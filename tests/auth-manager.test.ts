import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodexAuthManager,
  normalizeAccounts,
  parseCodexUsage
} from "@/lib/codex/auth-manager";

const tempDirs: string[] = [];

function tempPath(name = "codex-auth.json") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-auth-manager-"));
  tempDirs.push(directory);
  return path.join(directory, name);
}

function fakeJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("codex auth normalization", () => {
  it("normalizes nested, flat, and credential pool formats", () => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = fakeJwt({
      exp: expires,
      email: "flat@example.com",
      "https://api.openai.com/auth": { chatgpt_account_id: "acc_flat" }
    });

    expect(
      normalizeAccounts({
        tokens: {
          access_token: fakeJwt({ exp: expires, email: "nested@example.com" }),
          refresh_token: "nested-refresh",
          expires_at: expires * 1000
        },
        accountId: "acc_nested"
      })[0]
    ).toMatchObject({
      email: "nested@example.com",
      account_id: "acc_nested",
      expires_at: expires
    });

    expect(normalizeAccounts({ access: token, refresh: "flat-refresh" })[0]).toMatchObject({
      email: "flat@example.com",
      account_id: "acc_flat"
    });

    expect(
      normalizeAccounts({
        credential_pool: {
          "openai-codex": [
            {
              label: "pool",
              access_token: fakeJwt({ exp: expires, email: "pool@example.com" }),
              refresh_token: "pool-refresh",
              account_id: "acc_pool"
            }
          ]
        }
      })[0]
    ).toMatchObject({
      label: "pool",
      email: "pool@example.com",
      account_id: "acc_pool"
    });
  });
});

describe("codex usage parser", () => {
  it("finds quota percentages and reset windows recursively", () => {
    const usage = parseCodexUsage({
      plan_type: "Plus",
      limits: {
        primary: {
          used_percent: 25,
          primary_window: {
            reset_time_ms: 1_800_000_000_000
          }
        },
        weekly: {
          remaining_percent: 60,
          reset_after_seconds: 600
        }
      }
    });

    expect(usage.plan).toBe("Plus");
    expect(usage.fiveHourPct).toBe(75);
    expect(usage.fiveHourReset).toBe(1_800_000_000);
    expect(usage.weeklyPct).toBe(60);
    expect(usage.weeklyReset).toBeGreaterThan(Date.now() / 1000);
  });
});

describe("codex auth manager", () => {
  it("chooses the account with the best quota", async () => {
    const authPath = tempPath();
    const now = Math.floor(Date.now() / 1000) + 3600;
    await fs.promises.writeFile(
      authPath,
      JSON.stringify({
        credential_pool: {
          "openai-codex": [
            {
              label: "low",
              access_token: fakeJwt({ exp: now, email: "low@example.com" }),
              refresh_token: "low-refresh",
              account_id: "acc_low",
              status: "OK",
              usage: { fiveHourPct: 10, weeklyPct: 20 }
            },
            {
              label: "high",
              access_token: fakeJwt({ exp: now, email: "high@example.com" }),
              refresh_token: "high-refresh",
              account_id: "acc_high",
              status: "OK",
              usage: { fiveHourPct: 80, weeklyPct: 70 }
            }
          ]
        }
      }),
      "utf8"
    );

    const manager = new CodexAuthManager({ authPath });
    const credential = await manager.getCredentialForRequest();

    expect(credential.email).toBe("high@example.com");
    expect(credential.accountId).toBe("acc_high");
  });

  it("runs device code flow and stores the approved account", async () => {
    const authPath = tempPath();
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = fakeJwt({
      exp: expires,
      email: "device@example.com",
      "https://api.openai.com/auth": { chatgpt_account_id: "acc_device" }
    });
    const fetchStub: typeof fetch = async (url, init) => {
      const target = String(url);
      if (target.includes("usercode")) {
        return Response.json({
          user_code: "ABCD-EFGH",
          device_auth_id: "dev_123",
          verification_uri: "https://auth.openai.com/codex/device"
        });
      }

      if (target.includes("deviceauth/token")) {
        return Response.json({
          authorization_code: "auth_code",
          code_verifier: "verifier"
        });
      }

      expect(init?.method).toBe("POST");
      return Response.json({
        access_token: token,
        refresh_token: "device-refresh",
        expires_in: 3600
      });
    };

    const manager = new CodexAuthManager({ authPath, fetchImpl: fetchStub });
    const flow = await manager.startDeviceFlow();
    const result = await manager.pollDeviceFlow(flow.flowId);

    expect(result.status).toBe("approved");
    expect((await manager.status()).accounts[0]).toMatchObject({
      email: "device@example.com",
      accountIdMasked: "acc_de...vice"
    });
  });
});
