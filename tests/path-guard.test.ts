import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceGuard, WorkspacePathError } from "@/lib/agent/path-guard";

const tempDirs: string[] = [];

function makeWorkspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "agentic-guard-"));
  tempDirs.push(directory);
  fs.writeFileSync(path.join(directory, "inside.txt"), "hello", "utf8");
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("workspace path guard", () => {
  it("resolves reads inside the workspace", () => {
    const workspace = makeWorkspace();
    const guard = createWorkspaceGuard(workspace);

    expect(guard.resolveForRead("inside.txt")).toBe(path.join(fs.realpathSync(workspace), "inside.txt"));
  });

  it("rejects traversal outside the workspace", () => {
    const workspace = makeWorkspace();
    const guard = createWorkspaceGuard(workspace);

    expect(() => guard.resolveForRead("../outside.txt")).toThrow(WorkspacePathError);
    expect(() => guard.resolveForWrite("../outside.txt")).toThrow(WorkspacePathError);
  });

  it("allows nested writes inside the workspace", () => {
    const workspace = makeWorkspace();
    const guard = createWorkspaceGuard(workspace);
    const target = guard.resolveForWrite("nested/file.txt");

    fs.writeFileSync(target, "ok", "utf8");
    expect(fs.existsSync(path.join(workspace, "nested", "file.txt"))).toBe(true);
  });
});

