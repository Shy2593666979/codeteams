import { existsSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** Forge 8's ancestor lookup does not recognize bun.lock in hoisted workspaces. */
export function ensureElectronForForge(appDir: string): void {
  const localPackage = join(appDir, "node_modules", "electron");
  if (existsSync(join(localPackage, "package.json"))) return;

  const requireFromApp = createRequire(join(appDir, "package.json"));
  let installedPackage: string;
  try {
    installedPackage = dirname(requireFromApp.resolve("electron/package.json"));
  } catch {
    throw new Error("Electron is not installed. Run `bun install` from the repository root, then retry.");
  }

  mkdirSync(dirname(localPackage), { recursive: true });
  // Junctions work on Windows without requiring Developer Mode or administrator rights.
  symlinkSync(realpathSync(installedPackage), localPackage, process.platform === "win32" ? "junction" : "dir");
}
