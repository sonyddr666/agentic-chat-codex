import {
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  workspacePath: text("workspace_path").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  runId: text("run_id"),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull()
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  prompt: text("prompt").notNull(),
  providerId: text("provider_id").notNull().default("codex-http"),
  mode: text("mode").notNull().default("normal"),
  reasoningEffort: text("reasoning_effort").notNull().default("xhigh"),
  modeDecisionReasons: text("mode_decision_reasons").notNull().default("[]"),
  capabilitiesSnapshot: text("capabilities_snapshot"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  error: text("error")
});

export const runEvents = sqliteTable(
  "run_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    runSeqIndex: uniqueIndex("run_events_run_seq_idx").on(table.runId, table.seq)
  })
);

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  args: text("args").notNull(),
  status: text("status").notNull(),
  output: text("output"),
  error: text("error"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at")
});

export const fileSnapshots = sqliteTable("file_snapshots", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  runId: text("run_id"),
  path: text("path").notNull(),
  beforeContent: text("before_content"),
  afterContent: text("after_content"),
  diff: text("diff"),
  createdAt: text("created_at").notNull()
});

