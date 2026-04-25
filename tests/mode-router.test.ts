import { describe, expect, it } from "vitest";
import { decideAgentMode } from "@/lib/mode/mode-router";

describe("mode router", () => {
  it("keeps normal tasks in normal mode", () => {
    const decision = decideAgentMode({
      prompt: "Explique essa arquitetura e crie um plano tecnico.",
      projectSelected: true,
      explicitMode: "auto",
      cliAvailability: { available: true }
    });

    expect(decision.mode).toBe("normal");
    expect(decision.providerId).toBe("codex-http");
  });

  it("selects CLI for build and test tasks when available", () => {
    const decision = decideAgentMode({
      prompt: "Roda npm test, corrige ate passar e depois roda typecheck.",
      projectSelected: true,
      explicitMode: "auto",
      cliAvailability: { available: true, version: "codex 1.0.0" }
    });

    expect(decision.mode).toBe("cli");
    expect(decision.providerId).toBe("codex-cli-mcp");
    expect(decision.requiresApproval).toBe(true);
    expect(decision.reasons.join(" ")).toMatch(/testes|debug|comandos/i);
  });

  it("manual normal override wins over CLI-like prompts", () => {
    const decision = decideAgentMode({
      prompt: "Roda npm test e corrige o build.",
      projectSelected: true,
      explicitMode: "normal",
      cliAvailability: { available: true }
    });

    expect(decision.mode).toBe("normal");
    expect(decision.confidence).toBe(1);
  });

  it("falls back to normal when CLI is requested but unavailable", () => {
    const decision = decideAgentMode({
      prompt: "Refatora varios arquivos.",
      projectSelected: true,
      explicitMode: "cli",
      cliAvailability: {
        available: false,
        reason: "not_found",
        detail: "Codex CLI nao foi encontrada no PATH."
      }
    });

    expect(decision.mode).toBe("normal");
    expect(decision.providerId).toBe("codex-http");
    expect(decision.fallback?.from).toBe("cli");
  });
});
