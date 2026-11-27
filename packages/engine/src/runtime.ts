import { randomUUID } from "node:crypto";
import type * as acp from "@agentclientprotocol/sdk";
import {
  BUILTIN_AGENT_PRESETS,
  CoreError,
  type ActiveChatTurn,
  type AgentDefinition,
  type AgentSession,
  type AgentWithStatus,
  type Artifact,
  type ChatTurnState,
  type ContextHandoff,
  type Conversation,
  type CoreEvent,
  type Message,
  type NodeRun,
  type PermissionRequest,
  type Project,
  type ProjectMemory,
  type ProjectRuleFile,
  type RunCheckpoint,
  type TurnPlanEntry,
  type TurnSegment,
  type TurnToolDiff,
  type TurnToolLocation,
  type WorkflowDefinition,
  type WorkflowRecord,
  type WorkflowRun,
  type WorkspaceStatus,
} from "@codeteams/shared";
import {
  AcpAgentClient,
  buildDefaultRuntimeStatus,
  detectAgentInstallation,
  redactSecrets,
} from "@codeteams/acp";
import {
  agentSessionsTable,
  agentsTable,
  artifactsTable,
  conversationsTable,
  idempotencyKeysTable,
  messagesTable,
  nodeRunsTable,
  projectMemoriesTable,
  projectsTable,
  runCheckpointsTable,
  settingsTable,
  workflowRunsTable,
  workflowVersionsTable,
  workflowsTable,
  type CodeTeamsStorage,
} from "@codeteams/storage";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { ContextEngine } from "./context-engine";
import { CoreEventBus, type EventSubscriber } from "./event-bus";
import { PermissionBroker } from "./permission-broker";
import {
  assertValidWorkflow,
  computeWorkflowLayers,
  resolveWorkflowEdges,
  validateWorkflowDefinition,
} from "./workflow-validator";
import { WorkspaceManager } from "./workspace-manager";

interface LiveClientEntry {
  client: AcpAgentClient;
  agentId: string;
  sessionId: string;
  providerSessionId: string;
  cwd: string;
  conversationId: string;
  configSignature: string;
}

interface WarmClientEntry {
  key: string;
  agentId: string;
  cwd: string;
  configSignature: string;
  client: AcpAgentClient;
  initResult: acp.InitializeResponse;
  lastUsedAt: number;
  idleTimer: ReturnType<typeof setTimeout>;
}

const MAX_WARM_CLIENTS = 3;
const WARM_IDLE_TTL_MS = 5 * 60 * 1000;

function computeAgentConfigSignature(
  agent: AgentDefinition,
  env: Record<string, string>
): string {
  const sortedEnv = Object.keys(env)
    .sort()
    .map((k) => `${k}=${env[k] ?? ""}`);
  return JSON.stringify({
    command: agent.command,
    args: agent.args,
    env: sortedEnv,
  });
}

function finalizeOpenThought(segments: TurnSegment[]): void {
  const last = segments.at(-1);
  if (last && last.type === "thought" && last.durationMs == null) {
    last.durationMs = last.startedAt
      ? Math.max(0, Date.now() - last.startedAt)
      : 0;
  }
}

function appendThoughtSegment(segments: TurnSegment[], delta: string): void {
  if (!delta) return;
  const last = segments.at(-1);
  if (last && last.type === "thought") {
    last.text += delta;
  } else {
    segments.push({ type: "thought", text: delta, startedAt: Date.now() });
  }
}

function appendTextSegment(segments: TurnSegment[], delta: string): void {
  if (!delta) return;
  finalizeOpenThought(segments);
  const last = segments.at(-1);
  if (last && last.type === "text") {
    last.text += delta;
  } else {
    segments.push({ type: "text", text: delta });
  }
}

function upsertToolSegment(
  segments: TurnSegment[],
  update: {
    toolCallId: string;
    agentId: string;
    title?: string | null;
    kind?: string | null;
    status?: string | null;
    locations?: TurnToolLocation[];
    rawInputPreview?: string | null;
    rawOutputPreview?: string | null;
    contentPreview?: string | null;
    diffs?: TurnToolDiff[];
    autoApproved?: boolean;
  }
): void {
  finalizeOpenThought(segments);
  const existing = segments.find(
    (s): s is Extract<TurnSegment, { type: "tool" }> =>
      s.type === "tool" && s.toolCallId === update.toolCallId
  );
  if (existing) {
    if (update.title) existing.title = update.title;
    if (update.kind) existing.kind = update.kind;
    if (update.status) existing.status = update.status;
    if (update.locations && update.locations.length > 0) {
      existing.locations = update.locations;
    }
    if (update.rawInputPreview) existing.rawInputPreview = update.rawInputPreview;
    if (update.rawOutputPreview) {
      existing.rawOutputPreview = update.rawOutputPreview;
    }
    if (update.contentPreview) existing.contentPreview = update.contentPreview;
    if (update.diffs && update.diffs.length > 0) {
      existing.diffs = update.diffs;
    }
    if (update.autoApproved) existing.autoApproved = true;
    return;
  }
  segments.push({
    type: "tool",
    toolCallId: update.toolCallId,
    agentId: update.agentId,
    title: update.title || "执行工具操作",
    kind: update.kind || "other",
    status: update.status || "in_progress",
    locations: update.locations ?? [],
    rawInputPreview: update.rawInputPreview ?? null,
    rawOutputPreview: update.rawOutputPreview ?? null,
    contentPreview: update.contentPreview ?? null,
    ...(update.diffs && update.diffs.length > 0 ? { diffs: update.diffs } : {}),
    autoApproved: update.autoApproved ?? false,
  });
}

function upsertPlanSegment(
  segments: TurnSegment[],
  agentId: string,
  entries: TurnPlanEntry[]
): void {
  finalizeOpenThought(segments);
  const last = segments.at(-1);
  if (last && last.type === "plan") {
    last.entries = entries;
    return;
  }
  const existing = segments.find(
    (s): s is Extract<TurnSegment, { type: "plan" }> => s.type === "plan"
  );
  if (existing) {
    existing.entries = entries;
    return;
  }
  segments.push({ type: "plan", agentId, entries });
}

