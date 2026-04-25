"use client";

import { Brain, Check } from "lucide-react";
import { useState } from "react";
import type { AgentReasoningEffort } from "@/lib/mode/mode-types";

const OPTIONS: Array<{ value: AgentReasoningEffort; label: string }> = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "xhigh", label: "Altissimo" }
];

export function ReasoningEffortSelector({
  value,
  disabled,
  onChange
}: {
  value: AgentReasoningEffort;
  disabled?: boolean;
  onChange: (value: AgentReasoningEffort) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = OPTIONS.find((option) => option.value === value) ?? OPTIONS[3];

  return (
    <div className="relative inline-block min-w-0">
      <button
        type="button"
        className="flex h-8 min-w-24 items-center gap-2 rounded-md border border-line bg-panel px-3 text-xs font-semibold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={`Thinking ${active.label}`}
      >
        <Brain className="h-3.5 w-3.5 shrink-0 text-teal" />
        <span className="truncate">{active.label}</span>
      </button>
      {open && !disabled ? (
        <div className="absolute bottom-full right-0 z-40 mb-1 w-40 overflow-hidden rounded-md border border-line bg-paper shadow-soft">
          <div className="px-3 py-1.5 text-xs font-semibold text-muted">Thinking</div>
          {OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={[
                  "flex h-8 w-full items-center justify-between gap-2 px-3 text-left text-xs font-semibold hover:bg-panel",
                  selected ? "bg-teal text-white hover:bg-teal/90" : "text-ink"
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selected ? <Check className="h-3.5 w-3.5" /> : null}
              </button>
            );
          })}
          <button
            type="button"
            className="fixed inset-0 -z-10 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Fechar seletor de thinking"
          />
        </div>
      ) : null}
    </div>
  );
}
