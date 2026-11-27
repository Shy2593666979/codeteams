import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const projectsTable = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  canonicalPath: text("canonical_path").notNull().unique(),
  gitRoot: text("git_root"),
  createdAt: text("created_at").notNull(),
  lastOpenedAt: text("last_opened_at").notNull(),
  archivedAt: text("archived_at"),
});

export const agentsTable = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  vendor: text("vendor").notNull(),
  officialUrl: text("official_url").notNull(),
  logoAssetId: text("logo_asset_id"),
  source: text("source").notNull(),
  registryId: text("registry_id"),
  command: text("command").notNull(),
  argsJson: text("args_json").notNull(),
  envRefsJson: text("env_refs_json").notNull(),
  pinnedVersion: text("pinned_version"),
  installedVersion: text("installed_version"),
  verification: text("verification").notNull(),
  automationPolicy: text("automation_policy").notNull(),
  automationNote: text("automation_note"),
  description: text("description"),
  installCommandHint: text("install_command_hint"),
  detectBinary: text("detect_binary"),
  capabilitiesJson: text("capabilities_json"),
  lastTestedAt: text("last_tested_at"),
  lastError: text("last_error"),
  isCustom: integer("is_custom").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const workflowsTable = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projectsTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  currentVersion: integer("current_version").notNull().default(1),
  latestVersionId: text("latest_version_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workflowVersionsTable = sqliteTable(
  "workflow_versions",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflowsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definitionJson: text("definition_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_workflow_versions_wf_ver").on(
      table.workflowId,
      table.version
    ),
  ]
);

export const conversationsTable = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    mode: text("mode").notNull(),
    agentId: text("agent_id"),
    workflowId: text("workflow_id").references(() => workflowsTable.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [index("idx_conversations_project").on(table.projectId)]
);

export const workflowRunsTable = sqliteTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id").references(() => workflowsTable.id, {
      onDelete: "set null",
    }),
    workflowVersionId: text("workflow_version_id").references(
      () => workflowVersionsTable.id,
      { onDelete: "set null" }
    ),
    workflowSnapshotJson: text("workflow_snapshot_json").notNull(),
    objective: text("objective").notNull(),
    state: text("state").notNull(),
    pauseRequested: integer("pause_requested").notNull().default(0),
    workspaceBaselineHead: text("workspace_baseline_head"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (table) => [
    index("idx_workflow_runs_conv").on(table.conversationId),
    index("idx_workflow_runs_proj").on(table.projectId),
    index("idx_workflow_runs_state").on(table.state),
  ]
);

export const nodeRunsTable = sqliteTable(
  "node_runs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRunsTable.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    agentId: text("agent_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    attempt: integer("attempt").notNull().default(1),
    state: text("state").notNull(),
    stopReason: text("stop_reason"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_node_runs_unique_attempt").on(
      table.runId,
      table.stepId,
      table.attempt
    ),
    index("idx_node_runs_run_ord").on(table.runId, table.ordinal),
  ]
);

export const agentSessionsTable = sqliteTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    nodeRunId: text("node_run_id").references(() => nodeRunsTable.id, {
      onDelete: "set null",
    }),
    agentId: text("agent_id").notNull(),
    providerSessionId: text("provider_session_id"),
    cwd: text("cwd").notNull(),
    runtimeVersion: text("runtime_version"),
    canLoadSession: integer("can_load_session").notNull().default(0),
    state: text("state").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_agent_sessions_conv").on(table.conversationId),
    index("idx_agent_sessions_node_run").on(table.nodeRunId),
  ]
);

export const messagesTable = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => agentSessionsTable.id, {
      onDelete: "set null",
    }),
    nodeRunId: text("node_run_id").references(() => nodeRunsTable.id, {
      onDelete: "set null",
    }),
    agentId: text("agent_id"),
    role: text("role").notNull(),
    seq: integer("seq").notNull(),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    metadataJson: text("metadata_json"),
    replayed: integer("replayed").notNull().default(0),
    dedupeKey: text("dedupe_key"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_messages_conv_seq").on(table.conversationId, table.seq),
    index("idx_messages_dedupe").on(table.conversationId, table.dedupeKey),
  ]
);

export const eventsTable = sqliteTable(
  "events",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    eventId: text("event_id").notNull().unique(),
    projectId: text("project_id").notNull(),
    conversationId: text("conversation_id"),
    runId: text("run_id"),
    nodeRunId: text("node_run_id"),
    sessionId: text("session_id"),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_events_run").on(table.runId, table.seq),
    index("idx_events_conv").on(table.conversationId, table.seq),
  ]
);

export const runCheckpointsTable = sqliteTable("run_checkpoints", {
  runId: text("run_id")
    .primaryKey()
    .references(() => workflowRunsTable.id, { onDelete: "cascade" }),
  lastCompletedStepId: text("last_completed_step_id"),
  lastCompletedOrdinal: integer("last_completed_ordinal").notNull().default(-1),
  activeNodeRunId: text("active_node_run_id"),
  workspaceBaseline: text("workspace_baseline"),
  recoveryMode: text("recovery_mode").notNull().default("none"),
  updatedAt: text("updated_at").notNull(),
});

export const contextHandoffsTable = sqliteTable(
  "context_handoffs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRunsTable.id, { onDelete: "cascade" }),
    sourceNodeRunId: text("source_node_run_id")
      .notNull()
      .references(() => nodeRunsTable.id, { onDelete: "cascade" }),
    sourceAgentId: text("source_agent_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    sourceEventStart: integer("source_event_start").notNull(),
    sourceEventEnd: integer("source_event_end").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_handoffs_run").on(table.runId, table.createdAt),
    uniqueIndex("idx_handoffs_node_run").on(table.sourceNodeRunId),
  ]
);

export const projectMemoriesTable = sqliteTable("project_memories", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  source: text("source").notNull().default("user"),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const artifactsTable = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRunsTable.id, { onDelete: "cascade" }),
    nodeRunId: text("node_run_id")
      .notNull()
      .references(() => nodeRunsTable.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    kind: text("kind").notNull(),
    contentHash: text("content_hash").notNull(),
    size: integer("size").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_artifacts_run").on(table.runId)]
);

export const permissionsTable = sqliteTable(
  "permissions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    conversationId: text("conversation_id"),
    runId: text("run_id"),
    nodeRunId: text("node_run_id"),
    agentId: text("agent_id").notNull(),
    projectId: text("project_id").notNull(),
    requestId: text("request_id").notNull(),
    toolTitle: text("tool_title").notNull(),
    toolKind: text("tool_kind"),
    locationsJson: text("locations_json"),
    rawInputJson: text("raw_input_json"),
    optionsJson: text("options_json").notNull(),
    decision: text("decision"),
    selectedOptionId: text("selected_option_id"),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [index("idx_permissions_pending").on(table.decision, table.runId)]
);

export const settingsTable = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const idempotencyKeysTable = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  scope: text("scope").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: text("created_at").notNull(),
});
