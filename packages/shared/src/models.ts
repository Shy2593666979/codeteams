import { z } from "zod";

export const AgentSourceSchema = z.enum([
  "registry",
  "vendor",
  "community",
  "custom",
]);
export type AgentSource = z.infer<typeof AgentSourceSchema>;

export const AgentVerificationSchema = z.enum([
  "unverified",
  "verified",
  "unsupported",
]);
export type AgentVerification = z.infer<typeof AgentVerificationSchema>;

export const AutomationPolicySchema = z.enum([
  "allowed",
  "restricted",
  "unknown",
]);
export type AutomationPolicy = z.infer<typeof AutomationPolicySchema>;

export const AgentInstallStateSchema = z.enum([
  "not_installed",
  "installed",
  "via_npx",
  "unknown",
]);
export type AgentInstallState = z.infer<typeof AgentInstallStateSchema>;

export const AgentAuthStateSchema = z.enum([
  "ready",
  "auth_required",
  "restricted",
  "unknown",
]);
export type AgentAuthState = z.infer<typeof AgentAuthStateSchema>;

export const AgentConnectionStateSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "error",
]);
export type AgentConnectionState = z.infer<typeof AgentConnectionStateSchema>;

export const AgentDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  vendor: z.string().min(1),
  officialUrl: z.string().url(),
  logoAssetId: z.string().nullable(),
  source: AgentSourceSchema,
  registryId: z.string().nullable().optional(),
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()),
  envRefs: z.record(z.string(), z.string()),
  pinnedVersion: z.string().optional(),
  installedVersion: z.string().optional(),
  verification: AgentVerificationSchema,
  automationPolicy: AutomationPolicySchema,
  automationNote: z.string().optional(),
  description: z.string().optional(),
  installCommandHint: z.string().optional(),
  detectBinary: z.string().optional(),
  supportsLoadSession: z.boolean().optional(),
  custom: z.boolean().optional(),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const AgentRuntimeStatusSchema = z.object({
  agentId: z.string(),
  installState: AgentInstallStateSchema,
  resolvedExecutable: z.string().nullable(),
  authState: AgentAuthStateSchema,
  connectionState: AgentConnectionStateSchema,
  lastTestedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  protocolVersion: z.number().nullable().optional(),
  capabilities: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type AgentRuntimeStatus = z.infer<typeof AgentRuntimeStatusSchema>;

export const AgentWithStatusSchema = AgentDefinitionSchema.extend({
  status: AgentRuntimeStatusSchema,
});
export type AgentWithStatus = z.infer<typeof AgentWithStatusSchema>;

// Projects
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  canonicalPath: z.string(),
  gitRoot: z.string().nullable(),
  gitBranch: z.string().nullable().optional(),
  isGitRepo: z.boolean().optional(),
  hasUncommittedChanges: z.boolean().optional(),
  createdAt: z.string(),
  lastOpenedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectRuleFileSchema = z.object({
  relativePath: z.string(),
  content: z.string(),
  modifiedAt: z.string(),
  size: z.number(),
});
export type ProjectRuleFile = z.infer<typeof ProjectRuleFileSchema>;

export const ProjectMemorySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  content: z.string(),
  source: z.enum(["user", "rule_file", "task_summary"]),
  revision: z.number().int(),
  updatedAt: z.string(),
});
export type ProjectMemory = z.infer<typeof ProjectMemorySchema>;

// Workflows (Coding-Agent-only DAGs supporting both linear chains and parallel branches/joins)
export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  profileId: z.string().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  steps: z.array(WorkflowStepSchema),
  /**
   * Optional explicit directed edges between step IDs (supports parallel branches and joins,
   * e.g. 1->2, 1->3, 2->4, 3->4). When omitted, legacy linear chaining steps[i] -> steps[i+1] applies.
   */
  edges: z.array(WorkflowEdgeSchema).optional(),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const WorkflowRecordSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  name: z.string(),
  currentVersion: z.number().int(),
  latestVersionId: z.string(),
  definition: WorkflowDefinitionSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowRecord = z.infer<typeof WorkflowRecordSchema>;

// Conversations & Messages
export const ConversationModeSchema = z.enum(["single", "workflow"]);
export type ConversationMode = z.infer<typeof ConversationModeSchema>;

export const PermissionModeSchema = z.enum(["ask", "full_access"]);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

