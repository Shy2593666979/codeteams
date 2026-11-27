import { test, expect, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Monochrome chat keeps tool details, readable code, brand logos and status colors", async ({}, testInfo) => {
  const dataDir = mkdtempSync(join(tmpdir(), "ct-mono-data-"));
  const projectDir = mkdtempSync(join(tmpdir(), "ct-mono-repo-"));
  const bun = process.platform === "win32" ? join(process.env.USERPROFILE!, ".bun/bin/bun.exe") : "bun";
  const ids = JSON.parse(execFileSync(bun, ["run", resolve("tests/fixtures/seed-chat-navigation.ts"), dataDir, projectDir], { encoding: "utf8" }));
  const app = await electron.launch({ args: [resolve("apps/desktop")], env: { ...process.env, CODETEAMS_USER_DATA_DIR: dataDir, CODETEAMS_USE_COMPILED_CORE: "1" } });
  try {
    const page = await app.firstWindow();
    await page.evaluate(id => { location.hash = `/chat/${id}`; }, ids.monochrome);
    await expect(page.locator(".ct-acp-activity")).toHaveCount(3);
    const code = page.locator(".ct-markdown code").filter({ hasText: "src/evalweave/" });
    await expect(code).toHaveCSS("color", "rgb(39, 39, 42)");
    await expect(code).toHaveCSS("background-color", "rgb(242, 242, 243)");
    await expect(page.locator(".ct-acp-activity").first()).toHaveCSS("background-color", "rgb(247, 247, 248)");
    await expect(page.locator(".ct-acp-activity").first().getByText("失败")).toBeVisible();
    await expect(page.locator(".ct-acp-activity").last().getByText("完成")).toBeVisible();
    await expect(page.locator(".ct-acp-activity").first().getByText("失败").locator("..")).toHaveCSS("color", "rgb(220, 38, 38)");
    await expect(page.locator(".ct-acp-activity").last().getByText("完成").locator("..")).toHaveCSS("color", "rgb(21, 128, 61)");
    await page.locator(".ct-chat-scrollport").evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath("monochrome-chat.png") });
    await page.locator(".ct-acp-activity").first().getByRole("button").click();
    await expect(page.getByText("Windows process startup error 1385", { exact: true }).first()).toBeVisible();
  } finally { await app.close(); }
});
