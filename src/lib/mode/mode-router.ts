import type { AgentMode, CliAvailability, ModeDecision, ResolvedAgentMode } from "./mode-types";
import { providerIdForMode } from "./mode-types";

const CLI_SIGNAL_PATTERNS: Array<{ pattern: RegExp; reason: string; weight: number }> = [
  { pattern: /\b(repo|codebase|monorepo)\b/i, reason: "tarefa menciona codebase ou repo", weight: 2 },
  { pattern: /\b(refactor|refatora|refatore|migra(?:r|cao|ção)|feature integrada)\b/i, reason: "tarefa sugere refatoracao ou feature integrada", weight: 2 },
  { pattern: /\b(corrige ate passar|corrija ate passar|debug|depura|investiga)\b/i, reason: "tarefa pede debug iterativo", weight: 2 },
  { pattern: /\b(testes?|npm test|typecheck|build|lint|ci)\b/i, reason: "tarefa menciona testes ou build", weight: 2 },
  { pattern: /\b(PR|pull request|branch|commit)\b/i, reason: "tarefa envolve fluxo Git/GitHub", weight: 2 },
  { pattern: /\b(multiplos arquivos|muitos arquivos|varios arquivos|vários arquivos)\b/i, reason: "tarefa envolve multiplos arquivos", weight: 2 },
  { pattern: /\b(instalar dependencia|instale dependencia|npm install|pnpm add|yarn add)\b/i, reason: "tarefa pode instalar dependencias", weight: 3 },
  { pattern: /\b(shell|terminal|comando|executa|roda)\b/i, reason: "tarefa pode exigir execucao de comandos", weight: 1 }
];

const NORMAL_SIGNAL_PATTERNS: Array<{ pattern: RegExp; reason: string; weight: number }> = [
  { pattern: /\b(explique|explica|resuma|resume|compare|planeje|plano)\b/i, reason: "tarefa e principalmente conversa ou planejamento", weight: 2 },
  { pattern: /\b(pesquise|busca|buscar|web|rss|http|curl|endpoint)\b/i, reason: "tarefa usa pesquisa ou HTTP leve", weight: 2 },
  { pattern: /\b(voz|fale|converse|live mode)\b/i, reason: "tarefa e de conversa ou voz", weight: 2 },
  { pattern: /\b(readme|documentacao|documentação|texto|prompt)\b/i, reason: "tarefa e textual ou documental", weight: 1 },
  { pattern: /\b(html simples|landing estatica|landing estática|arquivo isolado)\b/i, reason: "tarefa parece artefato isolado", weight: 2 }
];

export type ModeRouterInput = {
  prompt: string;
  projectSelected: boolean;
  filesMentioned?: string[];
  explicitMode?: AgentMode;
  cliAvailability?: CliAvailability;
};

function normalizeMode(value: AgentMode | undefined): AgentMode {
  return value === "normal" || value === "cli" || value === "auto" ? value : "auto";
}

function scorePrompt(prompt: string) {
  const cliReasons: string[] = [];
  const normalReasons: string[] = [];
  let cli = 0;
  let normal = 0;

  for (const signal of CLI_SIGNAL_PATTERNS) {
    if (signal.pattern.test(prompt)) {
      cli += signal.weight;
      cliReasons.push(signal.reason);
    }
  }

  for (const signal of NORMAL_SIGNAL_PATTERNS) {
    if (signal.pattern.test(prompt)) {
      normal += signal.weight;
      normalReasons.push(signal.reason);
    }
  }

  return { cli, normal, cliReasons, normalReasons };
}

function cliUnavailableReason(cliAvailability: CliAvailability) {
  if (cliAvailability.detail) {
    return cliAvailability.detail;
  }

  if (cliAvailability.reason === "not_found") {
    return "Codex CLI nao foi encontrada no PATH.";
  }

  if (cliAvailability.reason === "mcp_failed") {
    return "Codex CLI foi encontrada, mas o MCP nao respondeu corretamente.";
  }

  if (cliAvailability.reason === "execution_blocked") {
    return "A execucao da Codex CLI foi bloqueada neste ambiente.";
  }

  if (cliAvailability.reason === "remote_environment") {
    return "Este ambiente nao parece permitir uso local da Codex CLI.";
  }

  return "Codex CLI nao esta disponivel neste ambiente.";
}

export function decideAgentMode(input: ModeRouterInput): ModeDecision {
  const requestedMode = normalizeMode(input.explicitMode);
  const cliAvailability = input.cliAvailability ?? { available: false, reason: "unknown" };
  const cliAvailable = cliAvailability.available;
  const scores = scorePrompt(input.prompt);

  let mode: ResolvedAgentMode = "normal";
  let confidence = 0.7;
  let reasons = ["tarefa compativel com modo normal"];

  if (requestedMode === "normal") {
    mode = "normal";
    confidence = 1;
    reasons = ["modo normal solicitado pelo usuario"];
  } else if (requestedMode === "cli") {
    mode = "cli";
    confidence = 1;
    reasons = ["modo Codex CLI solicitado pelo usuario"];
  } else if (scores.cli >= 3 && scores.cli > scores.normal && input.projectSelected) {
    mode = "cli";
    confidence = 0.82;
    reasons = scores.cliReasons.slice(0, 4);
  } else if (scores.normal > 0) {
    mode = "normal";
    confidence = Math.min(0.9, 0.68 + scores.normal * 0.04);
    reasons = scores.normalReasons.slice(0, 4);
  }

  if (mode === "cli" && !cliAvailable) {
    const diagnosticReason = cliUnavailableReason(cliAvailability);
    return {
      requestedMode,
      mode: "normal",
      providerId: providerIdForMode("normal"),
      confidence,
      reasons: [...reasons, "fallback para modo normal porque Codex CLI nao esta disponivel"],
      requiresApproval: false,
      cliAvailable: false,
      fallback: {
        from: "cli",
        to: "normal",
        reason: diagnosticReason,
        diagnostic: cliAvailability
      }
    };
  }

  return {
    requestedMode,
    mode,
    providerId: providerIdForMode(mode),
    confidence,
    reasons,
    requiresApproval: mode === "cli",
    cliAvailable
  };
}
