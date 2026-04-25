export type AgentMode = "auto" | "normal" | "cli";

export type ResolvedAgentMode = "normal" | "cli";

export type AgentProviderId = "codex-http" | "codex-cli-mcp";

export type AgentReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type AgentModel = "gpt-5.4-mini" | "gpt-5.4";

export const DEFAULT_AGENT_MODEL: AgentModel = "gpt-5.4-mini";

export type CliUnavailableReason =
  | "not_found"
  | "mcp_failed"
  | "auth_unavailable"
  | "execution_blocked"
  | "remote_environment"
  | "unknown";

export type CliAvailability = {
  available: boolean;
  reason?: CliUnavailableReason;
  detail?: string;
  version?: string;
};

export type AgentProviderCapabilities = {
  textStreaming: boolean;
  nativeToolEvents: boolean;
  reasoningDeltas: boolean;
  commandOutputDeltas: boolean;
  sandbox: boolean;
  approvals: boolean;
  previousResponseId: boolean;
  imageInput: boolean;
  fileInput: boolean;
};

export type ModeDecision = {
  requestedMode: AgentMode;
  mode: ResolvedAgentMode;
  providerId: AgentProviderId;
  confidence: number;
  reasons: string[];
  requiresApproval: boolean;
  cliAvailable: boolean;
  fallback?: {
    from: "cli";
    to: "normal";
    reason: string;
    diagnostic?: CliAvailability;
  };
};

export const CODEX_HTTP_CAPABILITIES: AgentProviderCapabilities = {
  textStreaming: true,
  nativeToolEvents: false,
  reasoningDeltas: false,
  commandOutputDeltas: false,
  sandbox: false,
  approvals: false,
  previousResponseId: false,
  imageInput: true,
  fileInput: true
};

export const CODEX_CLI_CAPABILITIES: AgentProviderCapabilities = {
  textStreaming: true,
  nativeToolEvents: true,
  reasoningDeltas: true,
  commandOutputDeltas: true,
  sandbox: true,
  approvals: true,
  previousResponseId: false,
  imageInput: false,
  fileInput: false
};

export function providerIdForMode(mode: ResolvedAgentMode): AgentProviderId {
  return mode === "cli" ? "codex-cli-mcp" : "codex-http";
}

export function capabilitiesForProvider(providerId: AgentProviderId) {
  return providerId === "codex-cli-mcp" ? CODEX_CLI_CAPABILITIES : CODEX_HTTP_CAPABILITIES;
}
