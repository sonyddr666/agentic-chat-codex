"use client";

import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Gauge,
  KeyRound,
  Loader2,
  LogIn,
  RefreshCcw,
  Upload,
  XCircle
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CodexAuthStatus, CodexSafeAccount } from "@/lib/types";

type DeviceFlow = {
  flowId: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
};

type AuthPanelProps = {
  status: CodexAuthStatus | null;
  onStatusChange: (status: CodexAuthStatus) => void;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatPct(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value)}%` : "-";
}

function formatReset(value: number | null | undefined) {
  if (!value) {
    return "-";
  }

  const delta = value - Date.now() / 1000;
  if (delta <= 0) {
    return "agora";
  }

  const hours = Math.floor(delta / 3600);
  const minutes = Math.floor((delta % 3600) / 60);
  return hours > 0 ? `${hours}h${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

function formatExpiry(value: number | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value * 1000));
}

function quotaClass(account: CodexSafeAccount) {
  const values = [account.usage?.fiveHourPct, account.usage?.weeklyPct].filter(
    (value): value is number => typeof value === "number"
  );
  if (values.length === 0) {
    return "text-muted";
  }

  const lowest = Math.min(...values);
  if (lowest <= 0) {
    return "text-berry";
  }

  if (lowest <= 50) {
    return "text-amber";
  }

  return "text-teal";
}

