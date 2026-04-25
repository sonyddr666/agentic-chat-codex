import type { AIProviderChunk } from "@/lib/ai/provider";
import type { RunEventType } from "@/lib/types";
import type { AgentProviderEvent } from "./agent-provider";

export function normalizeHttpProviderChunk(chunk: AIProviderChunk): AgentProviderEvent | null {
  if (chunk.type === "text" && chunk.text) {
    return { type: "text_delta", text: chunk.text };
  }

  return null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function normalizeCodexMcpNotification(value: unknown): AgentProviderEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const event = isRecord(value.params) && isRecord(value.params.event) ? value.params.event : value;
  const type = String(event.type ?? value.method ?? "");

  if (type === "agent_message_delta" && typeof event.delta === "string") {
    return { type: "text_delta", text: event.delta };
  }

  if (type === "agent_message" && typeof event.message === "string") {
    return { type: "text_delta", text: event.message };
  }

  if (type === "agent_reasoning_delta" && typeof event.delta === "string") {
    return { type: "reasoning_delta", text: event.delta };
  }

  if (type === "agent_reasoning" && typeof event.reasoning === "string") {
    return { type: "reasoning_delta", text: event.reasoning };
  }

  if (type === "exec_command_output_delta") {
    const stream = event.stream === "stderr" ? "stderr" : "stdout";
    const text = typeof event.delta === "string" ? event.delta : String(event.text ?? "");
    if (text) {
      return { type: "command_output_delta", stream, text };
    }
  }

  if (type === "task_complete") {
    return { type: "task_complete" };
  }

  if (type === "stream_error" || type === "error") {
    return { type: "error", error: String(event.error ?? event.message ?? "Codex CLI error.") };
  }

  return null;
}

export function providerEventToRunEventType(event: AgentProviderEvent): RunEventType {
  if (event.type === "text_delta") {
    return "message_delta";
  }

  if (event.type === "task_complete") {
    return "run_complete";
  }

  return event.type;
}

export function providerEventToPayload(event: AgentProviderEvent, extra: Record<string, unknown> = {}) {
  if (event.type === "text_delta") {
    return { ...extra, text: event.text };
  }

  if (event.type === "reasoning_delta") {
    return { text: event.text };
  }

  if (event.type === "tool_start") {
    return { name: event.name, args: event.args };
  }

  if (event.type === "tool_output") {
    return { name: event.name, output: event.output };
  }

  if (event.type === "command_output_delta") {
    return { stream: event.stream, text: event.text };
  }

  if (event.type === "file_changed") {
    return { path: event.path, diff: event.diff };
  }

  if (event.type === "approval_requested") {
    return { action: event.action };
  }

  if (event.type === "error") {
    return { error: event.error };
  }

  return extra;
}
