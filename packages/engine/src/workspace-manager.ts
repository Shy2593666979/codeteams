import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import {
  CoreError,
  type ProjectRuleFile,
  type WorkspaceFilePreview,
  type WorkspaceGitDiff,
  type WorkspaceStatus,
  type WorkspaceTreeEntry,
} from "@codeteams/shared";
import {
  assertPathInsideWorkspace,
  canonicalizeWorkspacePath,
} from "@codeteams/acp";

const IGNORED_TREE_DIRS = new Set([
  ".git",
  "node_modules",
  ".vite",
  ".next",
  ".nuxt",
  "dist",
  "out",
  "build",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  ".turbo",
]);

const MAX_TREE_ENTRIES = 250;
const MAX_FILE_PREVIEW_BYTES = 120_000;
const MAX_DIFF_CHARS = 120_000;

const RULE_FILE_CANDIDATES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
];

function runGit(cwd: string, args: string[]): { ok: boolean; stdout: string } {
  try {
    const proc = Bun.spawnSync(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) {
      return { ok: false, stdout: "" };
    }
    return { ok: true, stdout: proc.stdout.toString().trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
}

export class WorkspaceManager {
  private readonly activeLocks = new Map<string, string>(); // projectId -> runId

  canonicalize(projectPath: string): {
    canonicalPath: string;
    name: string;
    gitRoot: string | null;
  } {
    const canonicalPath = canonicalizeWorkspacePath(projectPath);
    const stat = statSync(canonicalPath);
    if (!stat.isDirectory()) {
      throw new CoreError(
        "VALIDATION_ERROR",
        `Project path must be a directory: ${canonicalPath}`
      );
    }
    const gitTop = runGit(canonicalPath, ["rev-parse", "--show-toplevel"]);
    return {
      canonicalPath,
      name: basename(canonicalPath),
      gitRoot: gitTop.ok && gitTop.stdout ? resolve(gitTop.stdout) : null,
    };
  }

  acquireLock(projectId: string, ownerId: string): void {
    const existing = this.activeLocks.get(projectId);
    if (existing && existing !== ownerId) {
      throw new CoreError(
        "WORKSPACE_BUSY",
        `Workspace for project "${projectId}" is currently locked by active execution "${existing}". Wait for completion or cancel it first.`,
        { projectId, lockedByRunId: existing }
      );
    }
    this.activeLocks.set(projectId, ownerId);
  }

  releaseLock(projectId: string, ownerId: string): void {
    if (this.activeLocks.get(projectId) === ownerId) {
      this.activeLocks.delete(projectId);
    }
  }

  getLockOwner(projectId: string): string | null {
    return this.activeLocks.get(projectId) ?? null;
  }

  getStatus(projectId: string, canonicalPath: string): WorkspaceStatus {
    const gitTop = runGit(canonicalPath, ["rev-parse", "--show-toplevel"]);
    const isGitRepo = gitTop.ok && gitTop.stdout.length > 0;
    const gitRoot = isGitRepo ? resolve(gitTop.stdout) : null;

    if (!isGitRepo) {
      return {
        projectId,
        canonicalPath,
        isGitRepo: false,
        gitRoot: null,
        branch: null,
        head: null,
        changedFiles: [],
        diffSummary: "Not a Git repository (diff and branch tracking unavailable).",
        lockedByRunId: this.getLockOwner(projectId),
      };
    }

    const branchRes = runGit(canonicalPath, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    const headRes = runGit(canonicalPath, ["rev-parse", "HEAD"]);
    const statusRes = runGit(canonicalPath, [
      "-c",
      "core.quotePath=false",
      "status",
      "--porcelain",
    ]);
    const diffStatRes = runGit(canonicalPath, [
      "-c",
      "core.quotePath=false",
      "diff",
      "--stat",
    ]);

    const changedFiles: Array<{ path: string; status: string }> = [];
    if (statusRes.ok && statusRes.stdout) {
      for (const line of statusRes.stdout.split(/\r?\n/)) {
        if (line.length < 4) continue;
        const status = line.slice(0, 2).trim() || "M";
        const rawPath = line.slice(3).trim();
        const filePath = rawPath.includes(" -> ")
          ? rawPath.split(" -> ").at(-1)!.trim()
          : rawPath;
        if (filePath) {
          changedFiles.push({ path: filePath, status });
        }
      }
    }

    return {
      projectId,
      canonicalPath,
      isGitRepo: true,
      gitRoot,
      branch: branchRes.ok ? branchRes.stdout : null,
      head: headRes.ok ? headRes.stdout : null,
      changedFiles,
      diffSummary: diffStatRes.ok ? diffStatRes.stdout : "",
      lockedByRunId: this.getLockOwner(projectId),
    };
  }

  readProjectRuleFiles(canonicalPath: string): ProjectRuleFile[] {
    const found: ProjectRuleFile[] = [];
    for (const rel of RULE_FILE_CANDIDATES) {
      const full = join(canonicalPath, rel);
      if (!existsSync(full)) continue;
      try {
        const stat = statSync(full);
        if (!stat.isFile()) continue;
        const content = readFileSync(full, "utf8");
        found.push({
          relativePath: rel,
          content: content.slice(0, 12_000),
          modifiedAt: stat.mtime.toISOString(),
          size: stat.size,
        });
      } catch {
        // Skip unreadable rule files
      }
    }
    return found;
  }

  listDirectory(
    projectId: string,
    canonicalPath: string,
    relDir = ""
  ): { entries: WorkspaceTreeEntry[]; truncated: boolean } {
    const cleanRel = relDir.trim().replace(/^[/\\]+/, "");
    const targetDir = cleanRel
      ? assertPathInsideWorkspace(canonicalPath, cleanRel)
      : canonicalPath;

    if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
      throw new CoreError(
        "NOT_FOUND",
        `Directory not found inside workspace: ${cleanRel || "."}`
      );
    }

    // Build quick git status map for badges in the tree
    const gitStatusByPath = new Map<string, string>();
    const dirtyDirs = new Set<string>();
    try {
      const ws = this.getStatus(projectId, canonicalPath);
      for (const cf of ws.changedFiles) {
        const norm = cf.path.replace(/\\/g, "/");
        gitStatusByPath.set(norm, cf.status);
        const parts = norm.split("/");
        for (let i = 1; i < parts.length; i++) {
          dirtyDirs.add(parts.slice(0, i).join("/"));
        }
      }
    } catch {
      // Non-git or unavailable
    }

    const rawEntries = readdirSync(targetDir, { withFileTypes: true });
    const entries: WorkspaceTreeEntry[] = [];

    for (const dirent of rawEntries) {
      const name = dirent.name;
      if (dirent.isDirectory() && IGNORED_TREE_DIRS.has(name)) {
        continue;
      }
      const fullPath = join(targetDir, name);
      const relPath = relative(canonicalPath, fullPath).replace(/\\/g, "/");
      if (dirent.isDirectory()) {
        entries.push({
          name,
          relativePath: relPath,
          kind: "dir",
          gitStatus: dirtyDirs.has(relPath) ? "M" : null,
        });
      } else if (dirent.isFile()) {
        let size: number | undefined;
        try {
          size = statSync(fullPath).size;
        } catch {
          // Ignore stat failure
        }
        entries.push({
          name,
          relativePath: relPath,
          kind: "file",
          size,
          gitStatus: gitStatusByPath.get(relPath) ?? null,
        });
      }
    }

    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    const truncated = entries.length > MAX_TREE_ENTRIES;
    return {
      entries: truncated ? entries.slice(0, MAX_TREE_ENTRIES) : entries,
      truncated,
    };
  }

  readWorkspaceFile(
    canonicalPath: string,
    relPath: string
  ): WorkspaceFilePreview {
    const cleanRel = relPath.trim().replace(/^[/\\]+/, "");
    const fullPath = assertPathInsideWorkspace(canonicalPath, cleanRel);
    if (!existsSync(fullPath)) {
      throw new CoreError("NOT_FOUND", `File not found: ${cleanRel}`);
    }
    const st = statSync(fullPath);
    if (!st.isFile()) {
      throw new CoreError("VALIDATION_ERROR", `Path is not a file: ${cleanRel}`);
    }

    const rawBuf = readFileSync(fullPath);
    const truncated = rawBuf.byteLength > MAX_FILE_PREVIEW_BYTES;
    const slice = truncated ? rawBuf.subarray(0, MAX_FILE_PREVIEW_BYTES) : rawBuf;

    // Detect binary content via NUL byte check in initial bytes
    const sampleLen = Math.min(slice.byteLength, 4096);
    let binary = false;
    for (let i = 0; i < sampleLen; i++) {
      if (slice[i] === 0) {
        binary = true;
        break;
      }
    }

    return {
      relativePath: cleanRel.replace(/\\/g, "/"),
      content: binary ? "" : slice.toString("utf8"),
      size: st.size,
      truncated,
      binary,
    };
  }

  getGitDiff(canonicalPath: string, relPath?: string): WorkspaceGitDiff {
    const gitTop = runGit(canonicalPath, ["rev-parse", "--show-toplevel"]);
    if (!gitTop.ok || !gitTop.stdout) {
      return {
        isGitRepo: false,
        relativePath: relPath ?? null,
        diff: "",
        truncated: false,
      };
    }

    const cleanRel = relPath?.trim().replace(/^[/\\]+/, "") || null;
    if (cleanRel) {
      // Validate path remains inside workspace
      assertPathInsideWorkspace(canonicalPath, cleanRel);
    }

    const args = cleanRel
      ? ["-c", "core.quotePath=false", "diff", "HEAD", "--", cleanRel]
      : ["-c", "core.quotePath=false", "diff", "HEAD"];

    let diffRes = runGit(canonicalPath, args);
    // Fallback for repos without an initial commit (no HEAD yet)
    if (!diffRes.ok) {
      const fallbackArgs = cleanRel
        ? ["-c", "core.quotePath=false", "diff", "--", cleanRel]
        : ["-c", "core.quotePath=false", "diff"];
      diffRes = runGit(canonicalPath, fallbackArgs);
    }

    let diffText = diffRes.ok ? diffRes.stdout : "";

    // If querying a specific untracked file, synthesize a clean unified diff preview
    if (cleanRel && !diffText) {
      const fullPath = assertPathInsideWorkspace(canonicalPath, cleanRel);
      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        const preview = this.readWorkspaceFile(canonicalPath, cleanRel);
        if (!preview.binary) {
          const lines = preview.content.split(/\r?\n/);
          diffText = [
            `--- /dev/null`,
            `+++ b/${cleanRel.replace(/\\/g, "/")}`,
            `@@ -0,0 +1,${lines.length} @@`,
            ...lines.map((l) => `+${l}`),
          ].join("\n");
        } else {
          diffText = `Binary file (${preview.size} bytes): ${cleanRel}`;
        }
      }
    }

    const truncated = diffText.length > MAX_DIFF_CHARS;
    return {
      isGitRepo: true,
      relativePath: cleanRel,
      diff: truncated
        ? `${diffText.slice(0, MAX_DIFF_CHARS)}\n… (diff truncated)`
        : diffText,
      truncated,
    };
  }
}
