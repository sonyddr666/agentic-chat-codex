import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodexChatGptProvider } from "@/lib/ai/codex-chatgpt-provider";

describe("codex chatgpt provider", () => {
  it("builds the responses payload shape", () => {
    const provider = new CodexChatGptProvider({ model: "gpt-5.4-mini" });
    const payload = provider.buildPayload([
      { role: "system", content: "System instruction." },
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Tudo certo." }
    ]);

    expect(payload).toMatchObject({
      model: "gpt-5.4-mini",
      instructions: "System instruction.",
      stream: true,
      store: false
    });
    expect(payload.input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Oi" }]
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Tudo certo." }]
      }
    ]);
  });

  it("adds image and file attachments to the responses payload", () => {
    const provider = new CodexChatGptProvider({ model: "gpt-5.4-mini" });
    const payload = provider.buildPayload([
      {
        role: "user",
        content: "Analise isso",
        attachments: [
          {
            id: "att_image",
            name: "tela.png",
            mimeType: "image/png",
            size: 12,
            kind: "image",
            dataUrl: "data:image/png;base64,abc"
          },
          {
            id: "att_text",
            name: "note.md",
            mimeType: "text/markdown",
            size: 5,
            kind: "text",
            text: "# Oi"
          },
          {
            id: "att_file",
            name: "doc.pdf",
            mimeType: "application/pdf",
            size: 20,
            kind: "text",
            text: "Texto extraido do PDF"
          }
        ]
      }
    ]);

    expect(payload.input[0].content).toEqual([
      { type: "input_text", text: "Analise isso" },
      { type: "input_text", text: "[Imagem anexada: tela.png (image/png)]" },
      { type: "input_image", image_url: "data:image/png;base64,abc" },
      {
        type: "input_text",
        text: ["Arquivo anexado: note.md (text/markdown)", "```", "# Oi", "```"].join("\n")
      },
      {
        type: "input_text",
        text: ["Arquivo anexado: doc.pdf (application/pdf)", "```", "Texto extraido do PDF", "```"].join("\n")
      }
    ]);
  });

  it("streams text deltas from codex SSE using auth manager credentials", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-auth-"));
    const authPath = path.join(directory, "auth.json");
    fs.writeFileSync(
      authPath,
      JSON.stringify({
        access: "access-token",
        refresh: "refresh-token",
        expires: Math.floor(Date.now() / 1000) + 3600,
        accountId: "acc_123"
      }),
      "utf8"
    );

    const fetchStub: typeof fetch = async (_url, init) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer access-token");
      expect((init?.headers as Record<string, string>)["chatgpt-account-id"]).toBe("acc_123");
      const body = JSON.parse(String(init?.body));
      expect(body.instructions).not.toContain("Contexto do workspace");
      expect(body.instructions).not.toContain("Saidas de ferramentas executadas");

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"response.output_text.delta","delta":"Ola"}\n\n'
              )
            );
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"response.output_text.delta","delta":"!"}\n\n'
              )
            );
            controller.close();
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        }
      );
    };

    const provider = new CodexChatGptProvider({ authPath, fetchImpl: fetchStub });
    let output = "";
    for await (const chunk of provider.streamChat({
      prompt: "Oi",
      messages: [],
      workspaceSummary: "",
      toolOutputs: []
    })) {
      output += chunk.text;
    }

    fs.rmSync(directory, { recursive: true, force: true });
    expect(output).toBe("Ola!");
  });
});
