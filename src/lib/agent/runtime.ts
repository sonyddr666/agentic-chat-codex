import type { ChatAttachment, Message, Project, Run } from "@/lib/types";
import { getAIProvider } from "@/lib/ai";
import {
  appendMessageContent,
  completeToolCall,
  createFileSnapshot,
  createMessage,
  createRunEvent,
  createToolCall,
  getRun,
  listMessages,
  updateRunStatus
} from "@/lib/db/repositories";
import { publishRunEvent } from "@/lib/events/event-bus";
import { clampText } from "@/lib/utils";
import {
  listWorkspaceFiles,
  patchWorkspaceFile,
  readWorkspaceFile,
  runWorkspaceShell,
  searchWorkspace,
  writeWorkspaceFile
} from "./tools";

type ExplicitTool =
  | { tool: "list_files"; args: { limit?: number } }
  | { tool: "read_file"; args: { path: string } }
  | { tool: "search_text"; args: { query: string } }
  | { tool: "run_shell"; args: { command: string } }
  | { tool: "write_file"; args: { path: string; content: string } }
  | { tool: "write_files"; args: { files: Array<{ path: string; content: string }> } }
  | { tool: "apply_patch"; args: { path: string; patch: string } };

const MAX_AGENT_TOOL_STEPS = 8;

function parseExplicitTool(prompt: string): ExplicitTool | null {
  const trimmed = prompt.trim();
  const [firstLine = "", ...rest] = trimmed.split(/\r?\n/);
  const body = rest.join("\n");

  const read = firstLine.match(/^\/read\s+(.+)$/i);
  if (read) {
    return { tool: "read_file", args: { path: read[1].trim() } };
  }

  const search = firstLine.match(/^\/search\s+(.+)$/i);
  if (search) {
    return { tool: "search_text", args: { query: search[1].trim() } };
  }

  const shell = firstLine.match(/^\/shell\s+(.+)$/i);
  if (shell) {
    return { tool: "run_shell", args: { command: shell[1].trim() } };
  }

  const write = firstLine.match(/^\/write\s+(.+)$/i);
  if (write) {
    return { tool: "write_file", args: { path: write[1].trim(), content: body } };
  }

  const patch = firstLine.match(/^\/patch\s+(.+)$/i);
  if (patch) {
    return { tool: "apply_patch", args: { path: patch[1].trim(), patch: body } };
  }

  return null;
}

function stringifyToolOutput(value: unknown) {
  return clampText(typeof value === "string" ? value : JSON.stringify(value, null, 2), 12_000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstBalancedJsonValue(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const source = (fenced ? fenced[1] : trimmed).trim();

  const objectStart = source.indexOf("{");
  const arrayStart = source.indexOf("[");
  const first =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);
  if (first === -1) {
    return source;
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = first; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push("}");
    } else if (char === "[") {
      stack.push("]");
    } else if (char === "}" || char === "]") {
      if (stack.at(-1) !== char) {
        break;
      }
      stack.pop();
      if (stack.length === 0) {
        return source.slice(first, index + 1);
      }
    }
  }

  return source.slice(first);
}

function normalizeAgentTool(value: unknown): ExplicitTool | null {
  if (!isRecord(value)) {
    return null;
  }

  const tool = String(value.tool ?? "");
  const args = isRecord(value.args) ? value.args : {};

  if (tool === "list_files") {
    return {
      tool,
      args: {
        limit: typeof args.limit === "number" ? Math.max(1, Math.min(240, args.limit)) : undefined
      }
    };
  }

  if (tool === "read_file" && typeof args.path === "string") {
    return { tool, args: { path: args.path } };
  }

  if (tool === "search_text" && typeof args.query === "string") {
    return { tool, args: { query: args.query } };
  }

  if (tool === "run_shell" && typeof args.command === "string") {
    return { tool, args: { command: args.command } };
  }

  if (
    tool === "write_file" &&
    typeof args.path === "string" &&
    typeof args.content === "string"
  ) {
    return { tool, args: { path: args.path, content: args.content } };
  }

  if (tool === "write_files" && Array.isArray(args.files)) {
    const files = args.files
      .filter((file): file is Record<string, unknown> => isRecord(file))
      .map((file) => ({
        path: typeof file.path === "string" ? file.path : "",
        content: typeof file.content === "string" ? file.content : ""
      }))
      .filter((file) => file.path)
      .slice(0, MAX_AGENT_TOOL_STEPS);

    if (files.length) {
      return { tool, args: { files } };
    }
  }

  if (
    tool === "apply_patch" &&
    typeof args.path === "string" &&
    typeof args.patch === "string"
  ) {
    return { tool, args: { path: args.path, patch: args.patch } };
  }

  return null;
}

