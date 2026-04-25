import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type SqliteDatabase } from "@/lib/db/client";
import { CODEX_CLI_CAPABILITIES } from "@/lib/mode/mode-types";
import {
  createMessage,
  createProject,
  createRun,
  createRunEvent,
  createThread,
  listMessages,
  listProjects,
  listRunEvents,
  listRuns,
  listThreads,
  updateRunStatus
} from "@/lib/db/repositories";

const tempDirs: string[] = [];
const databases: SqliteDatabase[] = [];

function openTempDb() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "agentic-db-"));
  tempDirs.push(directory);
  const db = openDatabase(path.join(directory, "test.sqlite"));
  databases.push(db);
  return db;
}

afterEach(() => {
  for (const db of databases.splice(0)) {
    db.close();
  }

  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("repositories", () => {
  it("persists project, thread, messages, run, and events", () => {
    const db = openTempDb();
    const project = createProject({ name: "Test", workspacePath: process.cwd() }, db);
    const thread = createThread({ projectId: project.id, title: "Hello" }, db);
    const message = createMessage(
      { threadId: thread.id, role: "user", content: "Build this." },
      db
    );
    const run = createRun(
      {
        threadId: thread.id,
        projectId: project.id,
        prompt: "Build this.",
        modeDecision: {
          requestedMode: "cli",
          mode: "cli",
          providerId: "codex-cli-mcp",
          confidence: 1,
          reasons: ["modo Codex CLI solicitado pelo usuario"],
          requiresApproval: true,
          cliAvailable: true
        },
        capabilitiesSnapshot: CODEX_CLI_CAPABILITIES
      },
      db
    );
    const event = createRunEvent(
      { runId: run.id, type: "message_delta", payload: { text: "Working" } },
      db
    );

    updateRunStatus(run.id, "completed", null, db);

    expect(listProjects(db)).toHaveLength(1);
    expect(listThreads(project.id, db)).toHaveLength(1);
    expect(listMessages(thread.id, db)[0]?.id).toBe(message.id);
    expect(listRunEvents(run.id, 0, db)[0]?.id).toBe(event.id);
    expect(listRuns(thread.id, db)[0]).toMatchObject({
      id: run.id,
      mode: "cli",
      providerId: "codex-cli-mcp",
      modeDecisionReasons: ["modo Codex CLI solicitado pelo usuario"],
      capabilitiesSnapshot: CODEX_CLI_CAPABILITIES
    });
  });
});

