import type {
  FileSnapshot,
  Message,
  MessageRole,
  Project,
  Run,
  RunEvent,
  RunEventType,
  RunStatus,
  Thread,
  ToolCall
} from "@/lib/types";
import { capabilitiesForProvider } from "@/lib/mode/mode-types";
import type {
  AgentProviderCapabilities,
  AgentProviderId,
  AgentReasoningEffort,
  ModeDecision,
  ResolvedAgentMode
} from "@/lib/mode/mode-types";
import { createId, nowIso, parseJson } from "@/lib/utils";
import { getDb, type SqliteDatabase } from "./client";

type ProjectRow = {
  id: string;
  name: string;
  workspace_path: string;
  created_at: string;
  updated_at: string;
};

type ThreadRow = {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  run_id: string | null;
  role: MessageRole;
  content: string;
  metadata: string | null;
  created_at: string;
};

type RunRow = {
  id: string;
  thread_id: string;
  project_id: string;
  status: RunStatus;
  prompt: string;
  provider_id: AgentProviderId | null;
  mode: ResolvedAgentMode | null;
  reasoning_effort: AgentReasoningEffort | null;
  mode_decision_reasons: string | null;
  capabilities_snapshot: string | null;
  started_at: string;
  completed_at: string | null;
  error: string | null;
};

type RunEventRow = {
  id: string;
  run_id: string;
  seq: number;
  type: RunEventType;
  payload: string;
  created_at: string;
};

type ToolCallRow = {
  id: string;
  run_id: string;
  name: string;
  args: string;
  status: RunStatus | "succeeded";
  output: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
};

type FileSnapshotRow = {
  id: string;
  project_id: string;
  run_id: string | null;
  path: string;
  before_content: string | null;
  after_content: string | null;
  diff: string | null;
  created_at: string;
};

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  workspacePath: row.workspace_path,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toThread = (row: ThreadRow): Thread => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  threadId: row.thread_id,
  runId: row.run_id,
  role: row.role,
  content: row.content,
  metadata: parseJson<Record<string, unknown> | null>(row.metadata, null),
  createdAt: row.created_at
});

const toRun = (row: RunRow): Run => ({
  id: row.id,
  threadId: row.thread_id,
  projectId: row.project_id,
  status: row.status,
  prompt: row.prompt,
  providerId: row.provider_id ?? "codex-http",
  mode: row.mode ?? "normal",
  reasoningEffort: row.reasoning_effort ?? "xhigh",
  modeDecisionReasons: parseJson<string[]>(row.mode_decision_reasons, []),
  capabilitiesSnapshot: parseJson<AgentProviderCapabilities | null>(
    row.capabilities_snapshot,
    null
  ),
  startedAt: row.started_at,
  completedAt: row.completed_at,
  error: row.error
});

const toRunEvent = (row: RunEventRow): RunEvent => ({
  id: row.id,
  runId: row.run_id,
  seq: row.seq,
  type: row.type,
  payload: parseJson<Record<string, unknown>>(row.payload, {}),
  createdAt: row.created_at
});

const toToolCall = (row: ToolCallRow): ToolCall => ({
  id: row.id,
  runId: row.run_id,
  name: row.name,
  args: parseJson<Record<string, unknown>>(row.args, {}),
  status: row.status,
  output: row.output,
  error: row.error,
  startedAt: row.started_at,
  completedAt: row.completed_at
});

const toFileSnapshot = (row: FileSnapshotRow): FileSnapshot => ({
  id: row.id,
  projectId: row.project_id,
  runId: row.run_id,
  path: row.path,
  beforeContent: row.before_content,
  afterContent: row.after_content,
  diff: row.diff,
  createdAt: row.created_at
});

const dbOrDefault = (db?: SqliteDatabase) => db ?? getDb();

export function listProjects(db?: SqliteDatabase) {
  return dbOrDefault(db)
    .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
    .all()
    .map((row) => toProject(row as ProjectRow));
}

