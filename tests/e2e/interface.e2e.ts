import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("All views: layout, accessible controls, modal keyboard behavior and narrow window", async ({}, testInfo) => {
  const dataDir = mkdtempSync(join(tmpdir(), "ct-ui-data-"));
  const projectDir = mkdtempSync(join(tmpdir(), "ct-ui-project-"));
  writeFileSync(join(projectDir, "README.md"), "# Interface review\n");
  writeFileSync(join(projectDir, "AGENTS.md"), "# Project rules\nUse Bun and strict TypeScript. Run bun test before submitting changes.\n");
  const app = await electron.launch({
    args: [resolve("apps/desktop")],
    env: { ...process.env, CODETEAMS_USER_DATA_DIR: dataDir, CODETEAMS_USE_COMPILED_CORE: "1" },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 960));
    await expect(page.getByRole("heading", { name: "今天想构建什么？" })).toBeVisible();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const ids = await page.evaluate(async path => {
      const project = await window.codeteams.rpc("projects.open", { path, name: "Interface review" }) as { id: string };
      const conversation = await window.codeteams.rpc("conversations.create", {
        projectId: project.id, title: "Review the application interface", mode: "single", agentId: "codex",
      }) as { id: string };
      const savedWorkflows: Array<{ id: string; name: string }> = [];
      for (const [name, agentIds] of [
        ["开发与审查", ["codex", "claude-code"]],
        ["需求到实现", ["claude-code", "codex", "gemini-cli"]],
        ["代码质量检查", ["codex", "gemini-cli"]],
      ] as const) {
        const wf = await window.codeteams.rpc("workflows.save", {
          projectId: project.id, name,
          steps: agentIds.map((agentId, ordinal) => ({ id: `${name}-${ordinal}`, agentId })),
        }) as { id: string; name: string };
        savedWorkflows.push(wf);
      }
      await window.codeteams.rpc("conversations.create", {
        projectId: project.id, title: "Team architecture review", mode: "workflow", workflowId: savedWorkflows[1]!.id,
      });
      await window.codeteams.rpc("projects.memory.update", {
        projectId: project.id,
        content: "本项目使用 Bun 作为包管理器。\n采用严格的 TypeScript 配置。\n运行测试：bun test。",
      });
      return { project: project.id, conversation: conversation.id };
    }, projectDir);
    await page.reload();
    await expect(page.getByRole("heading", { name: "今天想构建什么？" })).toBeVisible();
    await expect(page.locator(".ct-sidebar").getByText("Interface review", { exact: true })).toBeVisible();
    await expect(page.locator(".ct-home-agents").getByText("Codex")).toBeVisible();
    await expect(page.locator('.ct-home-agents img[src^="data:image/svg+xml"]').first()).toBeVisible();
    const capture = async (name: string) => {
      await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))); });
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };
    await capture("home");
    await page.getByRole("link", { name: "Agents", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    await expect(page.locator(".ct-agent-row")).toHaveCount(20);
    await capture("agents");
    await page.getByRole("button", { name: "添加 Agent" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture("agent-dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "添加 Agent" })).toBeFocused();
    await page.getByRole("textbox", { name: /搜索.*Agent/ }).fill("no-agent-matches-this");
    await expect(page.locator(".ct-empty")).toBeVisible();
    await page.getByRole("link", { name: "团队", exact: true }).click();
    await expect(page.getByRole("heading", { name: "团队", exact: true })).toBeVisible();
    await expect(page.locator(".ct-workflow-row")).toHaveCount(3);
    await capture("workflows");
    await page.getByRole("link", { name: "设置", exact: true }).click();
    await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
    await capture("settings");
    await page.evaluate(id => { location.hash = `/projects/${id}`; }, ids.project);
    await expect(page.getByRole("heading", { name: "Interface review" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "项目记忆" })).toHaveValue(/本项目使用 Bun/);
    await capture("project");
    await page.evaluate(id => { location.hash = `/chat/${id}`; }, ids.conversation);
    await expect(page.locator(".ct-chat-composer")).toBeVisible();
    await expect(page.locator(".ct-chat-composer [data-testid='locked-chat-target']")).toContainText("Codex");
    await expect(page.locator(".ct-chat-composer").getByRole("button", { name: "单 Agent" })).toHaveCount(0);
    await expect(page.locator(".ct-chat-composer").getByRole("button", { name: "团队" })).toHaveCount(0);
    await capture("chat");
    await page.evaluate(() => { location.hash = "/workflows/new"; });
    await expect(page.getByRole("textbox", { name: "团队名称" })).toBeVisible();
    await page.getByRole("button", { name: "添加成员", exact: true }).click();
    await page.getByRole("button", { name: /Claude Code/ }).click();
    await page.getByRole("button", { name: /Codex/ }).click();
    await expect(page.locator(".ct-chain-node")).toHaveCount(2);
    await expect.poll(async () => Number.parseFloat(await page.locator(".react-flow__viewport").evaluate(el => getComputedStyle(el).transform.split(",")[0]!.replace("matrix(", "")))).toBeLessThanOrEqual(1);
    await capture("canvas");
    await page.getByRole("button", { name: "运行", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture("run-dialog");
    await page.keyboard.press("Escape");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(960, 720));
    await capture("canvas-narrow");
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await page.getByRole("link", { name: "Agents", exact: true }).click();
    await expect(page.locator(".ct-agent-inspector")).toBeVisible();
    await capture("agents-narrow");
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
