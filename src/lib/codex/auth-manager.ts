import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { CodexAuthStatus, CodexSafeAccount, CodexUsage } from "@/lib/types";

const DEFAULT_AUTH_PATH = ".data/codex-auth.json";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const DEVICE_REDIRECT_URI = "https://auth.openai.com/deviceauth/callback";
const OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const ACCOUNTS_URL = "https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27";
const DEVICE_USER_CODE_URL = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_TOKEN_URL = "https://auth.openai.com/api/accounts/deviceauth/token";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

type UnknownRecord = Record<string, unknown>;

export type CodexAccountRecord = {
  id: string;
  label: string;
  auth_type: "oauth";
  access_token: string;
  refresh_token: string;
  account_id: string;
  expires_at?: number;
  email?: string;
  business_name?: string;
  status?: string;
  http_status?: number | string;
  usage?: CodexUsage;
  last_checked_at?: string;
};

type CodexStorage = {
  credential_pool: {
    "openai-codex": CodexAccountRecord[];
  };
};

type DeviceFlow = {
  deviceAuthId: string;
  userCode: string;
  verificationUri: string;
  createdAt: number;
};

type RefreshPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
};

const deviceFlows = new Map<string, DeviceFlow>();

export type CodexCredential = {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  label: string;
  email: string;
};

export type CodexAuthManagerConfig = {
  authPath?: string;
  fetchImpl?: typeof fetch;
  provider?: string;
  model?: string;
};

export class CodexAuthManager {
  private readonly authPath: string;
  private readonly fetchImpl: typeof fetch;
  private readonly provider: string;
  private readonly model: string;
  private refreshing = new Map<string, Promise<CodexAccountRecord>>();

  constructor({
    authPath = process.env.CODEX_AUTH_PATH ?? DEFAULT_AUTH_PATH,
    fetchImpl = fetch,
    provider = "codex-chatgpt",
    model = process.env.CODEX_MODEL ?? "gpt-5.4-mini"
  }: CodexAuthManagerConfig = {}) {
    this.authPath = path.resolve(authPath);
    this.fetchImpl = fetchImpl;
    this.provider = provider || "codex-chatgpt";
    this.model = model;
  }

  getAuthPath() {
    return this.authPath;
  }

  async status(): Promise<CodexAuthStatus> {
    const storage = await this.loadStorage();
    const active = this.chooseBestAccount(storage.credential_pool["openai-codex"]);

    return {
      provider: this.provider,
      model: this.model,
      authPath: this.authPath,
      activeAccountId: active?.id ?? null,
      activeAccount: active ? sanitizeAccount(active, active.id) : null,
      accounts: storage.credential_pool["openai-codex"].map((account) =>
        sanitizeAccount(account, active?.id ?? null)
      )
    };
  }

  async getCredentialForRequest(): Promise<CodexCredential> {
    const storage = await this.loadStorage();
    const selected = this.chooseBestAccount(storage.credential_pool["openai-codex"]);
    if (!selected) {
      throw new Error("No Codex auth accounts configured. Import auth.json or use device login.");
    }

    const fresh = await this.ensureFreshAccount(selected.id);
    return {
      accessToken: fresh.access_token,
      refreshToken: fresh.refresh_token,
      accountId: fresh.account_id,
      label: fresh.label,
      email: fresh.email ?? jwtEmail(fresh.access_token)
    };
  }

  async importFromPath(filePath: string) {
    const raw = await fs.readFile(path.resolve(filePath), "utf8");
    return this.importFromJson(raw, path.basename(filePath));
  }

  async importFromJson(jsonText: string, sourceLabel = "imported") {
    const parsed = JSON.parse(jsonText) as unknown;
    const imported = normalizeAccounts(parsed, sourceLabel);
    if (imported.length === 0) {
      throw new Error("No Codex accounts were found in this auth payload.");
    }

    const storage = await this.loadStorage();
    const merged = mergeAccounts(storage.credential_pool["openai-codex"], imported);
    storage.credential_pool["openai-codex"] = merged;
    await this.saveStorage(storage);

    return {
      imported: imported.length,
      status: await this.status()
    };
  }

