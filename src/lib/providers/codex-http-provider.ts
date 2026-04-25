import { CodexChatGptProvider } from "@/lib/ai/codex-chatgpt-provider";
import type { CodexAuthManager } from "@/lib/codex/auth-manager";
import { CODEX_HTTP_CAPABILITIES } from "@/lib/mode/mode-types";
import type { AgentProvider, AgentProviderInput } from "./agent-provider";
import { normalizeHttpProviderChunk } from "./event-normalizer";

type CodexHttpProviderConfig = {
  authPath?: string;
  model?: string;
  timeout?: number;
  fetchImpl?: typeof fetch;
  authManager?: CodexAuthManager;
};

export class CodexHttpProvider implements AgentProvider {
  id = "codex-http" as const;
  mode = "normal" as const;
  label = "Codex HTTP";
  capabilities = CODEX_HTTP_CAPABILITIES;
  private readonly provider: CodexChatGptProvider;

  constructor(config: CodexHttpProviderConfig = {}) {
    this.provider = new CodexChatGptProvider(config);
  }

  async *stream(input: AgentProviderInput) {
    for await (const chunk of this.provider.streamChat(input)) {
      const event = normalizeHttpProviderChunk(chunk);
      if (event) {
        yield event;
      }
    }
  }
}
