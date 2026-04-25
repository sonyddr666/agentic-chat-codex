import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { applyPatch as applyTextPatch } from "diff";
import type { WorkspaceTreeNode } from "@/lib/types";
import { clampText } from "@/lib/utils";
import { createUnifiedDiff } from "./diff";
import { createWorkspaceGuard } from "./path-guard";

const execFileAsync = promisify(execFile);

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".data",
  "node_modules",
  "coverage",
  "test-results",
  "playwright-report"
]);

const TEXT_FILE_LIMIT = 512 * 1024;
const SEARCH_FILE_LIMIT = 256 * 1024;
const SHELL_OUTPUT_LIMIT = 64 * 1024;

function isLikelyText(buffer: Buffer) {
  if (buffer.length === 0) {
    return true;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  return !sample.includes(0);
}

function listDirectory(root: string, current: string, depth: number, maxDepth: number): WorkspaceTreeNode[] {
  if (depth > maxDepth) {
    return [];
  }

  const entries = fs
    .readdirSync(current, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith(".") || entry.name === ".env.example")
    .filter((entry) => !(entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    })
    .slice(0, 80);

  return entries.map((entry) => {
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
    if (!entry.isDirectory()) {
      return {
        name: entry.name,
        path: relativePath,
        type: "file"
      } satisfies WorkspaceTreeNode;
    }

    return {
      name: entry.name,
      path: relativePath,
      type: "directory",
      children: listDirectory(root, absolutePath, depth + 1, maxDepth)
    } satisfies WorkspaceTreeNode;
  });
}

function walkFiles(root: string, current: string, files: string[], limit: number) {
  if (files.length >= limit) {
    return;
  }

  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") {
      continue;
    }

    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        walkFiles(root, absolutePath, files, limit);
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(path.relative(root, absolutePath).replaceAll(path.sep, "/"));
    }

    if (files.length >= limit) {
      return;
    }
  }
}

export function listWorkspaceTree(workspacePath: string, maxDepth = 3) {
  const guard = createWorkspaceGuard(workspacePath);
  return listDirectory(guard.root, guard.root, 1, maxDepth);
}

export function listWorkspaceFiles(workspacePath: string, limit = 240) {
  const guard = createWorkspaceGuard(workspacePath);
  const files: string[] = [];
  walkFiles(guard.root, guard.root, files, limit);
  return files;
}

export function readWorkspaceFile(workspacePath: string, filePath: string) {
  const guard = createWorkspaceGuard(workspacePath);
  const absolutePath = guard.resolveForRead(filePath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    throw new Error("Path is not a file.");
  }

  if (stat.size > TEXT_FILE_LIMIT) {
    throw new Error(`File is too large to read (${stat.size} bytes).`);
  }

  const content = fs.readFileSync(absolutePath);
  if (!isLikelyText(content)) {
    throw new Error("Binary files are not supported in the chat workspace viewer.");
  }

  return {
    path: guard.toRelative(absolutePath),
    content: content.toString("utf8")
  };
}

export function searchWorkspace(workspacePath: string, query: string, limit = 50) {
  const guard = createWorkspaceGuard(workspacePath);
  const files = listWorkspaceFiles(workspacePath, 500);
  const needle = query.toLocaleLowerCase();
  const matches: Array<{ path: string; line: number; text: string }> = [];

  for (const file of files) {
    if (matches.length >= limit) {
      break;
    }

    const absolutePath = guard.resolveForRead(file);
    const stat = fs.statSync(absolutePath);
    if (stat.size > SEARCH_FILE_LIMIT || !stat.isFile()) {
      continue;
    }

    const buffer = fs.readFileSync(absolutePath);
    if (!isLikelyText(buffer)) {
      continue;
    }

    const lines = buffer.toString("utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (matches.length < limit && line.toLocaleLowerCase().includes(needle)) {
        matches.push({
          path: file,
          line: index + 1,
          text: line.trim().slice(0, 240)
        });
      }
    });
  }

  return matches;
}

export function writeWorkspaceFile(workspacePath: string, filePath: string, content: string) {
  const guard = createWorkspaceGuard(workspacePath);
  const absolutePath = guard.resolveForWrite(filePath);
  const beforeContent = fs.existsSync(absolutePath)
    ? fs.readFileSync(absolutePath, "utf8")
    : "";
  fs.writeFileSync(absolutePath, content, "utf8");
  const afterContent = fs.readFileSync(absolutePath, "utf8");
  const relativePath = guard.toRelative(absolutePath);

  return {
    path: relativePath,
    beforeContent,
    afterContent,
    diff: createUnifiedDiff(relativePath, beforeContent, afterContent)
  };
}

export function patchWorkspaceFile(workspacePath: string, filePath: string, patch: string) {
  const current = readWorkspaceFile(workspacePath, filePath);
  const patched = applyTextPatch(current.content, patch);
  if (patched === false) {
    throw new Error("Patch could not be applied.");
  }

  return writeWorkspaceFile(workspacePath, filePath, patched);
}

export async function runWorkspaceShell(workspacePath: string, command: string) {
  const guard = createWorkspaceGuard(workspacePath);
  const startedAt = Date.now();

  try {
    const result = await execFileAsync(command, {
      cwd: guard.root,
      shell: true,
      timeout: 20_000,
      windowsHide: true,
      maxBuffer: SHELL_OUTPUT_LIMIT
    });

    return {
      command,
      exitCode: 0,
      stdout: clampText(result.stdout ?? "", SHELL_OUTPUT_LIMIT),
      stderr: clampText(result.stderr ?? "", SHELL_OUTPUT_LIMIT),
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    const failure = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      command,
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: clampText(failure.stdout ?? "", SHELL_OUTPUT_LIMIT),
      stderr: clampText(failure.stderr ?? failure.message ?? "Command failed.", SHELL_OUTPUT_LIMIT),
      durationMs: Date.now() - startedAt
    };
  }
}

