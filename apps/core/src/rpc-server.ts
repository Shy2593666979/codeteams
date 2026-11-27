import {
  CoreError,
  JsonRpcRequestSchema,
  RpcSchemas,
  type CoreEvent,
  type JsonRpcNotification,
  type JsonRpcResponse,
  type RpcMethod,
} from "@codeteams/shared";
import type { CodeTeamsRuntime } from "@codeteams/engine";

function writeFrame(frame: JsonRpcResponse | JsonRpcNotification): void {
  // stdout is strictly reserved for newline-delimited JSON-RPC 2.0 frames (Spec Section 3)
  process.stdout.write(JSON.stringify(frame) + "\n");
}

export function logStderr(level: "info" | "warn" | "error", msg: string, data?: unknown): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(data !== undefined ? { data } : {}),
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export class CoreRpcServer {
  private unsubscribeEvents: (() => void) | null = null;

  constructor(private readonly runtime: CodeTeamsRuntime) {}

  async dispatch(method: string, rawParams: unknown): Promise<unknown> {
    if (!(method in RpcSchemas)) {
      throw new CoreError("NOT_FOUND", `Unknown RPC method: ${method}`);
    }

    const rpcMethod = method as RpcMethod;
    const schema = RpcSchemas[rpcMethod];
    const parsed = schema.safeParse(rawParams ?? {});
    if (!parsed.success) {
      throw new CoreError(
        "VALIDATION_ERROR",
        `Invalid parameters for ${method}: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`
      );
    }

    const p = parsed.data as Record<string, unknown>;

    switch (rpcMethod) {
      case "system.ping":
        return { ok: true, ts: new Date().toISOString(), pid: process.pid };
      case "system.info":
        return {
          version: "0.1.0",
          bunVersion: Bun.version,
          platform: process.platform,
          arch: process.arch,
          userDataDir: this.runtime.storage.paths.userDataDir,
          latestEventSeq: this.runtime.eventBus.getLatestSeq(),
        };

      // Projects
      case "projects.list":
        return this.runtime.listProjects(Boolean(p.includeArchived));
      case "projects.open":
        return this.runtime.openProject(
          p.path as string,
          p.name as string | undefined
        );
      case "projects.get":
        return this.runtime.getProject(p.projectId as string);
      case "projects.archive":
        return this.runtime.archiveProject(
          p.projectId as string,
          Boolean(p.archived)
        );
      case "projects.workspaceStatus":
        return this.runtime.getWorkspaceStatus(p.projectId as string);
      case "projects.listFiles":
        return this.runtime.listWorkspaceFiles(
          p.projectId as string,
          p.relativePath as string | undefined
        );
      case "projects.readFile":
        return this.runtime.readWorkspaceFile(
          p.projectId as string,
          p.relativePath as string
        );
      case "projects.gitDiff":
        return this.runtime.getWorkspaceGitDiff(
          p.projectId as string,
          p.relativePath as string | undefined
        );
      case "projects.memory.get":
        return this.runtime.getProjectMemory(p.projectId as string);
      case "projects.memory.update":
        return this.runtime.updateProjectMemory(
          p.projectId as string,
          p.content as string
        );

      // Agents
      case "agents.list":
        return this.runtime.listAgents();
      case "agents.detect":
        return this.runtime.detectAgents(p.agentId as string | undefined);
      case "agents.configure":
        return this.runtime.configureAgent(
          p as Parameters<CodeTeamsRuntime["configureAgent"]>[0]
        );
      case "agents.registerCustom":
        return this.runtime.registerCustomAgent(
          p as Parameters<CodeTeamsRuntime["registerCustomAgent"]>[0]
        );
      case "agents.testConnection":
        return await this.runtime.testAgentConnection(
          p as Parameters<CodeTeamsRuntime["testAgentConnection"]>[0]
        );
      case "agents.capabilities": {
        const agent = this.runtime.getAgent(p.agentId as string);
        return {
          agentId: agent.id,
          capabilities: agent.status.capabilities ?? null,
          supportsLoadSession: Boolean(agent.supportsLoadSession),
        };
      }
      case "agents.setSecret":
        return this.runtime.setAgentSecret(
          p.agentId as string,
          p.envKey as string,
          p.value as string
        );

      // Conversations
      case "conversations.list":
        return this.runtime.listConversations(
          p as Parameters<CodeTeamsRuntime["listConversations"]>[0]
        );
      case "conversations.create":
        return this.runtime.createConversation(
          p as Parameters<CodeTeamsRuntime["createConversation"]>[0]
        );
      case "conversations.get":
        return this.runtime.getConversationDetail(p.conversationId as string);
      case "conversations.send":
        return await this.runtime.sendMessage(
          p as Parameters<CodeTeamsRuntime["sendMessage"]>[0]
        );
      case "conversations.cancel":
        return await this.runtime.cancelConversation(
          p.conversationId as string
        );
      case "conversations.rename":
        return this.runtime.renameConversation(
          p.conversationId as string,
          p.title as string
        );
      case "conversations.archive":
        return this.runtime.archiveConversation(
          p.conversationId as string,
          Boolean(p.archived)
        );
      case "conversations.delete":
        return await this.runtime.deleteConversation(
          p.conversationId as string
        );

      // Workflows
      case "workflows.list":
        return this.runtime.listWorkflows(p.projectId as string | undefined);
      case "workflows.get":
        return this.runtime.getWorkflow(p.workflowId as string);
      case "workflows.save":
        return this.runtime.saveWorkflow(
          p as Parameters<CodeTeamsRuntime["saveWorkflow"]>[0]
        );
      case "workflows.validate":
        return this.runtime.validateWorkflow(p.definition, false);
      case "workflows.delete":
        return this.runtime.deleteWorkflow(p.workflowId as string);

      // Runs
      case "runs.start":
        return await this.runtime.startRun(
          p as Parameters<CodeTeamsRuntime["startRun"]>[0]
        );
      case "runs.get":
        return this.runtime.getRun(p.runId as string);
      case "runs.list":
        return this.runtime.listRuns(
          p as Parameters<CodeTeamsRuntime["listRuns"]>[0]
        );
      case "runs.cancel":
        return await this.runtime.cancelRun(p.runId as string);
      case "runs.pauseAfterCurrent":
        return this.runtime.pauseRunAfterCurrent(p.runId as string);
      case "runs.resume":
        return await this.runtime.resumeRun(
          p as Parameters<CodeTeamsRuntime["resumeRun"]>[0]
        );
      case "runs.retryNode":
        return await this.runtime.retryNode(
          p as Parameters<CodeTeamsRuntime["retryNode"]>[0]
        );

      // Permissions
      case "permissions.listPending":
        return this.runtime.permissions.listPending(
          p as { runId?: string; conversationId?: string }
        );
      case "permissions.respond":
        return this.runtime.permissions.respond(
          p as {
            permissionId: string;
            outcome: "selected" | "cancelled";
            optionId?: string;
          }
        );

      // Context
      case "context.getHandoff":
        return this.runtime.contextEngine.listHandoffsForRun(p.runId as string);
      case "context.getProjectMemory":
        return this.runtime.getProjectMemory(p.projectId as string);
      case "context.getSnapshot": {
        if (p.runId) {
          return this.runtime.getRun(p.runId as string);
        }
        if (p.conversationId) {
          return this.runtime.getConversationDetail(p.conversationId as string);
        }
        return {
          latestSeq: this.runtime.eventBus.getLatestSeq(),
          projects: this.runtime.listProjects(),
          workflows: this.runtime.listWorkflows(),
          agents: this.runtime.listAgents(),
        };
      }

      // Events
      case "events.snapshotAfterCursor":
        return {
          latestSeq: this.runtime.eventBus.getLatestSeq(),
          events: this.runtime.eventBus.snapshotAfterCursor(
            p as {
              afterSeq: number;
              projectId?: string;
              conversationId?: string;
              runId?: string;
              limit?: number;
            }
          ),
        };

      // Storage & Settings
      case "storage.backup":
        return this.runtime.storage.createBackup("manual");
      case "storage.export":
        return this.runtime.exportRecords(p.projectId as string | undefined);
      case "storage.diagnostics":
        return this.runtime.storage.getDiagnostics();
      case "settings.getAll":
        return this.runtime.getAllSettings();
      case "settings.set":
        return this.runtime.setSetting(p.key as string, p.value);
    }
  }

  async serveStdio(): Promise<void> {
    this.unsubscribeEvents = this.runtime.subscribeEvents((event: CoreEvent) => {
      writeFrame({
        jsonrpc: "2.0",
        method: "core.event",
        params: event,
      });
    });

    // Emit ready notification so Electron Main knows Core has booted & migrated SQLite
    writeFrame({
      jsonrpc: "2.0",
      method: "core.ready",
      params: {
        version: "0.1.0",
        bunVersion: Bun.version,
        latestEventSeq: this.runtime.eventBus.getLatestSeq(),
        userDataDir: this.runtime.storage.paths.userDataDir,
      },
    });

    const decoder = new TextDecoder();
    const reader = Bun.stdin.stream().getReader();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIdx = buffer.indexOf("\n");
        while (newlineIdx !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (line.length > 0) {
            void this.handleLine(line);
          }
          newlineIdx = buffer.indexOf("\n");
        }
      }
    } finally {
      reader.releaseLock();
      this.unsubscribeEvents?.();
      await this.runtime.shutdown();
    }
  }

  private async handleLine(line: string): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      writeFrame({
        jsonrpc: "2.0",
        id: 0,
        error: {
          code: -32700,
          message: "Parse error: invalid JSON frame",
        },
      });
      return;
    }

    const parsed = JsonRpcRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const id =
        typeof (raw as { id?: unknown })?.id === "string" ||
        typeof (raw as { id?: unknown })?.id === "number"
          ? ((raw as { id: string | number }).id)
          : 0;
      writeFrame({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32600,
          message: "Invalid JSON-RPC 2.0 request",
        },
      });
      return;
    }

    const req = parsed.data;
    try {
      const result = await this.dispatch(req.method, req.params);
      writeFrame({
        jsonrpc: "2.0",
        id: req.id,
        result,
      });
    } catch (err) {
      if (err instanceof CoreError) {
        writeFrame({
          jsonrpc: "2.0",
          id: req.id,
          error: {
            code: -32000,
            message: err.message,
            data: err.toPayload(),
          },
        });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        logStderr("error", `RPC ${req.method} failed`, { error: msg });
        writeFrame({
          jsonrpc: "2.0",
          id: req.id,
          error: {
            code: -32603,
            message: msg,
            data: { code: "INTERNAL_ERROR", message: msg },
          },
        });
      }
    }
  }
}
