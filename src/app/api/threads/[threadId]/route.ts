import {
  getThread,
  listMessages,
  listRuns,
  listToolCalls
} from "@/lib/db/repositories";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await context.params;
    const thread = getThread(threadId);
    if (!thread) {
      return json({ error: "Thread not found." }, { status: 404 });
    }

    const runs = listRuns(thread.id);
    return json({
      thread,
      messages: listMessages(thread.id),
      runs,
      toolCalls: runs.flatMap((run) => listToolCalls(run.id))
    });
  } catch (error) {
    return apiError(error);
  }
}
