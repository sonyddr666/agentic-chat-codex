import { describe, expect, it } from "vitest";
import { toSse } from "@/lib/events/sse";
import type { RunEvent } from "@/lib/types";

describe("sse serialization", () => {
  it("serializes a run event with id, event, and data fields", () => {
    const event: RunEvent = {
      id: "evt_1",
      runId: "run_1",
      seq: 7,
      type: "tool_output",
      payload: { output: "ok" },
      createdAt: "2026-04-24T00:00:00.000Z"
    };

    expect(toSse(event)).toContain("id: 7");
    expect(toSse(event)).toContain("event: tool_output");
    expect(toSse(event)).toContain('"output":"ok"');
  });
});

