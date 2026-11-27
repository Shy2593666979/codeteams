import { test, expect, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { prepareDevExecutable } from "../../apps/desktop/dev-executable";

test("Windows taskbar uses the versioned CodeTeams icon instead of electron.exe", async () => {
  test.skip(process.platform !== "win32");
  const userDataDir = mkdtempSync(join(tmpdir(), "ct-taskbar-"));
  const executablePath = await prepareDevExecutable(resolve("apps/desktop"));
  const app = await electron.launch({
    executablePath,
    args: [resolve("apps/desktop")],
    env: { ...process.env, CODETEAMS_DEV_EXECUTABLE: "1", CODETEAMS_USER_DATA_DIR: userDataDir, CODETEAMS_USE_COMPILED_CORE: "1" },
  });
  try {
    const page = await app.firstWindow();
    expect(await app.evaluate(() => process.execPath)).toBe(executablePath);
    await page.waitForSelector(".ct-home-heading");
    const handle = await app.evaluate(({ BrowserWindow }) => {
      const buffer = BrowserWindow.getAllWindows()[0]!.getNativeWindowHandle();
      return buffer.readUInt32LE(0);
    });
    const properties = JSON.parse(execFileSync("powershell.exe", [
      "-NoProfile", "-File", resolve("tests/fixtures/read-window-shell-properties.ps1"), "-WindowHandle", String(handle),
    ], { encoding: "utf8", windowsHide: true }));
    const source = readFileSync("apps/desktop/resources/app-icon.ico");
    const digest = createHash("sha256").update(source).digest("hex").slice(0, 16);
    const cachedIcon = join(userDataDir, "icons", `codeteams-${digest}.ico`);
    expect(properties.appId).toBe("com.codeteams.desktop.dev");
    expect(properties.icon).toBe(`${cachedIcon},0`);
    expect(properties.displayName).toBe("CodeTeams");
    expect(properties.relaunchCommand).toContain(resolve("apps/desktop"));
    expect(readFileSync(cachedIcon).equals(source)).toBe(true);
  } finally {
    await app.close();
  }
});
