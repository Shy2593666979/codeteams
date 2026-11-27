import React, { useEffect } from "react";
import { HashRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import type {
  CoreEvent,
  TurnPlanEntry,
  TurnSegment,
  TurnToolDiff,
  TurnToolLocation,
} from "@codeteams/shared";
import { getBridge, rpc, subscribeCoreEvents } from "./lib/bridge";
import i18n from "./lib/i18n";
import {
  agentLogosAtom,
  liveEventsAtom,
  liveStreamMapAtom,
  pendingChatTurnsAtom,
} from "./store/atoms";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { HomePage } from "./pages/HomePage";
import { ChatRunPage } from "./pages/ChatRunPage";
import { WorkflowsListPage } from "./pages/WorkflowsListPage";
import { WorkflowEditorPage } from "./pages/WorkflowEditorPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { SettingsPage } from "./pages/SettingsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3000,
      refetchOnWindowFocus: false,
    },
  },
});

const CoreBootstrap: React.FC = () => {
  const qc = useQueryClient();
  const setLogos = useSetAtom(agentLogosAtom);
  const setStreams = useSetAtom(liveStreamMapAtom);
  const setPendingTurns = useSetAtom(pendingChatTurnsAtom);
  const setLiveEvents = useSetAtom(liveEventsAtom);

  useEffect(() => {
    void getBridge()
      .getAgentLogos()
      .then((logos) => setLogos(logos))
      .catch(() => {});

    void rpc<"settings.getAll", Record<string, unknown>>("settings.getAll")
      .then((settings) => {
        if (settings.language === "en" || settings.language === "zh-CN") {
          void i18n.changeLanguage(settings.language);
        }
      })
      .catch(() => {});

    type QueuedChunk = {
      kind: "text" | "thought";
      agentId: string;
      chars: string[];
    };
    const pendingQueues = new Map<string, QueuedChunk[]>();
    let rafId: number | null = null;

    const finalizeTrailingThought = (segments: TurnSegment[]) => {
      const last = segments.at(-1);
      if (last && last.type === "thought" && last.durationMs == null) {
        segments[segments.length - 1] = {
          ...last,
          durationMs: last.startedAt
            ? Math.max(0, Date.now() - last.startedAt)
            : 0,
        };
      }
    };

    const applyChunkToStream = (
      prev: Record<
        string,
        {
          agentId: string;
          text: string;
          segments: TurnSegment[];
          updatedAt: number;
        }
      >,
      key: string,
      kind: "text" | "thought",
      agentId: string,
      delta: string
    ) => {
      if (!delta) return prev;
      const cur = prev[key];
      const segments: TurnSegment[] = cur ? [...cur.segments] : [];
      if (kind === "thought") {
        const last = segments.at(-1);
        if (last && last.type === "thought") {
          segments[segments.length - 1] = {
            ...last,
            text: last.text + delta,
          };
        } else {
          segments.push({
            type: "thought",
            text: delta,
            startedAt: Date.now(),
          });
        }
        return {
          ...prev,
          [key]: {
            agentId: agentId || cur?.agentId || "agent",
            text: cur?.text ?? "",
            segments,
            updatedAt: Date.now(),
          },
        };
      }

      finalizeTrailingThought(segments);
      const last = segments.at(-1);
      if (last && last.type === "text") {
        segments[segments.length - 1] = {
          type: "text",
          text: last.text + delta,
        };
      } else {
        segments.push({ type: "text", text: delta });
      }
      return {
        ...prev,
        [key]: {
          agentId: agentId || cur?.agentId || "agent",
          text: (cur?.text ?? "") + delta,
          segments,
          updatedAt: Date.now(),
        },
      };
    };

    // Flush all buffered text/thought chars for a key immediately before structural events (tool/plan)
    const flushQueueForKey = (key: string) => {
      const queue = pendingQueues.get(key);
      if (!queue || queue.length === 0) return;
      pendingQueues.delete(key);
      setStreams((prev) => {
        let next = prev;
        for (const item of queue) {
          if (item.chars.length === 0) continue;
          next = applyChunkToStream(
            next,
            key,
            item.kind,
            item.agentId,
            item.chars.join("")
          );
        }
        return next;
      });
    };

    const pumpSmoothStreams = () => {
      rafId = null;
      if (pendingQueues.size === 0) return;

      const drained: Array<{
        key: string;
        kind: "text" | "thought";
        agentId: string;
        delta: string;
      }> = [];

      for (const [key, queue] of pendingQueues.entries()) {
        let totalRemaining = 0;
        for (const item of queue) totalRemaining += item.chars.length;
        if (totalRemaining === 0) {
          pendingQueues.delete(key);
          continue;
        }

        // Smooth adaptive pacing: gentle steady glide on small bursts, fast smooth catch-up on large chunks
        let budget =
          totalRemaining <= 16
            ? 2
            : totalRemaining <= 72
              ? Math.ceil(totalRemaining / 7)
              : Math.ceil(totalRemaining / 5);

        while (budget > 0 && queue.length > 0) {
          const head = queue[0]!;
          if (head.chars.length <= budget) {
            const delta = head.chars.join("");
            budget -= head.chars.length;
            queue.shift();
            if (delta) {
              drained.push({ key, kind: head.kind, agentId: head.agentId, delta });
            }
          } else {
            const slice = head.chars.splice(0, budget);
            budget = 0;
            drained.push({
              key,
              kind: head.kind,
              agentId: head.agentId,
              delta: slice.join(""),
            });
          }
        }

        if (queue.length === 0) {
          pendingQueues.delete(key);
        }
      }

      if (drained.length > 0) {
        setStreams((prev) => {
          let next = prev;
          for (const d of drained) {
            next = applyChunkToStream(next, d.key, d.kind, d.agentId, d.delta);
          }
          return next;
        });
      }

      if (pendingQueues.size > 0) {
        rafId = window.requestAnimationFrame(pumpSmoothStreams);
      }
    };

    const enqueueDelta = (
      key: string,
      kind: "text" | "thought",
      agentId: string,
      text: string
    ) => {
      if (!text) return;
      const chars = Array.from(text);
      let queue = pendingQueues.get(key);
      if (!queue) {
        queue = [];
        pendingQueues.set(key, queue);
      }
      const last = queue.at(-1);
      if (last && last.kind === kind && last.agentId === agentId) {
        last.chars.push(...chars);
      } else {
        queue.push({ kind, agentId, chars });
      }
      if (rafId === null) {
        rafId = window.requestAnimationFrame(pumpSmoothStreams);
      }
    };

    const unsub = subscribeCoreEvents((ev: CoreEvent) => {
      if (ev.type === "thought.delta" && ev.conversationId) {
        const p = ev.payload as { agentId?: string; text?: string };
        const key = `${ev.conversationId}:${ev.nodeRunId ?? "chat"}`;
        if (p.text) {
          enqueueDelta(key, "thought", p.agentId ?? "agent", p.text);
        }
        return;
      }

      if (ev.type === "message.delta" && ev.conversationId) {
        const p = ev.payload as { agentId?: string; text?: string };
        const key = `${ev.conversationId}:${ev.nodeRunId ?? "chat"}`;
        if (p.text) {
          enqueueDelta(key, "text", p.agentId ?? "agent", p.text);
        }
        return;
      }

      // Only record structured lifecycle/tool/plan events in liveEventsAtom (never spam with raw token deltas)
      setLiveEvents((prev) => [...prev.slice(-199), ev]);

      if (
        (ev.type === "tool.started" ||
          ev.type === "tool.updated" ||
          ev.type === "tool.completed") &&
        ev.conversationId
      ) {
        const p = ev.payload as {
          agentId?: string;
          toolCallId?: string;
          title?: string | null;
          kind?: string | null;
          status?: string | null;
          locations?: TurnToolLocation[];
          rawInputPreview?: string | null;
          rawOutputPreview?: string | null;
          contentPreview?: string | null;
          diffs?: TurnToolDiff[];
        };
        const key = `${ev.conversationId}:${ev.nodeRunId ?? "chat"}`;
        flushQueueForKey(key);
        const toolCallId = p.toolCallId || ev.eventId;
        const fallbackStatus =
          ev.type === "tool.completed"
            ? "completed"
            : ev.type === "tool.started"
              ? "in_progress"
              : "in_progress";

        setStreams((prev) => {
          const cur = prev[key];
          const segments: TurnSegment[] = cur ? [...cur.segments] : [];
          finalizeTrailingThought(segments);
          const idx = segments.findIndex(
            (s) => s.type === "tool" && s.toolCallId === toolCallId
          );
          if (idx !== -1) {
            const existing = segments[idx] as Extract<
              TurnSegment,
              { type: "tool" }
            >;
            segments[idx] = {
              ...existing,
              title: p.title || existing.title,
              kind: p.kind || existing.kind,
              status: p.status || (ev.type === "tool.completed" ? "completed" : existing.status),
              locations:
                p.locations && p.locations.length > 0
                  ? p.locations
                  : existing.locations,
              rawInputPreview: p.rawInputPreview ?? existing.rawInputPreview,
              rawOutputPreview: p.rawOutputPreview ?? existing.rawOutputPreview,
              contentPreview: p.contentPreview ?? existing.contentPreview,
              diffs:
                p.diffs && p.diffs.length > 0 ? p.diffs : existing.diffs,
            };
          } else {
            segments.push({
              type: "tool",
              toolCallId,
              agentId: p.agentId ?? cur?.agentId ?? "agent",
              title: p.title || "执行工具操作",
              kind: p.kind || "other",
              status: p.status || fallbackStatus,
              locations: p.locations ?? [],
              rawInputPreview: p.rawInputPreview ?? null,
              rawOutputPreview: p.rawOutputPreview ?? null,
              contentPreview: p.contentPreview ?? null,
              ...(p.diffs && p.diffs.length > 0 ? { diffs: p.diffs } : {}),
            });
          }
          return {
            ...prev,
            [key]: {
              agentId: p.agentId ?? cur?.agentId ?? "agent",
              text: cur?.text ?? "",
              segments,
              updatedAt: Date.now(),
            },
          };
        });
        return;
      }

      if (ev.type === "plan.updated" && ev.conversationId) {
        const p = ev.payload as {
          agentId?: string;
          entries?: TurnPlanEntry[];
        };
        if (Array.isArray(p?.entries)) {
          const key = `${ev.conversationId}:${ev.nodeRunId ?? "chat"}`;
          flushQueueForKey(key);
          setStreams((prev) => {
            const cur = prev[key];
            const segments: TurnSegment[] = cur ? [...cur.segments] : [];
            finalizeTrailingThought(segments);
            const idx = segments.findIndex((s) => s.type === "plan");
            const nextPlan: TurnSegment = {
              type: "plan",
              agentId: p.agentId ?? cur?.agentId ?? "agent",
              entries: p.entries!,
            };
            if (idx !== -1) {
              segments[idx] = nextPlan;
            } else {
              segments.push(nextPlan);
            }
            return {
              ...prev,
              [key]: {
                agentId: p.agentId ?? cur?.agentId ?? "agent",
                text: cur?.text ?? "",
                segments,
                updatedAt: Date.now(),
              },
            };
          });
        }
        return;
      }

      if (ev.type === "message.completed" && ev.conversationId) {
        const p = ev.payload as { role?: string } | undefined;
        if (p?.role === "assistant" || ev.nodeRunId) {
          const key = `${ev.conversationId}:${ev.nodeRunId ?? "chat"}`;
          pendingQueues.delete(key);
          setStreams((prev) => {
            if (!(key in prev)) return prev;
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        }
        void qc.invalidateQueries({
          queryKey: ["conversation", ev.conversationId],
        });
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        return;
      }

      if (ev.type === "permission.resolved" && ev.conversationId) {
        const p = ev.payload as { requestId?: string; decision?: string };
        if (p?.requestId && p.decision === "auto_approved") {
          const key = `${ev.conversationId}:${ev.nodeRunId ?? "chat"}`;
          setStreams((prev) => {
            const cur = prev[key];
            if (!cur) return prev;
            const idx = cur.segments.findIndex(
              (s) => s.type === "tool" && s.toolCallId === p.requestId
            );
            if (idx === -1) return prev;
            const nextSegments = [...cur.segments];
            const existing = nextSegments[idx] as Extract<
              TurnSegment,
              { type: "tool" }
            >;
            nextSegments[idx] = { ...existing, autoApproved: true };
            return {
              ...prev,
              [key]: { ...cur, segments: nextSegments, updatedAt: Date.now() },
            };
          });
        }
      }

      if (ev.type === "conversation.updated" && ev.conversationId) {
        const title = (ev.payload as { title?: string } | undefined)?.title;
        if (title) {
          const convId = ev.conversationId;
          qc.setQueryData<Record<string, unknown> | undefined>(
            ["conversation", convId],
            (prev) => {
              if (!prev) return prev;
              const prevConv = prev.conversation as
                | Record<string, unknown>
                | undefined;
              return prevConv
                ? { ...prev, conversation: { ...prevConv, title } }
                : prev;
            }
          );
          qc.setQueryData<Array<Record<string, unknown>> | undefined>(
            ["conversations"],
            (prev) =>
              prev?.map((c) => (c.id === convId ? { ...c, title } : c))
          );
          if (ev.projectId) {
            void qc.invalidateQueries({
              queryKey: ["project-conversations", ev.projectId],
            });
          }
        }
        return;
      }

      if (ev.type === "chat.state" && ev.conversationId) {
        const p = ev.payload as {
          agentId?: string;
          state?: string;
          startedAt?: string;
        };
        const convId = ev.conversationId;
        const isTerminal =
          p?.state === "completed" ||
          p?.state === "failed" ||
          p?.state === "cancelled";

        const nextActiveTurn =
          p?.state === "running" || p?.state === "waiting_permission"
            ? {
                agentId: p.agentId ?? "agent",
                state: p.state,
                startedAt: p.startedAt ?? ev.timestamp,
              }
            : null;

        // Optimistically sync activeTurn in React Query cache for instant, flicker-free UI transitions
        qc.setQueryData<Record<string, unknown> | undefined>(
          ["conversation", convId],
          (prev) => {
            if (!prev) return prev;
            const prevConv = prev.conversation as
              | Record<string, unknown>
              | undefined;
            return {
              ...prev,
              activeTurn: nextActiveTurn,
              ...(prevConv
                ? { conversation: { ...prevConv, activeTurn: nextActiveTurn } }
                : {}),
            };
          }
        );

        setPendingTurns((prev) => {
          if (!(convId in prev)) return prev;
          const copy = { ...prev };
          delete copy[convId];
          return copy;
        });

        if (isTerminal) {
          const chatKey = `${convId}:chat`;
          pendingQueues.delete(chatKey);
          setStreams((prev) => {
            if (!(chatKey in prev)) return prev;
            const copy = { ...prev };
            delete copy[chatKey];
            return copy;
          });
        }

        void qc.invalidateQueries({ queryKey: ["conversation", convId] });
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        return;
      }

      if (
        ev.type === "run.state" ||
        ev.type === "node.state" ||
        ev.type === "permission.requested" ||
        ev.type === "permission.resolved" ||
        ev.type === "context.handoff.saved"
      ) {
        if (ev.type === "run.state" && ev.conversationId) {
          const p = ev.payload as { state?: string } | undefined;
          if (
            p?.state === "completed" ||
            p?.state === "failed" ||
            p?.state === "cancelled" ||
            p?.state === "interrupted" ||
            p?.state === "paused"
          ) {
            const prefix = `${ev.conversationId}:`;
            for (const qk of Array.from(pendingQueues.keys())) {
              if (qk.startsWith(prefix)) pendingQueues.delete(qk);
            }
            setStreams((prev) => {
              const keys = Object.keys(prev).filter((k) => k.startsWith(prefix));
              if (keys.length === 0) return prev;
              const copy = { ...prev };
              for (const k of keys) delete copy[k];
              return copy;
            });
          }
        }
        if (ev.runId) {
          void qc.invalidateQueries({ queryKey: ["run", ev.runId] });
        }
        if (ev.conversationId) {
          void qc.invalidateQueries({
            queryKey: ["conversation", ev.conversationId],
          });
        }
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        return;
      }

      if (ev.type === "agent.connection") {
        void qc.invalidateQueries({ queryKey: ["agents"] });
      }
    });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      pendingQueues.clear();
      unsub();
    };
  }, [qc, setLogos, setStreams, setPendingTurns, setLiveEvents]);

  return null;
};

const ShellLayout: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    return getBridge().onNavigate((targetPath) => {
      navigate(targetPath);
    });
  }, [navigate]);

  // Chat page renders its own unified single-row header integrated with the window titlebar
  const isChatPage = pathname.startsWith("/chat/");

  return (
    <div className="ct-shell h-screen w-screen flex overflow-hidden bg-white">
      <CoreBootstrap />
      <a className="ct-skip-link" href="#main-content">
        跳转到主要内容
      </a>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {!isChatPage && <TopBar />}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 min-w-0 min-h-0 overflow-hidden"
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat/:id" element={<ChatRunPage />} />
            <Route path="/workflows" element={<WorkflowsListPage />} />
            <Route path="/workflows/new" element={<WorkflowEditorPage />} />
            <Route path="/workflows/:id" element={<WorkflowEditorPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ShellLayout />
      </HashRouter>
    </QueryClientProvider>
  );
};
