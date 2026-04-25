import type { AIProviderInput } from "@/lib/ai/provider";
import type {
  AgentProviderCapabilities,
  AgentProviderId,
  AgentReasoningEffort,
  ResolvedAgentMode
} from "@/lib/mode/mode-types";

export type AgentProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_start"; name: string; args?: unknown }
  | { type: "tool_output"; name: string; output: string }
  | { type: "command_output_delta"; stream: "stdout" | "stderr"; text: string }
  | { type: "file_changed"; path: string; diff?: string }
  | { type: "approval_requested"; action: unknown }
  | { type: "task_complete" }
  | { type: "error"; error: string };

export type AgentProviderInput = AIProviderInput & {
  cwd?: string;
  reasoningEffort?: AgentReasoningEffort;
  abortSignal?: AbortSignal;
};

export interface AgentProvider {
  id: AgentProviderId;
  mode: ResolvedAgentMode;
  label: string;
  capabilities: AgentProviderCapabilities;
  stream(input: AgentProviderInput): AsyncIterable<AgentProviderEvent>;
}
