import path from "node:path";
import { createWorkspaceGuard } from "@/lib/agent/path-guard";
import {
  createProject,
  listProjects,
  listThreads,
  updateProjectWorkspace
} from "@/lib/db/repositories";
import { apiError, json } from "@/lib/http";
import {
  ensureDefaultWorkspaceLayout,
  ensureWorkspaceLayout,
  getDefaultWorkspaceRoot,
  isForbiddenWorkspacePath,
  isInternalAppWorkspace
} from "@/lib/workspace-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeProjects() {
  const defaultWorkspace = ensureDefaultWorkspaceLayout();
  const projects = listProjects();

  return projects.map((project) => {
    if (isInternalAppWorkspace(project.workspacePath) || isForbiddenWorkspacePath(project.workspacePath)) {
      return (
        updateProjectWorkspace(project.id, {
          name: "Default Workspace",
          workspacePath: defaultWorkspace
        }) ?? project
      );
    }

    ensureWorkspaceLayout(project.workspacePath);
    return project;
  });
}

export async function GET() {
  try {
    const projects = safeProjects();
    return json({
      projects,
      threads: projects.flatMap((project) => listThreads(project.id))
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      workspacePath?: string;
    };
    const workspacePath = body.workspacePath || getDefaultWorkspaceRoot();
    if (isForbiddenWorkspacePath(workspacePath)) {
      return json({ error: "Workspace must live inside .data/workspaces." }, { status: 400 });
    }

    const root = ensureWorkspaceLayout(workspacePath);
    const guard = createWorkspaceGuard(root);
    const isDefault = path.resolve(root) === path.resolve(getDefaultWorkspaceRoot());
    const project = createProject({
      name: body.name?.trim() || (isDefault ? "Default Workspace" : path.basename(guard.root) || "Workspace"),
      workspacePath: guard.root
    });

    return json({ project }, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}