function joinTextSegments(segments: TurnSegment[]): string {
  return segments
    .filter((s): s is Extract<TurnSegment, { type: "text" }> => s.type === "text")
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

interface ActiveRunControl {
  runId: string;
  cancelled: boolean;
  pauseAfterCurrent: boolean;
  permissionMode: "ask" | "full_access";
  activeClients: Map<
    string,
    { client: AcpAgentClient; providerSessionId: string | null }
  >;
  promise: Promise<void>;
}

interface ActiveChatTurnControl {
  conversationId: string;
  projectId: string;
  agentId: string;
  state: "running" | "waiting_permission";
  startedAt: string;
  cancelled: boolean;
  promise: Promise<void>;
}

function summarizeAcpValue(val: unknown, secrets: string[], maxLen = 1400): string | null {
  if (val === undefined || val === null) return null;
  let text: string;
  if (typeof val === "string") {
    text = val;
  } else {
    try {
      text = JSON.stringify(val, null, 2);
    } catch {
      text = String(val);
    }
  }
  const clean = redactSecrets(text, secrets).trim();
  if (!clean) return null;
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}\n… (truncated)` : clean;
}

const MAX_DIFF_TEXT_LEN = 48_000;
const MAX_DIFFS_PER_TOOL = 6;

function boundDiffText(text: string, secrets: string[]): string {
  const clean = redactSecrets(text, secrets);
  return clean.length > MAX_DIFF_TEXT_LEN
    ? `${clean.slice(0, MAX_DIFF_TEXT_LEN)}\n… (truncated)`
    : clean;
}

function parseApplyPatchToDiffs(patchText: string, secrets: string[]): TurnToolDiff[] {
  if (!patchText.includes("*** ")) return [];
  const diffs: TurnToolDiff[] = [];
  const lines = patchText.replace(/\r\n/g, "\n").split("\n");
  let currentPath: string | null = null;
  let isAdd = false;
  let oldLines: string[] = [];
  let newLines: string[] = [];

  const flush = () => {
    if (!currentPath) return;
    diffs.push({
      path: currentPath,
      oldText: isAdd ? null : boundDiffText(oldLines.join("\n"), secrets),
      newText: boundDiffText(newLines.join("\n"), secrets),
    });
    currentPath = null;
    isAdd = false;
    oldLines = [];
    newLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("*** Update File: ")) {
      flush();
      currentPath = line.slice("*** Update File: ".length).trim();
      isAdd = false;
    } else if (line.startsWith("*** Add File: ")) {
      flush();
      currentPath = line.slice("*** Add File: ".length).trim();
      isAdd = true;
    } else if (line.startsWith("*** Delete File: ")) {
      flush();
      currentPath = line.slice("*** Delete File: ".length).trim();
      isAdd = false;
    } else if (line.startsWith("*** End Patch") || line.startsWith("*** Begin Patch")) {
      if (line.startsWith("*** End Patch")) flush();
    } else if (line.startsWith("@@")) {
      continue;
    } else if (currentPath) {
      if (line.startsWith("-")) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith("+")) {
        newLines.push(line.slice(1));
      } else if (line.startsWith(" ")) {
        const ctx = line.slice(1);
        oldLines.push(ctx);
        newLines.push(ctx);
      }
    }
    if (diffs.length >= MAX_DIFFS_PER_TOOL) break;
  }
  flush();
  return diffs.slice(0, MAX_DIFFS_PER_TOOL);
}

function extractToolDiffs(
  content: unknown,
  rawInput: unknown,
  locations: TurnToolLocation[] | undefined,
  kind: string | null | undefined,
  secrets: string[]
): TurnToolDiff[] {
  const diffs: TurnToolDiff[] = [];

  // 1. Official ACP v1 ToolCallContent { type: "diff", path, oldText, newText }
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      if (
        obj.type === "diff" &&
        typeof obj.path === "string" &&
        typeof obj.newText === "string"
      ) {
        diffs.push({
          path: obj.path,
          oldText:
            typeof obj.oldText === "string"
              ? boundDiffText(obj.oldText, secrets)
              : null,
          newText: boundDiffText(obj.newText, secrets),
        });
        if (diffs.length >= MAX_DIFFS_PER_TOOL) return diffs;
      }
    }
  }
  if (diffs.length > 0) return diffs;

  // 2. Fallback from rawInput (single/multi edit tools, write_file, or Codex apply_patch)
  if (typeof rawInput === "string") {
    return parseApplyPatchToDiffs(rawInput, secrets);
  }
  if (!rawInput || typeof rawInput !== "object") return diffs;

  const obj = rawInput as Record<string, unknown>;
  const patchCandidate =
    typeof obj.patch === "string"
      ? obj.patch
      : typeof obj.input === "string"
        ? obj.input
        : typeof obj.diff === "string"
          ? obj.diff
          : null;
  if (patchCandidate && patchCandidate.includes("*** ")) {
    const parsed = parseApplyPatchToDiffs(patchCandidate, secrets);
    if (parsed.length > 0) return parsed;
  }

  const filePath =
    (typeof obj.path === "string" && obj.path) ||
    (typeof obj.file_path === "string" && obj.file_path) ||
    (typeof obj.filePath === "string" && obj.filePath) ||
    (typeof obj.TargetFile === "string" && obj.TargetFile) ||
    locations?.[0]?.path ||
    "";

  if (!filePath) return diffs;

  // Multi-chunk edits array (e.g. edits / ReplacementChunks)
  const chunks = Array.isArray(obj.edits)
    ? obj.edits
    : Array.isArray(obj.ReplacementChunks)
      ? obj.ReplacementChunks
      : null;
  if (chunks && chunks.length > 0) {
    const oldParts: string[] = [];
    const newParts: string[] = [];
    for (const chunk of chunks) {
      if (!chunk || typeof chunk !== "object") continue;
      const c = chunk as Record<string, unknown>;
      const o =
        typeof c.old_string === "string"
          ? c.old_string
          : typeof c.oldText === "string"
            ? c.oldText
            : typeof c.TargetContent === "string"
              ? c.TargetContent
              : "";
      const n =
        typeof c.new_string === "string"
          ? c.new_string
          : typeof c.newText === "string"
            ? c.newText
            : typeof c.ReplacementContent === "string"
              ? c.ReplacementContent
              : null;
      if (n !== null) {
        oldParts.push(o);
        newParts.push(n);
      }
    }
    if (newParts.length > 0) {
      diffs.push({
        path: filePath,
        oldText: boundDiffText(oldParts.join("\n"), secrets),
        newText: boundDiffText(newParts.join("\n"), secrets),
      });
      return diffs;
    }
  }

  // Single replacement edit
  const oldStr =
    typeof obj.oldText === "string"
      ? obj.oldText
      : typeof obj.old_string === "string"
        ? obj.old_string
        : typeof obj.old_str === "string"
          ? obj.old_str
          : typeof obj.Target === "string"
            ? obj.Target
            : undefined;
  const newStr =
    typeof obj.newText === "string"
      ? obj.newText
      : typeof obj.new_string === "string"
        ? obj.new_string
        : typeof obj.new_str === "string"
          ? obj.new_str
          : typeof obj.Replacement === "string"
            ? obj.Replacement
            : undefined;

  if (newStr !== undefined) {
    diffs.push({
      path: filePath,
      oldText: oldStr !== undefined ? boundDiffText(oldStr, secrets) : null,
      newText: boundDiffText(newStr, secrets),
    });
    return diffs;
  }

  // Full file write
  const isEditLike =
    kind === "edit" || kind === "write" || typeof obj.CodeContent === "string";
  const writtenContent =
    typeof obj.content === "string"
      ? obj.content
      : typeof obj.CodeContent === "string"
        ? obj.CodeContent
        : undefined;
  if (isEditLike && writtenContent !== undefined) {
    diffs.push({
      path: filePath,
      oldText: null,
      newText: boundDiffText(writtenContent, secrets),
    });
  }

  return diffs;
}

function extractToolContentPreview(
  content: unknown,
  secrets: string[],
  maxLen = 1200
): string | null {
  if (!Array.isArray(content) || content.length === 0) return null;
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (
      obj.type === "content" &&
      obj.content &&
      typeof obj.content === "object" &&
      (obj.content as Record<string, unknown>).type === "text" &&
      typeof (obj.content as Record<string, unknown>).text === "string"
    ) {
      parts.push((obj.content as Record<string, unknown>).text as string);
    }
  }
  const joined = redactSecrets(parts.join("\n"), secrets).trim();
  if (!joined) return null;
  return joined.length > maxLen ? `${joined.slice(0, maxLen)}\n…` : joined;
}

async function applyAcpPermissionModeIfAdvertised(
  client: AcpAgentClient,
  sessionId: string,
  sessionResp: unknown,
  permissionMode: "ask" | "full_access"
): Promise<void> {
  if (permissionMode !== "full_access") return;
  const modes = (
    sessionResp as {
      modes?: {
        availableModes?: Array<{ id: string; name?: string }>;
        currentModeId?: string;
      };
    } | null
  )?.modes;
  if (!modes?.availableModes?.length) return;
  const target = modes.availableModes.find((m) =>
    /bypass|yolo|full.?auto|auto.?approve|danger|unrestricted|allow.?all/i.test(
      `${m.id} ${m.name ?? ""}`
    )
  );
  if (target && target.id !== modes.currentModeId) {
    try {
      await client.setSessionMode(sessionId, target.id);
    } catch {
      // Fallback: PermissionBroker autoApprove still handles all permission requests
    }
  }
}

export interface RuntimeOptions {
  /**
   * Optional fault injection hook for testing crash/interruption durability.
   */
  onBeforeNodeCommit?: (stepId: string, nodeRunId: string) => void | Promise<void>;
}

export class CodeTeamsRuntime {
  readonly storage: CodeTeamsStorage;
  readonly eventBus: CoreEventBus;
  readonly workspace: WorkspaceManager;
  readonly permissions: PermissionBroker;
  readonly contextEngine: ContextEngine;

  private readonly secretStore = new Map<string, string>(); // "agentId:ENV_KEY" -> secret value (memory only)
  private readonly liveChatClients = new Map<string, LiveClientEntry>(); // conversationId -> live single-agent client
  private readonly warmPool = new Map<string, WarmClientEntry>(); // `${agentId}::${cwd}` -> idle warm ACP client
  private readonly conversationPermissionModes = new Map<string, "ask" | "full_access">();
  private readonly manuallyRenamedConversations = new Set<string>();
  private readonly busyConversations = new Set<string>();
  private readonly activeChatTurns = new Map<string, ActiveChatTurnControl>();
  private readonly activeRuns = new Map<string, ActiveRunControl>();
  private readonly runtimeAgentStates = new Map<
    string,
    {
      connectionState: "disconnected" | "connecting" | "connected" | "error";
      protocolVersion: number | null;
      capabilities: Record<string, unknown> | null;
      lastError: string | null;
    }
  >();
  private shuttingDown = false;
  private readonly options: RuntimeOptions;

  constructor(storage: CodeTeamsStorage, options: RuntimeOptions = {}) {
    this.storage = storage;
    this.options = options;
    this.eventBus = new CoreEventBus(storage);
    this.workspace = new WorkspaceManager();
    this.permissions = new PermissionBroker(storage, this.eventBus);
    this.contextEngine = new ContextEngine(storage);

    this.seedBuiltinAgents();
    this.reconcileOnStartup();
  }

  subscribeEvents(listener: EventSubscriber): () => void {
    return this.eventBus.subscribe(listener);
  }

  private seedBuiltinAgents(): void {
    const now = new Date().toISOString();
    for (const preset of BUILTIN_AGENT_PRESETS) {
      const existing = this.storage.db
        .select({
          id: agentsTable.id,
          vendor: agentsTable.vendor,
          automationPolicy: agentsTable.automationPolicy,
          automationNote: agentsTable.automationNote,
        })
        .from(agentsTable)
        .where(eq(agentsTable.id, preset.id))
        .get();
      if (existing) {
        const updates: Partial<typeof agentsTable.$inferInsert> = {};
        if (
          preset.id === "antigravity" &&
          existing.automationPolicy === "restricted" &&
          existing.automationNote?.includes("Issue #1493")
        ) {
          updates.automationPolicy = preset.automationPolicy;
          updates.automationNote = preset.automationNote ?? null;
        }
        if (/\bACP\b/i.test(existing.vendor) && existing.vendor !== preset.vendor) {
          updates.vendor = preset.vendor;
        }
        if (Object.keys(updates).length > 0) {
          this.storage.db
            .update(agentsTable)
            .set({ ...updates, updatedAt: now })
            .where(eq(agentsTable.id, preset.id))
            .run();
        }
        continue;
      }

      this.storage.db
        .insert(agentsTable)
        .values({
          id: preset.id,
          name: preset.name,
          vendor: preset.vendor,
          officialUrl: preset.officialUrl,
          logoAssetId: preset.logoAssetId,
          source: preset.source,
          registryId: preset.registryId ?? null,
          command: preset.command,
          argsJson: JSON.stringify(preset.args),
          envRefsJson: JSON.stringify(preset.envRefs),
          pinnedVersion: preset.pinnedVersion ?? null,
          installedVersion: preset.installedVersion ?? null,
          verification: preset.verification,
          automationPolicy: preset.automationPolicy,
          automationNote: preset.automationNote ?? null,
          description: preset.description ?? null,
          installCommandHint: preset.installCommandHint ?? null,
          detectBinary: preset.detectBinary ?? null,
          capabilitiesJson: null,
          lastTestedAt: null,
          lastError: null,
          isCustom: 0,
          updatedAt: now,
        })
        .run();
    }
  }

  /**
   * Scans SQLite on startup for any runs/nodes/sessions left active from a crash
   * or sudden exit, marks them `interrupted`, and records a clear recovery notice.
   */
  reconcileOnStartup(): { interruptedRuns: string[] } {
    const now = new Date().toISOString();
    const staleRuns = this.storage.db
      .select()
      .from(workflowRunsTable)
      .where(
        inArray(workflowRunsTable.state, [
          "queued",
          "running",
          "waiting_permission",
        ])
      )
      .all();

    const interruptedRuns: string[] = [];

    for (const run of staleRuns) {
      interruptedRuns.push(run.id);

      this.storage.sqlite.transaction(() => {
        this.storage.db
          .update(workflowRunsTable)
          .set({
            state: "interrupted",
            errorCode: "INTERRUPTED",
            errorMessage:
              "Execution was interrupted when CodeTeams closed or crashed before completion.",
            updatedAt: now,
          })
          .where(eq(workflowRunsTable.id, run.id))
          .run();

        this.storage.db
          .update(nodeRunsTable)
          .set({
            state: "interrupted",
            errorCode: "INTERRUPTED",
            errorMessage: "Node execution was interrupted before commit.",
            finishedAt: now,
          })
          .where(
            and(
              eq(nodeRunsTable.runId, run.id),
              inArray(nodeRunsTable.state, ["running", "waiting_permission"])
            )
          )
          .run();

        this.storage.db
          .update(runCheckpointsTable)
          .set({
            recoveryMode: "needs_confirmation",
            updatedAt: now,
          })
          .where(eq(runCheckpointsTable.runId, run.id))
          .run();
      })();

      this.appendMessage({
        conversationId: run.conversationId,
        role: "system",
        kind: "recovery_notice",
        content:
          "上次执行已中断，已保存历史与工作成果。请确认当前代码区状态后选择恢复执行。",
        metadata: {
          runId: run.id,
          code: "INTERRUPTED",
        },
      });

      this.eventBus.emit({
        projectId: run.projectId,
        conversationId: run.conversationId,
        runId: run.id,
        type: "run.state",
        payload: { state: "interrupted", reason: "startup_reconcile" },
      });
    }

    // Mark dangling active agent sessions as interrupted
    this.storage.db
      .update(agentSessionsTable)
      .set({ state: "interrupted", updatedAt: now })
      .where(eq(agentSessionsTable.state, "active"))
      .run();

    // Mark dangling unresolved permission requests from previous process as cancelled
    this.permissions.reconcileOnStartup();

    return { interruptedRuns };
  }

  // =========================================================================
  // Projects
  // =========================================================================

  listProjects(includeArchived = false): Project[] {
    const rows = includeArchived
      ? this.storage.db
          .select()
          .from(projectsTable)
          .orderBy(desc(projectsTable.lastOpenedAt))
          .all()
      : this.storage.db
          .select()
          .from(projectsTable)
          .where(isNull(projectsTable.archivedAt))
          .orderBy(desc(projectsTable.lastOpenedAt))
          .all();

    return rows.map((r) => this.hydrateProject(r));
  }

  openProject(inputPath: string, customName?: string): Project {
    const info = this.workspace.canonicalize(inputPath);
    const now = new Date().toISOString();

    const existing = this.storage.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.canonicalPath, info.canonicalPath))
      .get();

    if (existing) {
      this.storage.db
        .update(projectsTable)
        .set({
          name: customName?.trim() || existing.name,
          gitRoot: info.gitRoot,
          lastOpenedAt: now,
          archivedAt: null,
        })
        .where(eq(projectsTable.id, existing.id))
        .run();
      return this.getProject(existing.id);
    }

    const id = randomUUID();
    this.storage.db
      .insert(projectsTable)
      .values({
        id,
        name: customName?.trim() || info.name,
        canonicalPath: info.canonicalPath,
        gitRoot: info.gitRoot,
        createdAt: now,
        lastOpenedAt: now,
        archivedAt: null,
      })
      .run();

    return this.getProject(id);
  }

  getProject(projectId: string): Project {
    const row = this.storage.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .get();
    if (!row) {
      throw new CoreError("NOT_FOUND", `Project "${projectId}" not found`);
    }
    return this.hydrateProject(row);
  }

  archiveProject(projectId: string, archived: boolean): Project {
    this.getProject(projectId);
    const archivedAt = archived ? new Date().toISOString() : null;
    this.storage.db
      .update(projectsTable)
      .set({ archivedAt })
      .where(eq(projectsTable.id, projectId))
      .run();
    return this.getProject(projectId);
  }

  getWorkspaceStatus(projectId: string): WorkspaceStatus {
    const project = this.getProject(projectId);
    return this.workspace.getStatus(project.id, project.canonicalPath);
  }

  listWorkspaceFiles(projectId: string, relativePath?: string) {
    const project = this.getProject(projectId);
    return this.workspace.listDirectory(
      project.id,
      project.canonicalPath,
      relativePath ?? ""
    );
  }

  readWorkspaceFile(projectId: string, relativePath: string) {
    const project = this.getProject(projectId);
    return this.workspace.readWorkspaceFile(project.canonicalPath, relativePath);
  }

  getWorkspaceGitDiff(projectId: string, relativePath?: string) {
    const project = this.getProject(projectId);
    return this.workspace.getGitDiff(project.canonicalPath, relativePath);
  }

  getProjectMemory(projectId: string): {
    memory: ProjectMemory | null;
    ruleFiles: ProjectRuleFile[];
  } {
    const project = this.getProject(projectId);
    const row = this.storage.db
      .select()
      .from(projectMemoriesTable)
      .where(
        and(
          eq(projectMemoriesTable.projectId, projectId),
          eq(projectMemoriesTable.source, "user")
        )
      )
      .orderBy(desc(projectMemoriesTable.revision))
      .get();

    const ruleFiles = this.workspace.readProjectRuleFiles(project.canonicalPath);
    const memory: ProjectMemory | null = row
      ? {
          id: row.id,
          projectId: row.projectId,
          content: row.content,
          source: row.source as ProjectMemory["source"],
          revision: row.revision,
          updatedAt: row.updatedAt,
        }
      : null;

    return { memory, ruleFiles };
  }

  updateProjectMemory(projectId: string, content: string): ProjectMemory {
    this.getProject(projectId);
    const now = new Date().toISOString();
    const existing = this.storage.db
      .select()
      .from(projectMemoriesTable)
      .where(
        and(
          eq(projectMemoriesTable.projectId, projectId),
          eq(projectMemoriesTable.source, "user")
        )
      )
      .get();

    if (existing) {
      const nextRev = existing.revision + 1;
      this.storage.db
        .update(projectMemoriesTable)
        .set({ content, revision: nextRev, updatedAt: now })
        .where(eq(projectMemoriesTable.id, existing.id))
        .run();
      return {
        id: existing.id,
        projectId,
        content,
        source: "user",
        revision: nextRev,
        updatedAt: now,
      };
    }

    const id = randomUUID();
    this.storage.db
      .insert(projectMemoriesTable)
      .values({
        id,
        projectId,
        content,
        source: "user",
        revision: 1,
        updatedAt: now,
      })
      .run();

    return {
      id,
      projectId,
      content,
      source: "user",
      revision: 1,
      updatedAt: now,
    };
  }

  private hydrateProject(row: typeof projectsTable.$inferSelect): Project {
    let gitBranch: string | null = null;
    let isGitRepo = false;
    let hasUncommittedChanges = false;
    try {
      const ws = this.workspace.getStatus(row.id, row.canonicalPath);
      gitBranch = ws.branch;
      isGitRepo = ws.isGitRepo;
      hasUncommittedChanges = ws.changedFiles.length > 0;
    } catch {
      // Directory may be temporarily unavailable
    }

    return {
      id: row.id,
      name: row.name,
      canonicalPath: row.canonicalPath,
      gitRoot: row.gitRoot,
      gitBranch,
      isGitRepo,
      hasUncommittedChanges,
      createdAt: row.createdAt,
      lastOpenedAt: row.lastOpenedAt,
      archivedAt: row.archivedAt,
    };
  }

  // =========================================================================
  // Agents
  // =========================================================================

  listAgents(): AgentWithStatus[] {
    const rows = this.storage.db.select().from(agentsTable).all();
    // Preserve builtin preset order first, then custom agents
    const presetOrder = new Map(
      BUILTIN_AGENT_PRESETS.map((p, idx) => [p.id, idx])
    );
    rows.sort((a, b) => {
      const oa = presetOrder.get(a.id) ?? 999;
      const ob = presetOrder.get(b.id) ?? 999;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });

    return rows.map((row) => this.hydrateAgent(row));
  }

  getAgent(agentId: string): AgentWithStatus {
    const row = this.storage.db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, agentId))
      .get();
    if (!row) {
      throw new CoreError("NOT_FOUND", `Agent "${agentId}" not found`);
    }
    return this.hydrateAgent(row);
  }

  detectAgents(agentId?: string): AgentWithStatus[] {
    if (agentId) {
      return [this.getAgent(agentId)];
    }
    return this.listAgents();
  }

  configureAgent(input: {
    id: string;
    command?: string;
    args?: string[];
    envRefs?: Record<string, string>;
    automationPolicy?: "allowed" | "restricted" | "unknown";
    name?: string;
    vendor?: string;
    officialUrl?: string;
  }): AgentWithStatus {
    const existing = this.getAgent(input.id);
    const now = new Date().toISOString();

    this.storage.db
      .update(agentsTable)
      .set({
        name: input.name ?? existing.name,
        vendor: input.vendor ?? existing.vendor,
        officialUrl: input.officialUrl ?? existing.officialUrl,
        command: input.command ?? existing.command,
        argsJson: JSON.stringify(input.args ?? existing.args),
        envRefsJson: JSON.stringify(input.envRefs ?? existing.envRefs),
        automationPolicy: input.automationPolicy ?? existing.automationPolicy,
        updatedAt: now,
      })
      .where(eq(agentsTable.id, input.id))
      .run();

    void this.evictWarmClientsForAgent(input.id);
    return this.getAgent(input.id);
  }

  registerCustomAgent(input: {
    id: string;
    name: string;
    vendor: string;
    officialUrl: string;
    command: string;
    args: string[];
    description?: string;
    automationPolicy: "allowed" | "restricted" | "unknown";
  }): AgentWithStatus {
    const now = new Date().toISOString();
    this.storage.db
      .insert(agentsTable)
      .values({
        id: input.id,
        name: input.name,
        vendor: input.vendor,
        officialUrl: input.officialUrl,
        logoAssetId: null,
        source: "custom",
        registryId: null,
        command: input.command,
        argsJson: JSON.stringify(input.args),
        envRefsJson: JSON.stringify({}),
        pinnedVersion: null,
        installedVersion: null,
        verification: "unverified",
        automationPolicy: input.automationPolicy,
        automationNote: "User-registered custom ACP server.",
        description: input.description ?? null,
        installCommandHint: `${input.command} ${input.args.join(" ")}`.trim(),
        detectBinary: input.command,
        capabilitiesJson: null,
        lastTestedAt: null,
        lastError: null,
        isCustom: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: agentsTable.id,
        set: {
          name: input.name,
          vendor: input.vendor,
          officialUrl: input.officialUrl,
          command: input.command,
          argsJson: JSON.stringify(input.args),
          description: input.description ?? null,
          automationPolicy: input.automationPolicy,
          updatedAt: now,
        },
      })
      .run();

    void this.evictWarmClientsForAgent(input.id);
    return this.getAgent(input.id);
  }

  setAgentSecret(agentId: string, envKey: string, value: string): { ok: true } {
    this.getAgent(agentId);
    const storeKey = `${agentId}:${envKey}`;
    if (!value) {
      this.secretStore.delete(storeKey);
    } else {
      this.secretStore.set(storeKey, value);
    }
    void this.evictWarmClientsForAgent(agentId);
    return { ok: true };
  }

  private async acquireOrConnectClient(params: {
    agent: AgentDefinition;
    cwd: string;
    env: Record<string, string>;
    secrets: string[];
    callbacks: NonNullable<ConstructorParameters<typeof AcpAgentClient>[0]["callbacks"]>;
  }): Promise<{
    client: AcpAgentClient;
    init: acp.InitializeResponse;
    configSignature: string;
    reused: boolean;
  }> {
    const configSignature = computeAgentConfigSignature(params.agent, params.env);
    const poolKey = `${params.agent.id}::${params.cwd}`;
    const warm = this.warmPool.get(poolKey);

    if (warm) {
      clearTimeout(warm.idleTimer);
      this.warmPool.delete(poolKey);

      if (warm.configSignature === configSignature && warm.client.isConnected) {
        warm.client.setKnownSecrets(params.secrets);
        warm.client.setCallbacks(params.callbacks);
        return {
          client: warm.client,
          init: warm.initResult,
          configSignature,
          reused: true,
        };
      }
      await warm.client.close().catch(() => {});
    }

    const client = new AcpAgentClient({
      command: params.agent.command,
      args: params.agent.args,
      cwd: params.cwd,
      env: params.env,
      knownSecrets: params.secrets,
      callbacks: params.callbacks,
    });
    const init = await client.connect();
    return { client, init, configSignature, reused: false };
  }

  private async releaseWarmClient(params: {
    agentId: string;
    cwd: string;
    configSignature: string;
    client: AcpAgentClient;
    initResult: acp.InitializeResponse | null;
    onIdleSessionUpdate?: (notification: acp.SessionNotification) => void;
  }): Promise<void> {
    if (this.shuttingDown || !params.client.isConnected || !params.initResult) {
      await params.client.close().catch(() => {});
      return;
    }

    const poolKey = `${params.agentId}::${params.cwd}`;
    const existing = this.warmPool.get(poolKey);
    if (existing) {
      clearTimeout(existing.idleTimer);
      this.warmPool.delete(poolKey);
      if (existing.client !== params.client) {
        await existing.client.close().catch(() => {});
      }
    }

    // Evict least-recently-used warm client when pool reaches capacity
    while (this.warmPool.size >= MAX_WARM_CLIENTS) {
      let oldest: WarmClientEntry | null = null;
      for (const entry of this.warmPool.values()) {
        if (!oldest || entry.lastUsedAt < oldest.lastUsedAt) {
          oldest = entry;
        }
      }
      if (!oldest) break;
      clearTimeout(oldest.idleTimer);
      this.warmPool.delete(oldest.key);
      await oldest.client.close().catch(() => {});
    }

    params.client.setCallbacks({
      onSessionUpdate: params.onIdleSessionUpdate,
      onDisconnect: () => {
        const cur = this.warmPool.get(poolKey);
        if (cur && cur.client === params.client) {
          clearTimeout(cur.idleTimer);
          this.warmPool.delete(poolKey);
        }
      },
    });

    const idleTimer = setTimeout(() => {
      const cur = this.warmPool.get(poolKey);
      if (cur && cur.client === params.client) {
        this.warmPool.delete(poolKey);
        void cur.client.close().catch(() => {});
      }
    }, WARM_IDLE_TTL_MS);
    if (typeof idleTimer === "object" && "unref" in idleTimer) {
      idleTimer.unref();
    }

    this.warmPool.set(poolKey, {
      key: poolKey,
      agentId: params.agentId,
      cwd: params.cwd,
      configSignature: params.configSignature,
      client: params.client,
      initResult: params.initResult,
      lastUsedAt: Date.now(),
      idleTimer,
    });
  }

  private async evictWarmClientsForAgent(agentId: string): Promise<void> {
    const matches: WarmClientEntry[] = [];
    for (const [key, entry] of this.warmPool.entries()) {
      if (entry.agentId === agentId) {
        clearTimeout(entry.idleTimer);
        this.warmPool.delete(key);
        matches.push(entry);
      }
    }
    await Promise.allSettled(matches.map((e) => e.client.close()));
  }

  private resolveAgentEnv(
    agent: AgentDefinition,
    overrides?: Record<string, string>
  ): { env: Record<string, string>; secrets: string[] } {
    const env: Record<string, string> = {};
    const secrets: string[] = [];

    for (const envKey of Object.keys(agent.envRefs)) {
      const mem = this.secretStore.get(`${agent.id}:${envKey}`);
      if (mem) {
        env[envKey] = mem;
        if (/(KEY|TOKEN|SECRET|PASS|CREDENTIAL|AUTH)/i.test(envKey)) {
          secrets.push(mem);
        }
      }
    }

    if (overrides) {
      for (const [k, v] of Object.entries(overrides)) {
        env[k] = v;
        if (/(KEY|TOKEN|SECRET|PASS)/i.test(k)) {
          secrets.push(v);
        }
      }
    }
    return { env, secrets };
  }

  async testAgentConnection(params: {
    agentId: string;
    cwd?: string;
    envOverrides?: Record<string, string>;
  }): Promise<{
    ok: boolean;
    agent: AgentWithStatus;
    initializeResult?: acp.InitializeResponse;
    error?: string;
  }> {
    const agent = this.getAgent(params.agentId);
    const cwd = params.cwd ?? process.cwd();
    const { env, secrets } = this.resolveAgentEnv(agent, params.envOverrides);
    const now = new Date().toISOString();

    this.runtimeAgentStates.set(agent.id, {
      connectionState: "connecting",
      protocolVersion: null,
      capabilities: null,
      lastError: null,
    });

    const client = new AcpAgentClient({
      command: agent.command,
      args: agent.args,
      cwd,
      env,
      knownSecrets: secrets,
    });

    try {
      const init = await client.connect();
      const caps = (init.agentCapabilities ?? {}) as Record<string, unknown>;
      const version = init.agentInfo?.version ?? agent.installedVersion ?? null;

      this.storage.db
        .update(agentsTable)
        .set({
          verification: "verified",
          installedVersion: version,
          capabilitiesJson: JSON.stringify(caps),
          lastTestedAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(agentsTable.id, agent.id))
        .run();

      this.runtimeAgentStates.set(agent.id, {
        connectionState: "connected",
        protocolVersion: init.protocolVersion,
        capabilities: caps,
        lastError: null,
      });

      this.eventBus.emit({
        projectId: "global",
        type: "agent.connection",
        payload: {
          agentId: agent.id,
          state: "connected",
          protocolVersion: init.protocolVersion,
          agentInfo: init.agentInfo,
        },
      });

      return {
        ok: true,
        agent: this.getAgent(agent.id),
        initializeResult: init,
      };
    } catch (err) {
      const msg = redactSecrets(
        err instanceof Error ? err.message : String(err),
        secrets
      );

      this.storage.db
        .update(agentsTable)
        .set({
          lastTestedAt: now,
          lastError: msg,
          updatedAt: now,
        })
        .where(eq(agentsTable.id, agent.id))
        .run();

      this.runtimeAgentStates.set(agent.id, {
        connectionState: "error",
        protocolVersion: null,
        capabilities: null,
        lastError: msg,
      });

      this.eventBus.emit({
        projectId: "global",
        type: "agent.connection",
        payload: { agentId: agent.id, state: "error", error: msg },
      });

      return {
        ok: false,
        agent: this.getAgent(agent.id),
        error: msg,
      };
    } finally {
      await client.close();
    }
  }

  private hydrateAgent(row: typeof agentsTable.$inferSelect): AgentWithStatus {
    const def: AgentDefinition = {
      id: row.id,
      name: row.name,
      vendor: row.vendor,
      officialUrl: row.officialUrl,
      logoAssetId: row.logoAssetId,
      source: row.source as AgentDefinition["source"],
      registryId: row.registryId,
      transport: "stdio",
      command: row.command,
      args: JSON.parse(row.argsJson) as string[],
      envRefs: JSON.parse(row.envRefsJson) as Record<string, string>,
      pinnedVersion: row.pinnedVersion ?? undefined,
      installedVersion: row.installedVersion ?? undefined,
      verification: row.verification as AgentDefinition["verification"],
      automationPolicy: row.automationPolicy as AgentDefinition["automationPolicy"],
      automationNote: row.automationNote ?? undefined,
      description: row.description ?? undefined,
      installCommandHint: row.installCommandHint ?? undefined,
      detectBinary: row.detectBinary ?? undefined,
      custom: row.isCustom === 1,
    };

    const caps = row.capabilitiesJson
      ? (JSON.parse(row.capabilitiesJson) as Record<string, unknown>)
      : null;
    const live = this.runtimeAgentStates.get(row.id);
    const detected = detectAgentInstallation(def);

    const status = buildDefaultRuntimeStatus(def, {
      installState: detected.installState,
      resolvedExecutable: detected.resolvedExecutable,
      connectionState: live?.connectionState ?? "disconnected",
      lastTestedAt: row.lastTestedAt,
      lastError: live?.lastError ?? row.lastError,
      protocolVersion: live?.protocolVersion ?? null,
      capabilities: live?.capabilities ?? caps,
      authState:
        def.automationPolicy === "restricted"
          ? "restricted"
          : row.verification === "verified"
            ? "ready"
            : "unknown",
    });

    return {
      ...def,
      supportsLoadSession: Boolean(caps?.loadSession),
      status,
    };
  }

  // =========================================================================
  // Workflows
  // =========================================================================

  listWorkflows(projectId?: string): WorkflowRecord[] {
    const rows = this.storage.db
      .select()
      .from(workflowsTable)
      .orderBy(desc(workflowsTable.updatedAt))
      .all();

    const filtered = projectId
      ? rows.filter((r) => r.projectId === null || r.projectId === projectId)
      : rows;

    return filtered.map((r) => this.hydrateWorkflow(r));
  }

  getWorkflow(workflowId: string): WorkflowRecord {
    const row = this.storage.db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, workflowId))
      .get();
    if (!row) {
      throw new CoreError("NOT_FOUND", `Workflow "${workflowId}" not found`);
    }
    return this.hydrateWorkflow(row);
  }

  validateWorkflow(definition: unknown, requireNonEmpty = false) {
    const known = new Set(this.listAgents().map((a) => a.id));
    return validateWorkflowDefinition(definition, known, { requireNonEmpty });
  }

  saveWorkflow(input: {
    id?: string;
    projectId?: string | null;
    name: string;
    steps: WorkflowDefinition["steps"];
    edges?: WorkflowDefinition["edges"];
  }): WorkflowRecord {
    const id = input.id?.trim() || randomUUID();
    const known = new Set(this.listAgents().map((a) => a.id));
    const def: WorkflowDefinition = assertValidWorkflow(
      {
        schemaVersion: 1,
        id,
        name: input.name.trim(),
        steps: input.steps,
        ...(input.edges !== undefined ? { edges: input.edges } : {}),
      },
      known,
      { requireNonEmpty: false }
    );

    const now = new Date().toISOString();
    const existing = this.storage.db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, id))
      .get();

    const nextVersion = existing ? existing.currentVersion + 1 : 1;
    const versionId = randomUUID();

    this.storage.sqlite.transaction(() => {
      if (!existing) {
        this.storage.db
          .insert(workflowsTable)
          .values({
            id,
            projectId: input.projectId ?? null,
            name: def.name,
            currentVersion: nextVersion,
            latestVersionId: versionId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } else {
        this.storage.db
          .update(workflowsTable)
          .set({
            name: def.name,
            currentVersion: nextVersion,
            latestVersionId: versionId,
            updatedAt: now,
          })
          .where(eq(workflowsTable.id, id))
          .run();
      }

      this.storage.db
        .insert(workflowVersionsTable)
        .values({
          id: versionId,
          workflowId: id,
          version: nextVersion,
          definitionJson: JSON.stringify(def),
          createdAt: now,
        })
        .run();
    })();

    return this.getWorkflow(id);
  }

  deleteWorkflow(workflowId: string): { deleted: true } {
    this.getWorkflow(workflowId);
    this.storage.db
      .delete(workflowsTable)
      .where(eq(workflowsTable.id, workflowId))
      .run();
    return { deleted: true };
  }

  private hydrateWorkflow(
    row: typeof workflowsTable.$inferSelect
  ): WorkflowRecord {
    const ver = this.storage.db
      .select()
      .from(workflowVersionsTable)
      .where(eq(workflowVersionsTable.id, row.latestVersionId))
      .get();

    const definition: WorkflowDefinition = ver
      ? (JSON.parse(ver.definitionJson) as WorkflowDefinition)
      : { schemaVersion: 1, id: row.id, name: row.name, steps: [] };

    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      currentVersion: row.currentVersion,
      latestVersionId: row.latestVersionId,
      definition,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // =========================================================================
  // Conversations & Messages
  // =========================================================================

  listConversations(params?: {
    projectId?: string;
    includeArchived?: boolean;
    search?: string;
  }): Conversation[] {
    const conditions = [];
    if (params?.projectId) {
      conditions.push(eq(conversationsTable.projectId, params.projectId));
    }
    if (!params?.includeArchived) {
      conditions.push(isNull(conversationsTable.archivedAt));
    }

    const rows =
      conditions.length > 0
        ? this.storage.db
            .select()
            .from(conversationsTable)
            .where(and(...conditions))
            .orderBy(desc(conversationsTable.updatedAt))
            .all()
        : this.storage.db
            .select()
            .from(conversationsTable)
            .orderBy(desc(conversationsTable.updatedAt))
            .all();

    let list = rows.map((r) => this.hydrateConversation(r));
    if (params?.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q));
    }
    return list;
  }

  createConversation(input: {
    projectId: string;
    title?: string;
    mode: "single" | "workflow";
    agentId?: string;
    workflowId?: string;
  }): Conversation {
    this.getProject(input.projectId);
    if (input.agentId) this.getAgent(input.agentId);
    if (input.workflowId) this.getWorkflow(input.workflowId);

    const id = randomUUID();
    const now = new Date().toISOString();
    const title = input.title?.trim() || "New conversation";

    this.storage.db
      .insert(conversationsTable)
      .values({
        id,
        projectId: input.projectId,
        title,
        mode: input.mode,
        agentId: input.agentId ?? null,
        workflowId: input.workflowId ?? null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      })
      .run();

    return this.getConversationSummary(id);
  }

  getConversationSummary(conversationId: string): Conversation {
    const row = this.storage.db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .get();
    if (!row) {
      throw new CoreError(
        "NOT_FOUND",
        `Conversation "${conversationId}" not found`
      );
    }
    return this.hydrateConversation(row);
  }

  getConversationDetail(conversationId: string): {
    conversation: Conversation;
    messages: Message[];
    sessions: AgentSession[];
    runs: WorkflowRun[];
    pendingPermissions: PermissionRequest[];
    activeTurn: ActiveChatTurn | null;
  } {
    const conversation = this.getConversationSummary(conversationId);
    const messages = this.listMessages(conversationId);
    const sessionRows = this.storage.db
      .select()
      .from(agentSessionsTable)
      .where(eq(agentSessionsTable.conversationId, conversationId))
      .orderBy(asc(agentSessionsTable.createdAt))
      .all();

    const sessions: AgentSession[] = sessionRows.map((s) => ({
      id: s.id,
      conversationId: s.conversationId,
      nodeRunId: s.nodeRunId,
      agentId: s.agentId,
      providerSessionId: s.providerSessionId,
      cwd: s.cwd,
      runtimeVersion: s.runtimeVersion,
      canLoadSession: s.canLoadSession === 1,
      state: s.state as AgentSession["state"],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    const runs = this.listRuns({ conversationId });
    const pendingPermissions = this.permissions.listPending({ conversationId });
    const activeTurn = conversation.activeTurn ?? null;

    return {
      conversation,
      messages,
      sessions,
      runs,
      pendingPermissions,
      activeTurn,
    };
  }

  renameConversation(
    conversationId: string,
    title: string,
    options?: { source?: "user" | "acp" | "auto"; agentId?: string }
  ): Conversation {
    const existing = this.getConversationSummary(conversationId);
    const cleanTitle = title.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!cleanTitle) {
      return existing;
    }
    const source = options?.source ?? "user";
    if (source === "user") {
      this.manuallyRenamedConversations.add(conversationId);
    }
    if (existing.title === cleanTitle) {
      return existing;
    }
    const now = new Date().toISOString();
    this.storage.db
      .update(conversationsTable)
      .set({ title: cleanTitle, updatedAt: now })
      .where(eq(conversationsTable.id, conversationId))
      .run();
    this.eventBus.emit({
      projectId: existing.projectId,
      conversationId,
      type: "conversation.updated",
      payload: {
        title: cleanTitle,
        source,
        ...(options?.agentId ? { agentId: options.agentId } : {}),
      },
    });
    return this.getConversationSummary(conversationId);
  }

  private applyAcpSessionTitle(params: {
    conversationId: string;
    agentId: string;
    rawTitle: string | null | undefined;
    secrets: string[];
    allowUpdate: boolean;
  }): void {
    if (!params.allowUpdate || !params.rawTitle) return;
    if (this.manuallyRenamedConversations.has(params.conversationId)) return;
    const clean = redactSecrets(params.rawTitle, params.secrets)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (
      !clean ||
      /^(new\s*(chat|conversation|session)|untitled|新对话|新建对话)$/i.test(
        clean
      ) ||
      /#\s*User Objective/i.test(clean) ||
      /You are step \d+/i.test(clean) ||
      /CodeTeams workflow/i.test(clean) ||
      /#\s*Project Rules/i.test(clean) ||
      /#\s*Upstream/i.test(clean)
    ) {
      return;
    }
    try {
      this.renameConversation(params.conversationId, clean, {
        source: "acp",
        agentId: params.agentId,
      });
    } catch {
      // Ignore if conversation was concurrently deleted
    }
  }

  archiveConversation(conversationId: string, archived: boolean): Conversation {
    this.getConversationSummary(conversationId);
    const now = new Date().toISOString();
    this.storage.db
      .update(conversationsTable)
      .set({ archivedAt: archived ? now : null, updatedAt: now })
      .where(eq(conversationsTable.id, conversationId))
      .run();
    return this.getConversationSummary(conversationId);
  }

  async deleteConversation(conversationId: string): Promise<{ deleted: true }> {
    await this.cancelConversation(conversationId);
    this.storage.db
      .delete(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .run();
    return { deleted: true };
  }

  private hydrateConversation(
    row: typeof conversationsTable.$inferSelect
  ): Conversation {
    const latestRun = this.storage.db
      .select({ id: workflowRunsTable.id, state: workflowRunsTable.state })
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.conversationId, row.id))
      .orderBy(desc(workflowRunsTable.createdAt))
      .limit(1)
      .get();

    const active = this.activeChatTurns.get(row.id);
    const activeTurn: ActiveChatTurn | null = active
      ? {
          agentId: active.agentId,
          state: active.state,
          startedAt: active.startedAt,
        }
      : null;

    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      mode: row.mode as Conversation["mode"],
      agentId: row.agentId,
      workflowId: row.workflowId,
      latestRunId: latestRun?.id ?? null,
      latestRunState: latestRun?.state ?? null,
      activeTurn,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
    };
  }

  listMessages(conversationId: string): Message[] {
    const rows = this.storage.db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.seq))
      .all();

    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      sessionId: r.sessionId,
      nodeRunId: r.nodeRunId,
      agentId: r.agentId,
      role: r.role as Message["role"],
      seq: r.seq,
      kind: r.kind as Message["kind"],
      content: r.content,
      metadata: r.metadataJson ? JSON.parse(r.metadataJson) : null,
      replayed: r.replayed === 1,
      createdAt: r.createdAt,
    }));
  }

  private appendMessage(input: {
    conversationId: string;
    sessionId?: string | null;
    nodeRunId?: string | null;
    agentId?: string | null;
    role: Message["role"];
    kind: Message["kind"];
    content: string;
    metadata?: Record<string, unknown> | null;
    replayed?: boolean;
    dedupeKey?: string | null;
  }): Message {
    if (input.dedupeKey) {
      const existing = this.storage.db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.conversationId, input.conversationId),
            eq(messagesTable.dedupeKey, input.dedupeKey)
          )
        )
        .get();
      if (existing) {
        return {
          id: existing.id,
          conversationId: existing.conversationId,
          sessionId: existing.sessionId,
          nodeRunId: existing.nodeRunId,
          agentId: existing.agentId,
          role: existing.role as Message["role"],
          seq: existing.seq,
          kind: existing.kind as Message["kind"],
          content: existing.content,
          metadata: existing.metadataJson
            ? JSON.parse(existing.metadataJson)
            : null,
          replayed: existing.replayed === 1,
          createdAt: existing.createdAt,
        };
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const seq = this.storage.sqlite.transaction(() => {
      const row = this.storage.sqlite
        .query<{ maxSeq: number | null }, [string]>(
          "SELECT MAX(seq) AS maxSeq FROM messages WHERE conversation_id = ?"
        )
        .get(input.conversationId);
      const nextSeq = (row?.maxSeq ?? 0) + 1;

      this.storage.db
        .insert(messagesTable)
        .values({
          id,
          conversationId: input.conversationId,
          sessionId: input.sessionId ?? null,
          nodeRunId: input.nodeRunId ?? null,
          agentId: input.agentId ?? null,
          role: input.role,
          seq: nextSeq,
          kind: input.kind,
          content: input.content,
          metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
          replayed: input.replayed ? 1 : 0,
          dedupeKey: input.dedupeKey ?? null,
          createdAt: now,
        })
        .run();

      this.storage.db
        .update(conversationsTable)
        .set({ updatedAt: now })
        .where(eq(conversationsTable.id, input.conversationId))
        .run();

      return nextSeq;
    })();

    return {
      id,
      conversationId: input.conversationId,
      sessionId: input.sessionId ?? null,
      nodeRunId: input.nodeRunId ?? null,
      agentId: input.agentId ?? null,
      role: input.role,
      seq,
      kind: input.kind,
      content: input.content,
      metadata: input.metadata ?? null,
      replayed: Boolean(input.replayed),
      createdAt: now,
    };
  }

  private setChatTurnState(
    ctrl: ActiveChatTurnControl,
    state: ChatTurnState,
    extra?: { errorCode?: string; errorMessage?: string; stopReason?: string }
  ): void {
    if (state === "running" || state === "waiting_permission") {
      ctrl.state = state;
    }
    this.eventBus.emit({
      projectId: ctrl.projectId,
      conversationId: ctrl.conversationId,
      type: "chat.state",
      payload: {
        agentId: ctrl.agentId,
        state,
        startedAt: ctrl.startedAt,
        ...(extra ?? {}),
      },
    });
  }

  /**
   * Waits for an active background single-agent chat turn to settle.
   */
  async waitForChatTurn(conversationId: string): Promise<void> {
    const active = this.activeChatTurns.get(conversationId);
    if (active) {
      await active.promise;
    }
  }

  /**
   * Sends a user message in a conversation:
   * - In `single` mode: streams a real ACP turn with the selected agent (reusing native session when possible).
   *   When `async: true`, returns immediately (`accepted: true`) while execution runs in the background and
   *   streams progress & lifecycle via Core events (`chat.state`, `message.delta`, `permission.requested`, etc.).
   * - In `workflow` mode: launches a serial workflow run for this conversation.
   */
  async sendMessage(params: {
    conversationId: string;
    content: string;
    idempotencyKey?: string;
    mode?: "single" | "workflow";
    agentId?: string;
    workflowId?: string;
    permissionMode?: "ask" | "full_access";
    allowRestrictedAutomation?: boolean;
    async?: boolean;
  }): Promise<{
    accepted?: boolean;
    turnState?: ChatTurnState;
    userMessage: Message;
    assistantMessage?: Message;
    run?: WorkflowRun;
    stopReason?: string;
  }> {
    if (this.shuttingDown) {
      throw new CoreError("CANCELLED", "CodeTeams Core is shutting down.");
    }

    if (params.idempotencyKey) {
      const prev = this.storage.db
        .select()
        .from(idempotencyKeysTable)
        .where(eq(idempotencyKeysTable.key, params.idempotencyKey))
        .get();
      if (prev) {
        return JSON.parse(prev.resultJson);
      }
    }

    const conv = this.getConversationSummary(params.conversationId);
    const project = this.getProject(conv.projectId);

    if (this.busyConversations.has(conv.id)) {
      throw new CoreError(
        "WORKSPACE_BUSY",
        "Another request is currently active in this conversation. Wait for it to finish or cancel first."
      );
    }

    // Auto-title first user message (remains eligible for ACP session_info_update override)
    const existingMessages = this.listMessages(conv.id);
    if (existingMessages.length === 0 && conv.title === "New conversation") {
      const cleanTitle = params.content.trim().replace(/\s+/g, " ").slice(0, 60);
      if (cleanTitle) {
        this.renameConversation(conv.id, cleanTitle, { source: "auto" });
      }
    }

    // Lock each conversation to the mode and target (Single Coding Agent or Team) chosen at creation.
    const isWorkflowMode = conv.mode === "workflow";
    const targetWorkflowId = conv.workflowId ?? params.workflowId;

    if (isWorkflowMode) {
      if (!targetWorkflowId) {
        throw new CoreError(
          "VALIDATION_ERROR",
          "No workflow selected for this conversation."
        );
      }
      if (!conv.workflowId) {
        this.storage.db
          .update(conversationsTable)
          .set({
            workflowId: targetWorkflowId,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(conversationsTable.id, conv.id))
          .run();
      }
      const run = await this.startRun({
        projectId: project.id,
        conversationId: conv.id,
        workflowId: targetWorkflowId,
        objective: params.content,
        idempotencyKey: params.idempotencyKey,
        permissionMode: params.permissionMode,
        allowRestrictedAutomation: params.allowRestrictedAutomation,
      });
      const latestUserMsg = this.listMessages(conv.id)
        .filter((m) => m.role === "user")
        .at(-1)!;
      return { accepted: true, userMessage: latestUserMsg, run };
    }

    // Single-agent interactive chat (locked to the conversation's assigned Coding Agent)
    const targetAgentId = conv.agentId ?? params.agentId;
    if (!targetAgentId) {
      throw new CoreError(
        "VALIDATION_ERROR",
        "No Coding Agent selected for this conversation."
      );
    }
    if (!conv.agentId) {
      this.storage.db
        .update(conversationsTable)
        .set({
          agentId: targetAgentId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(conversationsTable.id, conv.id))
        .run();
    }
    const agent = this.getAgent(targetAgentId);

    this.busyConversations.add(conv.id);
    const lockOwner = `chat:${conv.id}`;
    try {
      this.workspace.acquireLock(project.id, lockOwner);
    } catch (err) {
      this.busyConversations.delete(conv.id);
      throw err;
    }

    let userMessage: Message;
    try {
      userMessage = this.appendMessage({
        conversationId: conv.id,
        role: "user",
        kind: "text",
        content: params.content,
      });

      this.eventBus.emit({
        projectId: project.id,
        conversationId: conv.id,
        type: "message.completed",
        payload: userMessage,
      });

      this.conversationPermissionModes.set(
        conv.id,
        params.permissionMode ?? "ask"
      );
    } catch (err) {
      this.busyConversations.delete(conv.id);
      this.workspace.releaseLock(project.id, lockOwner);
      throw err;
    }

    const turnControl: ActiveChatTurnControl = {
      conversationId: conv.id,
      projectId: project.id,
      agentId: agent.id,
      state: "running",
      startedAt: new Date().toISOString(),
      cancelled: false,
      promise: Promise.resolve(),
    };
    this.activeChatTurns.set(conv.id, turnControl);
    this.setChatTurnState(turnControl, "running");

    // Asynchronous background execution mode: immediately returns "accepted" so the
    // desktop RPC bridge never times out while an agent thinks or waits for permission approval.
    if (params.async) {
      const { secrets } = this.resolveAgentEnv(agent);
      const acceptedResponse = {
        accepted: true as const,
        turnState: "running" as const,
        userMessage,
      };

      if (params.idempotencyKey) {
        this.storage.db
          .insert(idempotencyKeysTable)
          .values({
            key: params.idempotencyKey,
            scope: "conversations.send",
            resultJson: JSON.stringify(acceptedResponse),
            createdAt: new Date().toISOString(),
          })
          .onConflictDoNothing()
          .run();
      }

      turnControl.promise = (async () => {
        try {
          const turnResult = await this.executeSingleAgentTurn({
            project,
            conversationId: conv.id,
            agent,
            promptText: params.content,
            permissionMode: params.permissionMode ?? "ask",
            turnControl,
          });
          if (turnControl.cancelled || turnResult.stopReason === "cancelled") {
            this.setChatTurnState(turnControl, "cancelled", {
              stopReason: turnResult.stopReason,
            });
          } else {
            this.setChatTurnState(turnControl, "completed", {
              stopReason: turnResult.stopReason,
            });
          }
        } catch (err) {
          if (turnControl.cancelled || this.shuttingDown) {
            this.setChatTurnState(turnControl, "cancelled");
            return;
          }
          const rawMsg = err instanceof Error ? err.message : String(err);
          const safeMsg = redactSecrets(rawMsg, secrets);
          const errorCode = err instanceof CoreError ? err.code : "INTERNAL_ERROR";

          const errMsg = this.appendMessage({
            conversationId: conv.id,
            agentId: agent.id,
            role: "system",
            kind: "error",
            content: safeMsg,
            metadata: { errorCode },
          });
          this.eventBus.emit({
            projectId: project.id,
            conversationId: conv.id,
            type: "message.completed",
            payload: errMsg,
          });
          this.setChatTurnState(turnControl, "failed", {
            errorCode,
            errorMessage: safeMsg,
          });
        } finally {
          if (this.activeChatTurns.get(conv.id) === turnControl) {
            this.activeChatTurns.delete(conv.id);
          }
          this.busyConversations.delete(conv.id);
          this.workspace.releaseLock(project.id, lockOwner);
        }
      })();

      return acceptedResponse;
    }

    // Synchronous execution mode (default for direct runtime callers / tests)
    try {
      const turnResult = await this.executeSingleAgentTurn({
        project,
        conversationId: conv.id,
        agent,
        promptText: params.content,
        permissionMode: params.permissionMode ?? "ask",
        turnControl,
      });

      if (turnControl.cancelled || turnResult.stopReason === "cancelled") {
        this.setChatTurnState(turnControl, "cancelled", {
          stopReason: turnResult.stopReason,
        });
      } else {
        this.setChatTurnState(turnControl, "completed", {
          stopReason: turnResult.stopReason,
        });
      }

      const response = {
        userMessage,
        assistantMessage: turnResult.assistantMessage,
        stopReason: turnResult.stopReason,
      };

      if (params.idempotencyKey) {
        this.storage.db
          .insert(idempotencyKeysTable)
          .values({
            key: params.idempotencyKey,
            scope: "conversations.send",
            resultJson: JSON.stringify(response),
            createdAt: new Date().toISOString(),
          })
          .onConflictDoNothing()
          .run();
      }

      return response;
    } catch (err) {
      if (turnControl.cancelled || this.shuttingDown) {
        this.setChatTurnState(turnControl, "cancelled");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        this.setChatTurnState(turnControl, "failed", {
          errorCode: err instanceof CoreError ? err.code : "INTERNAL_ERROR",
          errorMessage: msg,
        });
      }
      throw err;
    } finally {
      if (this.activeChatTurns.get(conv.id) === turnControl) {
        this.activeChatTurns.delete(conv.id);
      }
      this.busyConversations.delete(conv.id);
      this.workspace.releaseLock(project.id, lockOwner);
    }
  }

  private collectPriorConversationToolCallIds(conversationId: string): Set<string> {
    const ids = new Set<string>();
    for (const msg of this.listMessages(conversationId)) {
      const segs = (msg.metadata as { segments?: TurnSegment[] } | null)?.segments;
      if (Array.isArray(segs)) {
        for (const s of segs) {
          if (s.type === "tool" && s.toolCallId) {
            ids.add(s.toolCallId);
          }
        }
      }
    }
    const priorEvents = this.eventBus.snapshotAfterCursor({
      afterSeq: 0,
      conversationId,
      limit: 1000,
    });
    for (const ev of priorEvents) {
      if (
        ev.type === "tool.started" ||
        ev.type === "tool.updated" ||
        ev.type === "tool.completed"
      ) {
        const tcId = (ev.payload as { toolCallId?: string } | null)?.toolCallId;
        if (tcId) ids.add(tcId);
      }
    }
    return ids;
  }

  private async executeSingleAgentTurn(params: {
    project: Project;
    conversationId: string;
    agent: AgentWithStatus;
    promptText: string;
    permissionMode?: "ask" | "full_access";
    turnControl?: ActiveChatTurnControl;
  }): Promise<{ assistantMessage: Message; stopReason: string }> {
    const { env, secrets } = this.resolveAgentEnv(params.agent);
    const configSignature = computeAgentConfigSignature(params.agent, env);
    let live = this.liveChatClients.get(params.conversationId);

    // If agent/cwd/config changed or connection closed, return healthy old client to warm pool
    if (
      live &&
      (live.agentId !== params.agent.id ||
        !live.client.isConnected ||
        live.cwd !== params.project.canonicalPath ||
        live.configSignature !== configSignature)
    ) {
      const displaced = live;
      this.liveChatClients.delete(params.conversationId);
      live = undefined;
      if (displaced.client.isConnected) {
        await this.releaseWarmClient({
          agentId: displaced.agentId,
          cwd: displaced.cwd,
          configSignature: displaced.configSignature,
          client: displaced.client,
          initResult: displaced.client.initializeResult,
        });
      } else {
        await displaced.client.close();
      }
    }

    const segments: TurnSegment[] = [];
    let replayingHistory = false;
    let activeSessionLocalId = live?.sessionId ?? "";
    let turnFinished = false;

    // Collect toolCallIds already recorded in earlier turns of this conversation so that
    // neither `session/load` history replay nor ACP adapters that re-emit prior session tool calls
    // can duplicate previous turns' tool cards into the new turn.
    const priorToolCallIds = this.collectPriorConversationToolCallIds(
      params.conversationId
    );

    const turnCallbacks: NonNullable<
      ConstructorParameters<typeof AcpAgentClient>[0]["callbacks"]
    > = {
      onSessionUpdate: (notification) => {
        const update = notification.update;
        if (replayingHistory) {
          if (
            (update.sessionUpdate === "tool_call" ||
              update.sessionUpdate === "tool_call_update") &&
            update.toolCallId
          ) {
            priorToolCallIds.add(update.toolCallId);
          }
          return; // Never leak replayed history chunks, tools, or plans into the live turn
        }
        // Always accept session_info_update even after prompt() resolves (e.g. Codex sends
        // its AI-generated summary title asynchronously 1-2s after end_turn!).
        if (update.sessionUpdate === "session_info_update") {
          this.applyAcpSessionTitle({
            conversationId: params.conversationId,
            agentId: params.agent.id,
            rawTitle: update.title,
            secrets,
            allowUpdate: true,
          });
          return;
        }
        if (turnFinished) {
          return;
        }
        if (update.sessionUpdate === "agent_message_chunk") {
          if (update.content.type === "text") {
            const delta = redactSecrets(update.content.text, secrets);
            appendTextSegment(segments, delta);
            this.eventBus.emit({
              projectId: params.project.id,
              conversationId: params.conversationId,
              sessionId: activeSessionLocalId,
              type: "message.delta",
              payload: {
                agentId: params.agent.id,
                text: delta,
              },
            });
          }
        } else if (update.sessionUpdate === "agent_thought_chunk") {
          if (update.content.type === "text") {
            const delta = redactSecrets(update.content.text, secrets);
            appendThoughtSegment(segments, delta);
            this.eventBus.emit({
              projectId: params.project.id,
              conversationId: params.conversationId,
              sessionId: activeSessionLocalId,
              type: "thought.delta",
              payload: {
                agentId: params.agent.id,
                text: delta,
              },
            });
          }
        } else if (update.sessionUpdate === "tool_call") {
          if (update.toolCallId && priorToolCallIds.has(update.toolCallId)) {
            return;
          }
          const locations = (update.locations ?? []).map((loc) => ({
            path: loc.path,
            line: loc.line ?? null,
          }));
          const rawInputPreview = summarizeAcpValue(update.rawInput, secrets);
          const diffs = extractToolDiffs(
            update.content,
            update.rawInput,
            locations,
            update.kind ?? null,
            secrets
          );
          upsertToolSegment(segments, {
            toolCallId: update.toolCallId,
            agentId: params.agent.id,
            title: update.title,
            kind: update.kind ?? null,
            status: update.status ?? "in_progress",
            locations,
            rawInputPreview,
            diffs,
          });
          this.eventBus.emit({
            projectId: params.project.id,
            conversationId: params.conversationId,
            sessionId: activeSessionLocalId,
            type: "tool.started",
            payload: {
              agentId: params.agent.id,
              toolCallId: update.toolCallId,
              title: update.title,
              kind: update.kind ?? null,
              status: update.status ?? "in_progress",
              locations,
              rawInputPreview,
              ...(diffs.length > 0 ? { diffs } : {}),
            },
          });
        } else if (update.sessionUpdate === "tool_call_update") {
          if (update.toolCallId && priorToolCallIds.has(update.toolCallId)) {
            return;
          }
          const locations = update.locations
            ? update.locations.map((loc) => ({
                path: loc.path,
                line: loc.line ?? null,
              }))
            : undefined;
          const rawInputPreview = summarizeAcpValue(update.rawInput, secrets);
          const rawOutputPreview = summarizeAcpValue(update.rawOutput, secrets);
          const contentPreview = extractToolContentPreview(
            update.content,
            secrets
          );
          const diffs = extractToolDiffs(
            update.content,
            update.rawInput,
            locations,
            update.kind ?? null,
            secrets
          );
          upsertToolSegment(segments, {
            toolCallId: update.toolCallId,
            agentId: params.agent.id,
            title: update.title ?? null,
            kind: update.kind ?? null,
            status: update.status ?? null,
            locations,
            rawInputPreview,
            rawOutputPreview,
            contentPreview,
            diffs,
          });
          this.eventBus.emit({
            projectId: params.project.id,
            conversationId: params.conversationId,
            sessionId: activeSessionLocalId,
            type:
              update.status === "completed" || update.status === "failed"
                ? "tool.completed"
                : "tool.updated",
            payload: {
              agentId: params.agent.id,
              toolCallId: update.toolCallId,
              title: update.title ?? null,
              kind: update.kind ?? null,
              status: update.status ?? null,
              locations,
              rawInputPreview,
              rawOutputPreview,
              contentPreview,
              ...(diffs.length > 0 ? { diffs } : {}),
            },
          });
        } else if (update.sessionUpdate === "plan") {
          upsertPlanSegment(segments, params.agent.id, update.entries);
          this.eventBus.emit({
            projectId: params.project.id,
            conversationId: params.conversationId,
            sessionId: activeSessionLocalId,
            type: "plan.updated",
            payload: {
              agentId: params.agent.id,
              entries: update.entries,
            },
          });
        }
      },
      onPermissionRequest: async (acpRequest) => {
        const currentPermMode =
          this.conversationPermissionModes.get(params.conversationId) ??
          params.permissionMode ??
          "ask";
        const autoApprove = currentPermMode === "full_access";
        if (autoApprove && acpRequest.toolCall?.toolCallId) {
          upsertToolSegment(segments, {
            toolCallId: acpRequest.toolCall.toolCallId,
            agentId: params.agent.id,
            title: acpRequest.toolCall.title ?? null,
            kind: acpRequest.toolCall.kind ?? null,
            autoApproved: true,
          });
        }
        return await this.permissions.requestPermission({
          projectId: params.project.id,
          conversationId: params.conversationId,
          sessionId: activeSessionLocalId || "pending",
          agentId: params.agent.id,
          acpRequest,
          autoApprove,
          onWaiting: () => {
            if (params.turnControl && !params.turnControl.cancelled) {
              this.setChatTurnState(params.turnControl, "waiting_permission");
            }
          },
          onResumed: () => {
            if (params.turnControl && !params.turnControl.cancelled) {
              this.setChatTurnState(params.turnControl, "running");
            }
          },
        });
      },
      onDisconnect: ({ exitCode, reason }) => {
        this.eventBus.emit({
          projectId: params.project.id,
          conversationId: params.conversationId,
          sessionId: activeSessionLocalId || undefined,
          type: "agent.connection",
          payload: {
            agentId: params.agent.id,
            state: "disconnected",
            exitCode,
            reason,
          },
        });
      },
    };

    if (!live) {
      const acquired = await this.acquireOrConnectClient({
        agent: params.agent,
        cwd: params.project.canonicalPath,
        env,
        secrets,
        callbacks: turnCallbacks,
      });
      const client = acquired.client;
      const init = acquired.init;
      const now = new Date().toISOString();

      // Update verified metadata in DB
      this.storage.db
        .update(agentsTable)
        .set({
          verification: "verified",
          installedVersion: init.agentInfo?.version ?? params.agent.installedVersion ?? null,
          capabilitiesJson: JSON.stringify(init.agentCapabilities ?? {}),
          lastTestedAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(agentsTable.id, params.agent.id))
        .run();

      // Check if we can natively resume a previous session for this same conversation + agent + cwd
      const priorSession = this.storage.db
        .select()
        .from(agentSessionsTable)
        .where(
          and(
            eq(agentSessionsTable.conversationId, params.conversationId),
            eq(agentSessionsTable.agentId, params.agent.id),
            eq(agentSessionsTable.cwd, params.project.canonicalPath)
          )
        )
        .orderBy(desc(agentSessionsTable.updatedAt))
        .limit(1)
        .get();

      let providerSessionId: string;
      let localSessionId: string;
      let contextRebuilt = false;

      if (
        priorSession?.providerSessionId &&
        client.supportsLoadSession
      ) {
        try {
          replayingHistory = true;
          activeSessionLocalId = priorSession.id;
          await client.loadSession(
            priorSession.providerSessionId,
            params.project.canonicalPath
          );
          await client.flushUpdates();
          replayingHistory = false;
          providerSessionId = priorSession.providerSessionId;
          localSessionId = priorSession.id;
          this.storage.db
            .update(agentSessionsTable)
            .set({ state: "active", updatedAt: now })
            .where(eq(agentSessionsTable.id, localSessionId))
            .run();
        } catch {
          replayingHistory = false;
          const created = await client.newSession(params.project.canonicalPath);
          providerSessionId = created.sessionId;
          await applyAcpPermissionModeIfAdvertised(
            client,
            providerSessionId,
            created,
            params.permissionMode ?? "ask"
          );
          localSessionId = randomUUID();
          contextRebuilt = true;
          this.storage.db
            .insert(agentSessionsTable)
            .values({
              id: localSessionId,
              conversationId: params.conversationId,
              nodeRunId: null,
              agentId: params.agent.id,
              providerSessionId,
              cwd: params.project.canonicalPath,
              runtimeVersion: init.agentInfo?.version ?? null,
              canLoadSession: client.supportsLoadSession ? 1 : 0,
              state: "active",
              createdAt: now,
              updatedAt: now,
            })
            .run();
        }
      } else {
        const created = await client.newSession(params.project.canonicalPath);
        providerSessionId = created.sessionId;
        await applyAcpPermissionModeIfAdvertised(
          client,
          providerSessionId,
          created,
          params.permissionMode ?? "ask"
        );
        localSessionId = randomUUID();
        if (priorSession) contextRebuilt = true;
        this.storage.db
          .insert(agentSessionsTable)
          .values({
            id: localSessionId,
            conversationId: params.conversationId,
            nodeRunId: null,
            agentId: params.agent.id,
            providerSessionId,
            cwd: params.project.canonicalPath,
            runtimeVersion: init.agentInfo?.version ?? null,
            canLoadSession: client.supportsLoadSession ? 1 : 0,
            state: "active",
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      activeSessionLocalId = localSessionId;
      live = {
        client,
        agentId: params.agent.id,
        sessionId: localSessionId,
        providerSessionId,
        cwd: params.project.canonicalPath,
        conversationId: params.conversationId,
        configSignature: acquired.configSignature,
      };
      this.liveChatClients.set(params.conversationId, live);

      if (contextRebuilt) {
        const ws = this.workspace.getStatus(
          params.project.id,
          params.project.canonicalPath
        );
        const recent = this.listMessages(params.conversationId).slice(-8);
        params.promptText = this.contextEngine.buildReconstructedRecoveryPrompt({
          objective: params.promptText,
          recentMessages: recent,
          workspaceStatus: ws,
          knownSecrets: secrets,
        });
      }
    } else {
      // Re-bind fresh per-turn callbacks onto the live client (zero double-appending!)
      live.client.setKnownSecrets(secrets);
      live.client.setCallbacks(turnCallbacks);
    }

    if (params.turnControl?.cancelled) {
      throw new CoreError("CANCELLED", "Conversation turn cancelled.");
    }

    let promptRes: acp.PromptResponse;
    try {
      promptRes = await live.client.prompt(live.providerSessionId, [
        { type: "text", text: params.promptText },
      ]);
    } catch (err) {
      // Preserve any thoughts, tool calls, or partial text streamed before interruption/cancellation
      if (segments.length > 0) {
        finalizeOpenThought(segments);
        for (const seg of segments) {
          if (
            seg.type === "tool" &&
            seg.status !== "completed" &&
            seg.status !== "failed"
          ) {
            seg.status = "interrupted";
          }
        }
        const partialText = joinTextSegments(segments);
        const partialMsg = this.appendMessage({
          conversationId: params.conversationId,
          sessionId: live.sessionId,
          agentId: params.agent.id,
          role: "assistant",
          kind: "text",
          content: partialText || "",
          metadata: {
            partial: true,
            interrupted: true,
            segments,
          },
        });
        this.eventBus.emit({
          projectId: params.project.id,
          conversationId: params.conversationId,
          sessionId: live.sessionId,
          type: "message.completed",
          payload: partialMsg,
        });
      }
      throw err;
    } finally {
      turnFinished = true;
    }
    finalizeOpenThought(segments);

    const isCancelled =
      Boolean(params.turnControl?.cancelled) ||
      promptRes.stopReason === "cancelled";

    if (isCancelled) {
      for (const seg of segments) {
        if (
          seg.type === "tool" &&
          seg.status !== "completed" &&
          seg.status !== "failed"
        ) {
          seg.status = "interrupted";
        }
      }
    }

    const joinedText = joinTextSegments(segments);
    const finalText =
      joinedText ||
      (isCancelled
        ? "已停止本次生成。"
        : promptRes.stopReason === "end_turn"
          ? "(Agent completed turn without text output.)"
          : `(Turn ended with stopReason: ${promptRes.stopReason})`);

    const assistantMessage = this.appendMessage({
      conversationId: params.conversationId,
      sessionId: live.sessionId,
      agentId: params.agent.id,
      role: "assistant",
      kind:
        promptRes.stopReason === "end_turn" || isCancelled ? "text" : "error",
      content: finalText,
      metadata: {
        stopReason: promptRes.stopReason,
        ...(segments.length > 0 ? { segments } : {}),
      },
    });

    this.eventBus.emit({
      projectId: params.project.id,
      conversationId: params.conversationId,
      sessionId: live.sessionId,
      type: "message.completed",
      payload: assistantMessage,
    });

    return { assistantMessage, stopReason: promptRes.stopReason };
  }

  async cancelConversation(conversationId: string): Promise<{ cancelled: true }> {
    const activeTurn = this.activeChatTurns.get(conversationId);
    if (activeTurn) {
      activeTurn.cancelled = true;
    }

    this.permissions.cancelAllForScope({ conversationId });

    // Cancel any active workflow run attached to this conversation
    for (const [runId] of this.activeRuns.entries()) {
      const run = this.storage.db
        .select({ conversationId: workflowRunsTable.conversationId })
        .from(workflowRunsTable)
        .where(eq(workflowRunsTable.id, runId))
        .get();
      if (run?.conversationId === conversationId) {
        await this.cancelRun(runId);
      }
    }

    const live = this.liveChatClients.get(conversationId);
    if (live) {
      await live.client.cancel(live.providerSessionId);
      await live.client.close();
      this.liveChatClients.delete(conversationId);
    }

    if (activeTurn) {
      await Promise.race([
        activeTurn.promise.catch(() => {}),
        new Promise<void>((r) => setTimeout(r, 2000)),
      ]);
    }

    return { cancelled: true };
  }

  // =========================================================================
  // Serial Workflow Runs, Checkpoints & Recovery
  // =========================================================================

  async startRun(params: {
    projectId: string;
    conversationId?: string;
    workflowId: string;
    objective: string;
    idempotencyKey?: string;
    permissionMode?: "ask" | "full_access";
    allowRestrictedAutomation?: boolean;
  }): Promise<WorkflowRun> {
    if (this.shuttingDown) {
      throw new CoreError("CANCELLED", "CodeTeams Core is shutting down.");
    }

    if (params.idempotencyKey) {
      const prev = this.storage.db
        .select()
        .from(idempotencyKeysTable)
        .where(eq(idempotencyKeysTable.key, params.idempotencyKey))
        .get();
      if (prev) {
        return JSON.parse(prev.resultJson) as WorkflowRun;
      }
    }

    const project = this.getProject(params.projectId);
    const workflow = this.getWorkflow(params.workflowId);
    const known = new Set(this.listAgents().map((a) => a.id));
    const snapshot = assertValidWorkflow(workflow.definition, known, {
      requireNonEmpty: true,
    });

    // Enforce automation authorization policy across every step BEFORE starting!
    for (const step of snapshot.steps) {
      const agent = this.getAgent(step.agentId);
      if (
        agent.automationPolicy === "restricted" &&
        !params.allowRestrictedAutomation
      ) {
        throw new CoreError(
          "AUTOMATION_RESTRICTED",
          `Agent "${agent.name}" is restricted from automated workflow chains (${agent.automationNote ?? "check vendor authentication terms"}). Use interactive single-agent chat or configure an authorized automation profile.`,
          { agentId: agent.id, stepId: step.id }
        );
      }
    }

    const runId = randomUUID();
    this.workspace.acquireLock(project.id, runId);

    let conversationId = params.conversationId;
    if (!conversationId) {
      const conv = this.createConversation({
        projectId: project.id,
        title: params.objective.trim().replace(/\s+/g, " ").slice(0, 60) || workflow.name,
        mode: "workflow",
        workflowId: workflow.id,
      });
      conversationId = conv.id;
    } else {
      const conv = this.getConversationSummary(conversationId);
      if (conv.projectId !== project.id) {
        this.workspace.releaseLock(project.id, runId);
        throw new CoreError(
          "VALIDATION_ERROR",
          "Conversation does not belong to the specified project."
        );
      }
    }

    const wsStatus = this.workspace.getStatus(project.id, project.canonicalPath);
    const now = new Date().toISOString();

    this.storage.sqlite.transaction(() => {
      this.storage.db
        .insert(workflowRunsTable)
        .values({
          id: runId,
          conversationId: conversationId!,
          projectId: project.id,
          workflowId: workflow.id,
          workflowVersionId: workflow.latestVersionId,
          workflowSnapshotJson: JSON.stringify(snapshot),
          objective: params.objective,
          state: "queued",
          pauseRequested: 0,
          workspaceBaselineHead: wsStatus.head,
          errorCode: null,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          finishedAt: null,
        })
        .run();

      this.storage.db
        .insert(runCheckpointsTable)
        .values({
          runId,
          lastCompletedStepId: null,
          lastCompletedOrdinal: -1,
          activeNodeRunId: null,
          workspaceBaseline: wsStatus.head,
          recoveryMode: "none",
          updatedAt: now,
        })
        .run();

      // Pre-create initial pending node_runs for visibility in UI
      snapshot.steps.forEach((step, idx) => {
        this.storage.db
          .insert(nodeRunsTable)
          .values({
            id: randomUUID(),
            runId,
            stepId: step.id,
            agentId: step.agentId,
            ordinal: idx,
            attempt: 1,
            state: "pending",
            stopReason: null,
            errorCode: null,
            errorMessage: null,
            startedAt: null,
            finishedAt: null,
            createdAt: now,
          })
          .run();
      });
    })();

    const userMsg = this.appendMessage({
      conversationId,
      role: "user",
      kind: "text",
      content: params.objective,
      metadata: { runId, workflowId: workflow.id },
    });

    this.eventBus.emit({
      projectId: project.id,
      conversationId,
      runId,
      type: "message.completed",
      payload: userMsg,
    });

    const run = this.getRun(runId).run;

    if (params.idempotencyKey) {
      this.storage.db
        .insert(idempotencyKeysTable)
        .values({
          key: params.idempotencyKey,
          scope: "runs.start",
          resultJson: JSON.stringify(run),
          createdAt: now,
        })
        .onConflictDoNothing()
        .run();
    }

    // Launch DAG / serial execution asynchronously
    const control: ActiveRunControl = {
      runId,
      cancelled: false,
      pauseAfterCurrent: false,
      permissionMode: params.permissionMode ?? "ask",
      activeClients: new Map(),
      promise: Promise.resolve(),
    };
    this.activeRuns.set(runId, control);
    control.promise = this.executeRunLoop(runId, control, {
      resumeFromStepOrdinal: 0,
      isResume: false,
    }).finally(() => {
      this.activeRuns.delete(runId);
      this.workspace.releaseLock(project.id, runId);
    });

    return run;
  }

  /**
   * Waits for an active run to settle (useful in integration tests and graceful shutdown).
   */
  async waitForRun(runId: string): Promise<WorkflowRun> {
    const active = this.activeRuns.get(runId);
    if (active) {
      await active.promise;
    }
    return this.getRun(runId).run;
  }

  getRun(runId: string): {
    run: WorkflowRun;
    nodeRuns: NodeRun[];
    checkpoint: RunCheckpoint | null;
    handoffs: ContextHandoff[];
    artifacts: Artifact[];
    pendingPermissions: PermissionRequest[];
  } {
    const row = this.storage.db
      .select()
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.id, runId))
      .get();

    if (!row) {
      throw new CoreError("NOT_FOUND", `Workflow run "${runId}" not found`);
    }

    const nodeRows = this.storage.db
      .select()
      .from(nodeRunsTable)
      .where(eq(nodeRunsTable.runId, runId))
      .orderBy(asc(nodeRunsTable.ordinal), asc(nodeRunsTable.attempt))
      .all();

    const cpRow = this.storage.db
      .select()
      .from(runCheckpointsTable)
      .where(eq(runCheckpointsTable.runId, runId))
      .get();

    const artifactRows = this.storage.db
      .select()
      .from(artifactsTable)
      .where(eq(artifactsTable.runId, runId))
      .orderBy(asc(artifactsTable.createdAt))
      .all();

    const sessionByNode = new Map<string, string>();
    const sessions = this.storage.db
      .select({ id: agentSessionsTable.id, nodeRunId: agentSessionsTable.nodeRunId })
      .from(agentSessionsTable)
      .where(eq(agentSessionsTable.conversationId, row.conversationId))
      .all();
    for (const s of sessions) {
      if (s.nodeRunId) sessionByNode.set(s.nodeRunId, s.id);
    }

    return {
      run: this.hydrateRun(row),
      nodeRuns: nodeRows.map((n) => ({
        id: n.id,
        runId: n.runId,
        stepId: n.stepId,
        agentId: n.agentId,
        ordinal: n.ordinal,
        attempt: n.attempt,
        state: n.state as NodeRun["state"],
        stopReason: n.stopReason,
        errorCode: n.errorCode,
        errorMessage: n.errorMessage,
        sessionId: sessionByNode.get(n.id) ?? null,
        startedAt: n.startedAt,
        finishedAt: n.finishedAt,
        createdAt: n.createdAt,
      })),
      checkpoint: cpRow
        ? {
            runId: cpRow.runId,
            lastCompletedStepId: cpRow.lastCompletedStepId,
            lastCompletedOrdinal: cpRow.lastCompletedOrdinal,
            activeNodeRunId: cpRow.activeNodeRunId,
            workspaceBaseline: cpRow.workspaceBaseline,
            recoveryMode: cpRow.recoveryMode as RunCheckpoint["recoveryMode"],
            updatedAt: cpRow.updatedAt,
          }
        : null,
      handoffs: this.contextEngine.listHandoffsForRun(runId),
      artifacts: artifactRows.map((a) => ({
        id: a.id,
        runId: a.runId,
        nodeRunId: a.nodeRunId,
        relativePath: a.relativePath,
        kind: a.kind,
        contentHash: a.contentHash,
        size: a.size,
        createdAt: a.createdAt,
      })),
      pendingPermissions: this.permissions.listPending({ runId }),
    };
  }

  listRuns(params?: {
    projectId?: string;
    conversationId?: string;
    limit?: number;
  }): WorkflowRun[] {
    const conditions = [];
    if (params?.projectId) {
      conditions.push(eq(workflowRunsTable.projectId, params.projectId));
    }
    if (params?.conversationId) {
      conditions.push(
        eq(workflowRunsTable.conversationId, params.conversationId)
      );
    }

    const rows =
      conditions.length > 0
        ? this.storage.db
            .select()
            .from(workflowRunsTable)
            .where(and(...conditions))
            .orderBy(desc(workflowRunsTable.createdAt))
            .limit(params?.limit ?? 50)
            .all()
        : this.storage.db
            .select()
            .from(workflowRunsTable)
            .orderBy(desc(workflowRunsTable.createdAt))
            .limit(params?.limit ?? 50)
            .all();

    return rows.map((r) => this.hydrateRun(r));
  }

  async cancelRun(runId: string): Promise<WorkflowRun> {
    const detail = this.getRun(runId);
    this.permissions.cancelAllForScope({ runId });

    const control = this.activeRuns.get(runId);
    if (control) {
      control.cancelled = true;
      await Promise.allSettled(
        Array.from(control.activeClients.values()).map(async (entry) => {
          if (entry.providerSessionId) {
            await entry.client.cancel(entry.providerSessionId);
          }
        })
      );
      // Wait bounded timeout for graceful cancellation, then force close all active clients
      await Promise.race([
        control.promise,
        new Promise((r) => setTimeout(r, 3000)),
      ]);
      await Promise.allSettled(
        Array.from(control.activeClients.values()).map((entry) =>
          entry.client.close()
        )
      );
      control.activeClients.clear();
    } else if (
      detail.run.state === "queued" ||
      detail.run.state === "running" ||
      detail.run.state === "waiting_permission" ||
      detail.run.state === "paused"
    ) {
      const now = new Date().toISOString();
      this.storage.db
        .update(workflowRunsTable)
        .set({ state: "cancelled", updatedAt: now, finishedAt: now })
        .where(eq(workflowRunsTable.id, runId))
        .run();
      this.eventBus.emit({
        projectId: detail.run.projectId,
        conversationId: detail.run.conversationId,
        runId,
        type: "run.state",
        payload: { state: "cancelled" },
      });
    }

    return this.getRun(runId).run;
  }

  pauseRunAfterCurrent(runId: string): WorkflowRun {
    const detail = this.getRun(runId);
    const control = this.activeRuns.get(runId);
    if (control) {
      control.pauseAfterCurrent = true;
    }
    this.storage.db
      .update(workflowRunsTable)
      .set({ pauseRequested: 1, updatedAt: new Date().toISOString() })
      .where(eq(workflowRunsTable.id, runId))
      .run();

    this.eventBus.emit({
      projectId: detail.run.projectId,
      conversationId: detail.run.conversationId,
      runId,
      type: "system.notice",
      payload: {
        message: "Pause scheduled at the end of the current agent step.",
      },
    });

    return this.getRun(runId).run;
  }

  async resumeRun(params: {
    runId: string;
    confirmSideEffectsReviewed?: boolean;
  }): Promise<WorkflowRun> {
    if (this.shuttingDown) {
      throw new CoreError("CANCELLED", "CodeTeams Core is shutting down.");
    }
    if (this.activeRuns.has(params.runId)) {
      throw new CoreError(
        "WORKSPACE_BUSY",
        `Run "${params.runId}" is already executing.`
      );
    }

    const detail = this.getRun(params.runId);
    const { run, checkpoint } = detail;

    if (
      run.state !== "interrupted" &&
      run.state !== "paused" &&
      run.state !== "failed"
    ) {
      throw new CoreError(
        "VALIDATION_ERROR",
        `Run "${run.id}" is in state "${run.state}" and cannot be resumed.`
      );
    }

    if (
      run.state === "interrupted" &&
      checkpoint?.recoveryMode === "needs_confirmation" &&
      !params.confirmSideEffectsReviewed
    ) {
      throw new CoreError(
        "INTERRUPTED",
        "Previous run was interrupted mid-node. Confirm that you have reviewed workspace side effects before resuming.",
        { requiresConfirmation: true }
      );
    }

    const startOrdinal = (checkpoint?.lastCompletedOrdinal ?? -1) + 1;
    if (startOrdinal >= run.workflowSnapshot.steps.length) {
      // All steps already completed before crash
      const now = new Date().toISOString();
      this.storage.db
        .update(workflowRunsTable)
        .set({ state: "completed", updatedAt: now, finishedAt: now })
        .where(eq(workflowRunsTable.id, run.id))
        .run();
      return this.getRun(run.id).run;
    }

    this.workspace.acquireLock(run.projectId, run.id);
    this.storage.db
      .update(workflowRunsTable)
      .set({
        state: "running",
        pauseRequested: 0,
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workflowRunsTable.id, run.id))
      .run();

    const control: ActiveRunControl = {
      runId: run.id,
      cancelled: false,
      pauseAfterCurrent: false,
      permissionMode: "ask",
      activeClients: new Map(),
      promise: Promise.resolve(),
    };
    this.activeRuns.set(run.id, control);
    control.promise = this.executeRunLoop(run.id, control, {
      resumeFromStepOrdinal: startOrdinal,
      isResume: true,
    }).finally(() => {
      this.activeRuns.delete(run.id);
      this.workspace.releaseLock(run.projectId, run.id);
    });

    return this.getRun(run.id).run;
  }

  async retryNode(params: {
    runId: string;
    nodeRunId: string;
    confirmRetry?: boolean;
  }): Promise<WorkflowRun> {
    const detail = this.getRun(params.runId);
    const targetNode = detail.nodeRuns.find((n) => n.id === params.nodeRunId);
    if (!targetNode) {
      throw new CoreError("NOT_FOUND", `Node run "${params.nodeRunId}" not found`);
    }
    if (
      targetNode.state !== "failed" &&
      targetNode.state !== "interrupted" &&
      targetNode.state !== "cancelled"
    ) {
      throw new CoreError(
        "VALIDATION_ERROR",
        `Node "${targetNode.id}" in state "${targetNode.state}" cannot be retried.`
      );
    }

    return await this.resumeRun({
      runId: params.runId,
      confirmSideEffectsReviewed: params.confirmRetry ?? true,
    });
  }

  private async executeRunLoop(
    runId: string,
    control: ActiveRunControl,
    opts: { resumeFromStepOrdinal: number; isResume: boolean }
  ): Promise<void> {
    const initial = this.getRun(runId);
    const run = initial.run;
    const project = this.getProject(run.projectId);
    const steps = run.workflowSnapshot.steps;
    const edges = resolveWorkflowEdges(run.workflowSnapshot);
    const layers = computeWorkflowLayers(steps, edges) ?? steps.map((s) => [s]);
    const stepOrdinalMap = new Map(steps.map((s, idx) => [s.id, idx]));

    // Pre-compute upstream ancestor step IDs so parallel branches stay scoped and merge nodes
    // receive handoffs from all their upstream branches (e.g. 2 & 3 -> 4).
    const incomingMap = new Map<string, string[]>();
    for (const e of edges) {
      const list = incomingMap.get(e.target) ?? [];
      list.push(e.source);
      incomingMap.set(e.target, list);
    }
    const getAncestorStepIds = (stepId: string): Set<string> => {
      const visited = new Set<string>();
      const queue = [...(incomingMap.get(stepId) ?? [])];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const p of incomingMap.get(cur) ?? []) {
          if (!visited.has(p)) queue.push(p);
        }
      }
      return visited;
    };

    this.setRunState(run, "running");

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      if (control.cancelled) {
        this.setRunState(run, "cancelled");
        return;
      }

      const layer = layers[layerIdx]!;
      const results = await Promise.all(
        layer.map((step, idxInLayer) => {
          const ordinal = stepOrdinalMap.get(step.id) ?? 0;
          return this.executeSingleWorkflowStep({
            runId,
            run,
            project,
            steps,
            step,
            ordinal,
            layerIdx,
            isTitleSource: layerIdx === 0 && idxInLayer === 0,
            ancestorStepIds: getAncestorStepIds(step.id),
            control,
            opts,
          });
        })
      );

      if (results.some((ok) => !ok)) {
        return;
      }

      // Respect pause at safe wave boundary
      if (control.pauseAfterCurrent && layerIdx < layers.length - 1) {
        this.setRunState(run, "paused");
        return;
      }
    }

    this.setRunState(run, "completed");
  }

  private async executeSingleWorkflowStep(ctx: {
    runId: string;
    run: WorkflowRun;
    project: Project;
    steps: WorkflowDefinition["steps"];
    step: WorkflowDefinition["steps"][number];
    ordinal: number;
    layerIdx: number;
    isTitleSource: boolean;
    ancestorStepIds: Set<string>;
    control: ActiveRunControl;
    opts: { resumeFromStepOrdinal: number; isResume: boolean };
  }): Promise<boolean> {
    const {
      runId,
      run,
      project,
      steps,
      step,
      ordinal,
      layerIdx,
      isTitleSource,
      ancestorStepIds,
      control,
      opts,
    } = ctx;

    if (control.cancelled) {
      this.setRunState(run, "cancelled");
      return false;
    }

    const agent = this.getAgent(step.agentId);

    // Determine node_run record (use pending attempt 1 on initial run, or allocate next attempt on resume/retry)
    const existingNodesForStep = this.storage.db
      .select()
      .from(nodeRunsTable)
      .where(
        and(
          eq(nodeRunsTable.runId, runId),
          eq(nodeRunsTable.stepId, step.id)
        )
      )
      .orderBy(desc(nodeRunsTable.attempt))
      .all();

    const latestForStep = existingNodesForStep[0];
    if (latestForStep?.state === "completed") {
      // Already committed before restart: NEVER re-run completed nodes!
      return true;
    }

    let nodeRunId: string;
    let attempt: number;
    const now = new Date().toISOString();

    if (latestForStep && latestForStep.state === "pending") {
      nodeRunId = latestForStep.id;
      attempt = latestForStep.attempt;
      this.storage.db
        .update(nodeRunsTable)
        .set({ state: "running", startedAt: now })
        .where(eq(nodeRunsTable.id, nodeRunId))
        .run();
    } else {
      nodeRunId = randomUUID();
      attempt = (latestForStep?.attempt ?? 0) + 1;
      this.storage.db
        .insert(nodeRunsTable)
        .values({
          id: nodeRunId,
          runId,
          stepId: step.id,
          agentId: step.agentId,
          ordinal,
          attempt,
          state: "running",
          stopReason: null,
          errorCode: null,
          errorMessage: null,
          startedAt: now,
          finishedAt: null,
          createdAt: now,
        })
        .run();
    }

    this.storage.db
      .update(runCheckpointsTable)
      .set({ activeNodeRunId: nodeRunId, updatedAt: now })
      .where(eq(runCheckpointsTable.runId, runId))
      .run();

    this.eventBus.emit({
      projectId: project.id,
      conversationId: run.conversationId,
      runId,
      nodeRunId,
      type: "node.state",
      payload: {
        stepId: step.id,
        agentId: step.agentId,
        ordinal,
        attempt,
        state: "running",
      },
    });

    const stepStartSeq = this.eventBus.getLatestSeq();
    const { env, secrets } = this.resolveAgentEnv(agent);
    const segments: TurnSegment[] = [];
    let disconnected = false;
    let disconnectReason = "";
    let replayingHistory = false;
      const priorToolCallIds = this.collectPriorConversationToolCallIds(
        run.conversationId
      );
      let localSessionId = "";
      let client: AcpAgentClient | null = null;
      let init: acp.InitializeResponse | null = null;
      let configSignature = "";
      let stepCompletedCleanly = false;

      const stepCallbacks: NonNullable<
        ConstructorParameters<typeof AcpAgentClient>[0]["callbacks"]
      > = {
        onSessionUpdate: (notification) => {
          const update = notification.update;
          if (replayingHistory) {
            if (
              (update.sessionUpdate === "tool_call" ||
                update.sessionUpdate === "tool_call_update") &&
              update.toolCallId
            ) {
              priorToolCallIds.add(update.toolCallId);
            }
            return;
          }
          if (update.sessionUpdate === "agent_message_chunk") {
            if (update.content.type === "text") {
              const delta = redactSecrets(update.content.text, secrets);
              appendTextSegment(segments, delta);
              this.eventBus.emit({
                projectId: project.id,
                conversationId: run.conversationId,
                runId,
                nodeRunId,
                sessionId: localSessionId || undefined,
                type: "message.delta",
                payload: { agentId: agent.id, stepId: step.id, text: delta },
              });
            }
          } else if (update.sessionUpdate === "agent_thought_chunk") {
            if (update.content.type === "text") {
              const delta = redactSecrets(update.content.text, secrets);
              appendThoughtSegment(segments, delta);
              this.eventBus.emit({
                projectId: project.id,
                conversationId: run.conversationId,
                runId,
                nodeRunId,
                sessionId: localSessionId || undefined,
                type: "thought.delta",
                payload: { agentId: agent.id, stepId: step.id, text: delta },
              });
            }
          } else if (update.sessionUpdate === "tool_call") {
            if (update.toolCallId && priorToolCallIds.has(update.toolCallId)) {
              return;
            }
            const locations = (update.locations ?? []).map((loc) => ({
              path: loc.path,
              line: loc.line ?? null,
            }));
            const rawInputPreview = summarizeAcpValue(update.rawInput, secrets);
            const diffs = extractToolDiffs(
              update.content,
              update.rawInput,
              locations,
              update.kind ?? null,
              secrets
            );
            upsertToolSegment(segments, {
              toolCallId: update.toolCallId,
              agentId: agent.id,
              title: update.title,
              kind: update.kind ?? null,
              status: update.status ?? "in_progress",
              locations,
              rawInputPreview,
              diffs,
            });
            this.eventBus.emit({
              projectId: project.id,
              conversationId: run.conversationId,
              runId,
              nodeRunId,
              sessionId: localSessionId || undefined,
              type: "tool.started",
              payload: {
                agentId: agent.id,
                toolCallId: update.toolCallId,
                title: update.title,
                kind: update.kind ?? null,
                status: update.status ?? "in_progress",
                locations,
                rawInputPreview,
                ...(diffs.length > 0 ? { diffs } : {}),
              },
            });
          } else if (update.sessionUpdate === "tool_call_update") {
            if (update.toolCallId && priorToolCallIds.has(update.toolCallId)) {
              return;
            }
            const locations = update.locations
              ? update.locations.map((loc) => ({
                  path: loc.path,
                  line: loc.line ?? null,
                }))
              : undefined;
            const rawInputPreview = summarizeAcpValue(update.rawInput, secrets);
            const rawOutputPreview = summarizeAcpValue(
              update.rawOutput,
              secrets
            );
            const contentPreview = extractToolContentPreview(
              update.content,
              secrets
            );
            const diffs = extractToolDiffs(
              update.content,
              update.rawInput,
              locations,
              update.kind ?? null,
              secrets
            );
            upsertToolSegment(segments, {
              toolCallId: update.toolCallId,
              agentId: agent.id,
              title: update.title ?? null,
              kind: update.kind ?? null,
              status: update.status ?? null,
              locations,
              rawInputPreview,
              rawOutputPreview,
              contentPreview,
              diffs,
            });
            this.eventBus.emit({
              projectId: project.id,
              conversationId: run.conversationId,
              runId,
              nodeRunId,
              sessionId: localSessionId || undefined,
              type:
                update.status === "completed" || update.status === "failed"
                  ? "tool.completed"
                  : "tool.updated",
              payload: {
                agentId: agent.id,
                toolCallId: update.toolCallId,
                title: update.title ?? null,
                kind: update.kind ?? null,
                status: update.status ?? null,
                locations,
                rawInputPreview,
                rawOutputPreview,
                contentPreview,
                ...(diffs.length > 0 ? { diffs } : {}),
              },
            });
          } else if (update.sessionUpdate === "plan") {
            upsertPlanSegment(segments, agent.id, update.entries);
            this.eventBus.emit({
              projectId: project.id,
              conversationId: run.conversationId,
              runId,
              nodeRunId,
              sessionId: localSessionId || undefined,
              type: "plan.updated",
              payload: { agentId: agent.id, entries: update.entries },
            });
          } else if (update.sessionUpdate === "session_info_update") {
            this.applyAcpSessionTitle({
              conversationId: run.conversationId,
              agentId: agent.id,
              rawTitle: update.title,
              secrets,
              allowUpdate: isTitleSource,
            });
          }
        },
        onPermissionRequest: async (acpRequest) => {
          const autoApprove = control.permissionMode === "full_access";
          if (autoApprove && acpRequest.toolCall?.toolCallId) {
            upsertToolSegment(segments, {
              toolCallId: acpRequest.toolCall.toolCallId,
              agentId: agent.id,
              title: acpRequest.toolCall.title ?? null,
              kind: acpRequest.toolCall.kind ?? null,
              autoApproved: true,
            });
          }
          return await this.permissions.requestPermission({
            projectId: project.id,
            conversationId: run.conversationId,
            runId,
            nodeRunId,
            sessionId: localSessionId || "pending",
            agentId: agent.id,
            acpRequest,
            autoApprove,
            onWaiting: () => {
              this.setNodeState(
                project.id,
                run.conversationId,
                runId,
                nodeRunId,
                step.id,
                agent.id,
                ordinal,
                attempt,
                "waiting_permission"
              );
              this.setRunState(run, "waiting_permission");
            },
            onResumed: () => {
              if (!control.cancelled) {
                this.setNodeState(
                  project.id,
                  run.conversationId,
                  runId,
                  nodeRunId,
                  step.id,
                  agent.id,
                  ordinal,
                  attempt,
                  "running"
                );
                this.setRunState(run, "running");
              }
            },
          });
        },
        onDisconnect: ({ exitCode, reason }) => {
          disconnected = true;
          disconnectReason = `${reason} (exit=${exitCode})`;
        },
      };

      try {
        const acquired = await this.acquireOrConnectClient({
          agent,
          cwd: project.canonicalPath,
          env,
          secrets,
          callbacks: stepCallbacks,
        });
        client = acquired.client;
        init = acquired.init;
        configSignature = acquired.configSignature;
        control.activeClients.set(nodeRunId, { client, providerSessionId: null });
        const connNow = new Date().toISOString();

        this.storage.db
          .update(agentsTable)
          .set({
            verification: "verified",
            installedVersion: init.agentInfo?.version ?? agent.installedVersion ?? null,
            capabilitiesJson: JSON.stringify(init.agentCapabilities ?? {}),
            lastTestedAt: connNow,
            lastError: null,
            updatedAt: connNow,
          })
          .where(eq(agentsTable.id, agent.id))
          .run();

        // Check if resuming an interrupted node with a prior native session
        let providerSessionId: string;
        let recoveryMode: RunCheckpoint["recoveryMode"] = "none";

        const priorInterruptedSession =
          opts.isResume && ordinal === opts.resumeFromStepOrdinal && latestForStep
            ? this.storage.db
                .select()
                .from(agentSessionsTable)
                .where(eq(agentSessionsTable.nodeRunId, latestForStep.id))
                .orderBy(desc(agentSessionsTable.updatedAt))
                .limit(1)
                .get()
            : undefined;

        if (
          priorInterruptedSession?.providerSessionId &&
          client.supportsLoadSession
        ) {
          try {
            replayingHistory = true;
            localSessionId = priorInterruptedSession.id;
            await client.loadSession(
              priorInterruptedSession.providerSessionId,
              project.canonicalPath
            );
            await client.flushUpdates();
            replayingHistory = false;
            providerSessionId = priorInterruptedSession.providerSessionId;
            recoveryMode = "session_resumed";
            this.storage.db
              .update(agentSessionsTable)
              .set({
                nodeRunId,
                state: "active",
                updatedAt: connNow,
              })
              .where(eq(agentSessionsTable.id, localSessionId))
              .run();

            this.appendMessage({
              conversationId: run.conversationId,
              sessionId: localSessionId,
              nodeRunId,
              agentId: agent.id,
              role: "system",
              kind: "recovery_notice",
              content: `已恢复原生会话（${agent.name} · session/load），继续执行节点 ${ordinal + 1}。`,
              metadata: { recoveryMode: "session_resumed", runId, nodeRunId },
            });
          } catch {
            replayingHistory = false;
            const created = await client.newSession(project.canonicalPath);
            providerSessionId = created.sessionId;
            await applyAcpPermissionModeIfAdvertised(
              client,
              providerSessionId,
              created,
              control.permissionMode
            );
            localSessionId = randomUUID();
            recoveryMode = "context_rebuilt";
            this.storage.db
              .insert(agentSessionsTable)
              .values({
                id: localSessionId,
                conversationId: run.conversationId,
                nodeRunId,
                agentId: agent.id,
                providerSessionId,
                cwd: project.canonicalPath,
                runtimeVersion: init.agentInfo?.version ?? null,
                canLoadSession: client.supportsLoadSession ? 1 : 0,
                state: "active",
                createdAt: connNow,
                updatedAt: connNow,
              })
              .run();

            this.appendMessage({
              conversationId: run.conversationId,
              sessionId: localSessionId,
              nodeRunId,
              agentId: agent.id,
              role: "system",
              kind: "recovery_notice",
              content: `原生会话不可用，已为 ${agent.name} 重建上下文并创建替代会话（非无损续跑）。`,
              metadata: { recoveryMode: "context_rebuilt", runId, nodeRunId },
            });
          }
        } else {
          const created = await client.newSession(project.canonicalPath);
          providerSessionId = created.sessionId;
          await applyAcpPermissionModeIfAdvertised(
            client,
            providerSessionId,
            created,
            control.permissionMode
          );
          localSessionId = randomUUID();
          if (opts.isResume && ordinal === opts.resumeFromStepOrdinal) {
            recoveryMode = "context_rebuilt";
            this.appendMessage({
              conversationId: run.conversationId,
              sessionId: localSessionId,
              nodeRunId,
              agentId: agent.id,
              role: "system",
              kind: "recovery_notice",
              content: `已为 ${agent.name} 重建上下文并继续执行（原生 session/load 未支持或无可用会话）。`,
              metadata: { recoveryMode: "context_rebuilt", runId, nodeRunId },
            });
          }
          this.storage.db
            .insert(agentSessionsTable)
            .values({
              id: localSessionId,
              conversationId: run.conversationId,
              nodeRunId,
              agentId: agent.id,
              providerSessionId,
              cwd: project.canonicalPath,
              runtimeVersion: init.agentInfo?.version ?? null,
              canLoadSession: client.supportsLoadSession ? 1 : 0,
              state: "active",
              createdAt: connNow,
              updatedAt: connNow,
            })
            .run();
        }

        control.activeClients.set(nodeRunId, { client, providerSessionId });

        if (recoveryMode !== "none") {
          this.storage.db
            .update(runCheckpointsTable)
            .set({ recoveryMode, updatedAt: new Date().toISOString() })
            .where(eq(runCheckpointsTable.runId, runId))
            .run();
        }

        // Build deterministic context prompt from objective, rules, memory, upstream handoffs & workspace.
        // For DAG graphs, filter handoffs strictly to this step's upstream ancestors (so parallel
        // branches stay focused and merge nodes receive handoffs from all converging branches).
        const { memory, ruleFiles } = this.getProjectMemory(project.id);
        const allHandoffs = this.contextEngine.listHandoffsForRun(runId);
        let upstreamHandoffs = allHandoffs;
        if (ancestorStepIds.size > 0) {
          const ancestorNodeRows = this.storage.db
            .select({ id: nodeRunsTable.id, stepId: nodeRunsTable.stepId })
            .from(nodeRunsTable)
            .where(eq(nodeRunsTable.runId, runId))
            .all();
          const ancestorNodeIds = new Set(
            ancestorNodeRows
              .filter((r) => ancestorStepIds.has(r.stepId))
              .map((r) => r.id)
          );
          upstreamHandoffs = allHandoffs.filter((h) =>
            ancestorNodeIds.has(h.sourceNodeRunId)
          );
        } else if (layerIdx === 0) {
          upstreamHandoffs = [];
        }
        const wsBefore = this.workspace.getStatus(
          project.id,
          project.canonicalPath
        );

        const promptText = this.contextEngine.buildPromptForWorkflowStep({
          objective: run.objective,
          stepIndex: ordinal,
          totalSteps: steps.length,
          agentName: agent.name,
          ruleFiles,
          projectMemory: memory,
          upstreamHandoffs,
          workspaceStatus: wsBefore,
          knownSecrets: secrets,
        });

        const promptRes = await client.prompt(providerSessionId, [
          { type: "text", text: promptText },
        ]);

        finalizeOpenThought(segments);
        const outputText = joinTextSegments(segments);

        // NEVER treat non-end_turn stopReason, cancellation, or disconnect as normal completion!
        if (control.cancelled || promptRes.stopReason === "cancelled") {
          this.failOrInterruptNode({
            project,
            run,
            nodeRunId,
            stepId: step.id,
            agentId: agent.id,
            ordinal,
            attempt,
            localSessionId,
            nodeState: "cancelled",
            runState: "cancelled",
            stopReason: promptRes.stopReason,
            errorCode: "CANCELLED",
            errorMessage: "Execution cancelled by user.",
            partialOutput: outputText,
          });
          return false;
        }

        if (disconnected || promptRes.stopReason !== "end_turn") {
          const isRefusal = promptRes.stopReason === "refusal";
          this.failOrInterruptNode({
            project,
            run,
            nodeRunId,
            stepId: step.id,
            agentId: agent.id,
            ordinal,
            attempt,
            localSessionId,
            nodeState: disconnected ? "interrupted" : "failed",
            runState: disconnected ? "interrupted" : "failed",
            stopReason: promptRes.stopReason,
            errorCode: isRefusal
              ? "PERMISSION_DENIED"
              : disconnected
                ? "INTERRUPTED"
                : "ACP_PROTOCOL_ERROR",
            errorMessage: disconnected
              ? `Agent disconnected mid-turn: ${disconnectReason}`
              : `Agent stopped with non-normal stopReason "${promptRes.stopReason}". Downstream steps were NOT scheduled.`,
            partialOutput: outputText,
          });
          return false;
        }

        // Persist transcript artifact atomically to disk BEFORE DB commit
        const transcriptArtifact = this.storage.writeArtifactFile(
          project.id,
          runId,
          `step-${ordinal + 1}-${agent.id}-attempt-${attempt}.md`,
          `# Step ${ordinal + 1}: ${agent.name}\n\n${outputText || "(No text output)"}\n`
        );

        // Optional fault injection hook for durability testing (before atomic commit)
        if (this.options.onBeforeNodeCommit) {
          await this.options.onBeforeNodeCommit(step.id, nodeRunId);
        }

        const wsAfter = this.workspace.getStatus(
          project.id,
          project.canonicalPath
        );
        const stepEndSeq = this.eventBus.getLatestSeq();
        const doneNow = new Date().toISOString();

        // Persist assistant message first
        const assistantMsg = this.appendMessage({
          conversationId: run.conversationId,
          sessionId: localSessionId,
          nodeRunId,
          agentId: agent.id,
          role: "assistant",
          kind: "text",
          content:
            outputText.trim() ||
            `(${agent.name} completed its turn without text output.)`,
          metadata: {
            runId,
            stepId: step.id,
            ordinal,
            attempt,
            stopReason: promptRes.stopReason,
            ...(segments.length > 0 ? { segments } : {}),
          },
        });

        let savedHandoff!: ContextHandoff & { id: string; createdAt: string };

        // ATOMIC COMMIT: artifact + context_handoff + node_run completed + checkpoint!
        this.storage.sqlite.transaction(() => {
          this.storage.db
            .insert(artifactsTable)
            .values({
              id: randomUUID(),
              runId,
              nodeRunId,
              relativePath: transcriptArtifact.relativePath,
              kind: "step_transcript",
              contentHash: transcriptArtifact.contentHash,
              size: transcriptArtifact.size,
              createdAt: doneNow,
            })
            .run();

          const handoffPayload = this.contextEngine.buildHandoffPayload({
            runId,
            sourceNodeRunId: nodeRunId,
            sourceAgentId: agent.id,
            objective: run.objective,
            rawOutputText: outputText,
            workspaceStatus: wsAfter,
            sourceEventRange: [stepStartSeq, stepEndSeq],
            knownSecrets: secrets,
          });
          savedHandoff = this.contextEngine.persistHandoff(handoffPayload);

          this.storage.db
            .update(nodeRunsTable)
            .set({
              state: "completed",
              stopReason: promptRes.stopReason,
              finishedAt: doneNow,
            })
            .where(eq(nodeRunsTable.id, nodeRunId))
            .run();

          this.storage.db
            .update(agentSessionsTable)
            .set({ state: "idle", updatedAt: doneNow })
            .where(eq(agentSessionsTable.id, localSessionId))
            .run();

          this.storage.db
            .update(runCheckpointsTable)
            .set({
              lastCompletedStepId: step.id,
              lastCompletedOrdinal: ordinal,
              activeNodeRunId: null,
              workspaceBaseline: wsAfter.head,
              updatedAt: doneNow,
            })
            .where(eq(runCheckpointsTable.runId, runId))
            .run();
        })();

        this.eventBus.emit({
          projectId: project.id,
          conversationId: run.conversationId,
          runId,
          nodeRunId,
          sessionId: localSessionId,
          type: "message.completed",
          payload: assistantMsg,
        });

        this.eventBus.emit({
          projectId: project.id,
          conversationId: run.conversationId,
          runId,
          nodeRunId,
          type: "context.handoff.saved",
          payload: savedHandoff,
        });

        this.eventBus.emit({
          projectId: project.id,
          conversationId: run.conversationId,
          runId,
          nodeRunId,
          type: "node.state",
          payload: {
            stepId: step.id,
            agentId: agent.id,
            ordinal,
            attempt,
            state: "completed",
            stopReason: promptRes.stopReason,
          },
        });

        this.eventBus.emit({
          projectId: project.id,
          conversationId: run.conversationId,
          runId,
          type: "workspace.changed",
          payload: wsAfter,
        });

        stepCompletedCleanly = true;
        return true;
      } catch (err) {
        const rawErrMsg = err instanceof Error ? err.message : String(err);
        const transportDropped =
          disconnected ||
          !client?.isConnected ||
          /closed|disconnect|aborted|eof|broken pipe|exited/i.test(rawErrMsg);
        const errCode =
          err instanceof CoreError
            ? err.code
            : transportDropped
              ? "INTERRUPTED"
              : "ACP_PROTOCOL_ERROR";
        const errMsg = redactSecrets(rawErrMsg, secrets);
        const isInterrupted =
          transportDropped ||
          errCode === "INTERRUPTED" ||
          errCode === "SESSION_UNAVAILABLE";

        this.failOrInterruptNode({
          project,
          run,
          nodeRunId,
          stepId: step.id,
          agentId: agent.id,
          ordinal,
          attempt,
          localSessionId: localSessionId || null,
          nodeState: control.cancelled
            ? "cancelled"
            : isInterrupted
              ? "interrupted"
              : "failed",
          runState: control.cancelled
            ? "cancelled"
            : isInterrupted
              ? "interrupted"
              : "failed",
          stopReason: null,
          errorCode: control.cancelled ? "CANCELLED" : errCode,
          errorMessage: errMsg,
          partialOutput: joinTextSegments(segments),
        });
        return false;
      } finally {
        const completedProviderSessionId =
          control.activeClients.get(nodeRunId)?.providerSessionId ?? null;
        control.activeClients.delete(nodeRunId);
        if (client) {
          if (
            stepCompletedCleanly &&
            !control.cancelled &&
            !disconnected &&
            client.isConnected &&
            init
          ) {
            await this.releaseWarmClient({
              agentId: agent.id,
              cwd: project.canonicalPath,
              configSignature,
              client,
              initResult: init,
              onIdleSessionUpdate:
                isTitleSource && completedProviderSessionId
                  ? (notification) => {
                      if (
                        notification.sessionId === completedProviderSessionId &&
                        notification.update.sessionUpdate ===
                          "session_info_update"
                      ) {
                        this.applyAcpSessionTitle({
                          conversationId: run.conversationId,
                          agentId: agent.id,
                          rawTitle: notification.update.title,
                          secrets,
                          allowUpdate: true,
                        });
                      }
                    }
                  : undefined,
            });
          } else {
            await client.close();
          }
        }
      }
  }

  private failOrInterruptNode(params: {
    project: Project;
    run: WorkflowRun;
    nodeRunId: string;
    stepId: string;
    agentId: string;
    ordinal: number;
    attempt: number;
    localSessionId: string | null;
    nodeState: "failed" | "interrupted" | "cancelled";
    runState: "failed" | "interrupted" | "cancelled";
    stopReason: string | null;
    errorCode: string;
    errorMessage: string;
    partialOutput: string;
  }): void {
    const now = new Date().toISOString();

    this.storage.sqlite.transaction(() => {
      this.storage.db
        .update(nodeRunsTable)
        .set({
          state: params.nodeState,
          stopReason: params.stopReason,
          errorCode: params.errorCode,
          errorMessage: params.errorMessage,
          finishedAt: now,
        })
        .where(eq(nodeRunsTable.id, params.nodeRunId))
        .run();

      this.storage.db
        .update(workflowRunsTable)
        .set({
          state: params.runState,
          errorCode: params.errorCode,
          errorMessage: params.errorMessage,
          updatedAt: now,
          finishedAt: params.runState === "interrupted" ? null : now,
        })
        .where(eq(workflowRunsTable.id, params.run.id))
        .run();

      if (params.localSessionId) {
        this.storage.db
          .update(agentSessionsTable)
          .set({
            state: params.nodeState === "interrupted" ? "interrupted" : "failed",
            updatedAt: now,
          })
          .where(eq(agentSessionsTable.id, params.localSessionId))
          .run();
      }

      if (params.runState === "interrupted") {
        this.storage.db
          .update(runCheckpointsTable)
          .set({
            recoveryMode: "needs_confirmation",
            updatedAt: now,
          })
          .where(eq(runCheckpointsTable.runId, params.run.id))
          .run();
      }
    })();

    if (params.partialOutput.trim().length > 0) {
      this.appendMessage({
        conversationId: params.run.conversationId,
        sessionId: params.localSessionId,
        nodeRunId: params.nodeRunId,
        agentId: params.agentId,
        role: "assistant",
        kind: "text",
        content: params.partialOutput.trim(),
        metadata: { partial: true, state: params.nodeState },
      });
    }

    if (params.runState !== "cancelled" && params.errorCode !== "CANCELLED") {
      const errMsg = this.appendMessage({
        conversationId: params.run.conversationId,
        sessionId: params.localSessionId,
        nodeRunId: params.nodeRunId,
        agentId: params.agentId,
        role: "system",
        kind: params.runState === "interrupted" ? "recovery_notice" : "error",
        content: params.errorMessage,
        metadata: {
          errorCode: params.errorCode,
          stopReason: params.stopReason,
          nodeRunId: params.nodeRunId,
        },
      });

      this.eventBus.emit({
        projectId: params.project.id,
        conversationId: params.run.conversationId,
        runId: params.run.id,
        nodeRunId: params.nodeRunId,
        type: "message.completed",
        payload: errMsg,
      });
    }

    this.eventBus.emit({
      projectId: params.project.id,
      conversationId: params.run.conversationId,
      runId: params.run.id,
      nodeRunId: params.nodeRunId,
      type: "node.state",
      payload: {
        stepId: params.stepId,
        agentId: params.agentId,
        ordinal: params.ordinal,
        attempt: params.attempt,
        state: params.nodeState,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
      },
    });

    this.eventBus.emit({
      projectId: params.project.id,
      conversationId: params.run.conversationId,
      runId: params.run.id,
      type: "run.state",
      payload: {
        state: params.runState,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
      },
    });
  }

  private setNodeState(
    projectId: string,
    conversationId: string,
    runId: string,
    nodeRunId: string,
    stepId: string,
    agentId: string,
    ordinal: number,
    attempt: number,
    state: NodeRun["state"]
  ): void {
    this.storage.db
      .update(nodeRunsTable)
      .set({ state })
      .where(eq(nodeRunsTable.id, nodeRunId))
      .run();

    this.eventBus.emit({
      projectId,
      conversationId,
      runId,
      nodeRunId,
      type: "node.state",
      payload: { stepId, agentId, ordinal, attempt, state },
    });
  }

  private setRunState(run: WorkflowRun, state: WorkflowRun["state"]): void {
    const now = new Date().toISOString();
    const isTerminal =
      state === "completed" || state === "cancelled" || state === "failed";
    this.storage.db
      .update(workflowRunsTable)
      .set({
        state,
        updatedAt: now,
        ...(isTerminal ? { finishedAt: now } : {}),
      })
      .where(eq(workflowRunsTable.id, run.id))
      .run();

    this.eventBus.emit({
      projectId: run.projectId,
      conversationId: run.conversationId,
      runId: run.id,
      type: "run.state",
      payload: { state },
    });
  }

  private hydrateRun(row: typeof workflowRunsTable.$inferSelect): WorkflowRun {
    return {
      id: row.id,
      conversationId: row.conversationId,
      projectId: row.projectId,
      workflowId: row.workflowId,
      workflowVersionId: row.workflowVersionId,
      workflowSnapshot: JSON.parse(
        row.workflowSnapshotJson
      ) as WorkflowDefinition,
      objective: row.objective,
      state: row.state as WorkflowRun["state"],
      pauseRequested: row.pauseRequested === 1,
      workspaceBaselineHead: row.workspaceBaselineHead,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      finishedAt: row.finishedAt,
    };
  }

  // =========================================================================
  // Settings, Storage, Export & Shutdown
  // =========================================================================

  getAllSettings(): Record<string, unknown> {
    const rows = this.storage.db.select().from(settingsTable).all();
    const out: Record<string, unknown> = {
      language: "zh-CN",
      theme: "light",
    };
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.valueJson);
      } catch {
        out[r.key] = r.valueJson;
      }
    }
    return out;
  }

  setSetting(key: string, value: unknown): Record<string, unknown> {
    const now = new Date().toISOString();
    this.storage.db
      .insert(settingsTable)
      .values({ key, valueJson: JSON.stringify(value), updatedAt: now })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { valueJson: JSON.stringify(value), updatedAt: now },
      })
      .run();
    return this.getAllSettings();
  }

  exportRecords(projectId?: string) {
    const projects = projectId
      ? [this.getProject(projectId)]
      : this.listProjects(true);
    const conversations = this.listConversations({
      projectId,
      includeArchived: true,
    });
    const workflows = this.listWorkflows(projectId);
    const runs = this.listRuns({ projectId, limit: 200 });
    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      projects,
      workflows,
      conversations: conversations.map((c) => ({
        ...c,
        messages: this.listMessages(c.id),
      })),
      runs: runs.map((r) => this.getRun(r.id)),
    };
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;

    // Mark active single-agent turns cancelled and release any pending permissions
    const activeTurns = Array.from(this.activeChatTurns.values());
    for (const turn of activeTurns) {
      turn.cancelled = true;
    }
    this.permissions.cancelAll();

    // Cancel active workflow runs gracefully with bounded timeout
    const runIds = Array.from(this.activeRuns.keys());
    await Promise.allSettled(runIds.map((id) => this.cancelRun(id)));

    // Close live chat ACP clients
    const chatClients = Array.from(this.liveChatClients.values());
    this.liveChatClients.clear();
    await Promise.allSettled(
      chatClients.map(async (c) => {
        await c.client.cancel(c.providerSessionId);
        await c.client.close();
      })
    );

    if (activeTurns.length > 0) {
      await Promise.race([
        Promise.allSettled(activeTurns.map((t) => t.promise)),
        new Promise<void>((r) => setTimeout(r, 2000)),
      ]);
    }

    // Close all warm pooled ACP clients
    const warmClients = Array.from(this.warmPool.values());
    this.warmPool.clear();
    await Promise.allSettled(
      warmClients.map(async (entry) => {
        clearTimeout(entry.idleTimer);
        await entry.client.close();
      })
    );

    this.storage.close();
  }
}
