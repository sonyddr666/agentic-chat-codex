import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type SqliteDatabase } from "@/lib/db/client";
import {
  createMessage,
  createProject,
  createRun,
  createRunEvent,
  createThread,
  listMessages,
  listProjects,
  listRunEvents,
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
    const run = createRun({ threadId: thread.id, projectId: project.id, prompt: "Build this." }, db);
    const event = createRunEvent(
      { runId: run.id, type: "message_delta", payload: { text: "Working" } },
      db
    );

    updateRunStatus(run.id, "completed", null, db);

    expect(listProjects(db)).toHaveLength(1);
    expect(listThreads(project.id, db)).toHaveLength(1);
    expect(listMessages(thread.id, db)[0]?.id).toBe(message.id);
    expect(listRunEvents(run.id, 0, db)[0]?.id).toBe(event.id);
  });
});

