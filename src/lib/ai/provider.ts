import type { Message } from "@/lib/types";
import type { ChatAttachment } from "@/lib/types";

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
};

export interface AIProvider {
  name: string;
  streamChat(input: AIProviderInput): AsyncIterable<AIProviderChunk>;
}
