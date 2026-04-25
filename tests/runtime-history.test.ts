import { describe, expect, it } from "vitest";
import {
  isModelRelevantMessage,
  parseAgentToolCall,
  parseAgentToolCalls,
  shouldUseWorkspaceContext
} from "@/lib/agent/runtime";
import type { Message } from "@/lib/types";

function message(content: string): Message {
  return {
    id: "msg_1",
    threadId: "thr_1",
    runId: null,
    role: "assistant",
    content,
    metadata: null,
    createdAt: new Date().toISOString()
  };
}

describe("runtime history filtering", () => {
  it("does not send auth/setup diagnostics back to the model", () => {
    expect(
      isModelRelevantMessage(
        message("No Codex auth accounts configured. Import auth.json or use device login.")
      )
    ).toBe(false);
    expect(
      isModelRelevantMessage(
        message("For real model output, configure credentials first.")
      )
    ).toBe(false);
    expect(
      isModelRelevantMessage(
        message("I inspected the selected workspace and prepared the next step.\n\nWorkspace snapshot:\npackage.json")
      )
    ).toBe(false);
  });

  it("keeps normal assistant responses", () => {
    expect(isModelRelevantMessage(message("Claro, posso ajudar com isso."))).toBe(true);
  });

  it("does not send raw tool-call JSON back to the model", () => {
    expect(
      isModelRelevantMessage(
        message('{"tool":"write_file","args":{"path":"bemvindo.txt","content":"oi tudo bem"}}')
      )
    ).toBe(false);
  });
});

describe("workspace context detection", () => {
  it("does not inspect files for normal chat", () => {
    expect(shouldUseWorkspaceContext("oi")).toBe(false);
    expect(shouldUseWorkspaceContext("tudo bem?")).toBe(false);
  });

  it("uses workspace context for explicit tools and code requests", () => {
    expect(shouldUseWorkspaceContext("/search package")).toBe(true);
    expect(shouldUseWorkspaceContext("procure no package.json")).toBe(true);
    expect(shouldUseWorkspaceContext("liste os arquivos")).toBe(true);
    expect(shouldUseWorkspaceContext("corrija o erro no app")).toBe(true);
  });
});

describe("agent tool calls", () => {
  it("parses valid tool-call JSON", () => {
    expect(parseAgentToolCall('{"tool":"read_file","args":{"path":"README.md"}}')).toEqual({
      tool: "read_file",
      args: { path: "README.md" }
    });
    expect(parseAgentToolCall('```json\n{"tool":"list_files","args":{"limit":999}}\n```')).toEqual({
      tool: "list_files",
      args: { limit: 240 }
    });
  });

  it("parses the first tool-call when the model repeats JSON objects", () => {
    expect(
      parseAgentToolCall(
        '{"tool":"write_file","args":{"path":"bemvindo.txt","content":"oi tudo bem"}}{"tool":"write_file","args":{"path":"bemvindo.txt","content":"oi tudo bem"}}'
      )
    ).toEqual({
      tool: "write_file",
      args: { path: "bemvindo.txt", content: "oi tudo bem" }
    });
  });

  it("parses batched tool calls", () => {
    expect(
      parseAgentToolCalls(
        '{"tools":[{"tool":"write_file","args":{"path":"teste_1.txt","content":"1"}},{"tool":"write_file","args":{"path":"teste_2.txt","content":"2"}}]}'
      )
    ).toEqual([
      { tool: "write_file", args: { path: "teste_1.txt", content: "1" } },
      { tool: "write_file", args: { path: "teste_2.txt", content: "2" } }
    ]);
    expect(
      parseAgentToolCalls(
        '{"tool":"write_files","args":{"files":[{"path":"teste_1.txt","content":"1"},{"path":"teste_2.txt","content":"2"}]}}'
      )
    ).toEqual([
      {
        tool: "write_files",
        args: {
          files: [
            { path: "teste_1.txt", content: "1" },
            { path: "teste_2.txt", content: "2" }
          ]
        }
      }
    ]);
  });

  it("rejects invalid tool-call JSON", () => {
    expect(parseAgentToolCall("Claro, vou listar.")).toBeNull();
    expect(parseAgentToolCall('{"tool":"read_file","args":{}}')).toBeNull();
  });
});
