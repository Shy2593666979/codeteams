import type { Database } from "bun:sqlite";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "0001_initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        canonical_path TEXT NOT NULL UNIQUE,
        git_root TEXT,
        created_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL,
        archived_at TEXT
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        vendor TEXT NOT NULL,
        official_url TEXT NOT NULL,
        logo_asset_id TEXT,
        source TEXT NOT NULL,
        registry_id TEXT,
        command TEXT NOT NULL,
        args_json TEXT NOT NULL,
        env_refs_json TEXT NOT NULL,
        pinned_version TEXT,
        installed_version TEXT,
        verification TEXT NOT NULL,
        automation_policy TEXT NOT NULL,
        automation_note TEXT,
        description TEXT,
        install_command_hint TEXT,
        detect_binary TEXT,
        capabilities_json TEXT,
        last_tested_at TEXT,
        last_error TEXT,
        is_custom INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        current_version INTEGER NOT NULL DEFAULT 1,
        latest_version_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflow_versions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_versions_wf_ver
        ON workflow_versions(workflow_id, version);

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        mode TEXT NOT NULL,
        agent_id TEXT,
        workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_project
        ON conversations(project_id);

      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
        workflow_version_id TEXT REFERENCES workflow_versions(id) ON DELETE SET NULL,
        workflow_snapshot_json TEXT NOT NULL,
        objective TEXT NOT NULL,
        state TEXT NOT NULL,
        pause_requested INTEGER NOT NULL DEFAULT 0,
        workspace_baseline_head TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_conv ON workflow_runs(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_proj ON workflow_runs(project_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_state ON workflow_runs(state);

      CREATE TABLE IF NOT EXISTS node_runs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL,
        stop_reason TEXT,
        error_code TEXT,
        error_message TEXT,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_node_runs_unique_attempt
        ON node_runs(run_id, step_id, attempt);
      CREATE INDEX IF NOT EXISTS idx_node_runs_run_ord
        ON node_runs(run_id, ordinal);

      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        node_run_id TEXT REFERENCES node_runs(id) ON DELETE SET NULL,
        agent_id TEXT NOT NULL,
        provider_session_id TEXT,
        cwd TEXT NOT NULL,
        runtime_version TEXT,
        can_load_session INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_conv ON agent_sessions(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_node_run ON agent_sessions(node_run_id);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
        node_run_id TEXT REFERENCES node_runs(id) ON DELETE SET NULL,
        agent_id TEXT,
        role TEXT NOT NULL,
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata_json TEXT,
        replayed INTEGER NOT NULL DEFAULT 0,
        dedupe_key TEXT,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages(conversation_id, seq);
      CREATE INDEX IF NOT EXISTS idx_messages_dedupe ON messages(conversation_id, dedupe_key);

      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL,
        conversation_id TEXT,
        run_id TEXT,
        node_run_id TEXT,
        session_id TEXT,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id, seq);
      CREATE INDEX IF NOT EXISTS idx_events_conv ON events(conversation_id, seq);

      CREATE TABLE IF NOT EXISTS run_checkpoints (
        run_id TEXT PRIMARY KEY REFERENCES workflow_runs(id) ON DELETE CASCADE,
        last_completed_step_id TEXT,
        last_completed_ordinal INTEGER NOT NULL DEFAULT -1,
        active_node_run_id TEXT,
        workspace_baseline TEXT,
        recovery_mode TEXT NOT NULL DEFAULT 'none',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS context_handoffs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        source_node_run_id TEXT NOT NULL REFERENCES node_runs(id) ON DELETE CASCADE,
        source_agent_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        source_event_start INTEGER NOT NULL,
        source_event_end INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_handoffs_run ON context_handoffs(run_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_handoffs_node_run ON context_handoffs(source_node_run_id);

      CREATE TABLE IF NOT EXISTS project_memories (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'user',
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        node_run_id TEXT NOT NULL REFERENCES node_runs(id) ON DELETE CASCADE,
        relative_path TEXT NOT NULL,
        kind TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);

      CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        conversation_id TEXT,
        run_id TEXT,
        node_run_id TEXT,
        agent_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        tool_title TEXT NOT NULL,
        tool_kind TEXT,
        locations_json TEXT,
        raw_input_json TEXT,
        options_json TEXT NOT NULL,
        decision TEXT,
        selected_option_id TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_permissions_pending ON permissions(decision, run_id);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
];

export function runMigrations(sqlite: Database): number[] {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = sqlite
    .query<{ version: number }, []>("SELECT version FROM schema_migrations")
    .all();
  const appliedSet = new Set(appliedRows.map((r) => r.version));
  const newlyApplied: number[] = [];

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.version)) continue;

    const tx = sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      sqlite
        .query(
          "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
        )
        .run(migration.version, migration.name, new Date().toISOString());
    });

    tx();
    newlyApplied.push(migration.version);
  }

  return newlyApplied;
}
