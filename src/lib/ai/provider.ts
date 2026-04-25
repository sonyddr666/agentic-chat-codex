import type { Message } from "@/lib/types";
import type { ChatAttachment } from "@/lib/types";
import type { AgentModel, AgentReasoningEffort } from "@/lib/mode/mode-types";

export type AIProviderChunk = {
  type: "text";
  text: string;
};

export type AIProviderInput = {
  prompt: string;
  messages: Message[];
  workspaceSummary: string;
  toolOutputs: string[];
  attachments?: ChatAttachment[];
  reasoningEffort?: AgentReasoningEffort;
  model?: AgentModel;
  systemPrompt?: string;
};

export interface AIProvider {
  name: string;
  streamChat(input: AIProviderInput): AsyncIterable<AIProviderChunk>;
}
