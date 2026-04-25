"use client";

import { Bot, ShieldCheck, Terminal } from "lucide-react";
import type {
  AgentProviderCapabilities,
  AgentProviderId,
  ResolvedAgentMode
} from "@/lib/mode/mode-types";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ProviderModeBadge({
  mode,
  providerId,
  capabilities,
  compact = false
}: {
  mode: ResolvedAgentMode;
  providerId: AgentProviderId;
  capabilities: AgentProviderCapabilities | null;
  compact?: boolean;
}) {
  const isCli = mode === "cli";
  const Icon = isCli ? Terminal : Bot;
  const label = isCli ? "Codex CLI" : "Normal";
  const providerLabel = providerId === "codex-cli-mcp" ? "codex mcp-server" : "Codex HTTP";
  const capabilityLabels = [
    capabilities?.textStreaming ? "streaming" : null,
    capabilities?.reasoningDeltas ? "reasoning" : null,
    capabilities?.commandOutputDeltas ? "command output" : null,
    capabilities?.sandbox ? "sandbox" : null,
    capabilities?.approvals ? "approvals" : null
  ].filter(Boolean);

  return (
    <div
      className={classNames(
        "flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
        isCli ? "border-amber/40 bg-amber/10" : "border-teal/30 bg-teal/10"
      )}
      title={`${label} / ${providerLabel}`}
    >
      <Icon className={classNames("h-3.5 w-3.5 shrink-0", isCli ? "text-amber" : "text-teal")} />
      <span className="shrink-0 font-semibold">{label}</span>
      {compact ? null : (
        <>
          <span className="text-muted">/</span>
          <span className="min-w-0 truncate text-muted">{providerLabel}</span>
          {capabilityLabels.length ? (
            <span className="hidden shrink-0 items-center gap-1 text-muted sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              {capabilityLabels.slice(0, 3).join(", ")}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
