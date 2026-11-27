#!/usr/bin/env bun
/**
 * Real ACP v1 Mock Agent Server over stdio using `@agentclientprotocol/sdk`.
 *
 * Supports configurable behaviors via env vars for deterministic testing:
 * - MOCK_AGENT_NAME: name reported in initialize (default: "mock-acp-agent")
 * - MOCK_SUPPORTS_LOAD: "1" to advertise loadSession and replay prior history
 * - MOCK_REQUEST_PERMISSION: "1" to send `session/request_permission` before completing
 * - MOCK_WRITE_FILE: relative path to write via `fs/write_text_file`
 * - MOCK_READ_FILE: relative path to read via `fs/read_text_file`
 * - MOCK_FAIL_PROMPT: "1" to return JSON-RPC error on prompt
 * - MOCK_DISCONNECT_MID_PROMPT: "1" to crash/exit mid-turn
 * - MOCK_STOP_REASON: custom stopReason (default: "end_turn")
 * - MOCK_DELAY_MS: artificial streaming delay per chunk (default: 15)
 * - MOCK_STATE_FILE: JSON file path to persist mock sessions across restarts
 */
import * as acp from "@agentclientprotocol/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const agentName = process.env.MOCK_AGENT_NAME ?? "mock-acp-agent";
const supportsLoad = process.env.MOCK_SUPPORTS_LOAD === "1";
const requestPermission = process.env.MOCK_REQUEST_PERMISSION === "1";
const writeFileRel = process.env.MOCK_WRITE_FILE ?? "";
const readFileRel = process.env.MOCK_READ_FILE ?? "";
const failPrompt = process.env.MOCK_FAIL_PROMPT === "1";
const disconnectMidPrompt = process.env.MOCK_DISCONNECT_MID_PROMPT === "1";
const customStopReason = (process.env.MOCK_STOP_REASON ?? "end_turn") as acp.StopReason;
const delayMs = Number(process.env.MOCK_DELAY_MS ?? "15");
const stateFile = process.env.MOCK_STATE_FILE ?? "";
const sessionTitle = process.env.MOCK_SESSION_TITLE ?? "";
const postTurnTitle = process.env.MOCK_POST_TURN_TITLE ?? "";

interface SessionRecord {
  id: string;
  cwd: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  toolHistory?: Array<{ toolCallId: string; title: string }>;
}

const sessions = new Map<string, SessionRecord>();
const cancelledSessions = new Set<string>();

function loadPersistedSessions() {
  if (!stateFile || !existsSync(stateFile)) return;
  try {
    const raw = JSON.parse(readFileSync(stateFile, "utf8")) as SessionRecord[];
    for (const s of raw) {
      sessions.set(s.id, s);
    }
  } catch {
    // Ignore corrupt state file in tests
  }
}

function persistSessions() {
  if (!stateFile) return;
  writeFileSync(
    stateFile,
    JSON.stringify(Array.from(sessions.values()), null, 2),
    "utf8"
  );
}

loadPersistedSessions();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Wrap stdout as WritableStream and stdin as ReadableStream for real stdio ACP
const stdoutStream = new WritableStream<Uint8Array>({
  write(chunk) {
    process.stdout.write(chunk);
  },
});

const stdinStream = Bun.stdin.stream();
const stream = acp.ndJsonStream(stdoutStream, stdinStream);

const mockAgent = acp.agent({ name: agentName });

mockAgent.onRequest(acp.methods.agent.initialize, async ({ params }) => {
  return {
    protocolVersion: Math.min(params.protocolVersion, acp.PROTOCOL_VERSION),
    agentCapabilities: {
      loadSession: supportsLoad,
    },
    agentInfo: {
      name: agentName,
      title: `Mock ACP (${agentName})`,
      version: "1.0.0-mock",
    },
  };
});

mockAgent.onRequest(acp.methods.agent.session.new, async ({ params }) => {
  const sessionId = `mock_sess_${randomUUID().slice(0, 8)}`;
  sessions.set(sessionId, { id: sessionId, cwd: params.cwd, history: [] });
  persistSessions();
  return { sessionId };
});

mockAgent.onRequest(
  acp.methods.agent.session.load,
  async ({ params, client }) => {
    const existing = sessions.get(params.sessionId);
    if (!existing) {
      throw acp.RequestError.resourceNotFound(params.sessionId);
    }
    // Replay saved history (including historical tool_calls) as ACP session/update notifications per ACP v1 spec
    for (const tc of existing.toolHistory ?? []) {
      await client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: tc.toolCallId,
          title: tc.title,
          kind: "execute",
          status: "completed",
        },
      });
    }
    for (const item of existing.history) {
      await client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate:
            item.role === "user"
              ? "user_message_chunk"
              : "agent_message_chunk",
          content: { type: "text", text: item.text },
        },
      });
    }
    return {};
  }
);

mockAgent.onNotification(acp.methods.agent.session.cancel, ({ params }) => {
  cancelledSessions.add(params.sessionId);
});

