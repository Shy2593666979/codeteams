import { z } from "zod";
import { CoreErrorPayloadSchema } from "./errors";
import {
  AgentDefinitionSchema,
  ConversationModeSchema,
  PermissionModeSchema,
  WorkflowDefinitionSchema,
} from "./models";

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.unknown().optional(),
});
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number().int(),
      message: z.string(),
      data: CoreErrorPayloadSchema.optional(),
    })
    .optional(),
});
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

export const JsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.unknown().optional(),
});
export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;

// RPC Params Schemas
export const RpcSchemas = {
  "system.ping": z.object({}).optional(),
  "system.info": z.object({}).optional(),

  // Projects
  "projects.list": z
    .object({ includeArchived: z.boolean().optional() })
    .optional(),
  "projects.open": z.object({ path: z.string().min(1), name: z.string().optional() }),
  "projects.get": z.object({ projectId: z.string().min(1) }),
  "projects.archive": z.object({ projectId: z.string().min(1), archived: z.boolean().default(true) }),
  "projects.workspaceStatus": z.object({ projectId: z.string().min(1) }),
  "projects.listFiles": z.object({
    projectId: z.string().min(1),
    relativePath: z.string().optional(),
  }),
  "projects.readFile": z.object({
    projectId: z.string().min(1),
    relativePath: z.string().min(1),
  }),
  "projects.gitDiff": z.object({
    projectId: z.string().min(1),
    relativePath: z.string().optional(),
  }),
  "projects.memory.get": z.object({ projectId: z.string().min(1) }),
  "projects.memory.update": z.object({
    projectId: z.string().min(1),
    content: z.string(),
  }),

  // Agents
  "agents.list": z.object({}).optional(),
  "agents.detect": z.object({ agentId: z.string().optional() }).optional(),
  "agents.configure": z.object({
    id: z.string().min(1),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    envRefs: z.record(z.string(), z.string()).optional(),
    automationPolicy: z.enum(["allowed", "restricted", "unknown"]).optional(),
    name: z.string().min(1).optional(),
    vendor: z.string().min(1).optional(),
    officialUrl: z.string().url().optional(),
  }),
  "agents.registerCustom": AgentDefinitionSchema.pick({
    id: true,
    name: true,
    vendor: true,
    officialUrl: true,
    command: true,
    args: true,
    description: true,
    automationPolicy: true,
  }),
  "agents.testConnection": z.object({
    agentId: z.string().min(1),
    cwd: z.string().optional(),
    envOverrides: z.record(z.string(), z.string()).optional(),
  }),
  "agents.capabilities": z.object({ agentId: z.string().min(1) }),
  "agents.setSecret": z.object({
    agentId: z.string().min(1),
    envKey: z.string().min(1),
    value: z.string(),
  }),

  // Conversations
  "conversations.list": z
    .object({
      projectId: z.string().optional(),
      includeArchived: z.boolean().optional(),
      search: z.string().optional(),
    })
    .optional(),
  "conversations.create": z.object({
    projectId: z.string().min(1),
    title: z.string().min(1).optional(),
    mode: ConversationModeSchema,
    agentId: z.string().optional(),
    workflowId: z.string().optional(),
  }),
  "conversations.get": z.object({ conversationId: z.string().min(1) }),
  "conversations.send": z.object({
    conversationId: z.string().min(1),
    content: z.string().min(1),
    idempotencyKey: z.string().min(1).optional(),
    mode: ConversationModeSchema.optional(),
    agentId: z.string().optional(),
    workflowId: z.string().optional(),
    permissionMode: PermissionModeSchema.optional(),
    allowRestrictedAutomation: z.boolean().optional(),
    async: z.boolean().optional(),
  }),
  "conversations.cancel": z.object({ conversationId: z.string().min(1) }),
  "conversations.rename": z.object({
    conversationId: z.string().min(1),
    title: z.string().min(1),
  }),
  "conversations.archive": z.object({
    conversationId: z.string().min(1),
    archived: z.boolean().default(true),
  }),
  "conversations.delete": z.object({
    conversationId: z.string().min(1),
  }),

  // Workflows
  "workflows.list": z.object({ projectId: z.string().optional() }).optional(),
  "workflows.get": z.object({ workflowId: z.string().min(1) }),
  "workflows.save": z.object({
    id: z.string().optional(),
    projectId: z.string().nullable().optional(),
    name: z.string().min(1),
    steps: WorkflowDefinitionSchema.shape.steps,
    edges: WorkflowDefinitionSchema.shape.edges,
  }),
  "workflows.validate": z.object({
    definition: WorkflowDefinitionSchema,
  }),
  "workflows.delete": z.object({ workflowId: z.string().min(1) }),

  // Runs
  "runs.start": z.object({
    projectId: z.string().min(1),
    conversationId: z.string().optional(),
    workflowId: z.string().min(1),
    objective: z.string().min(1),
    idempotencyKey: z.string().min(1).optional(),
    permissionMode: PermissionModeSchema.optional(),
    allowRestrictedAutomation: z.boolean().optional(),
  }),
  "runs.get": z.object({ runId: z.string().min(1) }),
  "runs.list": z
    .object({
      projectId: z.string().optional(),
      conversationId: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    })
    .optional(),
  "runs.cancel": z.object({ runId: z.string().min(1) }),
  "runs.pauseAfterCurrent": z.object({ runId: z.string().min(1) }),
  "runs.resume": z.object({
    runId: z.string().min(1),
    confirmSideEffectsReviewed: z.boolean().optional(),
  }),
  "runs.retryNode": z.object({
    runId: z.string().min(1),
    nodeRunId: z.string().min(1),
    confirmRetry: z.boolean().optional(),
  }),

  // Permissions
  "permissions.listPending": z
    .object({ runId: z.string().optional(), conversationId: z.string().optional() })
    .optional(),
  "permissions.respond": z.object({
    permissionId: z.string().min(1),
    outcome: z.enum(["selected", "cancelled"]),
    optionId: z.string().optional(),
  }),

  // Context
  "context.getHandoff": z.object({ runId: z.string().min(1) }),
  "context.getProjectMemory": z.object({ projectId: z.string().min(1) }),
  "context.getSnapshot": z.object({
    runId: z.string().optional(),
    conversationId: z.string().optional(),
  }),

  // Events
  "events.snapshotAfterCursor": z.object({
    afterSeq: z.number().int().min(0).default(0),
    projectId: z.string().optional(),
    conversationId: z.string().optional(),
    runId: z.string().optional(),
    limit: z.number().int().positive().max(1000).default(500),
  }),

  // Storage & Settings
  "storage.backup": z.object({}).optional(),
  "storage.export": z.object({ projectId: z.string().optional() }).optional(),
  "storage.diagnostics": z.object({}).optional(),
  "settings.getAll": z.object({}).optional(),
  "settings.set": z.object({ key: z.string().min(1), value: z.unknown() }),
} as const;

export type RpcMethod = keyof typeof RpcSchemas;
export type RpcParams<M extends RpcMethod> = z.infer<(typeof RpcSchemas)[M]>;
