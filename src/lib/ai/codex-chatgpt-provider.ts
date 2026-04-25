import { getCodexAuthManager, type CodexAuthManager } from "@/lib/codex/auth-manager";
import type { ChatAttachment } from "@/lib/types";
import type { AIProvider, AIProviderInput } from "./provider";

const CODEX_URL = "https://chatgpt.com/backend-api/codex/responses";
const DEFAULT_MODEL = "gpt-5.4-mini";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

type CodexStreamEvent = {
  type?: string;
  delta?: string;
  response?: {
    output?: Array<{
      content?: Array<{ text?: string }>;
    }>;
  };
  item?: {
    content?: Array<{ text?: string }>;
  };
};

type CodexMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
};

type CodexContentPart =
  | { type: "input_text" | "output_text"; text: string }
  | { type: "input_image"; image_url: string };

type CodexConversationMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
};

type CodexClientConfig = {
  authPath?: string;
  model?: string;
  timeout?: number;
  fetchImpl?: typeof fetch;
  authManager?: CodexAuthManager;
};

export class CodexChatGptProvider implements AIProvider {
  name = "codex-chatgpt";
  private readonly model: string;
  private readonly timeout: number;
  private readonly fetchImpl: typeof fetch;
  private readonly authManager: CodexAuthManager;

  constructor({
    authPath = ".data/codex-auth.json",
    model = DEFAULT_MODEL,
    timeout = 120_000,
    fetchImpl = fetch,
    authManager
  }: CodexClientConfig = {}) {
    this.model = model;
    this.timeout = timeout;
    this.fetchImpl = fetchImpl;
    this.authManager =
      authManager ??
      getCodexAuthManager({
        authPath,
        fetchImpl,
        provider: "codex-chatgpt",
        model
      });
  }

  async *streamChat(input: AIProviderInput) {
    const messages = this.toCodexMessages(input);
    for await (const delta of this.stream(messages)) {
      yield { type: "text" as const, text: delta };
    }
  }

  buildPayload(messages: CodexMessage[], extra: Record<string, unknown> = {}) {
    const instructions: string[] = [];
    const convo: CodexConversationMessage[] = [];

    for (const message of messages) {
      const content = String(message.content ?? "").trim();
      if (!content && !message.attachments?.length) {
        continue;
      }

      if (message.role === "system") {
        instructions.push(content);
      } else {
        convo.push({
          role: message.role === "assistant" ? "assistant" : "user",
          content,
          attachments: message.attachments
        });
      }
    }

    const input = (
      convo.length ? convo : [{ role: "user" as const, content: "Ola", attachments: [] }]
    ).map((message) => ({
      type: "message",
      role: message.role,
      content: this.buildContentParts(message)
    }));

    return {
      model: this.model,
      instructions: instructions.join("\n\n") || "You are a helpful assistant.",
      input,
      stream: true,
      store: false,
      ...extra
    };
  }

