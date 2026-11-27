import { randomUUID } from "node:crypto";
import type * as acp from "@agentclientprotocol/sdk";
import {
  CoreError,
  type PermissionOption,
  type PermissionRequest,
} from "@codeteams/shared";
import { permissionsTable, type CodeTeamsStorage } from "@codeteams/storage";
import { and, eq, isNull } from "drizzle-orm";
import type { CoreEventBus } from "./event-bus";

interface PendingResolver {
  resolve: (response: acp.RequestPermissionResponse) => void;
  options: PermissionOption[];
  projectId: string;
  conversationId?: string;
  runId?: string;
  nodeRunId?: string;
  sessionId: string;
}

export class PermissionBroker {
  private readonly pending = new Map<string, PendingResolver>();

  constructor(
    private readonly storage: CodeTeamsStorage,
    private readonly eventBus: CoreEventBus
  ) {}

  async requestPermission(params: {
    projectId: string;
    conversationId?: string;
    runId?: string;
    nodeRunId?: string;
    sessionId: string;
    agentId: string;
    acpRequest: acp.RequestPermissionRequest;
    autoApprove?: boolean;
    onWaiting?: () => void;
    onResumed?: () => void;
  }): Promise<acp.RequestPermissionResponse> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    const options: PermissionOption[] = params.acpRequest.options.map((o) => ({
      optionId: o.optionId,
      name: o.name,
      kind: o.kind,
    }));

    const locations = (params.acpRequest.toolCall.locations ?? []).map(
      (loc) => loc.path
    );
    const toolTitle =
      params.acpRequest.toolCall.title ?? "Agent tool action requires approval";
    const toolKind = params.acpRequest.toolCall.kind ?? null;
    const requestId = params.acpRequest.toolCall.toolCallId;

    // When the user explicitly enabled Full Access (最高权限), auto-select the highest allow option
    // while still recording the full audit entry in SQLite and emitting permission.resolved!
    if (params.autoApprove) {
      const preferred =
        options.find((o) => o.kind === "allow_always") ??
        options.find((o) => o.kind === "allow_once");
      if (preferred) {
        const resolvedAt = new Date().toISOString();
        this.storage.db
          .insert(permissionsTable)
          .values({
            id,
            sessionId: params.sessionId,
            conversationId: params.conversationId ?? null,
            runId: params.runId ?? null,
            nodeRunId: params.nodeRunId ?? null,
            agentId: params.agentId,
            projectId: params.projectId,
            requestId,
            toolTitle,
            toolKind,
            locationsJson: JSON.stringify(locations),
            rawInputJson:
              params.acpRequest.toolCall.rawInput !== undefined
                ? JSON.stringify(params.acpRequest.toolCall.rawInput)
                : null,
            optionsJson: JSON.stringify(options),
            decision: "auto_approved",
            selectedOptionId: preferred.optionId,
            createdAt,
            resolvedAt,
          })
          .run();

        const record: PermissionRequest = {
          id,
          sessionId: params.sessionId,
          conversationId: params.conversationId ?? null,
          runId: params.runId ?? null,
          nodeRunId: params.nodeRunId ?? null,
          agentId: params.agentId,
          projectId: params.projectId,
          requestId,
          toolTitle,
          toolKind,
          locations,
          rawInput: params.acpRequest.toolCall.rawInput,
          options,
          decision: "auto_approved",
          selectedOptionId: preferred.optionId,
          createdAt,
          resolvedAt,
        };

        this.eventBus.emit({
          projectId: params.projectId,
          conversationId: params.conversationId,
          runId: params.runId,
          nodeRunId: params.nodeRunId,
          sessionId: params.sessionId,
          type: "permission.resolved",
          payload: record,
        });

        return {
          outcome: {
            outcome: "selected",
            optionId: preferred.optionId,
          },
        };
      }
    }

    this.storage.db
      .insert(permissionsTable)
      .values({
        id,
        sessionId: params.sessionId,
        conversationId: params.conversationId ?? null,
        runId: params.runId ?? null,
        nodeRunId: params.nodeRunId ?? null,
        agentId: params.agentId,
        projectId: params.projectId,
        requestId,
        toolTitle,
        toolKind,
        locationsJson: JSON.stringify(locations),
        rawInputJson:
          params.acpRequest.toolCall.rawInput !== undefined
            ? JSON.stringify(params.acpRequest.toolCall.rawInput)
            : null,
        optionsJson: JSON.stringify(options),
        decision: null,
        selectedOptionId: null,
        createdAt,
        resolvedAt: null,
      })
      .run();

    params.onWaiting?.();

    const record: PermissionRequest = {
      id,
      sessionId: params.sessionId,
      conversationId: params.conversationId ?? null,
      runId: params.runId ?? null,
      nodeRunId: params.nodeRunId ?? null,
      agentId: params.agentId,
      projectId: params.projectId,
      requestId,
      toolTitle,
      toolKind,
      locations,
      rawInput: params.acpRequest.toolCall.rawInput,
      options,
      decision: null,
      selectedOptionId: null,
      createdAt,
      resolvedAt: null,
    };

    const response = await new Promise<acp.RequestPermissionResponse>(
      (resolve) => {
        this.pending.set(id, {
          resolve,
          options,
          projectId: params.projectId,
          conversationId: params.conversationId,
          runId: params.runId,
          nodeRunId: params.nodeRunId,
          sessionId: params.sessionId,
        });

        this.eventBus.emit({
          projectId: params.projectId,
          conversationId: params.conversationId,
          runId: params.runId,
          nodeRunId: params.nodeRunId,
          sessionId: params.sessionId,
          type: "permission.requested",
          payload: record,
        });
      }
    );

