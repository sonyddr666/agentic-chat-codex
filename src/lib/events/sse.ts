import type { RunEvent } from "@/lib/types";

export function toSse(event: RunEvent) {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

