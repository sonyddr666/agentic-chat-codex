import { createThread, getProject } from "@/lib/db/repositories";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      title?: string;
    };
    if (!body.projectId) {
      return json({ error: "projectId is required." }, { status: 400 });
    }

    const project = getProject(body.projectId);
    if (!project) {
      return json({ error: "Project not found." }, { status: 404 });
    }

    const thread = createThread({
      projectId: project.id,
      title: body.title
    });

    return json({ thread }, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}

