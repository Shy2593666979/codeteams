import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const desktopAppDir = resolve(__dirname, "../../apps/desktop");
const mockServerPath = resolve(__dirname, "../fixtures/mock-acp-server.ts");

test("Electron E2E: launch with compiled Bun Core, verify Home/Agents/Canvas, run workflow, restart & verify persistence", async ({}, testInfo) => {
  const userDataDir = mkdtempSync(join(tmpdir(), "ct-e2e-data-"));
  const sampleRepoDir = mkdtempSync(join(tmpdir(), "ct-e2e-repo-"));
  writeFileSync(
    join(sampleRepoDir, "README.md"),
    "# E2E Sample Repo\n",
    "utf8"
  );

  const bunPath =
    process.platform === "win32"
      ? join(process.env.USERPROFILE ?? "", ".bun", "bin", "bun.exe")
      : "bun";

  const launchApp = async () =>
    await electron.launch({
      args: [desktopAppDir],
      env: {
        ...process.env,
        CODETEAMS_USER_DATA_DIR: userDataDir,
        CODETEAMS_USE_COMPILED_CORE: "1",
      },
    });

  let app = await launchApp();

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    // 1. Verify white minimalist Home page (Codex-style, not a KPI dashboard)
    await expect(page.getByText("今天想构建什么？")).toBeVisible({
      timeout: 15_000,
    });

    // 2. Verify all 20 built-in presets + official SVG logos in Agents page
    await page.getByRole("link", { name: "Agents", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible();
    await expect(page.getByText("全部 20")).toBeVisible();

    const officialLogoCount = await page
      .locator('img[src^="data:image/"]')
      .count();
    expect(officialLogoCount).toBeGreaterThanOrEqual(20);

    // 3. Open sample project & register 2 deterministic mock ACP agents via typed preload bridge
    const project = await page.evaluate(
      async ({
        repoPath,
        bunExe,
        serverPath,
      }: {
        repoPath: string;
        bunExe: string;
        serverPath: string;
      }) => {
        const proj = await window.codeteams.rpc("projects.open", {
          path: repoPath,
          name: "E2E Demo Repo",
        });

        await window.codeteams.rpc("agents.registerCustom", {
          id: "e2e-agent-a",
          name: "E2E Agent Alpha",
          vendor: "E2E Mock",
          officialUrl: "https://agentclientprotocol.com",
          command: bunExe,
          args: ["run", serverPath],
          automationPolicy: "allowed",
        });
        await window.codeteams.rpc("agents.configure", {
          id: "e2e-agent-a",
          envRefs: { MOCK_AGENT_NAME: "secret:e2e-agent-a:MOCK_AGENT_NAME", MOCK_DELAY_MS: "secret:e2e-agent-a:MOCK_DELAY_MS" },
        });
        await window.codeteams.rpc("agents.setSecret", {
          agentId: "e2e-agent-a",
          envKey: "MOCK_AGENT_NAME",
          value: "e2e-alpha",
        });
        await window.codeteams.rpc("agents.setSecret", {
          agentId: "e2e-agent-a",
          envKey: "MOCK_DELAY_MS",
          value: "0",
        });

        await window.codeteams.rpc("agents.registerCustom", {
          id: "e2e-agent-b",
          name: "E2E Agent Beta",
          vendor: "E2E Mock",
          officialUrl: "https://agentclientprotocol.com",
          command: bunExe,
          args: ["run", serverPath],
          automationPolicy: "allowed",
        });
        await window.codeteams.rpc("agents.configure", {
          id: "e2e-agent-b",
          envRefs: {
            MOCK_AGENT_NAME: "secret:e2e-agent-b:MOCK_AGENT_NAME",
            MOCK_DELAY_MS: "secret:e2e-agent-b:MOCK_DELAY_MS",
            MOCK_WRITE_FILE: "secret:e2e-agent-b:MOCK_WRITE_FILE",
          },
        });
        await window.codeteams.rpc("agents.setSecret", {
          agentId: "e2e-agent-b",
          envKey: "MOCK_AGENT_NAME",
          value: "e2e-beta",
        });
        await window.codeteams.rpc("agents.setSecret", {
          agentId: "e2e-agent-b",
          envKey: "MOCK_DELAY_MS",
          value: "1200",
        });
        await window.codeteams.rpc("agents.setSecret", {
          agentId: "e2e-agent-b",
          envKey: "MOCK_WRITE_FILE",
          value: "src/theme.tsx",
        });

        return proj as { id: string; name: string };
      },
      { repoPath: sampleRepoDir, bunExe: bunPath, serverPath: mockServerPath }
    );
    expect(project.name).toBe("E2E Demo Repo");

    // 4. Open Fullscreen Team Canvas, add 2 Coding Agent members, save, and launch run
    await page.getByRole("link", { name: "团队", exact: true }).click();
    await page.getByRole("button", { name: "新建团队" }).first().click();

    // Open Coding Agent picker on fullscreen canvas
    await page.getByRole("button", { name: "添加成员" }).click();
    await expect(page.getByText("Coding Agent 成员")).toBeVisible();
    await page.getByRole("button", { name: /E2E Agent Alpha/ }).click();
    await page.getByRole("button", { name: /E2E Agent Beta/ }).click();

    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("已保存")).toBeVisible();

    // Click Run -> enter single objective -> Start Run
    await page.getByRole("button", { name: "运行" }).click();
    await page
      .getByPlaceholder(/只需输入一次需求/)
      .fill("Build E2E user permissions module");
    await page.getByRole("button", { name: "开始执行" }).click();

    // Wait for step 1 to finish and step 2 waiting/streaming dots to appear!
    await expect(page.getByText(/\[e2e-alpha\] Completed step/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".ct-thinking-wave, .ct-dots-wave-sm").first()).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({ path: testInfo.outputPath("thinking-wave.png"), animations: "disabled" });

    // Wait for step 2 to finish and composer to return to idle state
    await expect(page.getByText(/\[e2e-beta\] Completed step/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".ct-workflow-pill").getByText("已完成")).toHaveCount(2, { timeout: 10_000 });
    await expect(page.locator(".ct-chat-composer").getByRole("button", { name: "开始任务" })).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: testInfo.outputPath("run-completed.png"), animations: "disabled" });

    // Verify inline ACP tool activity cards & word-level file diff card rendered chronologically inside agent turns
    await expect(page.locator(".ct-acp-activity").first()).toBeVisible();
    await expect(page.locator("[data-testid='inline-diff-card']").first()).toBeVisible();

    // Follow-up composer stays locked to the conversation's team, while ACP permission mode remains toggleable
    await expect(page.locator(".ct-chat-composer [data-testid='locked-chat-target']")).toContainText("新 Agent 团队");
    await expect(page.locator(".ct-chat-composer").getByRole("button", { name: "单 Agent" })).toHaveCount(0);
    await page.locator(".ct-chat-composer").getByRole("button", { name: "默认审批" }).click();
    await expect(page.locator(".ct-chat-composer").getByRole("button", { name: "最高权限" })).toBeVisible();

    // Inspect Context Handoff drawer via clicking the floating workflow progress pill
    await page.locator(".ct-workflow-pill").click();
    await expect(page.locator(".ct-chat-drawer").getByText(/步骤 1/)).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("handoff.png"), animations: "disabled" });

    // 5. Close Electron cleanly and relaunch on same userDataDir -> verify persistence!
    await app.close();
    app = await launchApp();

    const page2 = await app.firstWindow();
    await page2.waitForLoadState("domcontentloaded");
    await expect(page2.getByText("E2E Demo Repo").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page2.getByText("Build E2E user permissions module").first()
    ).toBeVisible({ timeout: 10_000 });

    // Click persisted conversation in sidebar and verify transcripts survived restart
    await page2.getByText("Build E2E user permissions module").first().click();
    await expect(page2.getByText(/\[e2e-beta\] Completed step/).first()).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await app.close().catch(() => {});
    try {
      rmSync(userDataDir, { recursive: true, force: true });
      rmSync(sampleRepoDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup lag
    }
  }
});
