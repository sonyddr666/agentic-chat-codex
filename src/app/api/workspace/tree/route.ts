import { listWorkspaceTree } from "@/lib/agent/tools";
import { getProject } from "@/lib/db/repositories";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return json({ error: "projectId is required." }, { status: 400 });
    }

    const project = getProject(projectId);
    if (!project) {
      return json({ error: "Project not found." }, { status: 404 });
    }

    return json({ tree: listWorkspaceTree(project.workspacePath) });
  } catch (error) {
    return apiError(error, 400);
  }
}

