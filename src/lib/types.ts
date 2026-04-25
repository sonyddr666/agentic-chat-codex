export type Project = {
  id: string;
  name: string;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
};

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type Message = {
  id: string;
  threadId: string;
  runId: string | null;
  role: MessageRole;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ChatAttachmentKind = "image" | "text" | "pdf";

export type ChatAttachment = {
  id: string;
  name: string;
  originalName?: string;
  mimeType: string;
  size: number;
  kind: ChatAttachmentKind;
  text?: string;
  dataUrl?: string;
  storedPath?: string;
  uploadedAt?: string;
};

export type ChatAttachmentMetadata = {
  id: string;
  originalName: string;
  name: string;
  storedPath: string;
  mimeType: string;
  size: number;
  kind: ChatAttachmentKind;
  dataUrl?: string;
  uploadedAt: string;
};

export type RunStatus = "queued" | "running" | "cancelled" | "completed" | "failed";

export type Run = {
  id: string;
  threadId: string;
  projectId: string;
  status: RunStatus;
  prompt: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
};

export type RunEventType =
  | "message_delta"
  | "tool_start"
  | "tool_output"
  | "file_changed"
  | "diff_ready"
  | "error"
  | "run_complete";

export type RunEvent = {
  id: string;
  runId: string;
  seq: number;
  type: RunEventType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ToolCall = {
  id: string;
  runId: string;
  name: string;
  args: Record<string, unknown>;
  status: RunStatus | "succeeded";
  output: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type FileSnapshot = {
  id: string;
  projectId: string;
  runId: string | null;
  path: string;
  beforeContent: string | null;
  afterContent: string | null;
  diff: string | null;
  createdAt: string;
};

export type WorkspaceTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: WorkspaceTreeNode[];
};

export type ApiError = {
  error: string;
};

export type CodexUsage = {
  plan: string;
  fiveHourPct: number | null;
  fiveHourReset: number | null;
  weeklyPct: number | null;
  weeklyReset: number | null;
  updatedAt?: string;
};

export type CodexSafeAccount = {
  id: string;
  label: string;
  email: string;
  accountIdMasked: string;
  businessName: string;
  status: string;
  httpStatus: number | string;
  expiresAt: number | null;
  isExpired: boolean;
  isActive: boolean;
  usage: CodexUsage | null;
  lastCheckedAt: string | null;
  score: number;
};

export type CodexAuthStatus = {
  provider: string;
  model: string;
  authPath: string;
  activeAccountId: string | null;
  activeAccount: CodexSafeAccount | null;
  accounts: CodexSafeAccount[];
};
