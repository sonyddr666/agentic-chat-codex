import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { CODEX_CLI_CAPABILITIES, type CliAvailability } from "@/lib/mode/mode-types";
import type { AgentProvider, AgentProviderInput, AgentProviderEvent } from "./agent-provider";
import { normalizeCodexMcpNotification } from "./event-normalizer";

const execFileAsync = promisify(execFile);
const DEFAULT_MODEL = "gpt-5-codex";
let cachedAvailability: Promise<CliAvailability> | null = null;

type JsonRpcMessage = {
  jsonrpc?: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

type PendingRequest = {
  resolve: (value: JsonRpcMessage) => void;
  reject: (error: Error) => void;
};

export async function checkCodexCliAvailability(timeoutMs = 3_000): Promise<CliAvailability> {
  if (cachedAvailability) {
    return cachedAvailability;
  }

  cachedAvailability = inspectCodexCliAvailability(timeoutMs);
  return cachedAvailability;
}

async function inspectCodexCliAvailability(timeoutMs: number): Promise<CliAvailability> {
  try {
    const version = await execFileAsync("codex", ["--version"], {
      timeout: timeoutMs,
      windowsHide: true
    });

    try {
      await execFileAsync("codex", ["mcp-server", "--help"], {
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 64 * 1024
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "codex mcp-server --help failed.";
      return {
        available: false,
        reason: "mcp_failed",
        detail: message,
        version: version.stdout.trim() || version.stderr.trim()
      };
    }

    return {
      available: true,
      version: version.stdout.trim() || version.stderr.trim()
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return {
        available: false,
        reason: "not_found",
        detail: "Codex CLI nao foi encontrada no PATH."
      };
    }

    return {
      available: false,
      reason: "execution_blocked",
      detail: error instanceof Error ? error.message : "Nao foi possivel executar codex --version."
    };
  }
}

class McpStdioClient {
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private buffer = Buffer.alloc(0);
  private readonly process = spawn("codex", ["mcp-server"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });

  constructor(private readonly onEvent: (event: AgentProviderEvent) => void) {
    this.process.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    this.process.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (text.trim()) {
        this.onEvent({ type: "command_output_delta", stream: "stderr", text });
      }
    });
    this.process.on("error", (error) => this.rejectAll(error));
    this.process.on("exit", (code, signal) => {
      this.rejectAll(new Error(`codex mcp-server exited (${signal ?? code ?? "unknown"}).`));
    });
  }

  kill() {
    this.process.kill();
  }

  async request(method: string, params?: unknown, timeoutMs = 120_000) {
    const id = this.nextId;
    this.nextId += 1;
    const message: JsonRpcMessage = { jsonrpc: "2.0", id, method, params };
    this.writeMessage(message);

    return await new Promise<JsonRpcMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  notify(method: string, params?: unknown) {
    this.writeMessage({ jsonrpc: "2.0", method, params });
  }

  private writeMessage(message: JsonRpcMessage) {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
    this.process.stdin.write(Buffer.concat([header, body]));
  }

  private handleStdout(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) {
        return;
      }

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.subarray(bodyEnd);
      this.handleMessage(body);
    }
  }

  private handleMessage(body: string) {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(body) as JsonRpcMessage;
    } catch {
      return;
    }

    if (message.id !== undefined) {
      const id = Number(message.id);
      const pending = this.pending.get(id);
      if (!pending) {
        return;
      }

      this.pending.delete(id);
      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(message);
      }
      return;
    }

    const event = normalizeCodexMcpNotification(message);
    if (event) {
      this.onEvent(event);
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export class CodexCliMcpProvider implements AgentProvider {
  id = "codex-cli-mcp" as const;
  mode = "cli" as const;
  label = "Codex CLI";
  capabilities = CODEX_CLI_CAPABILITIES;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor({ model = process.env.CODEX_CLI_MODEL ?? DEFAULT_MODEL, timeoutMs = 120_000 } = {}) {
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async *stream(input: AgentProviderInput): AsyncIterable<AgentProviderEvent> {
    const queue: AgentProviderEvent[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let failure: Error | null = null;
    const client = new McpStdioClient((event) => {
      queue.push(event);
      wake?.();
      wake = null;
    });

    const waitForEvent = async () => {
      if (queue.length || finished || failure) {
        return;
      }

      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    };

    const wakeWaiter = () => {
      const currentWake = wake;
      wake = null;
      if (currentWake) {
        currentWake();
      }
    };

    const task = (async () => {
      try {
        const prompt = input.systemPrompt?.trim()
          ? [`System prompt:\n${input.systemPrompt.trim()}`, `User task:\n${input.prompt}`].join("\n\n")
          : input.prompt;
        await client.request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          clientInfo: { name: "agentic-chat-codex", version: "0.1.0" }
        }, 15_000);
        client.notify("notifications/initialized");
        await client.request("tools/call", {
          name: "codex",
          arguments: {
            prompt,
            model: input.model ?? this.model,
            cwd: input.cwd,
            "approval-policy": "on-request",
            sandbox: "workspace-write",
            "include-plan-tool": false,
            config: { model_reasoning_effort: input.reasoningEffort ?? "xhigh" }
          }
        }, this.timeoutMs);
        queue.push({ type: "task_complete" });
      } catch (error) {
        failure = error instanceof Error ? error : new Error("Codex CLI MCP failed.");
      } finally {
        finished = true;
        client.kill();
        wakeWaiter();
      }
    })();

    input.abortSignal?.addEventListener("abort", () => {
      failure = new Error("Run cancelled.");
      finished = true;
      client.kill();
      wakeWaiter();
    });

    try {
      while (!finished || queue.length) {
        await waitForEvent();
        while (queue.length) {
          yield queue.shift() as AgentProviderEvent;
        }
        if (failure) {
          throw failure;
        }
      }

      await task;
      if (failure) {
        throw failure;
      }
    } finally {
      client.kill();
    }
  }
}