export const ChatTurnStateSchema = z.enum([
  "running",
  "waiting_permission",
  "completed",
  "failed",
  "cancelled",
]);
export type ChatTurnState = z.infer<typeof ChatTurnStateSchema>;

export const ActiveChatTurnSchema = z.object({
  agentId: z.string(),
  state: z.enum(["running", "waiting_permission"]),
  startedAt: z.string(),
});
export type ActiveChatTurn = z.infer<typeof ActiveChatTurnSchema>;

export interface TurnToolLocation {
  path: string;
  line?: number | null;
}

export interface TurnToolDiff {
  path: string;
  oldText: string | null;
  newText: string;
}

export interface TurnTextSegment {
  type: "text";
  text: string;
}

export interface TurnThoughtSegment {
  type: "thought";
  text: string;
  startedAt?: number;
  durationMs?: number;
}

export interface TurnToolSegment {
  type: "tool";
  toolCallId: string;
  agentId?: string;
  title: string;
  kind: string;
  status: string;
  locations: TurnToolLocation[];
  rawInputPreview: string | null;
  rawOutputPreview: string | null;
  contentPreview: string | null;
  diffs?: TurnToolDiff[];
  autoApproved?: boolean;
}

export interface TurnPlanEntry {
  content: string;
  status: string;
  priority?: string;
}

export interface TurnPlanSegment {
  type: "plan";
  agentId?: string;
  entries: TurnPlanEntry[];
}

export type TurnSegment =
  | TurnTextSegment
  | TurnThoughtSegment
  | TurnToolSegment
  | TurnPlanSegment;

