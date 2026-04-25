import { describe, expect, it } from "vitest";
import {
  normalizeCodexMcpNotification,
  normalizeHttpProviderChunk,
  providerEventToPayload,
  providerEventToRunEventType
} from "@/lib/providers/event-normalizer";

describe("event normalizer", () => {
  it("maps HTTP text chunks to text deltas", () => {
    expect(normalizeHttpProviderChunk({ type: "text", text: "Oi" })).toEqual({
      type: "text_delta",
      text: "Oi"
    });
  });

  it("maps Codex MCP notifications to internal events", () => {
    expect(
      normalizeCodexMcpNotification({
        method: "notifications/message",
        params: { event: { type: "agent_reasoning_delta", delta: "pensando" } }
      })
    ).toEqual({ type: "reasoning_delta", text: "pensando" });

    expect(
      normalizeCodexMcpNotification({
        params: {
          event: {
            type: "exec_command_output_delta",
            stream: "stderr",
            delta: "erro"
          }
        }
      })
    ).toEqual({ type: "command_output_delta", stream: "stderr", text: "erro" });
  });

  it("maps provider events to run event types and payloads", () => {
    const event = { type: "text_delta" as const, text: "Ola" };
    expect(providerEventToRunEventType(event)).toBe("message_delta");
    expect(providerEventToPayload(event, { messageId: "msg_1" })).toEqual({
      messageId: "msg_1",
      text: "Ola"
    });
  });
});
