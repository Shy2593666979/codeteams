import { test, expect, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Chat turn rail: jump, scroll tracking, previews, keyboard, and conversation isolation", async ({}, testInfo) => {
  const dataDir = mkdtempSync(join(tmpdir(), "ct-turn-rail-data-"));
  const projectDir = mkdtempSync(join(tmpdir(), "ct-turn-rail-repo-"));
  const bun = process.platform === "win32" ? join(process.env.USERPROFILE!, ".bun/bin/bun.exe") : "bun";
  const ids = JSON.parse(execFileSync(bun, ["run", resolve("tests/fixtures/seed-chat-navigation.ts"), dataDir, projectDir], { encoding: "utf8" }));
  const app = await electron.launch({
    args: [resolve("apps/desktop")],
    env: { ...process.env, CODETEAMS_USER_DATA_DIR: dataDir, CODETEAMS_USE_COMPILED_CORE: "1" },
  });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.evaluate(id => { location.hash = `/chat/${id}`; }, ids.long);
    const rail = page.getByRole("navigation", { name: "对话定位" });
    const ticks = rail.getByRole("button");
    const scroll = page.locator(".ct-chat-scrollport");
    await expect(ticks).toHaveCount(8);
    await expect(ticks.nth(7)).toHaveAttribute("aria-current", "location");
    await ticks.first().click();
    await expect(ticks.first()).toHaveAttribute("aria-current", "location");
    await expect.poll(async () => scroll.evaluate(el => el.scrollTop)).toBeLessThan(30);
    await ticks.nth(2).hover();
    await expect(page.getByRole("tooltip")).toContainText("问题 3");
    await ticks.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(ticks.nth(1)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(ticks.nth(1)).toHaveAttribute("aria-current", "location");
    await ticks.nth(3).click();
    await expect(ticks.nth(3)).toHaveAttribute("aria-current", "location");
    // Exercise scroll tracking independently of clicking the rail.
    await scroll.evaluate(el => {
      const anchor = el.querySelectorAll<HTMLElement>('[id^="chat-turn-"]')[5]!;
      el.scrollTop += anchor.getBoundingClientRect().top - el.getBoundingClientRect().top - 20;
    });
    await expect(ticks.nth(5)).toHaveAttribute("aria-current", "location");
    await ticks.nth(5).hover();
    await expect(page.getByRole("tooltip")).toContainText("问题 6");
    await page.screenshot({ path: testInfo.outputPath("turn-rail.png") });
    // Incoming content at the bottom must not pull the reader away from history.
    const top = await scroll.evaluate(el => el.scrollTop);
    await page.locator("[data-chat-transcript-content]").evaluate(el => {
      const content = document.createElement("p");
      content.style.height = "600px";
      content.textContent = "New content at the end of the conversation";
      el.appendChild(content);
    });
    await expect(ticks.nth(5)).toHaveAttribute("aria-current", "location");
    expect(Math.abs((await scroll.evaluate(el => el.scrollTop)) - top)).toBeLessThan(2);
    await ticks.first().focus();
    await page.keyboard.press("End");
    await expect(ticks.last()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(ticks.last()).toHaveAttribute("aria-current", "location");
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await expect(page.locator(".ct-chat-drawer")).toBeVisible();
    await ticks.nth(2).click();
    await expect(ticks.nth(2)).toHaveAttribute("aria-current", "location");
    const railBox = await rail.boundingBox();
    const drawerBox = await page.locator(".ct-chat-drawer").boundingBox();
    expect(railBox!.x + railBox!.width).toBeLessThanOrEqual(drawerBox!.x);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(960, 720));
    await expect(ticks.nth(2)).toBeVisible();
    await ticks.nth(2).hover();
    await expect(page.getByRole("tooltip")).toContainText("问题 3");
    await page.screenshot({ path: testInfo.outputPath("turn-rail-narrow-drawer.png") });
    await page.evaluate(id => { location.hash = `/chat/${id}`; }, ids.single);
    await expect(page.getByText("问题 1：梳理项目架构与实现步骤。", { exact: true })).toBeVisible();
    await expect(rail).toHaveCount(0);
    await page.evaluate(id => { location.hash = `/chat/${id}`; }, ids.empty);
    await expect(page.locator('[id^="chat-turn-"]')).toHaveCount(0);
    await expect(rail).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});
