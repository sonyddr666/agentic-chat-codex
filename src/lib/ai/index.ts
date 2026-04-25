import type { AIProvider } from "./provider";
import { CodexChatGptProvider } from "./codex-chatgpt-provider";

export function getAIProvider(): AIProvider {
  return new CodexChatGptProvider({
    authPath: process.env.CODEX_AUTH_PATH,
    model: process.env.CODEX_MODEL,
    timeout: process.env.CODEX_TIMEOUT_MS ? Number(process.env.CODEX_TIMEOUT_MS) : undefined
  });
}
