import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAtom, useAtomValue } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  Copy,
  FileText,
  GitBranch,
  PanelRight,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
} from "lucide-react";
import {
  duoFolder,
  duoShield,
  duoShieldCheck,
  duoUsers,
  duoZap,
  KubaiIcon,
} from "../components/kubai";
import type {
  ActiveChatTurn,
  AgentSession,
  AgentWithStatus,
  Artifact,
  ContextHandoff,
  Conversation,
  CoreEvent,
  Message,
  NodeRun,
  PermissionRequest,
  Project,
  RunCheckpoint,
  TurnSegment,
  WorkflowRecord,
  WorkflowRun,
  WorkspaceStatus,
} from "@codeteams/shared";
import { rpc } from "../lib/bridge";
import {
  acpPermissionModeAtom,
  liveEventsAtom,
  liveStreamMapAtom,
  pendingChatTurnsAtom,
} from "../store/atoms";
import { AgentLogo } from "../components/AgentLogo";
import { ChatTurnNavigation, chatTurnAnchorId } from "../components/ChatTurnNavigation";
import { StatusBadge } from "../components/StatusBadge";
import {
  AcpActivityPanel,
  InlinePlanCard,
  InlineThoughtCard,
  InlineToolCallCard,
} from "../components/AcpActivityPanel";
import {
  extractDiffsFromPermissionInput,
  InlineDiffList,
} from "../components/InlineDiffView";
import {
  WorkspaceInspectorDrawer,
  type InspectorDrawerTab,
} from "../components/WorkspaceInspectorDrawer";

interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
  sessions: AgentSession[];
  runs: WorkflowRun[];
  pendingPermissions: PermissionRequest[];
  activeTurn?: ActiveChatTurn | null;
}

function isRpcTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("RPC_TIMEOUT") || /timed out after \d+ms/i.test(msg);
}

function formatPermissionInputPreview(rawInput: unknown): string | null {
  if (rawInput === undefined || rawInput === null) return null;
  if (typeof rawInput === "string") {
    const s = rawInput.trim();
    return s ? (s.length > 4000 ? `${s.slice(0, 4000)}\n… (已截断)` : s) : null;
  }
  if (typeof rawInput === "object") {
    const obj = rawInput as Record<string, unknown>;
    for (const key of [
      "command",
      "cmd",
      "script",
      "CommandLine",
      "file_path",
      "path",
    ]) {
      if (typeof obj[key] === "string" && obj[key]!.trim()) {
        const s = obj[key]!.trim();
        return s.length > 4000 ? `${s.slice(0, 4000)}\n… (已截断)` : s;
      }
    }
    try {
      const json = JSON.stringify(rawInput, null, 2).trim();
      if (!json || json === "{}") return null;
      return json.length > 4000 ? `${json.slice(0, 4000)}\n… (已截断)` : json;
    } catch {
      return null;
    }
  }
  return String(rawInput);
}

function getPermissionActionLabel(toolKind?: string | null): string {
  const k = (toolKind ?? "").toLowerCase();
  if (k === "execute" || k === "command" || k === "shell" || k === "terminal") {
    return "执行终端命令";
  }
  if (k === "edit" || k === "write" || k === "move") return "编辑或写入文件";
  if (k === "delete") return "删除文件";
  if (k === "read") return "读取文件";
  if (k === "fetch") return "访问网络资源";
  return "执行工具操作";
}

interface RunDetail {
  run: WorkflowRun;
  nodeRuns: NodeRun[];
  checkpoint: RunCheckpoint | null;
  handoffs: ContextHandoff[];
  artifacts: Artifact[];
  pendingPermissions: PermissionRequest[];
}

