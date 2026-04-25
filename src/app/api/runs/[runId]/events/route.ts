import { listRunEvents } from "@/lib/db/repositories";
import { subscribeToRun } from "@/lib/events/event-bus";
import { toSse } from "@/lib/events/sse";
import { apiError } from "@/lib/http";
import type { RunEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isTerminal(event: RunEvent) {
  return event.type === "run_complete" || event.type === "error";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    const url = new URL(request.url);
    const after = Number(url.searchParams.get("after") ?? "0");
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        let cleanup = () => {};
        const close = () => {
          if (closed) {
            return;
          }

          closed = true;
          cleanup();
          if (heartbeat) {
            clearInterval(heartbeat);
          }
          controller.close();
        };

        const send = (event: RunEvent) => {
          if (closed) {
            return;
          }

          controller.enqueue(encoder.encode(toSse(event)));
          if (isTerminal(event)) {
            close();
          }
        };

        cleanup = subscribeToRun(runId, send);
        heartbeat = setInterval(() => {
          if (!closed) {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          }
        }, 15_000);

        const abort = () => {
          if (closed) {
            return;
          }

          closed = true;
          cleanup();
          if (heartbeat) {
            clearInterval(heartbeat);
          }
        };

        request.signal.addEventListener("abort", abort);

        for (const event of listRunEvents(runId, after)) {
          send(event);
          if (closed) {
            break;
          }
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