export function AuthPanel({ status, onStatusChange }: AuthPanelProps) {
  const [importValue, setImportValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlow | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<"idle" | "listening" | "approved">("idle");
  const accounts = status?.accounts ?? [];

  const activeLabel = useMemo(() => {
    if (!status?.activeAccount) {
      return "No account";
    }

    return status.activeAccount.email !== "-"
      ? status.activeAccount.email
      : status.activeAccount.label;
  }, [status]);

  const loadStatus = async () => {
    const next = await fetchJson<CodexAuthStatus>("/api/auth/status");
    onStatusChange(next);
  };

  useEffect(() => {
    if (!status) {
      void loadStatus().catch((loadError: Error) => setError(loadError.message));
    }
  }, [status]);

  useEffect(() => {
    if (!deviceFlow || deviceStatus !== "listening") {
      return;
    }

    const interval = window.setInterval(() => {
      void pollDevice();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [deviceFlow, deviceStatus]);

  const importAuth = async (event: FormEvent) => {
    event.preventDefault();
    const value = importValue.trim();
    if (!value) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = value.startsWith("{") || value.startsWith("[") ? { json: value } : { path: value };
      const result = await fetchJson<{ status: CodexAuthStatus }>("/api/auth/import", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      onStatusChange(result.status);
      setImportValue("");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const refreshUsage = async () => {
    setBusy(true);
    setError(null);
    try {
      onStatusChange(
        await fetchJson<CodexAuthStatus>("/api/auth/usage/refresh", {
          method: "POST"
        })
      );
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Usage refresh failed.");
    } finally {
      setBusy(false);
    }
  };

  const startDevice = async () => {
    setBusy(true);
    setError(null);
    try {
      const flow = await fetchJson<DeviceFlow>("/api/auth/device/start", { method: "POST" });
      setDeviceFlow(flow);
      setDeviceStatus("listening");
    } catch (deviceError) {
      setError(deviceError instanceof Error ? deviceError.message : "Device login failed.");
    } finally {
      setBusy(false);
    }
  };

  const pollDevice = async () => {
    if (!deviceFlow) {
      return;
    }

    try {
      const result = await fetchJson<
        | { status: "pending"; httpStatus: number }
        | { status: "approved"; authStatus: CodexAuthStatus }
      >("/api/auth/device/poll", {
        method: "POST",
        body: JSON.stringify({ flowId: deviceFlow.flowId })
      });

      if (result.status === "approved") {
        setDeviceStatus("approved");
        setDeviceFlow(null);
        onStatusChange(result.authStatus);
      }
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : "Device polling failed.");
      setDeviceStatus("idle");
    }
  };

  const copyDeviceCode = async () => {
    if (deviceFlow?.userCode) {
      await navigator.clipboard.writeText(deviceFlow.userCode).catch(() => {
        setError("Browser blocked clipboard access. Select and copy the code manually.");
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-panel p-3">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-teal" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{activeLabel}</div>
            <div className="truncate text-xs text-muted">
              {status?.provider ?? "codex-chatgpt"} / {status?.model ?? "gpt-5.4-mini"}
            </div>
          </div>
        </div>
        <div className="truncate rounded-md bg-paper px-2 py-1 text-xs text-muted">
          {status?.authPath ?? ".data/codex-auth.json"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          className="flex h-9 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-60"
          onClick={() => void refreshUsage()}
          disabled={busy || accounts.length === 0}
          title="Refresh usage"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Usage
        </button>
        <button
          className="flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-paper disabled:opacity-60"
          onClick={() => void startDevice()}
          disabled={busy || deviceStatus === "listening"}
          title="Device login"
        >
          <LogIn className="h-4 w-4" />
          Login
        </button>
      </div>

      <form className="rounded-lg border border-line bg-panel p-3" onSubmit={importAuth}>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Upload className="h-4 w-4 text-amber" />
          Import auth
        </div>
        <textarea
          className="thin-scrollbar min-h-24 w-full resize-none rounded-md border border-line bg-paper p-2 text-xs outline-none focus:border-teal"
          value={importValue}
          onChange={(event) => setImportValue(event.target.value)}
          placeholder=".data/codex-auth.json or pasted JSON"
        />
        <button
          className="mt-2 h-9 w-full rounded-md bg-ink text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60"
          disabled={busy || !importValue.trim()}
          type="submit"
        >
          Import
        </button>
      </form>

      {deviceFlow ? (
        <div className="rounded-lg border border-teal/30 bg-teal/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-teal">
            {deviceStatus === "approved" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Device code
          </div>
          <button
            className="mb-2 h-12 w-full rounded-md border border-line bg-panel font-mono text-xl font-semibold tracking-wide"
            onClick={() => void copyDeviceCode()}
            title="Copy code"
            type="button"
          >
            {deviceFlow.userCode}
            <Copy className="ml-2 inline h-4 w-4 align-middle" />
          </button>
          <a
            className="flex h-9 items-center justify-center gap-2 rounded-md bg-teal text-sm font-semibold text-white hover:bg-teal/90"
            href={deviceFlow.verificationUri}
            target="_blank"
            rel="noreferrer"
          >
            Open OpenAI
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-berry/30 bg-berry/10 p-3 text-sm text-berry">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        {accounts.map((account) => (
          <div
            key={account.id}
            className={classNames(
              "rounded-lg border bg-panel p-3",
              account.isActive ? "border-teal/40" : "border-line"
            )}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{account.email}</div>
                <div className="truncate text-xs text-muted">
                  {account.label} / {account.accountIdMasked}
                </div>
              </div>
              {account.status === "OK" || account.status === "RENOVADO" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-amber" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-paper p-2">
                <div className="text-muted">5h</div>
                <div className={classNames("font-semibold", quotaClass(account))}>
                  {formatPct(account.usage?.fiveHourPct)}
                </div>
                <div className="text-muted">{formatReset(account.usage?.fiveHourReset)}</div>
              </div>
              <div className="rounded-md bg-paper p-2">
                <div className="text-muted">Weekly</div>
                <div className={classNames("font-semibold", quotaClass(account))}>
                  {formatPct(account.usage?.weeklyPct)}
                </div>
                <div className="text-muted">{formatReset(account.usage?.weeklyReset)}</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted">
              <div className="flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5" />
                {account.usage?.plan ?? "-"}
              </div>
              <div>{formatExpiry(account.expiresAt)}</div>
              <div>{account.status}</div>
              <div>{account.businessName}</div>
            </div>
          </div>
        ))}

        {accounts.length === 0 ? (
          <div className="rounded-lg border border-line bg-panel p-6 text-center text-sm text-muted">
            No Codex accounts configured.
          </div>
        ) : null}
      </div>
    </div>
  );
}
