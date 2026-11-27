import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertPathInsideWorkspace, redactSecrets } from "@codeteams/acp";
import { CodeTeamsStorage } from "@codeteams/storage";
import { CodeTeamsRuntime } from "@codeteams/engine";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore Windows cleanup lag
    }
  }
});

describe("Security, Official Assets & Context Isolation", () => {
  test("redacts API keys and known secrets from logs and handoff context", () => {
    const raw =
      "Authorization: Bearer sk-test1234567890abcdef123456 and custom mySuperSecretToken999";
    const cleaned = redactSecrets(raw, ["mySuperSecretToken999"]);
    expect(cleaned).not.toContain("sk-test1234567890abcdef123456");
    expect(cleaned).not.toContain("mySuperSecretToken999");
    expect(cleaned).toContain("[REDACTED]");
  });

  test("blocks path traversal attacks across nested relative paths", () => {
    const root = createTempDir("ct-sec-");
    expect(() =>
      assertPathInsideWorkspace(root, "subdir/../../etc/passwd")
    ).toThrow(/escapes authorized workspace/i);
    expect(() =>
      assertPathInsideWorkspace(root, "..\\outside.txt")
    ).toThrow(/escapes authorized workspace/i);
    // Valid nested path inside root succeeds
    const valid = assertPathInsideWorkspace(root, "src/auth/rbac.ts");
    expect(valid.toLowerCase()).toContain(root.toLowerCase());
  });

  test("all bundled official SVG logos are sanitized with zero scripts or external URLs", () => {
    const logosDir = resolve(import.meta.dir, "../../resources/agents/logos");
    const files = readdirSync(logosDir).filter((f) => f.endsWith(".svg"));
    expect(files.length).toBeGreaterThanOrEqual(17);

    for (const file of files) {
      const content = readFileSync(join(logosDir, file), "utf8");
      expect(content).not.toMatch(/<script/i);
      expect(content).not.toMatch(/<foreignObject/i);
      expect(content).not.toMatch(/\son[a-z]+\s*=/i);
      expect(content).not.toMatch(/javascript:/i);
      expect(content).not.toMatch(/href\s*=\s*["']https?:/i);
    }

    const manifest = JSON.parse(
      readFileSync(
        resolve(import.meta.dir, "../../resources/agents/manifest.json"),
        "utf8"
      )
    ) as { assets: Array<{ agentId: string; status: string }> };
    expect(manifest.assets).toHaveLength(20);
  });

  test("project memories and conversations remain strictly isolated between projects", async () => {
    const userData = createTempDir("ct-iso-db-");
    const repoA = createTempDir("ct-iso-a-");
    const repoB = createTempDir("ct-iso-b-");

    const storage = new CodeTeamsStorage(userData);
    const runtime = new CodeTeamsRuntime(storage);

    try {
      const projA = runtime.openProject(repoA, "Project Alpha");
      const projB = runtime.openProject(repoB, "Project Beta");

      runtime.updateProjectMemory(projA.id, "ALPHA_ONLY_SECRET_ARCH_NOTE");
      runtime.updateProjectMemory(projB.id, "BETA_ONLY_ARCH_NOTE");

      const memA = runtime.getProjectMemory(projA.id);
      const memB = runtime.getProjectMemory(projB.id);

      expect(memA.memory?.content).toBe("ALPHA_ONLY_SECRET_ARCH_NOTE");
      expect(memB.memory?.content).toBe("BETA_ONLY_ARCH_NOTE");

      const convA = runtime.createConversation({
        projectId: projA.id,
        title: "Alpha Thread",
        mode: "single",
        agentId: "codex",
      });

      const listB = runtime.listConversations({ projectId: projB.id });
      expect(listB.some((c) => c.id === convA.id)).toBe(false);

      // Attempting to launch run with mismatched conversation/project is rejected
      const wf = runtime.saveWorkflow({
        name: "WF",
        steps: [{ id: "s1", agentId: "codex" }],
      });
      await expect(
        runtime.startRun({
          projectId: projB.id,
          conversationId: convA.id,
          workflowId: wf.id,
          objective: "Cross-project hijack attempt",
        })
      ).rejects.toThrow(/does not belong to the specified project/i);
    } finally {
      await runtime.shutdown();
    }
  });
});