const ChatCodeBlock: React.FC<{ language?: string; code: string }> = ({
  language,
  code,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="my-3.5 rounded-[13px] overflow-hidden bg-[#F7F7F8] border border-[#E4E4E7] shadow-[0_2px_10px_rgba(39,39,42,0.04)]">
      <div className="h-[36px] px-4 bg-[#EFEFF1] border-b border-[#E4E4E7]/80 flex items-center justify-between text-[12px] font-semibold text-[#27272A]">
        <span>{language || "Code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="复制代码"
          className="inline-flex items-center gap-1.5 px-2 py-1 -mr-1.5 rounded-[6px] font-medium text-[#27272A] hover:text-[#18181B] hover:bg-white/60 transition"
        >
          {copied ? (
            <>
              <Check size={13} className="text-[#059669]" />
              <span className="text-[#059669]">已复制</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[14px] leading-[1.7] font-mono text-[#27272A]">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const MarkdownTextBlock: React.FC<{ text: string }> = ({ text }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      pre({ children }) {
        const arr = React.Children.toArray(children);
        const first = arr[0];
        if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(first)) {
          const cls = first.props?.className ?? "";
          const langMatch = cls.match(/language-([\w-]+)/);
          const lang = langMatch
            ? langMatch[1]!
                .replace(/^ts$/i, "TypeScript")
                .replace(/^js$/i, "JavaScript")
            : undefined;
          const rawCode = String(first.props?.children ?? "").replace(/\n$/, "");
          return <ChatCodeBlock language={lang} code={rawCode} />;
        }
        return <ChatCodeBlock code={String(children ?? "").replace(/\n$/, "")} />;
      },
      table({ children }) {
        return (
          <div className="ct-md-table-wrap">
            <table>{children}</table>
          </div>
        );
      },
    }}
  >
    {text}
  </ReactMarkdown>
);

/** Compact, refined 3-dot waiting indicator shown while waiting for Agent output */
const ThinkingDotsBlock: React.FC<{
  agentId: string;
  agentName: string;
  stepNum?: number;
  statusText: string;
}> = ({ agentId, agentName, stepNum, statusText }) => (
  <div className="ct-thinking-wave py-4 space-y-2">
    <div className="flex items-center gap-3">
      <span className="w-[32px] h-[32px] rounded-full bg-[#F8FAFC] inline-flex items-center justify-center shrink-0">
        <AgentLogo agentId={agentId} name={agentName} size={21} />
      </span>
      <span className="text-[17px] font-bold text-[#141518] tracking-[-0.015em]">
        {agentName}
      </span>
      {stepNum && (
        <span className="px-2 py-0.5 rounded-[6px] bg-[#F1F3F7] text-[#64748B] text-[12px] font-medium">
          步骤 {stepNum}
        </span>
      )}
    </div>

    <div className="pl-[44px] flex items-center gap-2.5 text-[13.5px] text-[#64748B]">
      <span className="ct-dots-wave" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>{statusText}</span>
    </div>
  </div>
);

export const ChatRunPage: React.FC = () => {
  const { id: conversationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);

  const liveStreams = useAtomValue(liveStreamMapAtom);
  const liveEvents = useAtomValue(liveEventsAtom);
  const [pendingChatTurns, setPendingChatTurns] = useAtom(pendingChatTurnsAtom);
  const [permissionMode, setPermissionMode] = useAtom(acpPermissionModeAtom);

  const [followUp, setFollowUp] = useState("");
  const [sending, setSending] = useState(false);
  const [drawerTab, setDrawerTab] = useState<InspectorDrawerTab | null>(null);
  const [confirmReviewed, setConfirmReviewed] = useState(false);
  const [actionNotice, setActionNotice] = useState<{
    kind: "error" | "timeout";
    message: string;
  } | null>(null);
  const [respondingPermIds, setRespondingPermIds] = useState<
    Record<string, boolean>
  >({});

  const syncedConvIdRef = useRef<string | null>(null);

  const { data: agents = [] } = useQuery<AgentWithStatus[]>({
    queryKey: ["agents"],
    queryFn: () => rpc("agents.list"),
  });

  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents]
  );

  const { data: detail, isLoading } = useQuery<ConversationDetail>({
    queryKey: ["conversation", conversationId],
    queryFn: () =>
      rpc("conversations.get", { conversationId: conversationId! }),
    enabled: Boolean(conversationId),
  });

  const projectId = detail?.conversation.projectId;

  const { data: workflows = [] } = useQuery<WorkflowRecord[]>({
    queryKey: ["workflows", projectId],
    queryFn: () => rpc("workflows.list", projectId ? { projectId } : {}),
    enabled: Boolean(projectId),
  });

  const latestRun = detail?.runs[0] ?? null;

  const { data: runDetail } = useQuery<RunDetail>({
    queryKey: ["run", latestRun?.id],
    queryFn: () => rpc("runs.get", { runId: latestRun!.id }),
    enabled: Boolean(latestRun?.id),
  });

  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => rpc("projects.get", { projectId: projectId! }),
    enabled: Boolean(projectId),
  });

  const { data: wsStatus } = useQuery<WorkspaceStatus>({
    queryKey: ["workspace", projectId],
    queryFn: () =>
      rpc("projects.workspaceStatus", {
        projectId: projectId!,
      }),
    enabled: Boolean(projectId),
    staleTime: 10_000,
  });

  // Always load persisted conversation events so ACP tool calls & execution plans stay visible after reload
  const { data: persistedEventsResp } = useQuery<{
    latestSeq: number;
    events: CoreEvent[];
  }>({
    queryKey: ["events", conversationId],
    queryFn: () =>
      rpc("events.snapshotAfterCursor", {
        afterSeq: 0,
        conversationId: conversationId!,
        limit: 500,
      }),
    enabled: Boolean(conversationId),
  });

  // Reset transient notices when switching to a different conversation
  useEffect(() => {
    const conv = detail?.conversation;
    if (!conv || syncedConvIdRef.current === conv.id) return;
    syncedConvIdRef.current = conv.id;
    setActionNotice(null);
  }, [detail]);

  const activeStreamsForConv = useMemo(() => {
    if (!conversationId) return [];
    return Object.entries(liveStreams)
      .filter(([key]) => key.startsWith(`${conversationId}:`))
      .map(([, val]) => val);
  }, [liveStreams, conversationId]);

  // Merge persisted & live events for this conversation (deduplicated by eventId)
  const mergedConversationEvents = useMemo(() => {
    const byId = new Map<string, CoreEvent>();
    for (const ev of persistedEventsResp?.events ?? []) {
      byId.set(ev.eventId, ev);
    }
    for (const ev of liveEvents) {
      if (ev.conversationId === conversationId) {
        byId.set(ev.eventId, ev);
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.seq - b.seq);
  }, [persistedEventsResp?.events, liveEvents, conversationId]);

  // Group orphan ACP tool/plan events (from interrupted/pre-segment turns with no persisted assistant message)
  // directly under the exact user message they belong to, so historical turns keep chronological order & Agent avatars.
  const orphanEventsAfterMsgId = useMemo(() => {
    const map = new Map<string, CoreEvent[]>();
    const msgs = detail?.messages ?? [];
    if (mergedConversationEvents.length === 0 || msgs.length === 0) return map;

    const hasAssistantAfter = new Set<string>();
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]!;
      if (m.role !== "user") continue;
      for (let j = i + 1; j < msgs.length; j++) {
        if (msgs[j]!.role === "user") break;
        if (msgs[j]!.role === "assistant") {
          hasAssistantAfter.add(m.id);
          break;
        }
      }
    }

    let currentUserMsgId: string | null = null;
    for (const ev of mergedConversationEvents) {
      if (ev.type === "message.completed") {
        const p = ev.payload as { id?: string; role?: string } | undefined;
        if (p?.role === "user" && p.id) {
          currentUserMsgId = p.id;
        } else if (p?.role === "assistant") {
          currentUserMsgId = null;
        }
        continue;
      }
      if (
        currentUserMsgId &&
        !hasAssistantAfter.has(currentUserMsgId) &&
        (ev.type === "tool.started" ||
          ev.type === "tool.updated" ||
          ev.type === "tool.completed" ||
          ev.type === "plan.updated" ||
          ev.type === "permission.resolved")
      ) {
        const list = map.get(currentUserMsgId) ?? [];
        list.push(ev);
        map.set(currentUserMsgId, list);
      }
    }
    return map;
  }, [mergedConversationEvents, detail?.messages]);
  const handoffByNodeRunId = useMemo(() => {
    const map = new Map<string, ContextHandoff>();
    for (const h of runDetail?.handoffs ?? []) {
      map.set(h.sourceNodeRunId, h);
    }
    return map;
  }, [runDetail?.handoffs]);

  const nodeRunOrdinalById = useMemo(() => {
    const map = new Map<string, number>();
    for (const nr of runDetail?.nodeRuns ?? []) {
      map.set(nr.id, nr.ordinal + 1);
    }
    return map;
  }, [runDetail?.nodeRuns]);

  const allHandoffChangedFiles = useMemo(() => {
    const set = new Set<string>();
    for (const h of runDetail?.handoffs ?? []) {
      for (const f of h.changedFiles) set.add(f);
    }
    return Array.from(set);
  }, [runDetail?.handoffs]);

  const summaryBullets = useMemo(() => {
    const items: string[] = [];
    for (const h of runDetail?.handoffs ?? []) {
      for (const c of h.completed) {
        if (c.trim() && !items.includes(c.trim())) items.push(c.trim());
      }
      for (const d of h.decisions) {
        if (d.trim() && !items.includes(d.trim())) items.push(d.trim());
      }
    }
    if (items.length > 0) return items.slice(0, 5);
    const fallback: string[] = [];
    for (const h of runDetail?.handoffs ?? []) {
      if (h.summary.trim()) fallback.push(h.summary.trim());
    }
    return fallback.slice(0, 4);
  }, [runDetail?.handoffs]);

  const run = runDetail?.run ?? latestRun;
  const isRunActive = Boolean(
    run &&
      (run.state === "running" ||
        run.state === "queued" ||
        run.state === "waiting_permission")
  );
  const activeChatTurn =
    detail?.activeTurn ?? detail?.conversation.activeTurn ?? null;
  const isSingleActive = Boolean(activeChatTurn);
  const pendingTurn = conversationId
    ? pendingChatTurns[conversationId]
    : undefined;
  const isBusy =
    isRunActive || isSingleActive || sending || Boolean(pendingTurn);

  const liveStreamUpdatedAt = activeStreamsForConv.reduce(
    (max, s) => (s.updatedAt > max ? s.updatedAt : max),
    0
  );

  // Smoothly follow streaming output when the user is near the bottom (without yanking if scrolled up)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !isNearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [detail?.messages.length, activeStreamsForConv.length, liveStreamUpdatedAt, isBusy]);

  // Reset sticky-bottom when switching to a different conversation
  useEffect(() => {
    isNearBottomRef.current = true;
  }, [conversationId]);

  if (isLoading || !detail) {
    return (
      <div className="h-full flex items-center justify-center text-[#64748B] bg-white gap-2.5">
        <span className="ct-dots-wave" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="text-[14px]">加载对话记录...</span>
      </div>
    );
  }

  const { conversation, messages } = detail;
  // Merge conversation-level and run-level pending permissions deduplicated by id
  // so single-agent permissions are NEVER shadowed by an older workflow run in the same conversation.
  const pendingPermissions = (() => {
    const byId = new Map<string, PermissionRequest>();
    for (const p of detail.pendingPermissions ?? []) byId.set(p.id, p);
    for (const p of runDetail?.pendingPermissions ?? []) byId.set(p.id, p);
    return Array.from(byId.values());
  })();

  const isWaitingPermission =
    pendingPermissions.length > 0 ||
    activeChatTurn?.state === "waiting_permission" ||
    run?.state === "waiting_permission";

  const lockedMode = conversation.mode;
  const lockedAgentId =
    conversation.agentId ??
    detail.runs[0]?.workflowSnapshot.steps.at(-1)?.agentId ??
    "codex";
  const activeAgent = agentMap.get(lockedAgentId) ?? null;
  const activeWorkflow =
    workflows.find((w) => w.id === conversation.workflowId) ?? null;
  const lockedTeamSteps =
    activeWorkflow?.definition.steps ?? run?.workflowSnapshot.steps ?? [];
  const lockedTeamAgentIds = Array.from(
    new Set(lockedTeamSteps.map((s) => s.agentId))
  );
  const lockedTeamName =
    activeWorkflow?.name ?? run?.workflowSnapshot.name ?? "团队";

  const latestNodeByStep = new Map<string, NodeRun>();
  for (const nr of runDetail?.nodeRuns ?? []) {
    const prev = latestNodeByStep.get(nr.stepId);
    if (!prev || nr.attempt > prev.attempt) {
      latestNodeByStep.set(nr.stepId, nr);
    }
  }

  const activeWorkflowStep = (() => {
    if (!run || !isRunActive) return null;
    for (let i = 0; i < run.workflowSnapshot.steps.length; i++) {
      const step = run.workflowSnapshot.steps[i]!;
      const nr = latestNodeByStep.get(step.id);
      if (
        !nr ||
        nr.state === "running" ||
        nr.state === "pending" ||
        nr.state === "waiting_permission"
      ) {
        return {
          step,
          nodeRun: nr,
          stepNum: i + 1,
        };
      }
    }
    return null;
  })();

  const latestActiveToolKind = (() => {
    for (let i = mergedConversationEvents.length - 1; i >= 0; i--) {
      const ev = mergedConversationEvents[i]!;
      if (ev.type === "tool.started" || ev.type === "tool.updated") {
        const p = ev.payload as { kind?: string | null; status?: string };
        if (p.status !== "completed" && p.status !== "failed") {
          return p.kind || "other";
        }
      }
      if (ev.type === "tool.completed") break;
    }
    return null;
  })();

  const activeToolWaitLabel = (kind: string | null): string => {
    if (!kind) return "思考中";
    const k = kind.toLowerCase();
    if (k === "execute" || k === "command" || k === "shell" || k === "terminal") {
      return "正在执行终端命令";
    }
    if (k === "read") return "正在读取文件";
    if (k === "edit" || k === "write" || k === "move") return "正在编辑文件";
    if (k === "search") return "正在检索代码";
    if (k === "fetch") return "正在获取网络信息";
    return "正在调用工具";
  };

  const hasAnySegmentedContent =
    messages.some((m) => {
      const segs = (m.metadata as { segments?: unknown } | null)?.segments;
      return Array.isArray(segs) && segs.length > 0;
    }) || activeStreamsForConv.some((s) => s.segments.length > 0);

  // Show the compact 3-dot waiting indicator whenever busy and no live stream segment has started yet
  const thinkingInfo = (() => {
    if (activeStreamsForConv.length > 0) return null;
    if (activeWorkflowStep) {
      const a = agentMap.get(activeWorkflowStep.step.agentId);
      return {
        agentId: activeWorkflowStep.step.agentId,
        agentName: a?.name ?? activeWorkflowStep.step.agentId,
        stepNum: activeWorkflowStep.stepNum,
        statusText: isWaitingPermission
          ? "等待授权"
          : activeToolWaitLabel(latestActiveToolKind),
      };
    }
    if (activeChatTurn) {
      const a = agentMap.get(activeChatTurn.agentId);
      return {
        agentId: activeChatTurn.agentId,
        agentName: a?.name ?? activeChatTurn.agentId,
        stepNum: undefined,
        statusText: isWaitingPermission
          ? "等待授权"
          : activeToolWaitLabel(latestActiveToolKind),
      };
    }
    if (pendingTurn || sending) {
      const targetId = pendingTurn?.agentId ?? activeAgent?.id ?? "codex";
      const a = agentMap.get(targetId);
      return {
        agentId: targetId,
        agentName: a?.name ?? targetId,
        stepNum: undefined,
        statusText: isWaitingPermission
          ? "等待授权"
          : activeToolWaitLabel(latestActiveToolKind),
      };
    }
    return null;
  })();

  const showOptimisticPrompt = Boolean(
    pendingTurn?.optimisticPrompt &&
      !messages.some(
        (m) => m.role === "user" && m.content === pendingTurn.optimisticPrompt
      )
  );

  const refreshAll = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["conversation", conversationId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["events", conversationId],
    });
    if (run?.id) {
      await queryClient.invalidateQueries({ queryKey: ["run", run.id] });
    }
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const reportActionError = (err: unknown) => {
    if (isRpcTimeoutError(err)) {
      setActionNotice({
        kind: "timeout",
        message:
          "与本地 Core 通信等待超时，后台任务可能仍在运行或等待你的授权批准，请先刷新查看状态，勿重复发送。",
      });
      void refreshAll();
    } else {
      setActionNotice({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handlePermissionDecision = async (
    perm: PermissionRequest,
    outcome: "selected" | "cancelled",
    optionId?: string
  ) => {
    setActionNotice(null);
    setRespondingPermIds((prev) => ({ ...prev, [perm.id]: true }));
    try {
      await rpc("permissions.respond", {
        permissionId: perm.id,
        outcome,
        optionId,
      });
      await refreshAll();
    } catch (err) {
      reportActionError(err);
    } finally {
      setRespondingPermIds((prev) => {
        if (!(perm.id in prev)) return prev;
        const copy = { ...prev };
        delete copy[perm.id];
        return copy;
      });
    }
  };

  const handleStop = async () => {
    setActionNotice(null);
    try {
      if (run && isRunActive) {
        await rpc("runs.cancel", { runId: run.id });
      } else {
        await rpc("conversations.cancel", { conversationId: conversation.id });
      }
      setPendingChatTurns((prev) => {
        if (!(conversation.id in prev)) return prev;
        const copy = { ...prev };
        delete copy[conversation.id];
        return copy;
      });
      await refreshAll();
    } catch (err) {
      reportActionError(err);
    }
  };

  const handlePauseAfterCurrent = async () => {
    if (!run) return;
    setActionNotice(null);
    try {
      await rpc("runs.pauseAfterCurrent", { runId: run.id });
      await refreshAll();
    } catch (err) {
      reportActionError(err);
    }
  };

  const handleResume = async () => {
    if (!run) return;
    setActionNotice(null);
    try {
      await rpc("runs.resume", {
        runId: run.id,
        confirmSideEffectsReviewed:
          run.state === "interrupted" ? confirmReviewed : true,
      });
      setConfirmReviewed(false);
      await refreshAll();
    } catch (err) {
      reportActionError(err);
    }
  };

  const handleSendFollowUp = async () => {
    const trimmed = followUp.trim();
    if (!trimmed || isBusy) return;

    const targetWorkflowId = activeWorkflow?.id ?? conversation.workflowId;
    if (lockedMode === "single" && !lockedAgentId) {
      setActionNotice({ kind: "error", message: t("home.needTargetWarning") });
      return;
    }
    if (lockedMode === "workflow" && !targetWorkflowId) {
      setActionNotice({ kind: "error", message: t("home.needTargetWarning") });
      return;
    }

    setActionNotice(null);
    setSending(true);
    setFollowUp("");

    const startedAtMs = Date.now();
    const startedAtIso = new Date(startedAtMs).toISOString();
    if (lockedMode === "single" && lockedAgentId) {
      setPendingChatTurns((prev) => ({
        ...prev,
        [conversation.id]: {
          agentId: lockedAgentId,
          startedAt: startedAtMs,
          optimisticPrompt: trimmed,
        },
      }));
    }

    try {
      await rpc("conversations.send", {
        conversationId: conversation.id,
        content: trimmed,
        idempotencyKey: `followup-${conversation.id}-${startedAtMs}`,
        mode: lockedMode,
        permissionMode,
        async: true,
        ...(lockedMode === "single"
          ? { agentId: lockedAgentId }
          : { workflowId: targetWorkflowId! }),
      });

      if (lockedMode === "single" && lockedAgentId) {
        // Optimistically reflect activeTurn while Core executes asynchronously in background
        queryClient.setQueryData<ConversationDetail | undefined>(
          ["conversation", conversation.id],
          (prev) => {
            if (!prev || prev.activeTurn) return prev;
            const nextTurn: ActiveChatTurn = {
              agentId: lockedAgentId,
              state: "running",
              startedAt: startedAtIso,
            };
            return {
              ...prev,
              activeTurn: nextTurn,
              conversation: { ...prev.conversation, activeTurn: nextTurn },
            };
          }
        );
      }

      await refreshAll();
    } catch (err) {
      reportActionError(err);
    } finally {
      setPendingChatTurns((prev) => {
        if (!(conversation.id in prev)) return prev;
        const copy = { ...prev };
        delete copy[conversation.id];
        return copy;
      });
      setSending(false);
    }
  };

  return (
    <div className="ct-chat h-full flex flex-col bg-white overflow-hidden">
      {/* Minimal Frameless Header Strip with Project Breadcrumb, Conversation Title & Workspace Inspector Trigger */}
      <div className="ct-drag h-[46px] shrink-0 px-6 pr-[152px] flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-1.5">
          {project && (
            <button
              type="button"
              data-kubai-trigger
              onClick={() => navigate(`/projects/${project.id}`)}
              title={project.canonicalPath}
              className="ct-no-drag inline-flex items-center gap-1.5 h-[28px] px-2 rounded-[8px] text-[12.5px] font-medium text-[#475569] hover:text-[#141518] hover:bg-[#F3F5F9] transition shrink-0"
            >
              <KubaiIcon
                icon={duoFolder}
                size={15.5}
                trigger="parent"
                className="text-[#52525B]"
              />
              <span className="truncate max-w-[140px]">{project.name}</span>
              {wsStatus?.isGitRepo && wsStatus.branch && (
                <span className="hidden md:inline-flex items-center gap-1 text-[11.5px] text-[#94A3B8] font-mono">
                  <GitBranch size={11} />
                  <span className="truncate max-w-[90px]">{wsStatus.branch}</span>
                </span>
              )}
            </button>
          )}
          {project && conversation.title && (
            <span
              className="text-[#CBD5E1] text-[13px] select-none shrink-0"
              aria-hidden="true"
            >
              /
            </span>
          )}
          {conversation.title && (
            <span
              data-testid="chat-header-title"
              title={conversation.title}
              className="text-[14px] font-semibold text-[#141518] tracking-[-0.015em] truncate min-w-0 px-1"
            >
              {conversation.title}
            </span>
          )}
        </div>

        <div className="ct-no-drag flex items-center gap-1.5 shrink-0">
          {wsStatus?.isGitRepo && wsStatus.changedFiles.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setDrawerTab(drawerTab === "diff" ? null : "diff")
              }
              title="查看 Git 变更差异"
              className={`inline-flex items-center gap-1.5 h-[28px] px-2.5 rounded-[8px] text-[12px] font-medium transition ${
                drawerTab === "diff"
                  ? "bg-[#F0F0F2] text-[#27272A]"
                  : "bg-[#F3F5F9] text-[#475569] hover:text-[#141518]"
              }`}
            >
              <span>{wsStatus.changedFiles.length} 变更</span>
            </button>
          )}
          {projectId && (
            <button
              type="button"
              onClick={() =>
                setDrawerTab(drawerTab ? null : "files")
              }
              aria-pressed={Boolean(drawerTab)}
              title={drawerTab ? "收起工作区面板" : "打开工作区文件与 Diff 面板"}
              className={`inline-flex items-center gap-1.5 h-[28px] px-2.5 rounded-[8px] text-[12px] font-medium transition ${
                drawerTab
                  ? "bg-[#141518] text-white"
                  : "text-[#475569] hover:text-[#141518] hover:bg-[#F3F5F9]"
              }`}
            >
              <PanelRight size={14} strokeWidth={1.9} />
              <span>工作区</span>
            </button>
          )}
        </div>
      </div>

      {/* Full-Width Conversation Area + Optional Floating Drawer */}
      <div className={`flex-1 flex min-h-0 pb-5 overflow-hidden ${drawerTab ? "pr-5 gap-5" : ""}`}>
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex-1 flex flex-col min-h-0 w-full">
            {/* Airy Borderless Horizontal Workflow Progress Stepper (supports parallel DAG waves) */}
            {run && (() => {
              const wfSteps = run.workflowSnapshot.steps;
              const wfEdges =
                run.workflowSnapshot.edges ??
                wfSteps.slice(0, -1).map((s, i) => ({
                  id: `e-${i}`,
                  source: s.id,
                  target: wfSteps[i + 1]!.id,
                }));
              const byId = new Map(wfSteps.map((s) => [s.id, s]));
              const inDeg = new Map(wfSteps.map((s) => [s.id, 0]));
              const out = new Map<string, string[]>(wfSteps.map((s) => [s.id, []]));
              for (const e of wfEdges) {
                if (!byId.has(e.source) || !byId.has(e.target)) continue;
                out.get(e.source)!.push(e.target);
                inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
              }
              const waves: typeof wfSteps[] = [];
              let ready = wfSteps.filter((s) => (inDeg.get(s.id) ?? 0) === 0);
              const visited = new Set<string>();
              while (ready.length > 0) {
                waves.push(ready);
                for (const r of ready) visited.add(r.id);
                const next: typeof wfSteps = [];
                for (const r of ready) {
                  for (const nxtId of out.get(r.id) ?? []) {
                    const d = (inDeg.get(nxtId) ?? 0) - 1;
                    inDeg.set(nxtId, d);
                    if (d === 0) next.push(byId.get(nxtId)!);
                  }
                }
                ready = next;
              }
              const displayWaves =
                visited.size === wfSteps.length ? waves : wfSteps.map((s) => [s]);

              const renderStepChip = (step: (typeof wfSteps)[number]) => {
                const nr = latestNodeByStep.get(step.id);
                const state = nr?.state ?? "pending";
                const agent = agentMap.get(step.agentId);
                const isStepActive =
                  state === "running" || state === "waiting_permission";
                return (
                  <span key={step.id} className="inline-flex items-center gap-2">
                    <span
                      className={`w-[28px] h-[28px] rounded-full inline-flex items-center justify-center shrink-0 ${
                        isStepActive ? "bg-[#EFF6FF]" : "bg-[#F8FAFC]"
                      }`}
                    >
                      <AgentLogo
                        agentId={step.agentId}
                        name={agent?.name}
                        size={19}
                      />
                    </span>
                    <span className="text-[14px] font-bold text-[#141518] tracking-[-0.02em]">
                      {agent?.name ?? step.agentId}
                    </span>
                    {state === "completed" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[11.5px] font-semibold text-[#15803D]">
                        <Check size={11.5} strokeWidth={2.6} />
                        <span>{t("states.completed")}</span>
                      </span>
                    ) : isStepActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#F0F0F2] text-[11.5px] font-semibold text-[#27272A]">
                        <span className="ct-dots-wave-sm" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                        <span>思考中</span>
                      </span>
                    ) : (
                      <StatusBadge state={state} compact dot />
                    )}
                  </span>
                );
              };

              return (
                <div className="shrink-0 mb-3 px-8 flex justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrawerTab(drawerTab === "handoff" ? null : "handoff");
                    }}
                    aria-label={t("chat.drawerHandoff")}
                    title="点击查看上下文交接、工作区变更与事件日志"
                    className="ct-workflow-pill px-4 py-2 rounded-[14px] hover:bg-[#F8FAFC] inline-flex items-center gap-3.5 flex-wrap justify-center transition"
                  >
                    {displayWaves.map((wave, wIdx) => {
                      const waveDone = wave.every(
                        (s) => latestNodeByStep.get(s.id)?.state === "completed"
                      );
                      return (
                        <React.Fragment key={wIdx}>
                          {wave.length > 1 ? (
                            <span className="inline-flex items-center gap-3 px-3 py-1 rounded-[11px] bg-[#F8FAFC] border border-slate-900/[0.07]">
                              {wave.map((step, sIdx) => (
                                <React.Fragment key={step.id}>
                                  {renderStepChip(step)}
                                  {sIdx < wave.length - 1 && (
                                    <span
                                      aria-hidden="true"
                                      className="h-4 w-px bg-slate-900/[0.1]"
                                    />
                                  )}
                                </React.Fragment>
                              ))}
                            </span>
                          ) : (
                            renderStepChip(wave[0]!)
                          )}

                          {wIdx < displayWaves.length - 1 && (
                            <span
                              aria-hidden="true"
                              className={`w-8 h-[1.5px] rounded-full shrink-0 ${
                                waveDone ? "bg-[#93C5FD]" : "bg-slate-900/[0.1]"
                              }`}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </button>
                </div>
              );
            })()}

            {/* Full-Width Card-less Editorial Messages Stream (scrollbar at far right edge) */}
            <div className="ct-chat-transcript relative flex-1 min-h-0">
            <div
              ref={scrollContainerRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                isNearBottomRef.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 96;
              }}
              className="ct-chat-scrollport h-full overflow-y-auto px-8"
            >
              <div data-chat-transcript-content className="space-y-2">
              {/* Paused / Failed Resume Bar */}
              {run && (run.state === "paused" || run.state === "failed") && (
                <div className="mb-4 rounded-[14px] border border-slate-900/[0.08] bg-[#F8FAFC] px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-[13.5px] text-[#374151]">
                    <StatusBadge state={run.state} compact dot />
                    <span>
                      {run.state === "paused"
                        ? "团队执行已暂停，可从当前成员继续执行"
                        : "上次运行未能完成，可重试恢复执行"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResume}
                    className="ct-btn-primary inline-flex items-center gap-1.5 h-[34px] px-3.5 text-[13px] font-semibold shrink-0"
                  >
                    <Play size={12} fill="currentColor" />
                    <span>{t("chat.resume")}</span>
                  </button>
                </div>
              )}

              {/* Interrupted Recovery Banner */}
              {run && run.state === "interrupted" && (
                <div className="mb-4 rounded-[14px] border border-[#FED7AA] bg-[#FFF7ED] p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle
                      size={17}
                      className="text-[#EA580C] shrink-0 mt-0.5"
                    />
                    <div className="space-y-1">
                      <h3 className="text-[14.5px] font-semibold text-[#9A3412]">
                        {t("chat.interruptedBannerTitle")}
                      </h3>
                      <p className="text-[13.5px] text-[#C2410C] leading-relaxed">
                        {t("chat.interruptedBannerDesc")}
                      </p>
                      {runDetail?.checkpoint && (
                        <p className="text-[13px] text-[#9A3412] font-medium">
                          已提交检查点：已完成{" "}
                          {runDetail.checkpoint.lastCompletedOrdinal + 1} /{" "}
                          {run.workflowSnapshot.steps.length} 个节点
                          {runDetail.checkpoint.recoveryMode ===
                          "session_resumed"
                            ? " · 原生会话已恢复"
                            : runDetail.checkpoint.recoveryMode ===
                                "context_rebuilt"
                              ? " · 已重建上下文"
                              : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[13.5px] text-[#9A3412] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmReviewed}
                      onChange={(e) => setConfirmReviewed(e.target.checked)}
                      className="rounded border-[#FB923C]"
                    />
                    <span>{t("chat.confirmResume")}</span>
                  </label>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={!confirmReviewed}
                      onClick={handleResume}
                      className="ct-btn-primary inline-flex items-center gap-1.5 h-[36px] px-4 text-[13.5px] font-semibold disabled:opacity-40"
                    >
                      <RotateCcw size={13} />
                      <span>{t("chat.resume")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawerTab("diff")}
                      className="h-[36px] px-3.5 rounded-[10px] border border-[#FDBA74] bg-white text-[13.5px] font-medium text-[#9A3412] hover:bg-[#FFEDD5]"
                    >
                      查看工作区变更
                    </button>
                  </div>
                </div>
              )}

              {/* Empty Conversation State */}
              {messages.length === 0 && !isBusy && !showOptimisticPrompt && (
                <div className="py-16 text-center space-y-2.5" role="status">
                  <h2 className="text-[21px] font-bold text-[#141518] tracking-[-0.025em]">
                    {t("chat.emptyTitle")}
                  </h2>
                  <p className="text-[14px] text-[#64748B] max-w-md mx-auto leading-relaxed">
                    {t("chat.emptyHint")}
                  </p>
                </div>
              )}

              {/* Persisted Messages */}
              {messages.map((msg, idx) => {
                if (msg.role === "user") {
                  const isLastMessage = idx === messages.length - 1;
                  const orphanEvents =
                    !(isLastMessage && activeStreamsForConv.length > 0)
                      ? orphanEventsAfterMsgId.get(msg.id)
                      : undefined;
                  return (
                    <React.Fragment key={msg.id}>
                      <div id={chatTurnAnchorId(msg.id)} className="flex justify-end py-2.5">
                        <div className="ct-chat-user-message max-w-[78%] rounded-[18px] bg-[#F3F4F8] px-4.5 py-2.5 text-[16px] text-[#141518] whitespace-pre-wrap leading-[1.8]">
                          {msg.content}
                        </div>
                      </div>
                      {orphanEvents && orphanEvents.length > 0 && (
                        <AcpActivityPanel
                          events={orphanEvents}
                          agentMap={agentMap}
                          isActive={isLastMessage && isBusy}
                        />
                      )}
                    </React.Fragment>
                  );
                }

                if (msg.role === "system") {
                  const metaErrorCode = (
                    msg.metadata as { errorCode?: string } | null
                  )?.errorCode;
                  if (
                    metaErrorCode === "CANCELLED" ||
                    msg.content.trim() === "Execution cancelled by user."
                  ) {
                    return null;
                  }
                  const isErr = msg.kind === "error";
                  return (
                    <div
                      key={msg.id}
                      className={`my-2 rounded-[12px] border px-4 py-3 text-[13.5px] ${
                        isErr
                          ? "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
                          : "bg-[#F8FAFC] border-slate-900/[0.07] text-[#475569]"
                      }`}
                    >
                      {msg.content}
                    </div>
                  );
                }

                const agent = msg.agentId ? agentMap.get(msg.agentId) : null;
                const nodeHandoff = msg.nodeRunId
                  ? handoffByNodeRunId.get(msg.nodeRunId)
                  : undefined;
                const stepNum = msg.nodeRunId
                  ? nodeRunOrdinalById.get(msg.nodeRunId)
                  : undefined;
                const nextMsg = messages[idx + 1];
                const isFollowedBySameTurnStep =
                  nextMsg?.role === "assistant" ||
                  (idx === messages.length - 1 &&
                    !showOptimisticPrompt &&
                    (activeStreamsForConv.length > 0 || Boolean(thinkingInfo)));
                const isEndOfUserTurn =
                  nextMsg?.role === "user" ||
                  (idx === messages.length - 1 && showOptimisticPrompt);

                const rawSegments = (
                  msg.metadata as { segments?: TurnSegment[] } | null
                )?.segments;
                const persistedSegments =
                  Array.isArray(rawSegments) && rawSegments.length > 0
                    ? rawSegments
                    : null;

                return (
                  <article
                    key={msg.id}
                    className={`ct-chat-assistant space-y-2.5 ${
                      isFollowedBySameTurnStep ? "pt-4 pb-2" : "py-5"
                    } ${
                      isEndOfUserTurn ? "border-b border-slate-900/[0.08] mb-2" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {msg.agentId && (
                        <span className="w-[32px] h-[32px] rounded-full bg-[#F8FAFC] inline-flex items-center justify-center shrink-0">
                          <AgentLogo
                            agentId={msg.agentId}
                            name={agent?.name}
                            size={21}
                          />
                        </span>
                      )}
                      <span className="text-[17px] font-bold text-[#141518] tracking-[-0.015em]">
                        {agent?.name ?? msg.agentId ?? "Agent"}
                      </span>
                      {stepNum && (
                        <span className="px-2 py-0.5 rounded-[6px] bg-[#F1F3F7] text-[#64748B] text-[12px] font-medium">
                          步骤 {stepNum}
                        </span>
                      )}
                    </div>

                    <div className="pl-[44px] ct-markdown space-y-2">
                      {persistedSegments ? (
                        persistedSegments.map((seg, sIdx) => {
                          if (seg.type === "text") {
                            return (
                              <div key={`txt-${sIdx}`}>
                                <MarkdownTextBlock text={seg.text} />
                              </div>
                            );
                          }
                          if (seg.type === "thought") {
                            return (
                              <InlineThoughtCard
                                key={`thought-${sIdx}`}
                                segment={seg}
                                isActive={false}
                              />
                            );
                          }
                          if (seg.type === "tool") {
                            return (
                              <InlineToolCallCard
                                key={`tool-${seg.toolCallId}-${sIdx}`}
                                segment={seg}
                                agentMap={agentMap}
                                allowRunningIndicator={false}
                              />
                            );
                          }
                          return (
                            <InlinePlanCard
                              key={`plan-${sIdx}`}
                              segment={seg}
                            />
                          );
                        })
                      ) : (
                        <MarkdownTextBlock text={msg.content} />
                      )}

                      {nodeHandoff && nodeHandoff.changedFiles.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-900/[0.06] space-y-2">
                          <div className="text-[12px] font-semibold text-[#64748B]">
                            变更文件
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {nodeHandoff.changedFiles.map((filePath) => (
                              <span
                                key={filePath}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[9px] bg-[#F8FAFC] border border-slate-900/[0.08] font-mono text-[12.5px] text-[#141518]"
                              >
                                <FileText
                                  size={13.5}
                                  className="text-[#475569] shrink-0"
                                />
                                <span>{filePath}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}

              {/* Optimistic User Prompt */}
              {showOptimisticPrompt && pendingTurn?.optimisticPrompt && (
                <div className="flex justify-end py-2.5">
                  <div className="ct-chat-user-message max-w-[78%] rounded-[18px] bg-[#F3F4F8] px-4.5 py-2.5 text-[16px] text-[#141518] whitespace-pre-wrap leading-[1.8]">
                    {pendingTurn.optimisticPrompt}
                  </div>
                </div>
              )}

              {/* Live Streaming Output (True Chronological Interleaving: thought -> tool -> real-time markdown) */}
              {activeStreamsForConv.map((stream, i) => {
                const agent = agentMap.get(stream.agentId);
                return (
                  <article key={i} className="py-5 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-[32px] h-[32px] rounded-full bg-[#F8FAFC] inline-flex items-center justify-center shrink-0">
                        <AgentLogo
                          agentId={stream.agentId}
                          name={agent?.name}
                          size={21}
                        />
                      </span>
                      <span className="text-[17px] font-bold text-[#141518] tracking-[-0.015em]">
                        {agent?.name ?? stream.agentId}
                      </span>
                    </div>
                    <div className="pl-[44px] ct-markdown space-y-2">
                      {stream.segments.map((seg, sIdx) => {
                        const isLatestSeg = sIdx === stream.segments.length - 1;
                        if (seg.type === "text") {
                          return (
                            <div key={`live-txt-${sIdx}`}>
                              <MarkdownTextBlock text={seg.text} />
                            </div>
                          );
                        }
                        if (seg.type === "thought") {
                          return (
                            <InlineThoughtCard
                              key={`live-thought-${sIdx}`}
                              segment={seg}
                              isActive={isLatestSeg}
                            />
                          );
                        }
                        if (seg.type === "tool") {
                          return (
                            <InlineToolCallCard
                              key={`live-tool-${seg.toolCallId}-${sIdx}`}
                              segment={seg}
                              agentMap={agentMap}
                            />
                          );
                        }
                        return (
                          <InlinePlanCard
                            key={`live-plan-${sIdx}`}
                            segment={seg}
                          />
                        );
                      })}
                    </div>
                  </article>
                );
              })}

              {/* Compact 3-Dot Waiting Indicator (before first segment arrives) */}
              {thinkingInfo && (
                <ThinkingDotsBlock
                  agentId={thinkingInfo.agentId}
                  agentName={thinkingInfo.agentName}
                  stepNum={thinkingInfo.stepNum}
                  statusText={thinkingInfo.statusText}
                />
              )}

              {/* Legacy fallback ONLY if conversation has ACP events that could not be matched to any user message */}
              {!hasAnySegmentedContent && orphanEventsAfterMsgId.size === 0 && (
                <AcpActivityPanel
                  events={mergedConversationEvents}
                  agentMap={agentMap}
                  isActive={isBusy}
                />
              )}

              {actionNotice && (
                <div
                  role="alert"
                  className={`my-2 rounded-[12px] border px-4 py-3 text-[13.5px] flex items-center justify-between gap-3 ${
                    actionNotice.kind === "timeout"
                      ? "border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]"
                      : "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]"
                  }`}
                >
                  <span>{actionNotice.message}</span>
                  {actionNotice.kind === "timeout" && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionNotice(null);
                        void refreshAll();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white border border-[#FCD34D] text-[12.5px] font-semibold text-[#92400E] hover:bg-[#FEF3C7] shrink-0 transition"
                    >
                      <RefreshCw size={12.5} />
                      <span>刷新状态</span>
                    </button>
                  )}
                </div>
              )}

              <div ref={bottomAnchorRef} className="h-2" />
              </div>
            </div>
            <ChatTurnNavigation
              key={conversation.id}
              messages={messages}
              scrollRef={scrollContainerRef}
              onNavigate={() => { isNearBottomRef.current = false; }}
            />
            </div>

            {/* Compact, Strictly-Bounded Permission Approval Card pinned directly above the composer */}
            {pendingPermissions.length > 0 && (() => {
              const perm = pendingPermissions[0]!;
              const permAgent = agentMap.get(perm.agentId);
              const rawPreview = formatPermissionInputPreview(perm.rawInput);
              const rawTitle = (perm.toolTitle ?? "").trim();
              const isLongTitle = rawTitle.length > 88 || rawTitle.includes("\n");
              const displayTitle = isLongTitle
                ? getPermissionActionLabel(perm.toolKind)
                : rawTitle || getPermissionActionLabel(perm.toolKind);
              const permDiffs = extractDiffsFromPermissionInput(
                perm.rawInput,
                perm.locations
              );
              const codePreview =
                permDiffs.length > 0
                  ? null
                  : rawPreview ?? (isLongTitle ? rawTitle : null);
              const isResponding = Boolean(respondingPermIds[perm.id]);

              return (
                <div className="shrink-0 px-7 pt-2.5">
                  <div
                    data-testid="permission-approval-card"
                    className="ct-popover-in w-full max-w-[780px] mx-auto max-h-[340px] flex flex-col rounded-[16px] bg-white border border-slate-900/[0.1] shadow-[0_8px_28px_rgba(15,23,42,0.08)] overflow-hidden"
                  >
                    <div
                      data-kubai-trigger
                      className="shrink-0 px-4.5 pt-3.5 pb-2.5 flex items-center gap-2.5"
                    >
                      <span className="w-7 h-7 rounded-[9px] bg-[#F4F4F5] text-[#27272A] inline-flex items-center justify-center shrink-0">
                        <KubaiIcon icon={duoShield} size={16} trigger="parent" />
                      </span>
                      <span className="text-[14px] font-bold text-[#141518] tracking-[-0.015em]">
                        {t("chat.permissionTitle")}
                      </span>
                      {pendingPermissions.length > 1 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#F1F5F9] text-[11px] font-semibold text-[#475569] tabular-nums">
                          1 / {pendingPermissions.length}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#475569] ml-auto">
                        <AgentLogo
                          agentId={perm.agentId}
                          name={permAgent?.name}
                          size={15}
                        />
                        <span>{permAgent?.name ?? perm.agentId}</span>
                      </span>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto px-4.5 pb-3">
                      {permDiffs.length > 0 ? (
                        <InlineDiffList
                          diffs={permDiffs}
                          maxHeightClass="max-h-[190px]"
                        />
                      ) : (
                        <div className="rounded-[11px] bg-[#F8FAFC] border border-slate-900/[0.07] px-3.5 py-2.5 space-y-2">
                          <div className="text-[13px] font-semibold text-[#141518] line-clamp-2 leading-snug">
                            {displayTitle}
                          </div>
                          {codePreview && (
                            <pre className="rounded-[9px] bg-[#F7F7F8] border border-[#E4E4E7] text-[#27272A] px-3 py-2 font-mono text-[12px] leading-[1.55] max-h-[120px] overflow-y-auto whitespace-pre-wrap break-all">
                              {codePreview}
                            </pre>
                          )}
                          {perm.locations && perm.locations.length > 0 && (
                            <div className="text-[11.5px] text-[#64748B] font-mono break-all">
                              范围：{perm.locations.join(", ")}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 px-4.5 py-2.5 bg-[#FAFBFD] border-t border-slate-900/[0.06] flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={isResponding}
                        onClick={() =>
                          void handlePermissionDecision(perm, "cancelled")
                        }
                        className="mr-auto h-[33px] px-2.5 rounded-[8px] text-[12.5px] font-medium text-[#64748B] hover:text-[#141518] hover:bg-slate-900/[0.04] disabled:opacity-50 transition"
                      >
                        取消
                      </button>
                      {perm.options.map((opt) => {
                        const isAllowOnce = opt.kind === "allow_once";
                        const isAllowAlways = opt.kind === "allow_always";
                        return (
                          <button
                            key={opt.optionId}
                            type="button"
                            disabled={isResponding}
                            onClick={() =>
                              void handlePermissionDecision(
                                perm,
                                "selected",
                                opt.optionId
                              )
                            }
                            className={`h-[33px] px-3.5 rounded-[9px] text-[12.5px] disabled:opacity-50 transition ${
                              isAllowOnce
                                ? "ct-btn-primary font-semibold"
                                : isAllowAlways
                                  ? "bg-[#F4F4F5] text-[#27272A] hover:bg-[#E4E4E7] font-semibold"
                                  : "bg-white border border-slate-900/[0.1] text-[#475569] hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626] font-medium"
                            }`}
                          >
                            {opt.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Sleek Floating Bottom ACP Composer (keeps exact comfortable width) */}
            <div className="shrink-0 pt-3 px-7">
              <div
                onClick={(e) => e.stopPropagation()}
                className="ct-chat-composer w-full max-w-[780px] mx-auto rounded-[20px] bg-white border border-slate-900/[0.1] shadow-[0_6px_28px_rgba(15,23,42,0.06)] focus-within:border-[#71717A] focus-within:shadow-[0_0_0_3px_rgba(39,39,42,0.10),0_6px_28px_rgba(15,23,42,0.06)] transition"
              >
                <textarea
                  ref={textareaRef}
                  aria-label={t("chat.followUpPlaceholder")}
                  name="follow-up"
                  rows={2}
                  value={followUp}
                  disabled={isBusy}
                  onChange={(e) => setFollowUp(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void handleSendFollowUp();
                    }
                  }}
                  placeholder={
                    isWaitingPermission
                      ? "请先处理权限授权弹窗，或点击停止..."
                      : isBusy
                        ? "Agent 正在执行中，可等待完成或点击停止..."
                        : t("chat.followUpPlaceholder")
                  }
                  className="w-full resize-none px-5 pt-3.5 pb-2 text-[16px] leading-[1.7] text-[#141518] placeholder:text-[#94A3B8] focus:outline-none max-h-36 bg-transparent rounded-t-[20px]"
                />

                {/* Composer Bottom Controls Bar */}
                <div className="px-4 pb-3.5 pt-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Read-only Locked Conversation Target (Agent or Team cannot be switched after creation) */}
                    <span
                      data-testid="locked-chat-target"
                      title={
                        lockedMode === "single"
                          ? `当前对话已绑定 Coding Agent：${activeAgent?.name ?? lockedAgentId}`
                          : `当前对话已绑定团队：${lockedTeamName}`
                      }
                      className="inline-flex items-center gap-2 h-[35px] px-3 rounded-[10px] text-[13px] font-medium bg-[#F3F4F8] text-[#141518] select-none"
                    >
                      {lockedMode === "single" ? (
                        <>
                          <AgentLogo
                            agentId={lockedAgentId}
                            name={activeAgent?.name ?? lockedAgentId}
                            size={17}
                          />
                          <span className="max-w-40 truncate">
                            {activeAgent?.name ?? lockedAgentId}
                          </span>
                        </>
                      ) : (
                        <>
                          {lockedTeamAgentIds.length > 0 ? (
                            <span className="inline-flex items-center -space-x-[7px] shrink-0">
                              {lockedTeamAgentIds
                                .slice(0, 3)
                                .map((agentId, idx, list) => (
                                  <span
                                    key={agentId}
                                    style={{ zIndex: list.length - idx }}
                                    className="relative w-[22px] h-[22px] rounded-full bg-white border border-slate-900/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-2 ring-[#F3F4F8] inline-flex items-center justify-center"
                                  >
                                    <AgentLogo
                                      agentId={agentId}
                                      name={agentMap.get(agentId)?.name}
                                      size={13.5}
                                    />
                                  </span>
                                ))}
                            </span>
                          ) : (
                            <KubaiIcon
                              icon={duoUsers}
                              size={15.5}
                              trigger="none"
                              className="text-[#52525B]"
                            />
                          )}
                          <span className="max-w-44 truncate">
                            {lockedTeamName}
                          </span>
                        </>
                      )}
                    </span>

                    {/* ACP Permission Mode Toggle Pill (默认审批 vs 最高权限) */}
                    <button
                      type="button"
                      data-kubai-trigger
                      disabled={isBusy}
                      onClick={() =>
                        setPermissionMode(
                          permissionMode === "full_access"
                            ? "ask"
                            : "full_access"
                        )
                      }
                      title={
                        permissionMode === "full_access"
                          ? "已开启最高权限：自动放行 ACP Agent 的文件写入、命令执行等权限请求"
                          : "默认审批模式：风险操作前由你确认（点击开启最高权限）"
                      }
                      className={`inline-flex items-center gap-1.5 h-[35px] px-2.5 rounded-[10px] text-[12.5px] font-medium disabled:opacity-50 transition ${
                        permissionMode === "full_access"
                          ? "bg-[#FFF1F2] text-[#E11D48] ring-1 ring-inset ring-[#FECDD3] hover:bg-[#FFE4E6]"
                          : "bg-[#F3F4F8] text-[#475569] hover:bg-[#EAECEF] hover:text-[#141518]"
                      }`}
                    >
                      {permissionMode === "full_access" ? (
                        <KubaiIcon
                          icon={duoZap}
                          size={15.5}
                          trigger="parent"
                          className="text-[#F43F5E]"
                        />
                      ) : (
                        <KubaiIcon
                          icon={duoShieldCheck}
                          size={16}
                          trigger="parent"
                          className="text-[#52525B]"
                        />
                      )}
                      <span>
                        {permissionMode === "full_access"
                          ? "最高权限"
                          : "默认审批"}
                      </span>
                    </button>
                  </div>

                  {/* Right Action: Pause/Stop while busy, or Obsidian Send Button */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isBusy ? (
                      <>
                        {isRunActive && (
                          <button
                            type="button"
                            onClick={handlePauseAfterCurrent}
                            disabled={Boolean(run?.pauseRequested)}
                            title={t("chat.pauseAfterStep")}
                            className="ct-btn-secondary inline-flex items-center gap-1.5 h-[35px] px-3 text-[12.5px] font-medium disabled:opacity-50"
                          >
                            <Pause size={12.5} />
                            <span>
                              {run?.pauseRequested ? "本步后暂停" : "暂停"}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleStop}
                          className="inline-flex items-center gap-1.5 h-[35px] px-3 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] text-[12.5px] font-semibold text-[#DC2626] hover:bg-[#FEE2E2] transition"
                        >
                          <Square size={10.5} fill="currentColor" />
                          <span>{t("chat.stop")}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        aria-label={t("home.send")}
                        onClick={() => void handleSendFollowUp()}
                        className="ct-btn-primary w-9 h-[35px] inline-flex items-center justify-center shrink-0"
                      >
                        <ArrowUp size={16} strokeWidth={2.2} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Right Workspace Inspector Drawer (File Tree, Real-Time Git Diff, Handoff, Logs) */}
        {drawerTab && projectId && (
          <WorkspaceInspectorDrawer
            projectId={projectId}
            tab={drawerTab}
            onTabChange={setDrawerTab}
            onClose={() => setDrawerTab(null)}
            wsStatus={wsStatus}
            run={run}
            handoffs={runDetail?.handoffs ?? []}
            artifacts={runDetail?.artifacts ?? []}
            events={mergedConversationEvents}
            agentMap={agentMap}
            summaryBullets={summaryBullets}
            allHandoffChangedFiles={allHandoffChangedFiles}
          />
        )}
      </div>
    </div>
  );
};
