import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CodeTeamsStorage } from "@codeteams/storage";
import { CodeTeamsRuntime } from "@codeteams/engine";

const mockServerPath = resolve(
  import.meta.dir,
  "../fixtures/mock-acp-server.ts"
);
const coreEntryPath = resolve(
  import.meta.dir,
  "../../apps/core/src/index.ts"
);

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
      // Ignore Windows file-handle release lag
    }
  }
});

function registerMockAgent(
  runtime: CodeTeamsRuntime,
  id: string,
  name: string,
  extraEnv: Record<string, string> = {},
  automationPolicy: "allowed" | "restricted" | "unknown" = "allowed"
) {
  // Pass env via wrapper args using `bun -e`? No, set on agent via registerCustom + test env!
  // We can pass small inline launcher via bun run mock-acp-server.ts and envRefs + setAgentSecret
  runtime.registerCustomAgent({
    id,
    name,
    vendor: "Test Mock",
    officialUrl: "https://agentclientprotocol.com",
    command: process.execPath,
    args: ["run", mockServerPath],
    automationPolicy,
  });
  const envRefs: Record<string, string> = {};
  for (const [k, v] of Object.entries(extraEnv)) {
    envRefs[k] = `secret:${id}:${k}`;
    runtime.setAgentSecret(id, k, v);
  }
  runtime.configureAgent({ id, envRefs });
}

