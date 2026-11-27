import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { resedit } from "@electron/packager/resedit";
import type { IForgePlugin } from "@electron-forge/shared-types";

/** Explorer can use the executable's icon for a Forge-launched taskbar group. */
export async function prepareDevExecutable(appDir: string): Promise<string> {
  const fromApp = createRequire(join(appDir, "package.json"));
  const electronPath = fromApp("electron") as string;
  if (process.platform !== "win32") return electronPath;
  const iconPath = join(appDir, "resources", "app-icon.ico");
  const version = fromApp("electron/package.json").version as string;
  const digest = createHash("sha256").update(version).update(readFileSync(iconPath)).digest("hex").slice(0, 16);
  // Keep Electron's adjacent DLLs, locales and resources available. Never patch
  // electron.exe itself: Node/Bun tools and icon generation also use that binary.
  const devPath = join(dirname(electronPath), `codeteams-dev-${digest}.exe`);
  if (!existsSync(devPath)) {
    const temporaryPath = `${devPath}.${process.pid}.tmp.exe`;
    try {
      copyFileSync(electronPath, temporaryPath);
      await resedit(temporaryPath, { iconPath, productName: "CodeTeams" });
      renameSync(temporaryPath, devPath);
    } finally {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    }
  }
  return devPath;
}

export const devExecutablePlugin: IForgePlugin = {
  name: "codeteams-dev-executable",
  __isElectronForgePlugin: true,
  init() {},
  async startLogic({ dir }) {
    if (process.platform !== "win32") return false;
    if (!dir) throw new Error("Forge did not provide the desktop application directory.");
    process.env.CODETEAMS_DEV_EXECUTABLE = "1";
    return prepareDevExecutable(dir);
  },
};
