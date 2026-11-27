import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import * as schema from "./schema";
import { runMigrations } from "./migrations";

export type CodeTeamsDb = BunSQLiteDatabase<typeof schema>;

export interface StoragePaths {
  userDataDir: string;
  dataDir: string;
  dbPath: string;
  artifactsDir: string;
  worktreesDir: string;
  logsDir: string;
  backupsDir: string;
  registryCacheDir: string;
  logosCacheDir: string;
}

export function resolveStoragePaths(userDataDir: string): StoragePaths {
  const root = resolve(userDataDir);
  return {
    userDataDir: root,
    dataDir: join(root, "data"),
    dbPath: join(root, "data", "codeteams.db"),
    artifactsDir: join(root, "artifacts"),
    worktreesDir: join(root, "worktrees"),
    logsDir: join(root, "logs"),
    backupsDir: join(root, "backups"),
    registryCacheDir: join(root, "cache", "registry"),
    logosCacheDir: join(root, "cache", "logos"),
  };
}

export class CodeTeamsStorage {
  readonly paths: StoragePaths;
  readonly sqlite: Database;
  readonly db: CodeTeamsDb;
  readonly appliedMigrations: number[];

  constructor(userDataDir: string) {
    this.paths = resolveStoragePaths(userDataDir);
    mkdirSync(this.paths.dataDir, { recursive: true });
    mkdirSync(this.paths.artifactsDir, { recursive: true });
    mkdirSync(this.paths.logsDir, { recursive: true });
    mkdirSync(this.paths.backupsDir, { recursive: true });
    mkdirSync(this.paths.registryCacheDir, { recursive: true });
    mkdirSync(this.paths.logosCacheDir, { recursive: true });

    this.sqlite = new Database(this.paths.dbPath, { create: true });
    // Durable single-writer WAL configuration per Spec Section 7
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    this.sqlite.exec("PRAGMA journal_mode = WAL;");
    this.sqlite.exec("PRAGMA busy_timeout = 5000;");
    this.sqlite.exec("PRAGMA synchronous = FULL;");

    this.appliedMigrations = runMigrations(this.sqlite);
    this.db = drizzle(this.sqlite, { schema });
  }

  /**
   * Atomically writes an artifact file (temp file + rename) and returns metadata.
   */
  writeArtifactFile(
    projectId: string,
    runId: string,
    filename: string,
    content: string | Uint8Array
  ): {
    relativePath: string;
    absolutePath: string;
    contentHash: string;
    size: number;
  } {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const relPath = join(projectId, runId, safeName).replace(/\\/g, "/");
    const absPath = join(this.paths.artifactsDir, relPath);
    mkdirSync(dirname(absPath), { recursive: true });

    const buf =
      typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    const contentHash = createHash("sha256").update(buf).digest("hex");
    const tmpPath = `${absPath}.${randomUUID()}.tmp`;
    writeFileSync(tmpPath, buf);
    renameSync(tmpPath, absPath);

    return {
      relativePath: relPath,
      absolutePath: absPath,
      contentHash,
      size: buf.byteLength,
    };
  }

  /**
   * Online SQLite backup safe under active WAL mode using `VACUUM INTO`.
   */
  createBackup(label?: string): { backupPath: string; createdAt: string } {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = label ? `-${label.replace(/[^a-zA-Z0-9_-]/g, "")}` : "";
    const backupPath = join(
      this.paths.backupsDir,
      `codeteams-backup-${ts}${suffix}.db`
    );
    mkdirSync(this.paths.backupsDir, { recursive: true });
    const escaped = backupPath.replace(/'/g, "''");
    this.sqlite.exec(`VACUUM INTO '${escaped}';`);
    return { backupPath, createdAt: new Date().toISOString() };
  }

  getDiagnostics(): {
    dbPath: string;
    journalMode: string;
    foreignKeys: number;
    synchronous: number;
    schemaVersions: number[];
    tableCounts: Record<string, number>;
  } {
    const jm = this.sqlite.query<{ journal_mode: string }, []>("PRAGMA journal_mode;").get();
    const fk = this.sqlite.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys;").get();
    const sync = this.sqlite.query<{ synchronous: number }, []>("PRAGMA synchronous;").get();
    const versions = this.sqlite
      .query<{ version: number }, []>("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((r) => r.version);

    const tables = [
      "projects",
      "agents",
      "workflows",
      "workflow_versions",
      "conversations",
      "workflow_runs",
      "node_runs",
      "agent_sessions",
      "messages",
      "events",
      "run_checkpoints",
      "context_handoffs",
      "project_memories",
      "artifacts",
      "permissions",
    ];
    const tableCounts: Record<string, number> = {};
    for (const t of tables) {
      const row = this.sqlite.query<{ c: number }, []>(`SELECT COUNT(*) AS c FROM ${t}`).get();
      tableCounts[t] = row?.c ?? 0;
    }

    return {
      dbPath: this.paths.dbPath,
      journalMode: jm?.journal_mode ?? "unknown",
      foreignKeys: fk?.foreign_keys ?? 0,
      synchronous: sync?.synchronous ?? 0,
      schemaVersions: versions,
      tableCounts,
    };
  }

  close(): void {
    try {
      this.sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
      // Ignore checkpoint error on close
    }
    this.sqlite.close();
  }
}
