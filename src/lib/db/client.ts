import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

type SqliteRunResult = {
  changes?: number;
  lastInsertRowid?: number | bigint;
};

export type SqliteStatement = {
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => SqliteRunResult;
};

export type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (filename: string) => SqliteDatabase;
};

type GlobalWithDb = typeof globalThis & {
  __agenticChatDb?: SqliteDatabase;
  __agenticChatDbPath?: string;
};

const globalForDb = globalThis as GlobalWithDb;

export function defaultDbPath() {
  return process.env.AGENTIC_DB_PATH ?? path.join(process.cwd(), ".data", "agentic-chat.sqlite");
}

export function openDatabase(filename = defaultDbPath()) {
  const directory = path.dirname(filename);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  const db = new DatabaseSync(filename);
  migrateDb(db);
  return db;
}

export function getDb() {
  const filename = defaultDbPath();
  if (!globalForDb.__agenticChatDb || globalForDb.__agenticChatDbPath !== filename) {
    globalForDb.__agenticChatDb?.close();
    globalForDb.__agenticChatDb = openDatabase(filename);
    globalForDb.__agenticChatDbPath = filename;
  }

  return globalForDb.__agenticChatDb;
}

export function migrateDb(db: SqliteDatabase) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      run_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      provider_id TEXT NOT NULL DEFAULT 'codex-http',
      mode TEXT NOT NULL DEFAULT 'normal',
      reasoning_effort TEXT NOT NULL DEFAULT 'xhigh',
      mode_decision_reasons TEXT NOT NULL DEFAULT '[]',
      capabilities_snapshot TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(run_id, seq)
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      args TEXT NOT NULL,
      status TEXT NOT NULL,
      output TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS file_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      run_id TEXT,
      path TEXT NOT NULL,
      before_content TEXT,
      after_content TEXT,
      diff TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS threads_project_idx ON threads(project_id);
    CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS runs_thread_idx ON runs(thread_id);
    CREATE INDEX IF NOT EXISTS run_events_run_idx ON run_events(run_id, seq);
    CREATE INDEX IF NOT EXISTS file_snapshots_project_idx ON file_snapshots(project_id);
  `);

  addColumnIfMissing(db, "runs", "provider_id", "TEXT NOT NULL DEFAULT 'codex-http'");
  addColumnIfMissing(db, "runs", "mode", "TEXT NOT NULL DEFAULT 'normal'");
  addColumnIfMissing(db, "runs", "reasoning_effort", "TEXT NOT NULL DEFAULT 'xhigh'");
  addColumnIfMissing(db, "runs", "mode_decision_reasons", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "runs", "capabilities_snapshot", "TEXT");
}

function addColumnIfMissing(db: SqliteDatabase, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  if (columns.some((item) => item.name === column)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

