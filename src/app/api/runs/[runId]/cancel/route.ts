import { createRunEvent, getRun, updateRunStatus } from "@/lib/db/repositories";
import { publishRunEvent } from "@/lib/events/event-bus";
import { apiError, json } from "@/lib/http";
import { cancelWorkspaceShell } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    const run = getRun(runId);
    if (!run) {
      return json({ error: "Run not found." }, { status: 404 });
    }

    updateRunStatus(run.id, "cancelled");
    cancelWorkspaceShell(run.id);
    const event = createRunEvent({
      runId: run.id,
      type: "run_complete",
      payload: { status: "cancelled" }
    });
    publishRunEvent(event);

    return json({ run: getRun(run.id) });
  } catch (error) {
    return apiError(error);
  }
}