  async refreshUsageForAll() {
    const storage = await this.loadStorage();
    const accounts = storage.credential_pool["openai-codex"];

    for (const account of accounts) {
      await this.refreshUsageForAccount(account).catch((error: unknown) => {
        account.status = error instanceof Error ? error.message : "Usage refresh failed";
        account.http_status = "-";
        account.last_checked_at = new Date().toISOString();
      });
    }

    await this.saveStorage(storage);
    return this.status();
  }

  async startDeviceFlow() {
    const response = await this.fetchImpl(DEVICE_USER_CODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA
      },
      body: JSON.stringify({ client_id: CLIENT_ID })
    });

    if (!response.ok) {
      throw new Error(`Device code failed: HTTP ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      user_code?: string;
      device_auth_id?: string;
      verification_uri?: string;
      expires_in?: number;
    };
    if (!payload.user_code || !payload.device_auth_id) {
      throw new Error("Device code response was missing required fields.");
    }

    const flowId = createId("flow");
    const verificationUri = payload.verification_uri ?? "https://auth.openai.com/codex/device";
    deviceFlows.set(flowId, {
      deviceAuthId: payload.device_auth_id,
      userCode: payload.user_code,
      verificationUri,
      createdAt: Date.now()
    });

    return {
      flowId,
      userCode: payload.user_code,
      verificationUri,
      expiresAt: new Date(Date.now() + (payload.expires_in ?? 900) * 1000).toISOString()
    };
  }

  async pollDeviceFlow(flowId: string) {
    const flow = deviceFlows.get(flowId);
    if (!flow) {
      throw new Error("Device flow not found or expired.");
    }

    const pollResponse = await this.fetchImpl(DEVICE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_auth_id: flow.deviceAuthId,
        user_code: flow.userCode
      })
    });

    if (pollResponse.status !== 200) {
      return {
        status: "pending" as const,
        httpStatus: pollResponse.status
      };
    }

    const pollPayload = (await pollResponse.json()) as {
      authorization_code?: string;
      code_verifier?: string;
    };
    if (!pollPayload.authorization_code || !pollPayload.code_verifier) {
      throw new Error("Device poll response was missing exchange fields.");
    }

    const tokenPayload = await this.exchangeAuthorizationCode(
      pollPayload.authorization_code,
      pollPayload.code_verifier
    );
    await this.importFromJson(JSON.stringify(tokensToPlainAuth(tokenPayload)), "device-login");
    deviceFlows.delete(flowId);

    return {
      status: "approved" as const,
      authStatus: await this.status()
    };
  }

  private async refreshUsageForAccount(account: CodexAccountRecord) {
    const fresh = await this.ensureFreshAccount(account.id);
    const headers = this.authHeaders(fresh);
    const response = await this.fetchImpl(USAGE_URL, {
      method: "GET",
      headers
    });

    account.http_status = response.status;
    account.last_checked_at = new Date().toISOString();

    if (response.status === 401) {
      const renewed = await this.refreshAccount(fresh);
      const retry = await this.fetchImpl(USAGE_URL, {
        method: "GET",
        headers: this.authHeaders(renewed)
      });
      account.http_status = retry.status;
      if (retry.ok) {
        account.status = "OK";
        account.usage = parseCodexUsage((await retry.json()) as UnknownRecord);
      } else {
        account.status = `HTTP ${retry.status}`;
      }
    } else if (response.ok) {
      account.status = "OK";
      account.usage = parseCodexUsage((await response.json()) as UnknownRecord);
    } else if (response.status === 429) {
      account.status = "ESGOTADO";
    } else {
      account.status = `HTTP ${response.status}`;
    }

    if (account.status === "OK") {
      account.business_name = await this.fetchBusinessName(account).catch(() => account.business_name);
    }
  }

  private async fetchBusinessName(account: CodexAccountRecord) {
    const response = await this.fetchImpl(ACCOUNTS_URL, {
      method: "GET",
      headers: this.authHeaders(account)
    });

    if (!response.ok) {
      return account.business_name ?? "Unknown";
    }

    const payload = (await response.json()) as {
      accounts?: Record<string, { name?: string; is_active?: boolean }>;
    };
    const accounts = payload.accounts ?? {};
    if (account.account_id && accounts[account.account_id]) {
      return accounts[account.account_id].name || "Personal";
    }

    const active = Object.values(accounts).find((item) => item.is_active);
    return active?.name || "Personal";
  }

  private async ensureFreshAccount(accountId: string) {
    const storage = await this.loadStorage();
    const account = storage.credential_pool["openai-codex"].find((item) => item.id === accountId);
    if (!account) {
      throw new Error("Selected Codex account was not found.");
    }

    if (!isExpiring(account)) {
      return account;
    }

    const refreshing = this.refreshing.get(account.id);
    if (refreshing) {
      return refreshing;
    }

    const promise = this.refreshAccount(account).finally(() => {
      this.refreshing.delete(account.id);
    });
    this.refreshing.set(account.id, promise);
    return promise;
  }

  private async refreshAccount(account: CodexAccountRecord) {
    if (!account.refresh_token) {
      throw new Error("Codex account is missing a refresh token.");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      refresh_token: account.refresh_token
    });

    const response = await this.fetchImpl(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA
      },
      body
    });

    if (!response.ok) {
      account.status = "MORTO";
      await this.updateAccount(account);
      throw new Error(`Codex refresh failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as RefreshPayload;
    account.access_token = payload.access_token ?? account.access_token;
    account.refresh_token = payload.refresh_token ?? account.refresh_token;
    account.expires_at = payload.expires_in
      ? Math.floor(Date.now() / 1000) + payload.expires_in
      : jwtExp(account.access_token) ?? account.expires_at;
    account.email = jwtEmail(account.access_token) || account.email;
    account.account_id = jwtAccountId(account.access_token) || account.account_id;
    account.status = "RENOVADO";
    await this.updateAccount(account);
    return account;
  }

  private async exchangeAuthorizationCode(code: string, codeVerifier: string) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      redirect_uri: DEVICE_REDIRECT_URI
    });

    const response = await this.fetchImpl(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA
      },
      body
    });

    if (!response.ok) {
      throw new Error(`Device token exchange failed: HTTP ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as RefreshPayload;
  }

  private async updateAccount(account: CodexAccountRecord) {
    const storage = await this.loadStorage();
    storage.credential_pool["openai-codex"] = storage.credential_pool["openai-codex"].map((item) =>
      item.id === account.id ? account : item
    );
    await this.saveStorage(storage);
  }

  private authHeaders(account: CodexAccountRecord) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${account.access_token}`,
      Accept: "application/json",
      Origin: "https://chatgpt.com",
      Referer: "https://chatgpt.com/",
      "User-Agent": UA
    };

    if (account.account_id) {
      headers["ChatGPT-Account-Id"] = account.account_id;
      headers["chatgpt-account-id"] = account.account_id;
    }

    return headers;
  }

  private chooseBestAccount(accounts: CodexAccountRecord[]) {
    const eligible = accounts.filter((account) => account.access_token && account.status !== "MORTO");
    if (eligible.length === 0) {
      return null;
    }

    return [...eligible].sort((a, b) => accountScore(b) - accountScore(a))[0] ?? null;
  }

  private async loadStorage(): Promise<CodexStorage> {
    try {
      const raw = await fs.readFile(this.authPath, "utf8");
      return toStorage(JSON.parse(raw) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyStorage();
      }

      throw error;
    }
  }

  private async saveStorage(storage: CodexStorage) {
    await fs.mkdir(path.dirname(this.authPath), { recursive: true });
    await fs.writeFile(this.authPath, JSON.stringify(storage, null, 2), "utf8");
  }
}

