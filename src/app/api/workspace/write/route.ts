import { writeWorkspaceFile } from "@/lib/agent/tools";
import { createFileSnapshot, getProject } from "@/lib/db/repositories";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      path?: string;
      content?: string;
    };
    if (!body.projectId || !body.path || typeof body.content !== "string") {
      return json({ error: "projectId, path, and content are required." }, { status: 400 });
    }

    const project = getProject(body.projectId);
    if (!project) {
      return json({ error: "Project not found." }, { status: 404 });
    }

    const result = writeWorkspaceFile(project.workspacePath, body.path, body.content);
    const snapshot = createFileSnapshot({
      projectId: project.id,
      path: result.path,
      beforeContent: result.beforeContent,
      afterContent: result.afterContent,
      diff: result.diff
    });

    return json({ file: result, snapshot });
  } catch (error) {
    return apiError(error, 400);
  }
}

