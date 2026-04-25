"use client";

import { AlertTriangle, CheckCircle2, GitBranch, ShieldCheck } from "lucide-react";
import type { ModeDecision } from "@/lib/mode/mode-types";
import type { Run } from "@/lib/types";

export function ModeDecisionPanel({
  run,
  decision
}: {
  run: Run | null;
  decision: ModeDecision | null;
}) {
  if (!run && !decision) {
    return null;
  }

  const mode = decision?.mode ?? run?.mode ?? "normal";
  const providerId = decision?.providerId ?? run?.providerId ?? "codex-http";
  const reasons = decision?.reasons ?? run?.modeDecisionReasons ?? [];
  const fallback = decision?.fallback;
  const capabilities = run?.capabilitiesSnapshot ?? null;
  const effortLabels = {
    low: "Baixa",
    medium: "Media",
    high: "Alta",
    xhigh: "Altissimo"
  } as const;
  const reasoningEffort = run?.reasoningEffort ?? "xhigh";

  return (
    <div className="rounded-lg border border-line bg-paper p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <GitBranch className="h-4 w-4 text-teal" />
        Mode decision
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3 rounded-md bg-panel px-3 py-2">
          <span className="text-muted">Mode</span>
          <span className="font-medium">{mode === "cli" ? "Codex CLI" : "Normal"}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md bg-panel px-3 py-2">
          <span className="text-muted">Provider</span>
          <span className="truncate font-medium">{providerId}</span>
        </div>
        {run ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-panel px-3 py-2">
            <span className="text-muted">Inteligencia</span>
            <span className="font-medium">{effortLabels[reasoningEffort]}</span>
          </div>
        ) : null}
        {decision ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-panel px-3 py-2">
            <span className="text-muted">Confidence</span>
            <span className="font-medium">{Math.round(decision.confidence * 100)}%</span>
          </div>
        ) : null}
      </div>

      {fallback ? (
        <div className="mt-3 rounded-md border border-amber/30 bg-amber/10 p-3 text-xs leading-5">
          <div className="mb-1 flex items-center gap-2 font-semibold text-ink">
            <AlertTriangle className="h-4 w-4 text-amber" />
            Fallback active
          </div>
          <div className="text-muted">{fallback.reason}</div>
        </div>
      ) : null}

      {reasons.length ? (
        <div className="mt-3 space-y-1.5">
          {reasons.map((reason) => (
            <div key={reason} className="flex gap-2 text-xs leading-5 text-muted">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
              <span>{reason}</span>
            </div>
          ))}
        </div>
      ) : null}

      {capabilities ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(capabilities)
            .filter(([, enabled]) => enabled)
            .slice(0, 8)
            .map(([name]) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded border border-line bg-panel px-2 py-1 text-[11px] text-muted"
              >
                <ShieldCheck className="h-3 w-3" />
                {name}
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}
