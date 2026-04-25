"use client";

import { Bot, Terminal, Wand2 } from "lucide-react";
import { useState } from "react";
import type { AgentMode } from "@/lib/mode/mode-types";

const OPTIONS: Array<{ value: AgentMode; label: string; icon: typeof Bot }> = [
  { value: "auto", label: "Auto", icon: Wand2 },
  { value: "normal", label: "Normal", icon: Bot },
  { value: "cli", label: "Codex CLI", icon: Terminal }
];

export function ProviderModeSelector({
  value,
  disabled,
  onChange
}: {
  value: AgentMode;
  disabled?: boolean;
  onChange: (value: AgentMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = OPTIONS.find((option) => option.value === value) ?? OPTIONS[0];
  const ActiveIcon = active.icon;

  return (
    <div className="relative inline-block min-w-0">
      <button
        type="button"
        className="flex h-8 min-w-28 items-center gap-2 rounded-md border border-line bg-panel px-3 text-xs font-semibold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={`Modo ${active.label}`}
      >
        <ActiveIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{active.label}</span>
      </button>
      {open && !disabled ? (
        <div className="absolute bottom-full left-0 z-40 mb-1 w-40 overflow-hidden rounded-md border border-line bg-paper shadow-soft">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={[
                  "flex h-8 w-full items-center gap-2 px-3 text-left text-xs font-semibold hover:bg-panel",
                  selected ? "bg-teal text-white hover:bg-teal/90" : "text-ink"
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="fixed inset-0 -z-10 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Fechar seletor de modo"
          />
        </div>
      ) : null}
    </div>
  );
}
