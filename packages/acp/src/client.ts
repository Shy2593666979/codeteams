import * as acp from "@agentclientprotocol/sdk";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { CoreError } from "@codeteams/shared";
import { assertPathInsideWorkspace } from "./path-guard";
import {
  buildSpawnArgv,
  killProcessTree,
  redactSecrets,
  resolveSystemProxyEnv,
} from "./process-utils";

export interface AcpClientCallbacks {
  onSessionUpdate?: (notification: acp.SessionNotification) => void | Promise<void>;
  onPermissionRequest?: (
    request: acp.RequestPermissionRequest
  ) => Promise<acp.RequestPermissionResponse>;
  onFileAccess?: (entry: {
    op: "read" | "write";
    path: string;
    allowed: boolean;
    reason?: string;
  }) => void;
  onStderr?: (line: string) => void;
  onDisconnect?: (info: { exitCode: number | null; reason: string }) => void;
}

export interface AcpSpawnOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  knownSecrets?: string[];
  clientName?: string;
  clientVersion?: string;
  initTimeoutMs?: number;
  callbacks?: AcpClientCallbacks;
}

/**
 * Wraps a Bun subprocess FileSink (`proc.stdin`) as a Web `WritableStream<Uint8Array>`
 * for `@agentclientprotocol/sdk`'s `ndJsonStream`.
 */
function bunStdinToWritableStream(
  sink: NonNullable<ReturnType<typeof Bun.spawn>["stdin"]>
): WritableStream<Uint8Array> {
  if (typeof sink === "number") {
    throw new CoreError("INTERNAL_ERROR", "Expected piped FileSink for subprocess stdin");
  }
  const fileSink = sink;
  return new WritableStream<Uint8Array>({
    write(chunk) {
      fileSink.write(chunk);
      fileSink.flush();
    },
    close() {
      try {
        fileSink.end();
      } catch {
        // Ignore if already closed
      }
    },
    abort() {
      try {
        fileSink.end();
      } catch {
        // Ignore
      }
    },
  });
}

export class AcpAgentClient {
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private connection: acp.ClientConnection | null = null;
  private initResponse: acp.InitializeResponse | null = null;
  private stderrLines: string[] = [];
  private stderrDrain: Promise<void> = Promise.resolve();
  private disposed = false;
  private updateQueue: Promise<void> = Promise.resolve();
  private readonly options: AcpSpawnOptions;

  constructor(options: AcpSpawnOptions) {
    this.options = options;
  }

  get pid(): number | null {
    return this.proc?.pid ?? null;
  }

  get initialized(): boolean {
    return this.initResponse !== null;
  }

  get initializeResult(): acp.InitializeResponse | null {
    return this.initResponse;
  }

  get supportsLoadSession(): boolean {
    return Boolean(this.initResponse?.agentCapabilities?.loadSession);
  }

  get recentStderr(): string[] {
    return [...this.stderrLines];
  }

  get isConnected(): boolean {
    return (
      this.connection !== null &&
      !this.connection.signal.aborted &&
      !this.disposed
    );
  }

  /**
   * Re-binds per-turn callbacks when reusing a warm pooled ACP client across turns/steps.
   */
  setCallbacks(callbacks: AcpClientCallbacks): void {
    this.options.callbacks = callbacks;
  }

  setKnownSecrets(secrets: string[]): void {
    this.options.knownSecrets = secrets;
  }

