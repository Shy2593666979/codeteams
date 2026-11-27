import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureElectronForForge } from "../../apps/desktop/ensure-electron";

test("Forge can locate hoisted Electron in a Bun workspace; repeated setup is safe", () => {
  const root = mkdtempSync(join(tmpdir(), "ct-forge-electron-"));
  const appDir = join(root, "apps", "desktop");
  const electronDir = join(root, "node_modules", "electron");
  mkdirSync(appDir, { recursive: true });
  mkdirSync(electronDir, { recursive: true });
  writeFileSync(join(appDir, "package.json"), "{}");
  writeFileSync(join(electronDir, "package.json"), JSON.stringify({ name: "electron", version: "1.0.0" }));
  ensureElectronForForge(appDir);
  ensureElectronForForge(appDir);
  const local = JSON.parse(readFileSync(join(appDir, "node_modules", "electron", "package.json"), "utf8"));
  expect(local.name).toBe("electron");
  expect(local.version).toBe("1.0.0");
});

test("Forge preserves an existing app-local Electron package", () => {
  const appDir = mkdtempSync(join(tmpdir(), "ct-forge-local-"));
  const electronDir = join(appDir, "node_modules", "electron");
  mkdirSync(electronDir, { recursive: true });
  writeFileSync(join(electronDir, "package.json"), JSON.stringify({ name: "electron", version: "2.0.0" }));
  ensureElectronForForge(appDir);
  expect(JSON.parse(readFileSync(join(electronDir, "package.json"), "utf8")).version).toBe("2.0.0");
});
