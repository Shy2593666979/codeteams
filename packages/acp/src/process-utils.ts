import { existsSync } from "node:fs";
import { extname, isAbsolute } from "node:path";

const SECRET_ENV_PATTERN =
  /(KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|AUTH|BEARER)/i;

/**
 * Redacts potential secrets from text/log output.
 */
export function redactSecrets(
  text: string,
  knownSecrets: Iterable<string> = []
): string {
  let out = text;
  for (const secret of knownSecrets) {
    if (secret && secret.length >= 6) {
      out = out.split(secret).join("[REDACTED]");
    }
  }
  // Common API key prefixes (sk-..., ghp_..., AIza..., xai-...)
  out = out.replace(
    /\b(sk-[a-zA-Z0-9_-]{16,}|ghp_[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|xai-[a-zA-Z0-9_-]{16,})\b/g,
    "[REDACTED]"
  );
  return out;
}

export function sanitizeEnvForLogs(
  env: Record<string, string | undefined>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    result[k] = SECRET_ENV_PATTERN.test(k) ? "[REDACTED]" : v;
  }
  return result;
}

/**
 * Safely resolves an executable on PATH or absolute path across Windows/macOS/Linux.
 */
export function resolveExecutable(command: string): string | null {
  if (!command || /[\r\n\0]/.test(command)) return null;
  if (isAbsolute(command)) {
    return existsSync(command) ? command : null;
  }
  const found = Bun.which(command);
  if (found) return found;

  if (process.platform === "win32") {
    for (const ext of [".exe", ".cmd", ".bat"]) {
      const candidate = Bun.which(`${command}${ext}`);
      if (candidate) return candidate;
    }
  }
  return null;
}

/**
 * Prepares safe argv for `Bun.spawn` without shell string interpolation.
 * On Windows, `.cmd`/`.bat` shims cannot be executed directly by CreateProcess
 * without `cmd.exe /d /c`; arguments are passed as separate array elements and validated.
 */
export function buildSpawnArgv(
  command: string,
  args: string[]
): { argv: string[]; resolvedPath: string | null } {
  const resolved = resolveExecutable(command);
  const exe = resolved ?? command;

  // Reject control characters in arguments
  for (const arg of args) {
    if (/[\r\n\0]/.test(arg)) {
      throw new Error("Invalid control character in spawn argument");
    }
  }

  if (process.platform === "win32") {
    const ext = extname(exe).toLowerCase();
    if (ext === ".cmd" || ext === ".bat") {
      return {
        argv: ["cmd.exe", "/d", "/c", exe, ...args],
        resolvedPath: resolved,
      };
    }
  }

  return {
    argv: [exe, ...args],
    resolvedPath: resolved,
  };
}

/**
 * Resolves the OS system proxy into HTTP_PROXY/HTTPS_PROXY env vars when no
 * explicit proxy env var is already configured. On Windows, CLI agents (Go/Node/Rust)
 * do not read WinINET / Clash Verge registry settings unless exported via env vars.
 */
let cachedSystemProxy: { ts: number; env: Record<string, string> } | null = null;

function normalizeProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export function resolveSystemProxyEnv(
  existingEnv: Record<string, string | undefined>
): Record<string, string> {
  const hasExplicit = Boolean(
    existingEnv.HTTP_PROXY ||
      existingEnv.HTTPS_PROXY ||
      existingEnv.http_proxy ||
      existingEnv.https_proxy ||
      existingEnv.ALL_PROXY ||
      existingEnv.all_proxy
  );
  if (hasExplicit) return {};
  if (process.platform !== "win32") return {};

  const now = Date.now();
  if (cachedSystemProxy && now - cachedSystemProxy.ts < 5_000) {
    return cachedSystemProxy.env;
  }

  let resolved: Record<string, string> = {};
  try {
    const proc = Bun.spawnSync(
      [
        "reg.exe",
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    if (proc.exitCode === 0) {
      const out = new TextDecoder().decode(proc.stdout);
      const enableMatch = out.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
      const enabled = enableMatch && Number.parseInt(enableMatch[1]!, 16) === 1;
      const serverMatch = out.match(/ProxyServer\s+REG_SZ\s+(.+)/i);
      const rawServer = serverMatch?.[1]?.trim() ?? "";

      if (enabled && rawServer) {
        let httpProxy = "";
        let httpsProxy = "";
        if (rawServer.includes("=")) {
          for (const part of rawServer.split(";")) {
            const [k, v] = part.split("=", 2);
            if (!k || !v) continue;
            const key = k.trim().toLowerCase();
            if (key === "http") httpProxy = normalizeProxyUrl(v);
            if (key === "https") httpsProxy = normalizeProxyUrl(v);
          }
          if (!httpsProxy) httpsProxy = httpProxy;
          if (!httpProxy) httpProxy = httpsProxy;
        } else {
          httpProxy = normalizeProxyUrl(rawServer);
          httpsProxy = httpProxy;
        }

        if (httpProxy || httpsProxy) {
          const noProxy =
            existingEnv.NO_PROXY ||
            existingEnv.no_proxy ||
            "localhost,127.0.0.1,::1";
          resolved = {
            ...(httpProxy ? { HTTP_PROXY: httpProxy, http_proxy: httpProxy } : {}),
            ...(httpsProxy ? { HTTPS_PROXY: httpsProxy, https_proxy: httpsProxy } : {}),
            NO_PROXY: noProxy,
            no_proxy: noProxy,
          };
        }
      }
    }
  } catch {
    // Registry unavailable; proceed without proxy
  }

  cachedSystemProxy = { ts: now, env: resolved };
  return resolved;
}

/**
 * Kills a process and its entire child tree across platforms.
 */
export async function killProcessTree(pid: number): Promise<void> {
  if (!pid || pid <= 0) return;

  if (process.platform === "win32") {
    try {
      const killer = Bun.spawn(
        ["taskkill", "/pid", String(pid), "/t", "/f"],
        { stdout: "ignore", stderr: "ignore" }
      );
      await killer.exited;
    } catch {
      // Process may already have exited
    }
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  await new Promise((r) => setTimeout(r, 300));
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already exited
  }
}