export function parseAgentToolCalls(text: string): ExplicitTool[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(firstBalancedJsonValue(text));
  } catch {
    return [];
  }

  const candidates = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.tools)
      ? parsed.tools
      : [parsed];

  return candidates
    .map((candidate) => normalizeAgentTool(candidate))
    .filter((toolCall): toolCall is ExplicitTool => Boolean(toolCall))
    .slice(0, MAX_AGENT_TOOL_STEPS);
}

export function parseAgentToolCall(text: string): ExplicitTool | null {
  return parseAgentToolCalls(text)[0] ?? null;
}

export function isModelRelevantMessage(message: Message) {
  if (message.role !== "assistant") {
    return true;
  }

  const content = message.content.trim();
  if (!content) {
    return false;
  }

  if (parseAgentToolCall(content)) {
    return false;
  }

  const diagnostics = [
    "No Codex auth accounts configured.",
    "Import auth.json or use device login.",
    "For real model output",
    "I inspected the selected workspace and prepared the next step.",
    "Workspace snapshot:",
    "Codex auth is missing",
    "Codex account is missing",
    "Codex HTTP"
  ];

  return !diagnostics.some((diagnostic) => content.includes(diagnostic));
}

function summarizeToolCompletion(toolCall: ExplicitTool, result: unknown) {
  if (toolCall.tool === "write_files") {
    if (Array.isArray(result)) {
      const paths = result
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((item) => String(item.path ?? ""))
        .filter(Boolean);
      const changed = result
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .filter((item) => typeof item.diff === "string" && item.diff.trim()).length;

      if (paths.length) {
        return changed
          ? `Salvei ${paths.length} arquivo${paths.length === 1 ? "" : "s"}: ${paths.map((path) => `\`${path}\``).join(", ")}.`
          : `Os ${paths.length} arquivos ja estavam atualizados: ${paths.map((path) => `\`${path}\``).join(", ")}.`;
      }
    }

    return "Arquivos atualizados.";
  }

  if (toolCall.tool === "write_file" || toolCall.tool === "apply_patch") {
    if (isRecord(result) && typeof result.path === "string") {
      const diff = typeof result.diff === "string" ? result.diff.trim() : "";
      return diff
        ? `Arquivo salvo em \`${result.path}\`.`
        : `Arquivo \`${result.path}\` ja estava atualizado.`;
    }

    return "Arquivo atualizado.";
  }

  if (toolCall.tool === "list_files") {
    const count = Array.isArray(result) ? result.length : 0;
    if (count === 0) {
      return "No momento, nao ha arquivos visiveis no workspace.";
    }

    return `Listei ${count} arquivo${count === 1 ? "" : "s"} no workspace.`;
  }

  if (toolCall.tool === "read_file") {
    if (isRecord(result) && typeof result.path === "string") {
      return `Li o arquivo \`${result.path}\`.`;
    }

    return "Arquivo lido.";
  }

  if (toolCall.tool === "search_text") {
    const count = Array.isArray(result) ? result.length : 0;
    return count === 0
      ? "Nao encontrei ocorrencias para a busca."
      : `Encontrei ${count} ocorrencia${count === 1 ? "" : "s"} para a busca.`;
  }

  if (toolCall.tool === "run_shell") {
    if (isRecord(result) && typeof result.exitCode === "number") {
      return `Comando executado com codigo ${result.exitCode}.`;
    }

    return "Comando executado.";
  }

  return "Ferramenta executada.";
}

function toolSignature(toolCall: ExplicitTool) {
  return JSON.stringify(toolCall);
}