export function getCodexAuthManager(config?: CodexAuthManagerConfig) {
  return new CodexAuthManager(config);
}

export function parseCodexUsage(body: UnknownRecord): CodexUsage {
  const found: Array<{ pct: number; reset: number | null }> = [];

  function hunt(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(hunt);
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const obj = value as UnknownRecord;
    let pct = numberOrNull(obj.percent_left ?? obj.remaining_percent);
    const usedPct = numberOrNull(obj.used_percent);
    if (pct === null && usedPct !== null) {
      pct = 100 - usedPct;
    }

    if (pct !== null) {
      const primaryWindow = isRecord(obj.primary_window) ? obj.primary_window : null;
      let resetRaw =
        obj.reset_time_ms ??
        obj.reset_at ??
        primaryWindow?.reset_time_ms ??
        primaryWindow?.reset_at;
      if (resetRaw === undefined && obj.reset_after_seconds !== undefined) {
        const resetAfter = numberOrNull(obj.reset_after_seconds);
        resetRaw = resetAfter === null ? undefined : Date.now() / 1000 + resetAfter;
      }

      found.push({
        pct,
        reset: toEpochSeconds(resetRaw)
      });
    }

    Object.values(obj).forEach(hunt);
  }

  hunt(body);

  return {
    plan: String(body.plan_type ?? "Team/Biz"),
    fiveHourPct: found[0]?.pct ?? null,
    fiveHourReset: found[0]?.reset ?? null,
    weeklyPct: found[1]?.pct ?? null,
    weeklyReset: found[1]?.reset ?? null,
    updatedAt: new Date().toISOString()
  };
}