mockAgent.onRequest(
  acp.methods.agent.session.prompt,
  async ({ params, client }) => {
    const session = sessions.get(params.sessionId);
    if (!session) {
      throw acp.RequestError.resourceNotFound(params.sessionId);
    }

    cancelledSessions.delete(params.sessionId);

    const promptText = params.prompt
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    session.history.push({ role: "user", text: promptText });
    persistSessions();

    if (failPrompt) {
      throw acp.RequestError.internalError({
        reason: "Simulated prompt failure",
      });
    }

    if (sessionTitle) {
      await client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "session_info_update",
          title: sessionTitle,
        },
      });
    }

    // Emit ACP thinking / reasoning summary chunks before plan & tool call
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "text",
          text: `[${agentName}] Analyzing workspace context and planning execution steps.`,
        },
      },
    });

    // Emit plan update
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "plan",
        entries: [
          {
            content: `[${agentName}] Analyze objective and inspect workspace`,
            priority: "high",
            status: "in_progress",
          },
          {
            content: `[${agentName}] Produce implementation summary`,
            priority: "medium",
            status: "pending",
          },
        ],
      },
    });

    const toolCallId = `tc_${randomUUID().slice(0, 8)}`;
    const toolTitle = `[${agentName}] Inspect project workspace`;
    session.toolHistory = session.toolHistory ?? [];
    // Simulate ACP servers (like Antigravity) that re-emit prior session tool calls on follow-up turns
    if (process.env.MOCK_REEMIT_PRIOR_TOOLS === "1") {
      for (const oldTc of session.toolHistory) {
        await client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: oldTc.toolCallId,
            title: oldTc.title,
            kind: "execute",
            status: "completed",
          },
        });
      }
    }
    session.toolHistory.push({ toolCallId, title: toolTitle });
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId,
        title: toolTitle,
        kind: "read",
        status: "in_progress",
      },
    });

    if (requestPermission) {
      const permResp = await client.request(
        acp.methods.client.session.requestPermission,
        {
          sessionId: params.sessionId,
          toolCall: {
            toolCallId,
            title: `Allow ${agentName} to modify workspace files`,
            kind: "edit",
          },
          options: [
            { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
            { optionId: "reject_once", name: "Reject", kind: "reject_once" },
          ],
        }
      );

      if (
        permResp.outcome.outcome === "cancelled" ||
        (permResp.outcome.outcome === "selected" &&
          permResp.outcome.optionId === "reject_once")
      ) {
        await client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId,
            status: "failed",
          },
        });
        return { stopReason: "refusal" };
      }
    }

    if (readFileRel) {
      const readRes = (await client.request(
        acp.methods.client.fs.readTextFile,
        {
          sessionId: params.sessionId,
          path: readFileRel,
        }
      )) as acp.ReadTextFileResponse;
      await client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: `[read:${readFileRel}:${readRes.content.length}chars] `,
          },
        },
      });
    }

    if (writeFileRel) {
      const nextContent = `Generated by ${agentName}\nObjective snippet: ${promptText.slice(0, 120)}\n`;
      await client.request(acp.methods.client.fs.writeTextFile, {
        sessionId: params.sessionId,
        path: writeFileRel,
        content: nextContent,
      });
      await client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          kind: "edit",
          title: `Edit ${writeFileRel}`,
          content: [
            {
              type: "diff",
              path: writeFileRel,
              oldText: `const oldLabel = "dark";\nexport const theme = oldLabel;\n`,
              newText: `const skyLabel = "sky-blue";\nexport const theme = skyLabel;\n`,
            },
          ],
        },
      });
    }

    if (disconnectMidPrompt) {
      await client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: `[${agentName}] Partial output before unexpected crash...`,
          },
        },
      });
      await sleep(20);
      process.exit(137);
    }

    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: "completed",
      },
    });

    const replyChunks = [
      `[${agentName}] Completed step for objective: `,
      `"${promptText.split("\n")[0]?.slice(0, 100) ?? ""}".\n`,
      `Decision: Proceeded cleanly using ACP v1 stdio transport.\n`,
      `Completed: Verified context and recorded output for downstream handoff.`,
    ];

    let fullReply = "";
    for (const chunk of replyChunks) {
      if (cancelledSessions.has(params.sessionId)) {
        return { stopReason: "cancelled" };
      }
      fullReply += chunk;
      await client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: chunk },
        },
      });
      if (delayMs > 0) await sleep(delayMs);
    }

    session.history.push({ role: "assistant", text: fullReply });
    persistSessions();

    if (postTurnTitle) {
      const sid = params.sessionId;
      setTimeout(() => {
        void client
          .notify(acp.methods.client.session.update, {
            sessionId: sid,
            update: {
              sessionUpdate: "session_info_update",
              title: postTurnTitle,
            },
          })
          .catch(() => {});
      }, 60);
    }

    return { stopReason: customStopReason };
  }
);

const conn = mockAgent.connect(stream);
await conn.closed;