export function createProject(input: { name: string; workspacePath: string }, db?: SqliteDatabase) {
  const database = dbOrDefault(db);
  const timestamp = nowIso();
  const project: Project = {
    id: createId("proj"),
    name: input.name,
    workspacePath: input.workspacePath,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  database
    .prepare(
      "INSERT INTO projects (id, name, workspace_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(project.id, project.name, project.workspacePath, project.createdAt, project.updatedAt);

  return project;
}

export function getProject(id: string, db?: SqliteDatabase) {
  const row = dbOrDefault(db)
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as ProjectRow | undefined;
  return row ? toProject(row) : null;
}

export function updateProjectWorkspace(
  projectId: string,
  input: { name?: string; workspacePath: string },
  db?: SqliteDatabase
) {
  const database = dbOrDefault(db);
  const timestamp = nowIso();
  if (input.name) {
    database
      .prepare("UPDATE projects SET name = ?, workspace_path = ?, updated_at = ? WHERE id = ?")
      .run(input.name, input.workspacePath, timestamp, projectId);
  } else {
    database
      .prepare("UPDATE projects SET workspace_path = ?, updated_at = ? WHERE id = ?")
      .run(input.workspacePath, timestamp, projectId);
  }

  return getProject(projectId, database);
}

export function listThreads(projectId: string, db?: SqliteDatabase) {
  return dbOrDefault(db)
    .prepare("SELECT * FROM threads WHERE project_id = ? ORDER BY updated_at DESC")
    .all(projectId)
    .map((row) => toThread(row as ThreadRow));
}

export function createThread(
  input: { projectId: string; title?: string },
  db?: SqliteDatabase
) {
  const database = dbOrDefault(db);
  const timestamp = nowIso();
  const thread: Thread = {
    id: createId("thr"),
    projectId: input.projectId,
    title: input.title?.trim() || "New thread",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  database
    .prepare(
      "INSERT INTO threads (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(thread.id, thread.projectId, thread.title, thread.createdAt, thread.updatedAt);

  return thread;
}

export function getThread(id: string, db?: SqliteDatabase) {
  const row = dbOrDefault(db)
    .prepare("SELECT * FROM threads WHERE id = ?")
    .get(id) as ThreadRow | undefined;
  return row ? toThread(row) : null;
}

export function updateThreadTitle(threadId: string, title: string, db?: SqliteDatabase) {
  dbOrDefault(db)
    .prepare("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?")
    .run(title, nowIso(), threadId);
}

export function touchThread(threadId: string, db?: SqliteDatabase) {
  dbOrDefault(db).prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(nowIso(), threadId);
}

export function createMessage(
  input: {
    threadId: string;
    role: MessageRole;
    content: string;
    runId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  db?: SqliteDatabase
) {
  const database = dbOrDefault(db);
  const message: Message = {
    id: createId("msg"),
    threadId: input.threadId,
    runId: input.runId ?? null,
    role: input.role,
    content: input.content,
    metadata: input.metadata ?? null,
    createdAt: nowIso()
  };

  database
    .prepare(
      "INSERT INTO messages (id, thread_id, run_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      message.id,
      message.threadId,
      message.runId,
      message.role,
      message.content,
      message.metadata ? JSON.stringify(message.metadata) : null,
      message.createdAt
    );
  touchThread(message.threadId, database);
  return message;
}

export function appendMessageContent(messageId: string, delta: string, db?: SqliteDatabase) {
  dbOrDefault(db)
    .prepare("UPDATE messages SET content = content || ? WHERE id = ?")
    .run(delta, messageId);
}

export function listMessages(threadId: string, db?: SqliteDatabase) {
  return dbOrDefault(db)
    .prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
    .all(threadId)
    .map((row) => toMessage(row as MessageRow));
}

export function createRun(
  input: {
    threadId: string;
    projectId: string;
    prompt: string;
    reasoningEffort?: AgentReasoningEffort;
    modeDecision?: ModeDecision;
    capabilitiesSnapshot?: AgentProviderCapabilities | null;
  },
  db?: SqliteDatabase
) {
  const providerId = input.modeDecision?.providerId ?? "codex-http";
  const mode = input.modeDecision?.mode ?? "normal";
  const reasoningEffort = input.reasoningEffort ?? "xhigh";
  const capabilitiesSnapshot =
    input.capabilitiesSnapshot ?? capabilitiesForProvider(providerId);
  const run: Run = {
    id: createId("run"),
    threadId: input.threadId,
    projectId: input.projectId,
    status: "queued",
    prompt: input.prompt,
    providerId,
    mode,
    reasoningEffort,
    modeDecisionReasons: input.modeDecision?.reasons ?? [],
    capabilitiesSnapshot,
    startedAt: nowIso(),
    completedAt: null,
    error: null
  };

  dbOrDefault(db)
    .prepare(
      "INSERT INTO runs (id, thread_id, project_id, status, prompt, provider_id, mode, reasoning_effort, mode_decision_reasons, capabilities_snapshot, started_at, completed_at, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      run.id,
      run.threadId,
      run.projectId,
      run.status,
      run.prompt,
      run.providerId,
      run.mode,
      run.reasoningEffort,
      JSON.stringify(run.modeDecisionReasons),
      run.capabilitiesSnapshot ? JSON.stringify(run.capabilitiesSnapshot) : null,
      run.startedAt,
      run.completedAt,
      run.error
    );

  return run;
}

export function getRun(id: string, db?: SqliteDatabase) {
  const row = dbOrDefault(db).prepare("SELECT * FROM runs WHERE id = ?").get(id) as
    | RunRow
    | undefined;
  return row ? toRun(row) : null;
}

export function listRuns(threadId: string, db?: SqliteDatabase) {
  return dbOrDefault(db)
    .prepare("SELECT * FROM runs WHERE thread_id = ? ORDER BY started_at DESC")
    .all(threadId)
    .map((row) => toRun(row as RunRow));
}

export function updateRunStatus(
  runId: string,
  status: RunStatus,
  error: string | null = null,
  db?: SqliteDatabase
) {
  dbOrDefault(db)
    .prepare("UPDATE runs SET status = ?, completed_at = ?, error = ? WHERE id = ?")
    .run(status, status === "running" || status === "queued" ? null : nowIso(), error, runId);
}

export function nextEventSeq(runId: string, db?: SqliteDatabase) {
  const row = dbOrDefault(db)
    .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM run_events WHERE run_id = ?")
    .get(runId) as { seq: number };
  return row.seq;
}

export function createRunEvent(
  input: { runId: string; type: RunEventType; payload: Record<string, unknown> },
  db?: SqliteDatabase
) {
  const database = dbOrDefault(db);
  const event: RunEvent = {
    id: createId("evt"),
    runId: input.runId,
    seq: nextEventSeq(input.runId, database),
    type: input.type,
    payload: input.payload,
    createdAt: nowIso()
  };

  database
    .prepare(
      "INSERT INTO run_events (id, run_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      event.id,
      event.runId,
      event.seq,
      event.type,
      JSON.stringify(event.payload),
      event.createdAt
    );

  return event;
}

export function listRunEvents(runId: string, afterSeq = 0, db?: SqliteDatabase) {
  return dbOrDefault(db)
    .prepare("SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC")
    .all(runId, afterSeq)
    .map((row) => toRunEvent(row as RunEventRow));
}

export function createToolCall(
  input: { runId: string; name: string; args: Record<string, unknown> },
  db?: SqliteDatabase
) {
  const toolCall: ToolCall = {
    id: createId("tool"),
    runId: input.runId,
    name: input.name,
    args: input.args,
    status: "running",
    output: null,
    error: null,
    startedAt: nowIso(),
    completedAt: null
  };

  dbOrDefault(db)
    .prepare(
      "INSERT INTO tool_calls (id, run_id, name, args, status, output, error, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      toolCall.id,
      toolCall.runId,
      toolCall.name,
      JSON.stringify(toolCall.args),
      toolCall.status,
      toolCall.output,
      toolCall.error,
      toolCall.startedAt,
      toolCall.completedAt
    );

  return toolCall;
}

export function completeToolCall(
  toolCallId: string,
  input: { output?: string | null; error?: string | null; status?: ToolCall["status"] },
  db?: SqliteDatabase
) {
  dbOrDefault(db)
    .prepare("UPDATE tool_calls SET status = ?, output = ?, error = ?, completed_at = ? WHERE id = ?")
    .run(
      input.status ?? (input.error ? "failed" : "succeeded"),
      input.output ?? null,
      input.error ?? null,
      nowIso(),
      toolCallId
    );
}

export function listToolCalls(runId: string, db?: SqliteDatabase) {
  return dbOrDefault(db)
    .prepare("SELECT * FROM tool_calls WHERE run_id = ? ORDER BY started_at ASC")
    .all(runId)
    .map((row) => toToolCall(row as ToolCallRow));
}

export function createFileSnapshot(
  input: {
    projectId: string;
    runId?: string | null;
    path: string;
    beforeContent?: string | null;
    afterContent?: string | null;
    diff?: string | null;
  },
  db?: SqliteDatabase
) {
  const snapshot: FileSnapshot = {
    id: createId("snap"),
    projectId: input.projectId,
    runId: input.runId ?? null,
    path: input.path,
    beforeContent: input.beforeContent ?? null,
    afterContent: input.afterContent ?? null,
    diff: input.diff ?? null,
    createdAt: nowIso()
  };

  dbOrDefault(db)
    .prepare(
      "INSERT INTO file_snapshots (id, project_id, run_id, path, before_content, after_content, diff, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      snapshot.id,
      snapshot.projectId,
      snapshot.runId,
      snapshot.path,
      snapshot.beforeContent,
      snapshot.afterContent,
      snapshot.diff,
      snapshot.createdAt
    );

  return snapshot;
}

export function listFileSnapshots(projectId: string, db?: SqliteDatabase) {
  return dbOrDefault(db)
    .prepare("SELECT * FROM file_snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT 30")
    .all(projectId)
    .map((row) => toFileSnapshot(row as FileSnapshotRow));
}