const workspaceIntentPatterns = [
  /\b(arquivo|arquivos|pasta|pastas|listar|liste|ler|leia|file|files|workspace|projeto|project|codigo|code|erro|bug|corrigir|corrija|fix|terminal|shell|comando|npm|build|teste|test|component|api|rota|route|diff|patch)\b/,
  /(^|\s)(src\/|app\/|pages\/|package\.json|next\.config|\.tsx?\b|\.jsx?\b|\.json\b|\.css\b|\.md\b)/
];

export function shouldUseWorkspaceContext(prompt: string) {
  const normalized = prompt
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!normalized) {
    return false;
  }

  if (parseExplicitTool(normalized)) {
    return true;
  }

  return workspaceIntentPatterns.some((pattern) => pattern.test(normalized));
}

export interface AgentRuntime {
  run(input: {
    run: Run;
    project: Project;
    prompt: string;
    attachments?: ChatAttachment[];
  }): Promise<void>;
}

export class LocalAgentRuntime implements AgentRuntime {
  async run(input: {
    run: Run;
    project: Project;
    prompt: string;
    attachments?: ChatAttachment[];
  }) {
    const provider = getAIProvider();
    const toolOutputs: string[] = [];
    let assistantMessage: Message | null = null;
    let lastToolCompletionText = "";

    const emit = (type: Parameters<typeof createRunEvent>[0]["type"], payload: Record<string, unknown>) => {
      const event = createRunEvent({ runId: input.run.id, type, payload });
      publishRunEvent(event);
      return event;
    };

    const ensureNotCancelled = () => {
      if (getRun(input.run.id)?.status === "cancelled") {
        throw new Error("Run cancelled.");
      }
    };

    const runTool = async <T>(
      name: string,
      args: Record<string, unknown>,
      operation: () => Promise<T> | T
    ) => {
      ensureNotCancelled();
      const toolCall = createToolCall({ runId: input.run.id, name, args });
      emit("tool_start", { toolCallId: toolCall.id, name, args });

      try {
        const result = await operation();
        const output = stringifyToolOutput(result);
        completeToolCall(toolCall.id, { output });
        emit("tool_output", { toolCallId: toolCall.id, name, output });
        toolOutputs.push(`${name}:\n${output}`);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool failed.";
        completeToolCall(toolCall.id, { error: message, status: "failed" });
        emit("tool_output", { toolCallId: toolCall.id, name, error: message });
        throw error;
      }
    };

    const executeTool = async (toolCall: ExplicitTool) => {
      if (toolCall.tool === "list_files") {
        return runTool("list_files", toolCall.args, () =>
          listWorkspaceFiles(input.project.workspacePath, toolCall.args.limit ?? 120)
        );
      }

      if (toolCall.tool === "read_file") {
        return runTool("read_file", toolCall.args, () =>
          readWorkspaceFile(input.project.workspacePath, toolCall.args.path)
        );
      }

      if (toolCall.tool === "search_text") {
        return runTool("search_text", toolCall.args, () =>
          searchWorkspace(input.project.workspacePath, toolCall.args.query)
        );
      }

      if (toolCall.tool === "run_shell") {
        return runTool("run_shell", toolCall.args, () =>
          runWorkspaceShell(input.project.workspacePath, toolCall.args.command)
        );
      }

      if (toolCall.tool === "write_file") {
        const result = await runTool("write_file", toolCall.args, () =>
          writeWorkspaceFile(input.project.workspacePath, toolCall.args.path, toolCall.args.content)
        );
        createFileSnapshot({
          projectId: input.project.id,
          runId: input.run.id,
          path: result.path,
          beforeContent: result.beforeContent,
          afterContent: result.afterContent,
          diff: result.diff
        });
        emit("file_changed", { path: result.path, bytes: result.afterContent.length });
        emit("diff_ready", { path: result.path, diff: result.diff });
        return result;
      }

      if (toolCall.tool === "write_files") {
        const result = await runTool("write_files", toolCall.args, () =>
          toolCall.args.files.map((file) =>
            writeWorkspaceFile(input.project.workspacePath, file.path, file.content)
          )
        );

        for (const fileResult of result) {
          createFileSnapshot({
            projectId: input.project.id,
            runId: input.run.id,
            path: fileResult.path,
            beforeContent: fileResult.beforeContent,
            afterContent: fileResult.afterContent,
            diff: fileResult.diff
          });
          emit("file_changed", { path: fileResult.path, bytes: fileResult.afterContent.length });
          emit("diff_ready", { path: fileResult.path, diff: fileResult.diff });
        }

        return result;
      }

      const result = await runTool("apply_patch", toolCall.args, () =>
        patchWorkspaceFile(input.project.workspacePath, toolCall.args.path, toolCall.args.patch)
      );
      createFileSnapshot({
        projectId: input.project.id,
        runId: input.run.id,
        path: result.path,
        beforeContent: result.beforeContent,
        afterContent: result.afterContent,
        diff: result.diff
      });
      emit("file_changed", { path: result.path, bytes: result.afterContent.length });
      emit("diff_ready", { path: result.path, diff: result.diff });
      return result;
    };

    const collectModelText = async (workspaceSummary: string) => {
      const messages = listMessages(input.run.threadId).filter(isModelRelevantMessage);
      let output = "";

      for await (const chunk of provider.streamChat({
        prompt: input.prompt,
        messages,
        workspaceSummary,
        toolOutputs,
        attachments: input.attachments
      })) {
        ensureNotCancelled();
        if (chunk.type === "text" && chunk.text) {
          output += chunk.text;
        }
      }

      return output;
    };

    try {
      updateRunStatus(input.run.id, "running");
      assistantMessage = createMessage({
        threadId: input.run.threadId,
        runId: input.run.id,
        role: "assistant",
        content: ""
      });

      const explicitTool = parseExplicitTool(input.prompt);
      let workspaceSummary = "";
      if (shouldUseWorkspaceContext(input.prompt)) {
        const files = (await executeTool({ tool: "list_files", args: { limit: 80 } })) as string[];
        workspaceSummary = files.slice(0, 50).join("\n");
      }

      if (explicitTool) {
        const result = await executeTool(explicitTool);
        lastToolCompletionText = summarizeToolCompletion(explicitTool, result);
      }

      let finalText = "";
      const seenToolCalls = new Set<string>();
      let executedToolSteps = 0;
      for (let step = 0; step <= MAX_AGENT_TOOL_STEPS; step += 1) {
        const modelText = await collectModelText(workspaceSummary);
        const requestedTools = parseAgentToolCalls(modelText);

        if (!requestedTools.length) {
          finalText = modelText;
          break;
        }

        for (const requestedTool of requestedTools) {
          const signature = toolSignature(requestedTool);
          if (seenToolCalls.has(signature)) {
            finalText =
              lastToolCompletionText ||
              "A ferramenta solicitada ja foi executada; usei o resultado coletado.";
            break;
          }
          seenToolCalls.add(signature);

          if (executedToolSteps >= MAX_AGENT_TOOL_STEPS || step === MAX_AGENT_TOOL_STEPS) {
            finalText =
              lastToolCompletionText ||
              "Executei as ferramentas, mas o modelo continuou pedindo novas acoes. Veja os detalhes no painel Run.";
            break;
          }

          const result = await executeTool(requestedTool);
          executedToolSteps += 1;
          lastToolCompletionText = summarizeToolCompletion(requestedTool, result);
        }

        if (finalText) {
          break;
        }
      }

      if (finalText.trim()) {
        appendMessageContent(assistantMessage.id, finalText);
        emit("message_delta", { messageId: assistantMessage.id, text: finalText });
      }

      updateRunStatus(input.run.id, "completed");
      emit("run_complete", { status: "completed", provider: provider.name });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Run failed.";
      const status = message === "Run cancelled." ? "cancelled" : "failed";
      updateRunStatus(input.run.id, status, status === "failed" ? message : null);
      if (assistantMessage) {
        appendMessageContent(assistantMessage.id, `\n\n${message}`);
      }
      emit(status === "failed" ? "error" : "run_complete", {
        status,
        error: status === "failed" ? message : null
      });
    }
  }
}

export function getAgentRuntime(): AgentRuntime {
  return new LocalAgentRuntime();
}
