import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dir, "..");
const outDir = join(rootDir, "apps", "desktop", "resources", "bin");
mkdirSync(outDir, { recursive: true });

const ext = process.platform === "win32" ? ".exe" : "";
const outfile = join(outDir, `codeteams-core${ext}`);
const entry = join(rootDir, "apps", "core", "src", "index.ts");

console.log(`[build-core] Compiling ${entry} -> ${outfile}`);

const proc = Bun.spawnSync(
  ["bun", "build", entry, "--compile", "--outfile", outfile],
  {
    cwd: rootDir,
    stdout: "inherit",
    stderr: "inherit",
  }
);

if (proc.exitCode !== 0) {
  console.error(`[build-core] Failed with exit code ${proc.exitCode}`);
  process.exit(proc.exitCode ?? 1);
}

console.log(`[build-core] Successfully built ${outfile}`);