  async connect(): Promise<acp.InitializeResponse> {
    if (this.connection) {
      throw new CoreError("INTERNAL_ERROR", "ACP client is already connected");
    }

    const { argv, resolvedPath } = buildSpawnArgv(
      this.options.command,
      this.options.args
    );

    if (!resolvedPath && !this.options.command.includes("/") && !this.options.command.includes("\\")) {
      throw new CoreError(
        "AGENT_NOT_INSTALLED",
        `Agent executable "${this.options.command}" was not found on PATH.`,
        { command: this.options.command }
      );
    }

    const mergedEnv: Record<string, string | undefined> = {
      ...process.env,
      ...this.options.env,
    };
    const systemProxyEnv = resolveSystemProxyEnv(mergedEnv);
    const childEnv: Record<string, string | undefined> = {
      ...systemProxyEnv,
      ...mergedEnv,
    };

    const proc = Bun.spawn(argv, {
      cwd: this.options.cwd,
      env: childEnv,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.proc = proc;

    // Drain stderr asynchronously with secret redaction
    if (proc.stderr && typeof proc.stderr !== "number") {
      this.stderrDrain = this.drainStderr(proc.stderr);
    }

    if (!proc.stdout || typeof proc.stdout === "number" || !proc.stdin || typeof proc.stdin === "number") {
      await this.close();
      throw new CoreError("INTERNAL_ERROR", "Failed to open stdio pipes for ACP agent");
    }

    const stream = acp.ndJsonStream(
      bunStdinToWritableStream(proc.stdin),
      proc.stdout
    );

    const app = acp.client({
      name: this.options.clientName ?? "CodeTeams",
    });

    // Serialize session/update notifications in strict arrival order
    app.onNotification(acp.methods.client.session.update, ({ params }) => {
      const cb = this.options.callbacks?.onSessionUpdate;
      if (!cb) return;
      this.updateQueue = this.updateQueue
        .then(() => cb(params))
        .catch(() => {
          // Listener errors must not break the stream pump
        });
    });

    // Permission requests: NEVER auto-approve without explicit callback decision
    app.onRequest(
      acp.methods.client.session.requestPermission,
      async ({ params }) => {
        const cb = this.options.callbacks?.onPermissionRequest;
        if (!cb) {
          return { outcome: { outcome: "cancelled" } };
        }
        return await cb(params);
      }
    );

    // Scoped filesystem callbacks guarded against path traversal & symlink escape
    app.onRequest(
      acp.methods.client.fs.readTextFile,
      async ({ params }) => {
        try {
          const safePath = assertPathInsideWorkspace(
            this.options.cwd,
            params.path
          );
          const raw = readFileSync(safePath, "utf8");
          let content = raw;
          if (params.line != null || params.limit != null) {
            const lines = raw.split(/\r?\n/);
            const startIdx = Math.max(0, (params.line ?? 1) - 1);
            const endIdx =
              params.limit != null ? startIdx + params.limit : lines.length;
            content = lines.slice(startIdx, endIdx).join("\n");
          }
          this.options.callbacks?.onFileAccess?.({
            op: "read",
            path: safePath,
            allowed: true,
          });
          return { content };
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          this.options.callbacks?.onFileAccess?.({
            op: "read",
            path: params.path,
            allowed: false,
            reason,
          });
          throw acp.RequestError.invalidParams({ reason });
        }
      }
    );

    app.onRequest(
      acp.methods.client.fs.writeTextFile,
      async ({ params }) => {
        try {
          const safePath = assertPathInsideWorkspace(
            this.options.cwd,
            params.path
          );
          mkdirSync(dirname(safePath), { recursive: true });
          writeFileSync(safePath, params.content, "utf8");
          this.options.callbacks?.onFileAccess?.({
            op: "write",
            path: safePath,
            allowed: true,
          });
          return {};
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          this.options.callbacks?.onFileAccess?.({
            op: "write",
            path: params.path,
            allowed: false,
            reason,
          });
          throw acp.RequestError.invalidParams({ reason });
        }
      }
    );

    const conn = app.connect(stream);
    this.connection = conn;

    // Watch process exit so disconnects are surfaced cleanly
    void proc.exited.then((exitCode) => {
      if (!this.disposed) {
        this.options.callbacks?.onDisconnect?.({
          exitCode,
          reason: `Agent process exited with code ${exitCode}`,
        });
      }
    });

    // Package runners may download the adapter and its platform binary on first use.
    const runner = basename(this.options.command).replace(/\.(cmd|bat|exe)$/i, "").toLowerCase();
    const timeoutMs = this.options.initTimeoutMs ?? (["npx", "bunx", "uvx"].includes(runner) ? 90_000 : 30_000);
    let initTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      const response = await Promise.race([
        conn.agent.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {
            fs: {
              readTextFile: true,
              writeTextFile: true,
            },
          },
          clientInfo: {
            name: this.options.clientName ?? "codeteams",
            title: "CodeTeams",
            version: this.options.clientVersion ?? "0.1.0",
          },
        }),
        new Promise<never>((_, reject) => {
          initTimer = setTimeout(
            () => reject(new CoreError("TIMEOUT", `ACP initialize timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        }),
      ]);
      this.initResponse = response;
      return response;
    } catch (err) {
      await this.close();
      const stderr = this.recentStderr.slice(-10);
      const cause = err instanceof Error ? err.message : String(err);
      const diagnostic = stderr.length ? `\n${stderr.join("\n")}` : "";
      throw new CoreError(
        err instanceof CoreError ? err.code : "ACP_PROTOCOL_ERROR",
        redactSecrets(`ACP initialize failed: ${cause}${diagnostic}`, this.options.knownSecrets),
        { stderr }
      );
    } finally {
      clearTimeout(initTimer);
    }
  }

  async newSession(
    cwd: string,
    mcpServers: acp.McpServer[] = []
  ): Promise<acp.NewSessionResponse> {
    const conn = this.requireConnection();
    return await conn.agent.request(acp.methods.agent.session.new, {
      cwd,
      mcpServers,
    });
  }

  async loadSession(
    sessionId: string,
    cwd: string,
    mcpServers: acp.McpServer[] = []
  ): Promise<acp.LoadSessionResponse | void> {
    if (!this.supportsLoadSession) {
      throw new CoreError(
        "SESSION_UNAVAILABLE",
        "Agent does not advertise loadSession capability"
      );
    }
    const conn = this.requireConnection();
    return await conn.agent.request(acp.methods.agent.session.load, {
      sessionId,
      cwd,
      mcpServers,
    });
  }

  async setSessionMode(sessionId: string, modeId: string): Promise<void> {
    const conn = this.requireConnection();
    await conn.agent.request(acp.methods.agent.session.setMode, {
      sessionId,
      modeId,
    });
  }

  async prompt(
    sessionId: string,
    prompt: acp.ContentBlock[]
  ): Promise<acp.PromptResponse> {
    const conn = this.requireConnection();
    const res = await conn.agent.request(acp.methods.agent.session.prompt, {
      sessionId,
      prompt,
    });
    // Flush queued session/update notifications before returning prompt completion
    await this.updateQueue;
    return res;
  }

  async cancel(sessionId: string): Promise<void> {
    if (!this.connection || this.connection.signal.aborted) return;
    try {
      await this.connection.agent.notify(acp.methods.agent.session.cancel, {
        sessionId,
      });
    } catch {
      // Connection may already be closing
    }
  }

  async authenticate(methodId: string): Promise<acp.AuthenticateResponse | void> {
    const conn = this.requireConnection();
    return await conn.agent.request(acp.methods.agent.authenticate, {
      methodId,
    });
  }

  async flushUpdates(): Promise<void> {
    await this.updateQueue;
  }

  async close(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.connection?.close();
    } catch {
      // Ignore
    }
    const pid = this.proc?.pid;
    if (pid) {
      await killProcessTree(pid);
    }
    await this.stderrDrain;
    this.connection = null;
    this.proc = null;
  }

  private requireConnection(): acp.ClientConnection {
    if (!this.connection || this.connection.signal.aborted) {
      throw new CoreError(
        "SESSION_UNAVAILABLE",
        "ACP agent connection is not active"
      );
    }
    return this.connection;
  }

  private async drainStderr(stream: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const clean = redactSecrets(line, this.options.knownSecrets);
          if (clean.trim().length > 0) {
            this.stderrLines.push(clean);
            if (this.stderrLines.length > 200) {
              this.stderrLines.shift();
            }
            this.options.callbacks?.onStderr?.(clean);
          }
        }
      }
      if (buffer.trim().length > 0) {
        const clean = redactSecrets(buffer, this.options.knownSecrets);
        this.stderrLines.push(clean);
        this.options.callbacks?.onStderr?.(clean);
      }
    } catch {
      // Stream closed
    } finally {
      reader.releaseLock();
    }
  }
}
