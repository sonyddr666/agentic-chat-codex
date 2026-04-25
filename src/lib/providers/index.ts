import { CodexHttpProvider } from "./codex-http-provider";
import { CodexCliMcpProvider } from "./codex-cli-mcp-provider";
import type { AgentProvider } from "./agent-provider";
import type { AgentProviderId } from "@/lib/mode/mode-types";

export function getAgentProvider(providerId: AgentProviderId): AgentProvider {
  if (providerId === "codex-cli-mcp") {
    return new CodexCliMcpProvider();
  }

  return new CodexHttpProvider({
    authPath: process.env.CODEX_AUTH_PATH,
    model: process.env.CODEX_MODEL,
    timeout: process.env.CODEX_TIMEOUT_MS ? Number(process.env.CODEX_TIMEOUT_MS) : undefined
  });
}
