import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Project } from "@/lib/types";
import {
  ensureWorkspaceLayout,
  getDefaultWorkspaceRoot,
  getWorkspaceContainerRoot,
  isForbiddenWorkspacePath,
  persistAttachmentToWorkspace,
  workspaceUploadPath
} from "@/lib/workspace-manager";

const created: string[] = [];

function testWorkspace(name: string) {
  const root = path.join(getWorkspaceContainerRoot(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  created.push(root);
  return root;
}

afterEach(() => {
  for (const target of created.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

function projectAt(workspacePath: string): Project {
  return {
    id: "proj_test",
    name: "Test",
    workspacePath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

describe("workspace manager", () => {
  it("creates the default sandbox and uploads layout outside the app source", () => {
    const root = testWorkspace("test-layout");

    const ensured = ensureWorkspaceLayout(root);

    expect(getDefaultWorkspaceRoot()).not.toBe(process.cwd());
    expect(ensured).not.toBe(process.cwd());
    expect(fs.existsSync(path.join(ensured, "sandbox"))).toBe(true);
    expect(fs.existsSync(path.join(ensured, "uploads"))).toBe(true);
    expect(isForbiddenWorkspacePath(process.cwd())).toBe(true);
    expect(isForbiddenWorkspacePath(ensured)).toBe(false);
  });

  it("builds dated upload paths inside the workspace", () => {
    const root = testWorkspace("test-upload-path");
    ensureWorkspaceLayout(root);

    const upload = workspaceUploadPath(projectAt(root), "Meu Arquivo.ino", new Date("2026-04-25T10:00:00Z"));

    expect(upload.storedPath).toMatch(/^uploads\/2026-04-25\/meu-arquivo-[a-z0-9]+\.ino$/);
    expect(upload.absolutePath.startsWith(path.join(root, "uploads"))).toBe(true);
  });

  it("persists uploaded attachment bytes in the workspace", () => {
    const root = testWorkspace("test-persist-upload");
    ensureWorkspaceLayout(root);

    const persisted = persistAttachmentToWorkspace(projectAt(root), {
      id: "att_1",
      name: "note.md",
      mimeType: "text/markdown",
      size: 7,
      kind: "text",
      text: "# hello"
    });

    expect(persisted.metadata.storedPath).toContain("uploads/");
    expect(fs.readFileSync(persisted.absolutePath, "utf8")).toBe("# hello");
  });
});
