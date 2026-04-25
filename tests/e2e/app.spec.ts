import { expect, test } from "@playwright/test";

test("creates the default workspace thread and streams a run", async ({ page }) => {
  await page.route("**/api/threads/*/runs", async (route) => {
    const now = new Date().toISOString();
    await route.fulfill({
      status: 201,
      json: {
        run: {
          id: "run_e2e",
          threadId: "thread_e2e",
          projectId: "project_e2e",
          status: "running",
          prompt: "oi",
          startedAt: now,
          completedAt: null,
          error: null
        }
      }
    });
  });
  await page.route("**/api/runs/run_e2e/events", async (route) => {
    const now = new Date().toISOString();
    await route.fulfill({
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body:
        `id: 1\nevent: message_delta\ndata: ${JSON.stringify({
          id: "evt_e2e_1",
          runId: "run_e2e",
          seq: 1,
          type: "message_delta",
          payload: { messageId: "msg_e2e", text: "Ola, estou usando o LLM Codex." },
          createdAt: now
        })}\n\n`
    });
  });

  await page.goto("/");

  await expect(page.getByText("Agentic Chat")).toBeVisible();
  await page.getByPlaceholder("Mensagem para o chat...").fill("oi");
  await page.getByTitle("Send message").click();

  await expect(page.locator("article").filter({ hasText: "Ola, estou usando o LLM Codex." }).last()).toBeVisible({
    timeout: 20_000
  });
});

test("shows auth panel and imports sanitized account data", async ({ page }) => {
  const status: {
    provider: string;
    model: string;
    authPath: string;
    activeAccountId: string;
    activeAccount: Record<string, unknown>;
    accounts: Array<Record<string, unknown>>;
  } = {
    provider: "codex-chatgpt",
    model: "gpt-5.4-mini",
    authPath: ".data/codex-auth.json",
    activeAccountId: "acct_1",
    activeAccount: {
      id: "acct_1",
      label: "demo",
      email: "demo@example.com",
      accountIdMasked: "acc_de...mo",
      businessName: "Personal",
      status: "OK",
      httpStatus: 200,
      expiresAt: 1_800_000_000,
      isExpired: false,
      isActive: true,
      usage: {
        plan: "Plus",
        fiveHourPct: 80,
        fiveHourReset: 1_800_003_600,
        weeklyPct: 60,
        weeklyReset: 1_800_604_800,
        updatedAt: "2026-04-24T00:00:00.000Z"
      },
      lastCheckedAt: "2026-04-24T00:00:00.000Z",
      score: 1140
    },
    accounts: []
  };
  status.accounts = [status.activeAccount];

  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill({ json: status });
  });
  await page.route("**/api/auth/import", async (route) => {
    await route.fulfill({ json: { imported: 1, status } });
  });
  await page.route("**/api/auth/device/start", async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        flowId: "flow_1",
        userCode: "ABCD-EFGH",
        verificationUri: "https://auth.openai.com/codex/device",
        expiresAt: "2026-04-24T00:15:00.000Z"
      }
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "demo@example.com" }).click({ force: true });

  const emailMatches = page.getByText("demo@example.com");
  expect(await emailMatches.count()).toBeGreaterThanOrEqual(2);
  await expect(emailMatches.first()).toBeVisible();
  await expect(page.getByText("80%")).toBeVisible();
  await page.getByPlaceholder(".data/codex-auth.json or pasted JSON").fill('{"access":"token"}');
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Plus", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("ABCD-EFGH")).toBeVisible();
});

test("keeps the mobile chat layout usable with drawers and Android-style typing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto("/");

  const composer = page.getByPlaceholder("Mensagem para o chat...");
  await expect(composer).toBeVisible();

  const composerBox = await composer.boundingBox();
  expect(composerBox).not.toBeNull();
  expect((composerBox?.y ?? 0) + (composerBox?.height ?? 0)).toBeLessThanOrEqual(740);
  await expect(page.locator("main")).toHaveCSS("overflow", "hidden");

  await page.locator("header").getByTitle("Historico").press("Enter");
  await expect(page.getByText("Chats")).toBeVisible();
  await page.getByLabel("Fechar historico").click();

  await expect(page.getByLabel("Anexar arquivos")).toBeVisible();
  await page.getByTitle("Painel lateral").press("Enter");
  await expect(page.getByText("Workspace", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Auth", exact: true })).toBeVisible();
  await page.getByTitle("Close panel").click({ force: true });

  await composer.fill("linha 1");
  await page.keyboard.press("Enter");
  await expect(composer).toHaveValue("linha 1\n");
});

test("attaches files in the composer and sends them with the run", async ({ page }) => {
  type RunRequestBody = {
    content?: string;
    attachments?: Array<Record<string, unknown>>;
  };
  const captured: { body?: RunRequestBody } = {};

  await page.route("**/api/threads/*/runs", async (route) => {
    captured.body = route.request().postDataJSON();
    const now = new Date().toISOString();
    await route.fulfill({
      status: 201,
      json: {
        run: {
          id: "run_attach",
          threadId: "thread_e2e",
          projectId: "project_e2e",
          status: "running",
          prompt: captured.body?.content ?? "",
          startedAt: now,
          completedAt: null,
          error: null
        }
      }
    });
  });
  await page.route("**/api/runs/run_attach/events", async (route) => {
    const now = new Date().toISOString();
    await route.fulfill({
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body:
        `id: 1\nevent: message_delta\ndata: ${JSON.stringify({
          id: "evt_attach_1",
          runId: "run_attach",
          seq: 1,
          type: "message_delta",
          payload: { messageId: "msg_attach", text: "Recebi o anexo." },
          createdAt: now
        })}\n\n`
    });
  });

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "note.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Anexo")
  });
  await expect(page.getByText("note.md")).toBeVisible();
  await page.getByPlaceholder("Mensagem para o chat...").fill("resuma");
  await page.getByTitle("Send message").click();

  await expect(page.locator("article").filter({ hasText: "Recebi o anexo." }).last()).toBeVisible({
    timeout: 20_000
  });
  expect(captured.body?.attachments?.[0]).toMatchObject({
    name: "note.md",
    mimeType: "text/markdown",
    kind: "text",
    text: "# Anexo"
  });
});