export function normalizeAccounts(input: unknown, sourceLabel = "auth"): CodexAccountRecord[] {
  const accounts: CodexAccountRecord[] = [];

  if (isRecord(input)) {
    const credentialPool = input.credential_pool;
    if (isRecord(credentialPool) && Array.isArray(credentialPool["openai-codex"])) {
      for (const entry of credentialPool["openai-codex"]) {
        const account = normalizeOneAccount(entry, sourceLabel);
        if (account) {
          accounts.push(account);
        }
      }
    }

    if (Array.isArray(input.accounts)) {
      for (const entry of input.accounts) {
        const account = normalizeOneAccount(entry, sourceLabel);
        if (account) {
          accounts.push(account);
        }
      }
    }

    const single = normalizeOneAccount(input, sourceLabel);
    if (single) {
      accounts.push(single);
    }
  }

  return mergeAccounts([], accounts);
}

function normalizeOneAccount(input: unknown, sourceLabel: string): CodexAccountRecord | null {
  if (!isRecord(input)) {
    return null;
  }

  const tokens = isRecord(input.tokens) ? input.tokens : null;
  const accessToken = cleanToken(
    stringOrEmpty(input.access_token ?? tokens?.access_token ?? input.access ?? tokens?.access)
  );
  if (!accessToken) {
    return null;
  }

  const refreshToken = cleanToken(
    stringOrEmpty(input.refresh_token ?? tokens?.refresh_token ?? input.refresh ?? tokens?.refresh)
  );
  const accountId =
    stringOrEmpty(input.account_id ?? input.accountId ?? tokens?.account_id ?? tokens?.accountId) ||
    jwtAccountId(accessToken);
  const email = stringOrEmpty(input.email) || jwtEmail(accessToken);
  const expiresAt =
    toEpochSeconds(input.expires_at ?? tokens?.expires_at ?? input.expires ?? tokens?.expires) ??
    jwtExp(accessToken) ??
    undefined;
  const label =
    stringOrEmpty(input.label ?? input.id) ||
    (email.includes("@") ? email.split("@")[0] : sourceLabel.replace(/\.json$/i, "")) ||
    "codex-account";

  return {
    id: stringOrEmpty(input.id) || createAccountId(accountId, email, accessToken),
    label,
    auth_type: "oauth",
    access_token: accessToken,
    refresh_token: refreshToken,
    account_id: accountId,
    expires_at: expiresAt,
    email,
    business_name: stringOrEmpty(input.business_name ?? input.businessName),
    status: stringOrEmpty(input.status ?? input.result) || "UNKNOWN",
    http_status: typeof input.http_status === "number" ? input.http_status : stringOrEmpty(input.http_status),
    usage: isRecord(input.usage) ? normalizeUsage(input.usage) : undefined,
    last_checked_at: stringOrEmpty(input.last_checked_at ?? input.lastCheckedAt)
  };
}

function normalizeUsage(input: UnknownRecord): CodexUsage {
  return {
    plan: stringOrEmpty(input.plan) || "Team/Biz",
    fiveHourPct: numberOrNull(input.fiveHourPct ?? input.five_hour_pct),
    fiveHourReset: toEpochSeconds(input.fiveHourReset ?? input.five_hour_reset),
    weeklyPct: numberOrNull(input.weeklyPct ?? input.weekly_pct),
    weeklyReset: toEpochSeconds(input.weeklyReset ?? input.weekly_reset),
    updatedAt: stringOrEmpty(input.updatedAt ?? input.updated_at) || new Date().toISOString()
  };
}

