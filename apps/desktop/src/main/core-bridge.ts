import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { CoreEvent, JsonRpcNotification, JsonRpcResponse } from "@codeteams/shared";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface CoreBridgeOptions {
  userDataDir: string;
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
  onEvent: (event: CoreEvent) => void;
  onCoreExit?: (code: number | null) => void;
}

export class CoreProcessBridge {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private stdoutBuffer = "";
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((err: Error) => void) | null = null;
  private shuttingDown = false;

  constructor(private readonly options: CoreBridgeOptions) {}

  private resolveCoreCommand(): { command: string; args: string[]; cwd: string } {
    const ext = process.platform === "win32" ? ".exe" : "";
    const binName = `codeteams-core${ext}`;

    // 1. Packaged app: look in process.resourcesPath/bin/codeteams-core(.exe)
    if (this.options.isPackaged) {
      const packagedBin = join(this.options.resourcesPath, "bin", binName);
      if (existsSync(packagedBin)) {
        return {
          command: packagedBin,
          args: ["--user-data-dir", this.options.userDataDir],
          cwd: this.options.userDataDir,
        };
      }
    }

    // 2. Monorepo dev: prefer compiled binary if CODETEAMS_USE_COMPILED_CORE=1,
    //    otherwise run Bun source directly for fast iteration.
    const repoRoot = this.findRepoRoot(this.options.appPath);
    const compiledDevBin = join(repoRoot, "apps", "desktop", "resources", "bin", binName);
    if (process.env.CODETEAMS_USE_COMPILED_CORE === "1" && existsSync(compiledDevBin)) {
      return {
        command: compiledDevBin,
        args: ["--user-data-dir", this.options.userDataDir],
        cwd: repoRoot,
      };
    }

    const coreEntry = join(repoRoot, "apps", "core", "src", "index.ts");
    const bunExe = this.resolveBunExecutable();
    if (existsSync(coreEntry) && bunExe) {
      return {
        command: bunExe,
        args: ["run", coreEntry, "--user-data-dir", this.options.userDataDir],
        cwd: repoRoot,
      };
    }

    if (existsSync(compiledDevBin)) {
      return {
        command: compiledDevBin,
        args: ["--user-data-dir", this.options.userDataDir],
        cwd: repoRoot,
      };
    }

    throw new Error(
      `Unable to locate CodeTeams Core binary (${compiledDevBin}) or Bun runtime (${coreEntry}).`
    );
  }

  private findRepoRoot(startPath: string): string {
    let cur = resolve(startPath);
    for (let i = 0; i < 6; i++) {
      if (existsSync(join(cur, "apps", "core", "src", "index.ts"))) {
        return cur;
      }
      const parent = resolve(cur, "..");
      if (parent === cur) break;
      cur = parent;
    }
    return resolve(startPath);
  }

  private resolveBunExecutable(): string | null {
    const ext = process.platform === "win32" ? ".exe" : "";
    const homeBun = join(homedir(), ".bun", "bin", `bun${ext}`);
    if (existsSync(homeBun)) return homeBun;
    return process.platform === "win32" ? "bun.exe" : "bun";
  }

  async start(): Promise<void> {
    if (this.proc) return;
    this.shuttingDown = false;
    mkdirSync(this.options.userDataDir, { recursive: true });
    const { command, args, cwd } = this.resolveCoreCommand();

    this.readyPromise = new Promise<void>((resolveReady, rejectReady) => {
      this.resolveReady = resolveReady;
      this.rejectReady = rejectReady;
    });

    const proc = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.proc = proc;

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk;
      let nl = this.stdoutBuffer.indexOf("\n");
      while (nl !== -1) {
        const line = this.stdoutBuffer.slice(0, nl).trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(nl + 1);
        if (line.length > 0) {
          this.handleFrame(line);
        }
        nl = this.stdoutBuffer.indexOf("\n");
      }
    });

    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => {
      // Forward structured Core logs to Main stderr only
      process.stderr.write(`[core] ${chunk}`);
    });

    proc.on("error", (err) => {
      this.rejectReady?.(err);
      this.rejectAllPending(err);
    });

    proc.on("exit", (code) => {
      this.proc = null;
      const err = new Error(`CodeTeams Core exited with code ${code}`);
      this.rejectReady?.(err);
      this.rejectAllPending(err);
      if (!this.shuttingDown) {
        this.options.onCoreExit?.(code);
      }
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out waiting for CodeTeams Core ready signal")), 15_000)
    );
    await Promise.race([this.readyPromise, timeout]);
  }

  private handleFrame(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    // Notification
    if ("method" in msg && !("id" in msg)) {
      const notif = msg as unknown as JsonRpcNotification;
      if (notif.method === "core.ready") {
        this.resolveReady?.();
        this.resolveReady = null;
        this.rejectReady = null;
        return;
      }
      if (notif.method === "core.event" && notif.params) {
        this.options.onEvent(notif.params as CoreEvent);
      }
      return;
    }

    // Response
    if ("id" in msg) {
      const resp = msg as unknown as JsonRpcResponse;
      const id = Number(resp.id);
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      clearTimeout(pending.timer);

      if (resp.error) {
        const err = new Error(resp.error.message) as Error & {
          code?: string;
          details?: Record<string, unknown>;
        };
        err.code = resp.error.data?.code ?? "INTERNAL_ERROR";
        err.details = resp.error.data?.details;
        pending.reject(err);
      } else {
        pending.resolve(resp.result);
      }
    }
  }

  async call(method: string, params: unknown = {}, timeoutMs = 120_000): Promise<unknown> {
    if (!this.proc) {
      await this.start();
    }
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error("CodeTeams Core stdio transport is unavailable");
    }

    const id = this.nextId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }) + "\n";

    return await new Promise((resolveCall, rejectCall) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const err = new Error(
          `[RPC_TIMEOUT] RPC "${method}" timed out after ${timeoutMs}ms`
        ) as Error & { code?: string };
        err.code = "RPC_TIMEOUT";
        rejectCall(err);
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolveCall,
        reject: rejectCall,
        timer,
      });

      this.proc!.stdin.write(payload);
    });
  }

  private rejectAllPending(err: Error): void {
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(err);
      this.pending.delete(id);
    }
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    const proc = this.proc;
    if (!proc) return;
    try {
      proc.stdin.end();
    } catch {
      // Ignore
    }
    await Promise.race([
      new Promise<void>((r) => proc.once("exit", () => r())),
      new Promise<void>((r) => setTimeout(r, 3000)),
    ]);
    if (this.proc) {
      try {
        proc.kill();
      } catch {
        // Ignore
      }
      this.proc = null;
    }
  }
}