    params.onResumed?.();
    return response;
  }

  respond(params: {
    permissionId: string;
    outcome: "selected" | "cancelled";
    optionId?: string;
  }): PermissionRequest {
    const existing = this.storage.db
      .select()
      .from(permissionsTable)
      .where(eq(permissionsTable.id, params.permissionId))
      .get();

    if (!existing) {
      throw new CoreError(
        "NOT_FOUND",
        `Permission request "${params.permissionId}" not found`
      );
    }

    const entry = this.pending.get(params.permissionId);
    const options = JSON.parse(existing.optionsJson) as PermissionOption[];

    let acpResponse: acp.RequestPermissionResponse;
    let decisionLabel: string;
    let selectedOptionId: string | null = null;

    if (params.outcome === "selected") {
      const matched = options.find((o) => o.optionId === params.optionId);
      if (!matched) {
        throw new CoreError(
          "VALIDATION_ERROR",
          `Invalid permission optionId "${params.optionId ?? ""}"`
        );
      }
      selectedOptionId = matched.optionId;
      decisionLabel = matched.kind;
      acpResponse = {
        outcome: {
          outcome: "selected",
          optionId: matched.optionId,
        },
      };
    } else {
      decisionLabel = "cancelled";
      acpResponse = {
        outcome: {
          outcome: "cancelled",
        },
      };
    }

    const resolvedAt = new Date().toISOString();
    this.storage.db
      .update(permissionsTable)
      .set({
        decision: decisionLabel,
        selectedOptionId,
        resolvedAt,
      })
      .where(eq(permissionsTable.id, params.permissionId))
      .run();

    if (entry) {
      this.pending.delete(params.permissionId);
      entry.resolve(acpResponse);
    }

    const updated: PermissionRequest = {
      id: existing.id,
      sessionId: existing.sessionId,
      conversationId: existing.conversationId,
      runId: existing.runId,
      nodeRunId: existing.nodeRunId,
      agentId: existing.agentId,
      projectId: existing.projectId,
      requestId: existing.requestId,
      toolTitle: existing.toolTitle,
      toolKind: existing.toolKind,
      locations: existing.locationsJson
        ? (JSON.parse(existing.locationsJson) as string[])
        : [],
      rawInput: existing.rawInputJson
        ? JSON.parse(existing.rawInputJson)
        : undefined,
      options,
      decision: decisionLabel,
      selectedOptionId,
      createdAt: existing.createdAt,
      resolvedAt,
    };

    this.eventBus.emit({
      projectId: existing.projectId,
      conversationId: existing.conversationId ?? undefined,
      runId: existing.runId ?? undefined,
      nodeRunId: existing.nodeRunId ?? undefined,
      sessionId: existing.sessionId,
      type: "permission.resolved",
      payload: updated,
    });

    return updated;
  }

  cancelAllForScope(scope: { runId?: string; conversationId?: string }): void {
    for (const [id, entry] of this.pending.entries()) {
      const matchRun = scope.runId && entry.runId === scope.runId;
      const matchConv =
        scope.conversationId && entry.conversationId === scope.conversationId;
      if (matchRun || matchConv) {
        this.respond({ permissionId: id, outcome: "cancelled" });
      }
    }
  }

  cancelAll(): void {
    for (const id of Array.from(this.pending.keys())) {
      this.respond({ permissionId: id, outcome: "cancelled" });
    }
  }

  /**
   * Marks any unresolved permission records left over from a previous process
   * as cancelled on startup, because their in-memory ACP resolvers no longer exist.
   */
  reconcileOnStartup(): number {
    const stale = this.storage.db
      .select({ id: permissionsTable.id })
      .from(permissionsTable)
      .where(isNull(permissionsTable.decision))
      .all();
    if (stale.length === 0) return 0;

    const now = new Date().toISOString();
    this.storage.db
      .update(permissionsTable)
      .set({
        decision: "cancelled",
        selectedOptionId: null,
        resolvedAt: now,
      })
      .where(isNull(permissionsTable.decision))
      .run();

    return stale.length;
  }

  listPending(filter?: {
    runId?: string;
    conversationId?: string;
  }): PermissionRequest[] {
    const conditions = [isNull(permissionsTable.decision)];
    if (filter?.runId) {
      conditions.push(eq(permissionsTable.runId, filter.runId));
    }
    if (filter?.conversationId) {
      conditions.push(eq(permissionsTable.conversationId, filter.conversationId));
    }

    const rows = this.storage.db
      .select()
      .from(permissionsTable)
      .where(and(...conditions))
      .all();

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      conversationId: row.conversationId,
      runId: row.runId,
      nodeRunId: row.nodeRunId,
      agentId: row.agentId,
      projectId: row.projectId,
      requestId: row.requestId,
      toolTitle: row.toolTitle,
      toolKind: row.toolKind,
      locations: row.locationsJson ? (JSON.parse(row.locationsJson) as string[]) : [],
      rawInput: row.rawInputJson ? JSON.parse(row.rawInputJson) : undefined,
      options: JSON.parse(row.optionsJson) as PermissionOption[],
      decision: row.decision,
      selectedOptionId: row.selectedOptionId,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    }));
  }
}