function mergeAccounts(existing: CodexAccountRecord[], incoming: CodexAccountRecord[]) {
  const merged = [...existing];
  for (const account of incoming) {
    const index = merged.findIndex((item) => accountMergeKey(item) === accountMergeKey(account));
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...account,
        usage: account.usage ?? merged[index].usage,
        business_name: account.business_name || merged[index].business_name
      };
    } else {
      merged.push(account);
    }
  }

  return merged;
}

function toStorage(input: unknown): CodexStorage {
  return {
    credential_pool: {
      "openai-codex": normalizeAccounts(input)
    }
  };
}

function emptyStorage(): CodexStorage {
  return {
    credential_pool: {
      "openai-codex": []
    }
  };
}

function tokensToPlainAuth(payload: RefreshPayload) {
  const access = payload.access_token ?? "";
  return {
    access,
    refresh: payload.refresh_token ?? "",
    expires: payload.expires_in ? Math.floor(Date.now() / 1000) + payload.expires_in : jwtExp(access),
    accountId: jwtAccountId(access)
  };
}

function sanitizeAccount(account: CodexAccountRecord, activeAccountId: string | null): CodexSafeAccount {
  const expiresAt = account.expires_at ?? jwtExp(account.access_token) ?? null;
  return {
    id: account.id,
    label: account.label,
    email: account.email || jwtEmail(account.access_token) || "-",
    accountIdMasked: maskId(account.account_id),
    businessName: account.business_name || "Unknown",
    status: account.status || "UNKNOWN",
    httpStatus: account.http_status ?? "-",
    expiresAt,
    isExpired: expiresAt ? Date.now() / 1000 > expiresAt : false,
    isActive: account.id === activeAccountId,
    usage: account.usage ?? null,
    lastCheckedAt: account.last_checked_at || null,
    score: accountScore(account)
  };
}

function accountScore(account: CodexAccountRecord) {
  const statusScore = account.status === "OK" || account.status === "RENOVADO" ? 1000 : account.status === "UNKNOWN" ? 500 : 0;
  const values = [account.usage?.fiveHourPct, account.usage?.weeklyPct].filter(
    (value): value is number => typeof value === "number"
  );
  const quotaScore = values.length ? Math.min(...values) : 100;
  const expiryScore = account.expires_at ? Math.min(100, Math.max(0, (account.expires_at - Date.now() / 1000) / 864)) : 0;
  return statusScore + quotaScore + expiryScore;
}

function isExpiring(account: CodexAccountRecord) {
  const expiresAt = account.expires_at ?? jwtExp(account.access_token);
  return Boolean(expiresAt && Date.now() / 1000 > expiresAt - 60);
}

function accountMergeKey(account: CodexAccountRecord) {
  return account.account_id || account.email || hash(account.access_token);
}

function createAccountId(accountId: string, email: string, accessToken: string) {
  return `acct_${hash(accountId || email || accessToken).slice(0, 18)}`;
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cleanToken(value: string) {
  return value.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
}

function jwtClaims(token: string): UnknownRecord {
  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return {};
    }

    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UnknownRecord;
  } catch {
    return {};
  }
}

function jwtExp(token: string) {
  return toEpochSeconds(jwtClaims(token).exp);
}

function jwtEmail(token: string) {
  const claims = jwtClaims(token);
  const profile = isRecord(claims["https://api.openai.com/profile"])
    ? claims["https://api.openai.com/profile"]
    : null;
  return stringOrEmpty(profile?.email ?? claims.email);
}

function jwtAccountId(token: string) {
  const claims = jwtClaims(token);
  const auth = isRecord(claims["https://api.openai.com/auth"])
    ? claims["https://api.openai.com/auth"]
    : null;
  return stringOrEmpty(auth?.chatgpt_account_id);
}

function maskId(value: string) {
  if (!value) {
    return "-";
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}...`;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function toEpochSeconds(value: unknown) {
  const number = numberOrNull(value);
  if (number === null) {
    return null;
  }

  return number > 1_000_000_000_000 ? number / 1000 : number;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
