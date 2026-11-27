import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { CoreError } from "@codeteams/shared";

/**
 * Resolves a workspace root to its canonical real path.
 */
export function canonicalizeWorkspacePath(workspacePath: string): string {
  const abs = resolve(workspacePath);
  if (!existsSync(abs)) {
    throw new CoreError("NOT_FOUND", `Workspace path does not exist: ${abs}`);
  }
  return realpathSync(abs);
}

/**
 * Resolves a target file path and ensures it stays strictly inside `workspaceRoot`,
 * detecting `..` traversal and symlink escapes (including for non-existent target files).
 */
export function assertPathInsideWorkspace(
  workspaceRoot: string,
  targetPath: string
): string {
  const canonicalRoot = canonicalizeWorkspacePath(workspaceRoot);
  const resolvedTarget = isAbsolute(targetPath)
    ? resolve(targetPath)
    : resolve(canonicalRoot, targetPath);

  // Walk up until an existing ancestor is found, then realpath it to catch symlink escapes.
  let probe = resolvedTarget;
  const trailingSegments: string[] = [];
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) break;
    trailingSegments.unshift(relative(parent, probe));
    probe = parent;
  }

  let canonicalTarget: string;
  if (existsSync(probe)) {
    // Reject if the final target itself is a symlink pointing outside root
    const realProbe = realpathSync(probe);
    canonicalTarget =
      trailingSegments.length > 0
        ? resolve(realProbe, ...trailingSegments)
        : realProbe;

    // Also inspect direct symlink if target exists
    try {
      const stat = lstatSync(resolvedTarget);
      if (stat.isSymbolicLink()) {
        canonicalTarget = realpathSync(resolvedTarget);
      }
    } catch {
      // Target does not exist yet; checked via realProbe above
    }
  } else {
    canonicalTarget = resolvedTarget;
  }

  const normalizedRoot =
    process.platform === "win32"
      ? canonicalRoot.toLowerCase()
      : canonicalRoot;
  const normalizedTarget =
    process.platform === "win32"
      ? canonicalTarget.toLowerCase()
      : canonicalTarget;

  const rel = relative(normalizedRoot, normalizedTarget);
  const escaped =
    rel === ".." ||
    rel.startsWith("..\\") ||
    rel.startsWith("../") ||
    isAbsolute(rel);

  if (escaped) {
    throw new CoreError(
      "PATH_ESCAPE",
      `Access denied: path "${targetPath}" escapes authorized workspace "${canonicalRoot}"`,
      { workspaceRoot: canonicalRoot, targetPath }
    );
  }

  return canonicalTarget;
}
