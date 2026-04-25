import fs from "node:fs";
import path from "node:path";
import { readWorkspaceFile } from "@/lib/agent/tools";
import { createWorkspaceGuard } from "@/lib/agent/path-guard";
import { getProject } from "@/lib/db/repositories";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_FILE_LIMIT = 12 * 1024 * 1024;
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function imageMimeType(filePath: string) {
  return IMAGE_MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;
}

function readWorkspaceImage(workspacePath: string, filePath: string, mimeType: string) {
  const guard = createWorkspaceGuard(workspacePath);
  const absolutePath = guard.resolveForRead(filePath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    throw new Error("Path is not a file.");
  }

  if (stat.size > IMAGE_FILE_LIMIT) {
    throw new Error(`Image is too large to preview (${stat.size} bytes).`);
  }

  const content = fs.readFileSync(absolutePath);
  return {
    path: guard.toRelative(absolutePath),
    content: "",
    kind: "image",
    mimeType,
    size: stat.size,
    dataUrl: `data:${mimeType};base64,${content.toString("base64")}`
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const filePath = url.searchParams.get("path");
    if (!projectId || !filePath) {
      return json({ error: "projectId and path are required." }, { status: 400 });
    }

    const project = getProject(projectId);
    if (!project) {
      return json({ error: "Project not found." }, { status: 404 });
    }

    const mimeType = imageMimeType(filePath);
    if (mimeType) {
      return json({ file: readWorkspaceImage(project.workspacePath, filePath, mimeType) });
    }

    return json({ file: { ...readWorkspaceFile(project.workspacePath, filePath), kind: "text" } });
  } catch (error) {
    return apiError(error, 400);
  }
}