describe("M1-M4: CodeTeamsRuntime serial workflows, handoff, permissions, persistence & recovery", () => {
  test("3-agent serial workflow executes strictly in order, persists handoffs, and preserves immutable snapshot", async () => {
    const userData = createTempDir("ct-data-");
    const repoDir = createTempDir("ct-repo-");
    writeFileSync(join(repoDir, "AGENTS.md"), "# Repo Rules\nAlways write strict TypeScript.\n", "utf8");

    const storage = new CodeTeamsStorage(userData);
    const runtime = new CodeTeamsRuntime(storage);

    try {
      registerMockAgent(runtime, "mock-agy", "Mock AGY", {
        MOCK_AGENT_NAME: "mock-agy",
        MOCK_WRITE_FILE: "step1-plan.txt",
        MOCK_DELAY_MS: "5",
        MOCK_POST_TURN_TITLE: "RBAC 审计日志实现",
      });
      registerMockAgent(runtime, "mock-codex", "Mock Codex", {
        MOCK_AGENT_NAME: "mock-codex",
        MOCK_READ_FILE: "step1-plan.txt",
        MOCK_WRITE_FILE: "step2-impl.txt",
        MOCK_DELAY_MS: "5",
        MOCK_SESSION_TITLE: "Should Not Override Step 1",
      });
      registerMockAgent(runtime, "mock-claude", "Mock Claude", {
        MOCK_AGENT_NAME: "mock-claude",
        MOCK_READ_FILE: "step2-impl.txt",
        MOCK_DELAY_MS: "5",
      });

      const project = runtime.openProject(repoDir, "Sample Repo");
      runtime.updateProjectMemory(project.id, "Use strict TypeScript and clear error handling.");

      // Also verify same agent can appear twice with unique step IDs
      const wf = runtime.saveWorkflow({
        projectId: project.id,
        name: "Three Agent Dev Chain",
        steps: [
          { id: "step-1", agentId: "mock-agy" },
          { id: "step-2", agentId: "mock-codex" },
          { id: "step-3", agentId: "mock-claude" },
          { id: "step-4", agentId: "mock-codex" },
        ],
      });

      const observedOrder: string[] = [];
      runtime.subscribeEvents((ev) => {
        if (ev.type === "node.state") {
          const p = ev.payload as { stepId: string; state: string };
          observedOrder.push(`${p.stepId}:${p.state}`);
        }
      });

      const run = await runtime.startRun({
        projectId: project.id,
        workflowId: wf.id,
        objective: "Implement RBAC role audit logging",
        idempotencyKey: "run-key-001",
      });

      // Mutate workflow canvas immediately after start — running snapshot MUST remain untouched
      runtime.saveWorkflow({
        id: wf.id,
        projectId: project.id,
        name: "Mutated Workflow",
        steps: [{ id: "only-one", agentId: "mock-agy" }],
      });

      // Idempotency key returns identical run without launching duplicate
      const duplicate = await runtime.startRun({
        projectId: project.id,
        workflowId: wf.id,
        objective: "Implement RBAC role audit logging",
        idempotencyKey: "run-key-001",
      });
      expect(duplicate.id).toBe(run.id);

      const settled = await runtime.waitForRun(run.id);
      expect(settled.state).toBe("completed");
      expect(settled.workflowSnapshot.steps).toHaveLength(4);

      // Strict serial order: step-1 completed BEFORE step-2 running, etc.
      expect(observedOrder).toEqual([
        "step-1:running",
        "step-1:completed",
        "step-2:running",
        "step-2:completed",
        "step-3:running",
        "step-3:completed",
        "step-4:running",
        "step-4:completed",
      ]);

      const detail = runtime.getRun(run.id);
      expect(detail.nodeRuns.every((n) => n.state === "completed")).toBe(true);
      expect(detail.handoffs).toHaveLength(4);
      expect(detail.handoffs[0]!.objective).toBe("Implement RBAC role audit logging");
      expect(detail.artifacts).toHaveLength(4);
      expect(detail.checkpoint?.lastCompletedStepId).toBe("step-4");
      expect(existsSync(join(repoDir, "step1-plan.txt"))).toBe(true);
      expect(existsSync(join(repoDir, "step2-impl.txt"))).toBe(true);
      // Step 1's delayed post-end_turn session_info_update must update the conversation title
      // even after Step 1 released its warm client, and Step 2 must NOT overwrite it.
      const convDetail = runtime.getConversationDetail(run.conversationId);
      expect(convDetail.conversation.title).toBe("RBAC 审计日志实现");
      // Step 1 emitted an ACP diff block -> persisted tool segment must carry structured diffs
      const firstAssistant = convDetail.messages.find((m) => m.role === "assistant");
      const firstSegs =
        (firstAssistant?.metadata as { segments?: Array<{ type: string; diffs?: Array<{ path: string; oldText: string | null; newText: string }> }> } | null)
          ?.segments ?? [];
      const diffTool = firstSegs.find((s) => s.type === "tool" && s.diffs && s.diffs.length > 0);
      expect(diffTool?.diffs?.[0]?.path).toBe("step1-plan.txt");
      expect(diffTool?.diffs?.[0]?.oldText).toContain("oldLabel");
      expect(diffTool?.diffs?.[0]?.newText).toContain("skyLabel");
    } finally {
      await runtime.shutdown();
    }
  });

  test("diamond parallel DAG (1->2, 1->3, 2->4, 3->4) runs branches 2 & 3 concurrently, merges handoffs into 4, and rejects cyclic graphs", async () => {
    const userData = createTempDir("ct-dag-data-");
    const repoDir = createTempDir("ct-dag-repo-");
    const storage = new CodeTeamsStorage(userData);
    const runtime = new CodeTeamsRuntime(storage);

    try {
      registerMockAgent(runtime, "dag-1", "DAG Lead", {
        MOCK_AGENT_NAME: "dag-1",
        MOCK_DELAY_MS: "5",
      });
      registerMockAgent(runtime, "dag-2", "DAG Branch A", {
        MOCK_AGENT_NAME: "dag-2",
        MOCK_DELAY_MS: "40",
      });
      registerMockAgent(runtime, "dag-3", "DAG Branch B", {
        MOCK_AGENT_NAME: "dag-3",
        MOCK_DELAY_MS: "40",
      });
      registerMockAgent(runtime, "dag-4", "DAG Merger", {
        MOCK_AGENT_NAME: "dag-4",
        MOCK_DELAY_MS: "5",
      });

      const project = runtime.openProject(repoDir, "DAG Repo");

      // Cycle detection guard: 1->2->1 MUST be rejected
      expect(() =>
        runtime.saveWorkflow({
          projectId: project.id,
          name: "Invalid Cycle",
          steps: [
            { id: "n1", agentId: "dag-1" },
            { id: "n2", agentId: "dag-2" },
          ],
          edges: [
            { id: "e1", source: "n1", target: "n2" },
            { id: "e2", source: "n2", target: "n1" },
          ],
        })
      ).toThrow(/cycle/i);

      const wf = runtime.saveWorkflow({
        projectId: project.id,
        name: "Diamond Parallel Team",
        steps: [
          { id: "s1", agentId: "dag-1", position: { x: 80, y: 200 } },
          { id: "s2", agentId: "dag-2", position: { x: 360, y: 120 } },
          { id: "s3", agentId: "dag-3", position: { x: 360, y: 280 } },
          { id: "s4", agentId: "dag-4", position: { x: 640, y: 200 } },
        ],
        edges: [
          { id: "e-1-2", source: "s1", target: "s2" },
          { id: "e-1-3", source: "s1", target: "s3" },
          { id: "e-2-4", source: "s2", target: "s4" },
          { id: "e-3-4", source: "s3", target: "s4" },
        ],
      });

      const events: string[] = [];
      runtime.subscribeEvents((ev) => {
        if (ev.type === "node.state") {
          const p = ev.payload as { stepId: string; state: string };
          events.push(`${p.stepId}:${p.state}`);
        }
      });

      const run = await runtime.startRun({
        projectId: project.id,
        workflowId: wf.id,
        objective: "Run parallel branches and merge results",
      });

      const finished = await runtime.waitForRun(run.id);
      expect(finished.state).toBe("completed");

      const detail = runtime.getRun(run.id);
      expect(detail.nodeRuns.every((n) => n.state === "completed")).toBe(true);
      expect(detail.handoffs).toHaveLength(4);

      // s1 must finish BEFORE s2 & s3 start; s2 & s3 must BOTH start BEFORE either finishes (parallel wave!),
      // and s4 must start AFTER both s2 & s3 complete.
      const idx = (tag: string) => events.indexOf(tag);
      expect(idx("s1:completed")).toBeLessThan(idx("s2:running"));
      expect(idx("s1:completed")).toBeLessThan(idx("s3:running"));
      expect(idx("s2:running")).toBeLessThan(idx("s3:completed"));
      expect(idx("s3:running")).toBeLessThan(idx("s2:completed"));
      expect(idx("s2:completed")).toBeLessThan(idx("s4:running"));
      expect(idx("s3:completed")).toBeLessThan(idx("s4:running"));
    } finally {
      await runtime.shutdown();
    }
  });

  test("rejects empty workflow, unknown agent, and restricted automation policy", async () => {
    const userData = createTempDir("ct-val-");
    const repoDir = createTempDir("ct-val-repo-");
    const storage = new CodeTeamsStorage(userData);
    const runtime = new CodeTeamsRuntime(storage);

    try {
      const project = runtime.openProject(repoDir);

      // Unknown agent rejected on save
      expect(() =>
        runtime.saveWorkflow({
          name: "Bad Agent",
          steps: [{ id: "s1", agentId: "nonexistent-node" }],
        })
      ).toThrow(/Unknown Coding Agent/i);

      // Empty workflow rejected on run
      const emptyWf = runtime.saveWorkflow({ name: "Empty", steps: [] });
      await expect(
        runtime.startRun({
          projectId: project.id,
          workflowId: emptyWf.id,
          objective: "Should fail",
        })
      ).rejects.toThrow(/at least one Coding Agent/i);

      // Explicitly restricted agent blocked in automated workflow
      registerMockAgent(runtime, "mock-restricted", "Mock Restricted Agent", {}, "restricted");
      const restrictedWf = runtime.saveWorkflow({
        name: "Restricted",
        steps: [{ id: "s1", agentId: "mock-restricted" }],
      });
      await expect(
        runtime.startRun({
          projectId: project.id,
          workflowId: restrictedWf.id,
          objective: "Unattended run",
        })
      ).rejects.toThrow(/restricted from automated workflow/i);
    } finally {
      await runtime.shutdown();
    }
  });

  test("permission rejection halts workflow and NEVER schedules downstream agent", async () => {
    const userData = createTempDir("ct-perm-wf-");
    const repoDir = createTempDir("ct-perm-repo-");
    const storage = new CodeTeamsStorage(userData);
    const runtime = new CodeTeamsRuntime(storage);

    try {
      registerMockAgent(runtime, "perm-step-1", "Perm Step 1", {
        MOCK_AGENT_NAME: "perm-step-1",
        MOCK_REQUEST_PERMISSION: "1",
        MOCK_DELAY_MS: "0",
      });
      registerMockAgent(runtime, "step-2-never", "Step 2 Never", {
        MOCK_AGENT_NAME: "step-2-never",
        MOCK_WRITE_FILE: "should-not-exist.txt",
        MOCK_DELAY_MS: "0",
      });

      const project = runtime.openProject(repoDir);
      const wf = runtime.saveWorkflow({
        name: "Permission Gate",
        steps: [
          { id: "s1", agentId: "perm-step-1" },
          { id: "s2", agentId: "step-2-never" },
        ],
      });

      runtime.subscribeEvents((ev) => {
        if (ev.type === "permission.requested") {
          const p = ev.payload as { id: string; options: Array<{ optionId: string; kind: string }> };
          const rejectOpt = p.options.find((o) => o.kind === "reject_once");
          runtime.permissions.respond({
            permissionId: p.id,
            outcome: "selected",
            optionId: rejectOpt!.optionId,
          });
        }
      });

      const run = await runtime.startRun({
        projectId: project.id,
        workflowId: wf.id,
        objective: "Test refusal stops chain",
      });
      const settled = await runtime.waitForRun(run.id);

      expect(settled.state).toBe("failed");
      expect(settled.errorCode).toBe("PERMISSION_DENIED");
      const detail = runtime.getRun(run.id);
      expect(detail.nodeRuns[0]!.state).toBe("failed");
      expect(detail.nodeRuns[1]!.state).toBe("pending");
      expect(existsSync(join(repoDir, "should-not-exist.txt"))).toBe(false);
    } finally {
      await runtime.shutdown();
    }
  });

  test("crash recovery: step 2 disconnects, restart reconciles, resume skips step 1 and completes via native load or rebuild", async () => {
    const userData = createTempDir("ct-rec-data-");
    const repoDir = createTempDir("ct-rec-repo-");
    const mockStateFile = join(repoDir, ".mock-acp-state.json");

    let runId = "";

    // Phase 1: Step 1 completes, Step 2 crashes mid-prompt
    {
      const storage1 = new CodeTeamsStorage(userData);
      const runtime1 = new CodeTeamsRuntime(storage1);

      registerMockAgent(runtime1, "rec-agent-1", "Rec Agent 1", {
        MOCK_AGENT_NAME: "rec-agent-1",
        MOCK_WRITE_FILE: "from-step-1.txt",
        MOCK_DELAY_MS: "0",
      });
      registerMockAgent(runtime1, "rec-agent-2", "Rec Agent 2", {
        MOCK_AGENT_NAME: "rec-agent-2",
        MOCK_SUPPORTS_LOAD: "1",
        MOCK_STATE_FILE: mockStateFile,
        MOCK_DISCONNECT_MID_PROMPT: "1",
        MOCK_DELAY_MS: "5",
      });
      registerMockAgent(runtime1, "rec-agent-3", "Rec Agent 3", {
        MOCK_AGENT_NAME: "rec-agent-3",
        MOCK_WRITE_FILE: "from-step-3.txt",
        MOCK_DELAY_MS: "0",
      });

      const project = runtime1.openProject(repoDir);
      const wf = runtime1.saveWorkflow({
        name: "Recovery Chain",
        steps: [
          { id: "s1", agentId: "rec-agent-1" },
          { id: "s2", agentId: "rec-agent-2" },
          { id: "s3", agentId: "rec-agent-3" },
        ],
      });

      const run = await runtime1.startRun({
        projectId: project.id,
        workflowId: wf.id,
        objective: "Survive crash on step 2",
      });
      runId = run.id;

      const interrupted = await runtime1.waitForRun(run.id);
      expect(interrupted.state).toBe("interrupted");
      const detail = runtime1.getRun(run.id);
      expect(detail.checkpoint?.lastCompletedStepId).toBe("s1");
      expect(detail.checkpoint?.lastCompletedOrdinal).toBe(0);
      await runtime1.shutdown();
    }

    // Phase 2: Restart Core, verify step 1 is NOT re-run, and resume completes steps 2 & 3!
    {
      const storage2 = new CodeTeamsStorage(userData);
      const runtime2 = new CodeTeamsRuntime(storage2);

      // Reconfigure rec-agent-2 without crash flag so recovery succeeds via native session/load
      runtime2.setAgentSecret("rec-agent-2", "MOCK_DISCONNECT_MID_PROMPT", "0");
      runtime2.setAgentSecret("rec-agent-2", "MOCK_AGENT_NAME", "rec-agent-2");
      runtime2.setAgentSecret("rec-agent-2", "MOCK_SUPPORTS_LOAD", "1");
      runtime2.setAgentSecret("rec-agent-2", "MOCK_STATE_FILE", mockStateFile);
      runtime2.setAgentSecret("rec-agent-2", "MOCK_DELAY_MS", "0");

      runtime2.setAgentSecret("rec-agent-3", "MOCK_AGENT_NAME", "rec-agent-3");
      runtime2.setAgentSecret("rec-agent-3", "MOCK_WRITE_FILE", "from-step-3.txt");
      runtime2.setAgentSecret("rec-agent-3", "MOCK_DELAY_MS", "0");

      // Resume without confirming side effects MUST be rejected
      await expect(runtime2.resumeRun({ runId })).rejects.toThrow(
        /Confirm that you have reviewed/i
      );

      // Track node executions during resume
      const resumedSteps: string[] = [];
      runtime2.subscribeEvents((ev) => {
        if (ev.type === "node.state") {
          const p = ev.payload as { stepId: string; state: string };
          resumedSteps.push(`${p.stepId}:${p.state}`);
        }
      });

      await runtime2.resumeRun({ runId, confirmSideEffectsReviewed: true });
      const completed = await runtime2.waitForRun(runId);

      expect(completed.state).toBe("completed");
      // Step 1 MUST NOT have been re-run!
      expect(resumedSteps.some((s) => s.startsWith("s1:"))).toBe(false);
      expect(resumedSteps).toEqual([
        "s2:running",
        "s2:completed",
        "s3:running",
        "s3:completed",
      ]);

      const finalDetail = runtime2.getRun(runId);
      expect(finalDetail.checkpoint?.recoveryMode).toBe("session_resumed");
      expect(existsSync(join(repoDir, "from-step-3.txt"))).toBe(true);
      await runtime2.shutdown();
    }
  });

  test("single-agent chat persists conversation and streams real ACP reply", async () => {
    const userData = createTempDir("ct-chat-data-");
    const repoDir = createTempDir("ct-chat-repo-");
    const storage = new CodeTeamsStorage(userData);
    const runtime = new CodeTeamsRuntime(storage);

    try {
      registerMockAgent(runtime, "chat-mock", "Chat Mock", {
        MOCK_AGENT_NAME: "chat-mock",
        MOCK_DELAY_MS: "5",
        MOCK_REEMIT_PRIOR_TOOLS: "1",
        MOCK_SESSION_TITLE: "Repository Layout Overview",
      });
      const project = runtime.openProject(repoDir);
      const conv = runtime.createConversation({
        projectId: project.id,
        mode: "single",
        agentId: "chat-mock",
      });

      const deltas: string[] = [];
      runtime.subscribeEvents((ev) => {
        if (ev.type === "message.delta" && ev.conversationId === conv.id) {
          deltas.push((ev.payload as { text: string }).text);
        }
      });

      const res = await runtime.sendMessage({
        conversationId: conv.id,
        content: "Explain the repository layout",
      });

      expect(res.stopReason).toBe("end_turn");
      expect(deltas.join("")).toContain("[chat-mock] Completed step");
      // Regression guard: persisted assistant text MUST match streamed deltas exactly (never doubled!)
      expect(res.assistantMessage?.content).toBe(deltas.join("").trim());
      const segs = (res.assistantMessage?.metadata as { segments?: Array<{ type: string; text?: string }> } | null)?.segments ?? [];
      expect(segs.some((s) => s.type === "thought")).toBe(true);
      expect(segs.some((s) => s.type === "tool")).toBe(true);
      expect(segs.some((s) => s.type === "text")).toBe(true);
      expect(res.assistantMessage?.content).not.toContain("Analyzing workspace context");

      // Follow-up turn on reused live client must also never double text or carry over prior turns' tool calls
      deltas.length = 0;
      const res2 = await runtime.sendMessage({
        conversationId: conv.id,
        content: "Second follow-up question",
      });
      expect(res2.stopReason).toBe("end_turn");
      expect(res2.assistantMessage?.content).toBe(deltas.join("").trim());
      const segs2 = (res2.assistantMessage?.metadata as { segments?: Array<{ type: string; toolCallId?: string }> } | null)?.segments ?? [];
      expect(segs2.filter((s) => s.type === "tool")).toHaveLength(1);

      const detail = runtime.getConversationDetail(conv.id);
      expect(detail.messages).toHaveLength(4);
      // ACP session_info_update title should automatically become the CodeTeams conversation title
      expect(detail.conversation.title).toBe("Repository Layout Overview");

      // Manual rename by the user must NOT be overwritten by subsequent ACP session_info_update events
      runtime.renameConversation(conv.id, "Custom User Title");
      await runtime.sendMessage({
        conversationId: conv.id,
        content: "Third question after manual rename",
      });
      expect(runtime.getConversationDetail(conv.id).conversation.title).toBe(
        "Custom User Title"
      );
    } finally {
      await runtime.shutdown();
    }
  });

  test("async single-agent send returns immediately, tracks running/waiting_permission/completed states, and resumes after approval", async () => {
    const userData = createTempDir("ct-async-chat-data-");
    const repoDir = createTempDir("ct-async-chat-repo-");
    const storage = new CodeTeamsStorage(userData);
    const runtime = new CodeTeamsRuntime(storage);

    try {
      registerMockAgent(runtime, "async-perm-mock", "Async Perm Mock", {
        MOCK_AGENT_NAME: "async-perm-mock",
        MOCK_REQUEST_PERMISSION: "1",
        MOCK_DELAY_MS: "20",
      });
      const project = runtime.openProject(repoDir);
      const conv = runtime.createConversation({
        projectId: project.id,
        mode: "single",
        agentId: "async-perm-mock",
      });

      const chatStates: string[] = [];
      let resolvePermRequested: ((perm: { id: string; options: Array<{ optionId: string; kind: string }> }) => void) | null = null;
      const permRequestedPromise = new Promise<{
        id: string;
        options: Array<{ optionId: string; kind: string }>;
      }>((resolve) => {
        resolvePermRequested = resolve;
      });

      runtime.subscribeEvents((ev) => {
        if (ev.type === "chat.state" && ev.conversationId === conv.id) {
          chatStates.push((ev.payload as { state: string }).state);
        }
        if (ev.type === "permission.requested" && ev.conversationId === conv.id) {
          resolvePermRequested?.(
            ev.payload as {
              id: string;
              options: Array<{ optionId: string; kind: string }>;
            }
          );
        }
      });

      // Async send MUST return immediately while the agent is still running / waiting for approval
      const t0 = Date.now();
      const accepted = await runtime.sendMessage({
        conversationId: conv.id,
        content: "Run a terminal tool requiring permission",
        async: true,
      });
      expect(accepted.accepted).toBe(true);
      expect(accepted.turnState).toBe("running");
      expect(accepted.assistantMessage).toBeUndefined();
      expect(Date.now() - t0).toBeLessThan(2000);

      // Wait until the agent requests permission
      const perm = await permRequestedPromise;
      const waitingDetail = runtime.getConversationDetail(conv.id);
      expect(waitingDetail.activeTurn?.state).toBe("waiting_permission");
      expect(waitingDetail.conversation.activeTurn?.state).toBe("waiting_permission");
      expect(waitingDetail.pendingPermissions).toHaveLength(1);
      expect(waitingDetail.pendingPermissions[0]!.id).toBe(perm.id);

      // Duplicate send while waiting for permission must be rejected cleanly with WORKSPACE_BUSY
      await expect(
        runtime.sendMessage({
          conversationId: conv.id,
          content: "Duplicate send",
          async: true,
        })
      ).rejects.toThrow(/Another request is currently active/i);

      // Approve the permission and verify the turn transitions back to running -> completed
      const allowOpt = perm.options.find((o) => o.kind === "allow_once");
      runtime.permissions.respond({
        permissionId: perm.id,
        outcome: "selected",
        optionId: allowOpt!.optionId,
      });

      await runtime.waitForChatTurn(conv.id);

      expect(chatStates).toEqual([
        "running",
        "waiting_permission",
        "running",
        "completed",
      ]);

      const finalDetail = runtime.getConversationDetail(conv.id);
      expect(finalDetail.activeTurn).toBeNull();
      expect(finalDetail.pendingPermissions).toHaveLength(0);
      expect(finalDetail.messages.some((m) => m.role === "assistant")).toBe(true);
    } finally {
      await runtime.shutdown();
    }
  });

  test("workspace file tree, file preview, and path traversal protection work safely", async () => {
    const userData = createTempDir("ct-ws-tree-data-");
    const repoDir = createTempDir("ct-ws-tree-repo-");
    writeFileSync(join(repoDir, "README.md"), "# Workspace Test\nHello\n", "utf8");
    const storage = new CodeTeamsStorage(userData);
    const runtime = new CodeTeamsRuntime(storage);

    try {
      const project = runtime.openProject(repoDir, "WS Repo");
      const listed = runtime.listWorkspaceFiles(project.id);
      expect(listed.entries.some((e) => e.name === "README.md" && e.kind === "file")).toBe(true);

      const preview = runtime.readWorkspaceFile(project.id, "README.md");
      expect(preview.binary).toBe(false);
      expect(preview.content).toContain("# Workspace Test");

      expect(() => runtime.readWorkspaceFile(project.id, "../../etc/passwd")).toThrow();
    } finally {
      await runtime.shutdown();
    }
  });

  test("Bun Core standalone JSON-RPC 2.0 stdio protocol round-trip", async () => {
    const userData = createTempDir("ct-rpc-");
    const proc = Bun.spawn(
      [process.execPath, "run", coreEntryPath, "--user-data-dir", userData],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" }
    );

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    async function readNextFrame(): Promise<Record<string, unknown>> {
      while (true) {
        const idx = buf.indexOf("\n");
        if (idx !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line) return JSON.parse(line);
        }
        const { done, value } = await reader.read();
        if (done) throw new Error("Core stdout closed unexpectedly");
        buf += decoder.decode(value, { stream: true });
      }
    }

    try {
      const ready = await readNextFrame();
      expect(ready.method).toBe("core.ready");

      // Send system.ping & agents.list over JSON-RPC stdio
      proc.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "system.ping", params: {} }) + "\n"
      );
      proc.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "agents.list", params: {} }) + "\n"
      );
      proc.stdin.flush();

      const resp1 = await readNextFrame();
      expect(resp1.id).toBe(1);
      expect((resp1.result as { ok: boolean }).ok).toBe(true);

      const resp2 = await readNextFrame();
      expect(resp2.id).toBe(2);
      expect((resp2.result as unknown[]).length).toBe(20);
    } finally {
      proc.stdin.end();
      await proc.exited;
    }
  });
});
