import fs from "node:fs";
import path from "node:path";

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspacePathError";
  }
}

export type WorkspaceGuard = {
  root: string;
  resolveForRead: (targetPath: string) => string;
  resolveForWrite: (targetPath: string) => string;
  toRelative: (absolutePath: string) => string;
};

function assertInside(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }

  throw new WorkspacePathError("Path is outside the selected workspace.");
}

function lexicalResolve(root: string, targetPath: string) {
  const resolved = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(root, targetPath);
  assertInside(root, resolved);
  return resolved;
}

export function createWorkspaceGuard(workspacePath: string): WorkspaceGuard {
  const root = fs.realpathSync(path.resolve(workspacePath));
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) {
    throw new WorkspacePathError("Workspace path must be a directory.");
  }

  return {
    root,
    resolveForRead(targetPath: string) {
      const resolved = lexicalResolve(root, targetPath);
      if (!fs.existsSync(resolved)) {
        throw new WorkspacePathError("Path does not exist.");
      }

      const real = fs.realpathSync(resolved);
      assertInside(root, real);
      return real;
    },
    resolveForWrite(targetPath: string) {
      const resolved = lexicalResolve(root, targetPath);
      const parent = path.dirname(resolved);
      if (!fs.existsSync(parent)) {
        fs.mkdirSync(parent, { recursive: true });
      }

      const realParent = fs.realpathSync(parent);
      assertInside(root, realParent);
      return resolved;
    },
    toRelative(absolutePath: string) {
      const relative = path.relative(root, path.resolve(absolutePath));
      return relative === "" ? "." : relative.replaceAll(path.sep, "/");
    }
  };
}