  async *stream(messages: CodexMessage[], extra: Record<string, unknown> = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await this.fetchImpl(CODEX_URL, {
        method: "POST",
        headers: await this.headers(),
        body: JSON.stringify(this.buildPayload(messages, extra)),
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }

    if (!response.ok || !response.body) {
      clearTimeout(timeout);
      throw new Error(`Codex HTTP ${response.status}: ${await response.text()}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawDelta = false;
    const emittedFinalTexts = new Set<string>();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          for (const line of event.split("\n")) {
            if (!line.startsWith("data: ")) {
              continue;
            }

            const chunk = line.slice(6);
            if (!chunk || chunk === "[DONE]") {
              continue;
            }

            const parsed = parseCodexEvent(chunk);
            if (!parsed) {
              continue;
            }

            if (parsed.type === "response.output_text.delta" && parsed.delta) {
              sawDelta = true;
              yield parsed.delta;
              continue;
            }

            if (
              parsed.type === "response.completed" ||
              parsed.type === "response.output_item.done"
            ) {
              if (sawDelta) {
                continue;
              }

              for (const finalText of collectFinalTexts(parsed)) {
                if (!emittedFinalTexts.has(finalText)) {
                  emittedFinalTexts.add(finalText);
                  yield finalText;
                }
              }
            }
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      reader.releaseLock();
    }
  }

  private toCodexMessages(input: AIProviderInput): CodexMessage[] {
    const messages: CodexMessage[] = input.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: message.content
      }));

    const systemParts = [
      "Voce e um assistente de chat dentro de um app local-first.",
      "Responda naturalmente e de forma direta.",
      "Use portugues quando o usuario falar portugues.",
      "Quando o runtime fornecer contexto de workspace ou saidas de ferramentas, use esses dados para ajudar.",
      "Nao diga que alterou arquivos se os logs de ferramenta nao mostrarem alteracao.",
      [
        "Voce pode pedir ferramentas locais respondendo somente JSON, sem Markdown e sem texto extra.",
        "Formato de uma acao: {\"tool\":\"read_file\",\"args\":{\"path\":\"README.md\"}}",
        "Formato de varias acoes: {\"tools\":[{\"tool\":\"write_file\",\"args\":{\"path\":\"a.txt\",\"content\":\"A\"}},{\"tool\":\"write_file\",\"args\":{\"path\":\"b.txt\",\"content\":\"B\"}}]}",
        "Tools: list_files {limit?}, read_file {path}, search_text {query}, write_file {path, content}, write_files {files:[{path,content}]}, apply_patch {path, patch}, run_shell {command}.",
        "Quando o usuario pedir varios arquivos, use write_files ou um lote tools com todos os arquivos solicitados.",
        "Use tools quando precisar ver, listar, buscar, criar, editar ou executar algo no workspace.",
        "Nao prometa que vai criar/editar arquivos em texto; primeiro chame as ferramentas necessarias.",
        "Depois que todas as ferramentas necessarias terminarem, responda naturalmente ao usuario."
      ].join("\n")
    ];

    if (input.workspaceSummary) {
      systemParts.push(`Contexto do workspace:\n${input.workspaceSummary}`);
    }

    if (input.toolOutputs.length) {
      systemParts.push(`Saidas de ferramentas executadas:\n${input.toolOutputs.join("\n\n")}`);
    }

    const system = systemParts.join("\n\n");

    const last = messages.at(-1);
    if (!last || last.role !== "user" || last.content.trim() !== input.prompt.trim()) {
      messages.push({ role: "user", content: input.prompt, attachments: input.attachments });
    } else if (input.attachments?.length) {
      last.attachments = input.attachments;
    }

    return [{ role: "system", content: system }, ...messages];
  }

  private buildContentParts(message: CodexConversationMessage): CodexContentPart[] {
    const parts: CodexContentPart[] = [];
    const textType = message.role === "assistant" ? "output_text" : "input_text";
    const content = message.content.trim();

    if (content) {
      parts.push({ type: textType, text: content });
    }

    if (message.role === "user") {
      for (const attachment of message.attachments ?? []) {
        if (attachment.kind === "image" && attachment.dataUrl) {
          parts.push({
            type: "input_text",
            text: `[Imagem anexada: ${attachment.name} (${attachment.mimeType || "image"})]`
          });
          parts.push({ type: "input_image", image_url: attachment.dataUrl });
          continue;
        }

        if (attachment.text) {
          parts.push({
            type: "input_text",
            text: [
              `Arquivo anexado: ${attachment.name} (${attachment.mimeType || "text/plain"})`,
              "```",
              attachment.text,
              "```"
            ].join("\n")
          });
          continue;
        }
      }
    }

    if (!parts.length) {
      parts.push({ type: textType, text: "Analise os anexos." });
    }

    return parts;
  }

  private async headers() {
    const credential = await this.authManager.getCredentialForRequest();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${credential.accessToken}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Origin: "https://chatgpt.com",
      Referer: "https://chatgpt.com/",
      "User-Agent": UA
    };

    if (credential.accountId) {
      headers["chatgpt-account-id"] = credential.accountId;
      headers["ChatGPT-Account-Id"] = credential.accountId;
    }

    return headers;
  }
}

function parseCodexEvent(chunk: string) {
  try {
    return JSON.parse(chunk) as CodexStreamEvent;
  } catch {
    return null;
  }
}

function collectFinalTexts(event: CodexStreamEvent) {
  const texts: string[] = [];

  for (const item of event.response?.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.text) {
        texts.push(content.text);
      }
    }
  }

  for (const content of event.item?.content ?? []) {
    if (content.text) {
      texts.push(content.text);
    }
  }

  return texts;
}