export const ConversationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  mode: ConversationModeSchema,
  agentId: z.string().nullable(),
  workflowId: z.string().nullable(),
  latestRunId: z.string().nullable().optional(),
  latestRunState: z.string().nullable().optional(),
  activeTurn: ActiveChatTurnSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const MessageRoleSchema = z.enum(["user", "assistant", "system", "tool"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageKindSchema = z.enum([
  "text",
  "tool_call",
  "plan",
  "permission",
  "handoff",
  "recovery_notice",
  "error",
]);
export type MessageKind = z.infer<typeof MessageKindSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  sessionId: z.string().nullable(),
  nodeRunId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  role: MessageRoleSchema,
  seq: z.number().int(),
  kind: MessageKindSchema,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  replayed: z.boolean().optional(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

// Sessions
export const AgentSessionStateSchema = z.enum([
  "active",
  "idle",
  "interrupted",
  "closed",
  "failed",
]);
export type AgentSessionState = z.infer<typeof AgentSessionStateSchema>;

export const AgentSessionSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  nodeRunId: z.string().nullable(),
  agentId: z.string(),
  providerSessionId: z.string().nullable(),
  cwd: z.string(),
  runtimeVersion: z.string().nullable(),
  canLoadSession: z.boolean(),
  state: AgentSessionStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentSession = z.infer<typeof AgentSessionSchema>;

// Runs, NodeRuns, Checkpoints, Handoffs
export const NodeRunStateSchema = z.enum([
  "pending",
  "running",
  "waiting_permission",
  "completed",
  "failed",
  "interrupted",
  "cancelled",
]);
export type NodeRunState = z.infer<typeof NodeRunStateSchema>;

export const WorkflowRunStateSchema = z.enum([
  "queued",
  "running",
  "waiting_permission",
  "paused",
  "interrupted",
  "failed",
  "cancelled",
  "completed",
]);
export type WorkflowRunState = z.infer<typeof WorkflowRunStateSchema>;

export const NodeRunSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string(),
  agentId: z.string(),
  ordinal: z.number().int(),
  attempt: z.number().int(),
  state: NodeRunStateSchema,
  stopReason: z.string().nullable(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NodeRun = z.infer<typeof NodeRunSchema>;

export const WorkflowRunSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  projectId: z.string(),
  workflowId: z.string().nullable(),
  workflowVersionId: z.string().nullable(),
  workflowSnapshot: WorkflowDefinitionSchema,
  objective: z.string(),
  state: WorkflowRunStateSchema,
  pauseRequested: z.boolean().optional(),
  workspaceBaselineHead: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const RunCheckpointSchema = z.object({
  runId: z.string(),
  lastCompletedStepId: z.string().nullable(),
  lastCompletedOrdinal: z.number().int(),
  activeNodeRunId: z.string().nullable(),
  workspaceBaseline: z.string().nullable(),
  recoveryMode: z
    .enum(["none", "session_resumed", "context_rebuilt", "needs_confirmation"])
    .optional(),
  updatedAt: z.string(),
});
export type RunCheckpoint = z.infer<typeof RunCheckpointSchema>;

export const ContextHandoffSchema = z.object({
  id: z.string().optional(),
  runId: z.string(),
  sourceNodeRunId: z.string(),
  sourceAgentId: z.string(),
  objective: z.string(),
  summary: z.string(),
  decisions: z.array(z.string()),
  completed: z.array(z.string()),
  pending: z.array(z.string()),
  artifacts: z.array(
    z.object({
      id: z.string(),
      relativePath: z.string(),
      sha256: z.string().optional(),
    })
  ),
  changedFiles: z.array(z.string()),
  unresolvedIssues: z.array(z.string()),
  constraints: z.array(z.string()),
  gitHead: z.string().optional(),
  sourceEventRange: z.tuple([z.number().int(), z.number().int()]),
  createdAt: z.string().optional(),
});
export type ContextHandoff = z.infer<typeof ContextHandoffSchema>;

export const ArtifactSchema = z.object({
  id: z.string(),
  runId: z.string(),
  nodeRunId: z.string(),
  relativePath: z.string(),
  kind: z.string(),
  contentHash: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

// Permissions
export const PermissionOptionSchema = z.object({
  optionId: z.string(),
  name: z.string(),
  kind: z.enum(["allow_once", "allow_always", "reject_once", "reject_always"]),
});
export type PermissionOption = z.infer<typeof PermissionOptionSchema>;

export const PermissionRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  conversationId: z.string().nullable().optional(),
  runId: z.string().nullable().optional(),
  nodeRunId: z.string().nullable().optional(),
  agentId: z.string(),
  projectId: z.string(),
  requestId: z.string(),
  toolTitle: z.string(),
  toolKind: z.string().nullable().optional(),
  locations: z.array(z.string()).optional(),
  rawInput: z.unknown().optional(),
  options: z.array(PermissionOptionSchema),
  decision: z.string().nullable(),
  selectedOptionId: z.string().nullable().optional(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type PermissionRequest = z.infer<typeof PermissionRequestSchema>;

// Core Events
export const CoreEventTypeSchema = z.enum([
  "message.delta",
  "thought.delta",
  "message.completed",
  "tool.started",
  "tool.updated",
  "tool.completed",
  "plan.updated",
  "permission.requested",
  "permission.resolved",
  "agent.connection",
  "conversation.updated",
  "chat.state",
  "node.state",
  "run.state",
  "context.handoff.saved",
  "workspace.changed",
  "system.notice",
]);
export type CoreEventType = z.infer<typeof CoreEventTypeSchema>;

export const CoreEventSchema = z.object({
  eventId: z.string(),
  seq: z.number().int(),
  timestamp: z.string(),
  projectId: z.string(),
  conversationId: z.string().optional(),
  runId: z.string().optional(),
  nodeRunId: z.string().optional(),
  sessionId: z.string().optional(),
  type: z.string(),
  payload: z.unknown(),
});
export type CoreEvent = z.infer<typeof CoreEventSchema>;

export const WorkspaceStatusSchema = z.object({
  projectId: z.string(),
  canonicalPath: z.string(),
  isGitRepo: z.boolean(),
  gitRoot: z.string().nullable(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
  changedFiles: z.array(
    z.object({
      path: z.string(),
      status: z.string(),
    })
  ),
  diffSummary: z.string(),
  lockedByRunId: z.string().nullable(),
});
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export const WorkspaceTreeEntrySchema = z.object({
  name: z.string(),
  relativePath: z.string(),
  kind: z.enum(["dir", "file"]),
  size: z.number().optional(),
  gitStatus: z.string().nullable().optional(),
});
export type WorkspaceTreeEntry = z.infer<typeof WorkspaceTreeEntrySchema>;

export const WorkspaceFilePreviewSchema = z.object({
  relativePath: z.string(),
  content: z.string(),
  size: z.number(),
  truncated: z.boolean(),
  binary: z.boolean(),
});
export type WorkspaceFilePreview = z.infer<typeof WorkspaceFilePreviewSchema>;

export const WorkspaceGitDiffSchema = z.object({
  isGitRepo: z.boolean(),
  relativePath: z.string().nullable(),
  diff: z.string(),
  truncated: z.boolean(),
});
export type WorkspaceGitDiff = z.infer<typeof WorkspaceGitDiffSchema>;
