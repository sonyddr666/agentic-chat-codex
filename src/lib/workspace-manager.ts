import fs from "node:fs";
import path from "node:path";
import type { ChatAttachment, ChatAttachmentMetadata, Project } from "@/lib/types";
import { createId } from "@/lib/utils";

const FORBIDDEN_APP_CHILDREN = new Set([
  ".next",
  "app",
  "node_modules",
  "playwright-report",
  "src",
  "test-results",
  "tests"
]);

function appRoot() {
  return fs.realpathSync(process.cwd());
}

export function getWorkspaceContainerRoot() {
  return path.resolve(process.cwd(), ".data", "workspaces");
}

export function getDefaultWorkspaceRoot() {
  return path.join(getWorkspaceContainerRoot(), "default");
}

function normalizeExistingOrFuture(targetPath: string) {
  const resolved = path.resolve(targetPath);
  if (fs.existsSync(resolved)) {
    return fs.realpathSync(resolved);
  }
  return resolved;
}

function isInside(parent: string, target: string) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function isForbiddenWorkspacePath(workspacePath: string) {
  const root = appRoot();
  const workspaceRoot = path.resolve(getWorkspaceContainerRoot());
  const resolved = normalizeExistingOrFuture(workspacePath);

  if (resolved === root) {
    return true;
  }

  if (resolved === workspaceRoot || !isInside(workspaceRoot, resolved)) {
    return true;
  }

  const relativeToApp = path.relative(root, resolved);
  const firstSegment = relativeToApp.split(path.sep)[0];
  if (FORBIDDEN_APP_CHILDREN.has(firstSegment)) {
    return true;
  }

  return false;
}

export function ensureWorkspaceLayout(workspacePath: string) {
  if (isForbiddenWorkspacePath(workspacePath)) {
    throw new Error("Workspace must live inside .data/workspaces.");
  }

  fs.mkdirSync(workspacePath, { recursive: true });
  const root = fs.realpathSync(workspacePath);
  fs.mkdirSync(path.join(root, "sandbox"), { recursive: true });
  fs.mkdirSync(path.join(root, "uploads"), { recursive: true });
  return root;
}

export function ensureDefaultWorkspaceLayout() {
  return ensureWorkspaceLayout(getDefaultWorkspaceRoot());
}

export function isInternalAppWorkspace(workspacePath: string) {
  const root = appRoot();
  const resolved = normalizeExistingOrFuture(workspacePath);
  return resolved === root || isInside(path.join(root, "src"), resolved) || isInside(path.join(root, ".next"), resolved);
}

function safeDateSegment(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function slugFileName(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, extension);
  const slug =
    base
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .toLowerCase() || "upload";
  return `${slug}-${createId("up").replace(/^up_/, "").slice(0, 8)}${extension}`;
}

export function workspaceUploadPath(project: Project, fileName: string, date = new Date()) {
  const workspaceRoot = ensureWorkspaceLayout(project.workspacePath);
  const day = safeDateSegment(date);
  const uploadDirectory = path.join(workspaceRoot, "uploads", day);
  fs.mkdirSync(uploadDirectory, { recursive: true });

  const storedName = slugFileName(fileName);
  const absolutePath = path.join(uploadDirectory, storedName);
  const storedPath = path.relative(workspaceRoot, absolutePath).replaceAll(path.sep, "/");

  return { absolutePath, storedPath };
}

function dataUrlToBuffer(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return Buffer.alloc(0);
  }

  const header = dataUrl.slice(0, commaIndex);
  const body = dataUrl.slice(commaIndex + 1);
  if (header.includes(";base64")) {
    return Buffer.from(body, "base64");
  }

  return Buffer.from(decodeURIComponent(body), "utf8");
}

export function persistAttachmentToWorkspace(
  project: Project,
  attachment: ChatAttachment,
  uploadedAt = new Date()
) {
  const { absolutePath, storedPath } = workspaceUploadPath(project, attachment.name, uploadedAt);
  const bytes = attachment.dataUrl
    ? dataUrlToBuffer(attachment.dataUrl)
    : Buffer.from(attachment.text ?? "", "utf8");

  fs.writeFileSync(absolutePath, bytes);

  const metadata: ChatAttachmentMetadata = {
    id: attachment.id,
    originalName: attachment.name,
    name: attachment.name,
    storedPath,
    mimeType: attachment.mimeType,
    size: attachment.size || bytes.length,
    kind: attachment.kind,
    uploadedAt: uploadedAt.toISOString()
  };

  return {
    ...attachment,
    size: metadata.size,
    storedPath,
    originalName: attachment.name,
    uploadedAt: metadata.uploadedAt,
    absolutePath,
    metadata
  } satisfies ChatAttachment & { absolutePath: string; metadata: ChatAttachmentMetadata };
}
