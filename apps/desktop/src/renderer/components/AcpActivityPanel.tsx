import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  XCircle,
} from "lucide-react";
import type {
  AgentWithStatus,
  CoreEvent,
  TurnPlanSegment,
  TurnThoughtSegment,
  TurnToolDiff,
  TurnToolSegment,
} from "@codeteams/shared";
import { AgentLogo } from "./AgentLogo";
import { InlineDiffList } from "./InlineDiffView";
import {
  duoFileDiff,
  duoFileText,
  duoGlobe,
  duoListChecks,
  duoSearch,
  duoSparkles,
  duoTerminal,
  duoTrash,
  duoWrench,
  duoZap,
  KubaiIcon,
  type KubaiIconData,
} from "./kubai";

function getToolKindVisual(kind: string): {
  icon: KubaiIconData;
  badgeBg: string;
  iconColor: string;
} {
  const k = kind.toLowerCase();
  if (k === "execute" || k === "command" || k === "shell" || k === "terminal") {
    return {
      icon: duoTerminal,
      badgeBg: "bg-[#ECECEE]",
      iconColor: "text-[#52525B]",
    };
  }
  if (k === "read") {
    return {
      icon: duoFileText,
      badgeBg: "bg-[#ECECEE]",
      iconColor: "text-[#52525B]",
    };
  }
  if (k === "edit" || k === "write" || k === "move") {
    return {
      icon: duoFileDiff,
      badgeBg: "bg-[#ECECEE]",
      iconColor: "text-[#52525B]",
    };
  }
  if (k === "search") {
    return {
      icon: duoSearch,
      badgeBg: "bg-[#ECECEE]",
      iconColor: "text-[#52525B]",
    };
  }
  if (k === "fetch") {
    return {
      icon: duoGlobe,
      badgeBg: "bg-[#ECECEE]",
      iconColor: "text-[#52525B]",
    };
  }
  if (k === "delete") {
    return {
      icon: duoTrash,
      badgeBg: "bg-[#FEE2E2]",
      iconColor: "text-[#DC2626]",
    };
  }
  if (k === "think") {
    return {
      icon: duoSparkles,
      badgeBg: "bg-[#ECECEE]",
      iconColor: "text-[#52525B]",
    };
  }
  return {
    icon: duoWrench,
    badgeBg: "bg-[#ECECEE]",
    iconColor: "text-[#52525B]",
  };
}

/** Inline collapsible ACP thinking/reasoning block: expanded while streaming, auto-collapses when done */
export const InlineThoughtCard: React.FC<{
  segment: TurnThoughtSegment;
  isActive?: boolean;
}> = ({ segment, isActive = false }) => {
  const [expanded, setExpanded] = useState(isActive);

  // Automatically collapse once thinking completes (and expand if it becomes active)
  useEffect(() => {
    setExpanded(isActive);
  }, [isActive]);

  const cleanText = segment.text.trim();
  if (!cleanText) return null;

  return (
    <div className="ct-thought-block my-1.5">
      <button
        type="button"
        data-kubai-trigger
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-2 py-1 px-2 -ml-2 rounded-[8px] text-[13px] font-medium text-[#64748B] hover:text-[#141518] hover:bg-slate-900/[0.035] transition"
      >
        {isActive ? (
          <>
            <span className="ct-dots-wave-sm text-[#27272A]" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="text-[#475569]">思考中</span>
          </>
        ) : (
          <>
            <KubaiIcon
              icon={duoSparkles}
              size={14}
              trigger="parent"
              className="text-[#52525B]"
            />
            <span>思考过程</span>
          </>
        )}
        {expanded ? (
          <ChevronDown size={13.5} className="text-[#94A3B8]" />
        ) : (
          <ChevronRight size={13.5} className="text-[#94A3B8]" />
        )}
      </button>

      {expanded && (
        <div className="mt-1 ml-1.5 pl-3.5 border-l-2 border-slate-900/[0.08] text-[13px] leading-[1.68] text-[#64748B] whitespace-pre-wrap">
          {cleanText}
        </div>
      )}
    </div>
  );
};

/** Single inline ACP Tool Call row placed directly in chronological order inside an Agent's turn */
export const InlineToolCallCard: React.FC<{
  segment: TurnToolSegment;
  agentMap?: Map<string, AgentWithStatus>;
  showAgent?: boolean;
  allowRunningIndicator?: boolean;
}> = ({
  segment,
  agentMap,
  showAgent = false,
  allowRunningIndicator = true,
}) => {
  const hasDiffs = Boolean(segment.diffs && segment.diffs.length > 0);
  const [expanded, setExpanded] = useState(hasDiffs);
  const [userToggled, setUserToggled] = useState(false);

  // Auto-open the inline diff preview as soon as ACP streams diff content for a file edit
  useEffect(() => {
    if (hasDiffs && !userToggled) {
      setExpanded(true);
    }
  }, [hasDiffs, userToggled]);

  const visual = getToolKindVisual(segment.kind);
  const isDone = segment.status === "completed";
  const isFailed = segment.status === "failed";
  const isInterrupted =
    segment.status === "interrupted" ||
    segment.status === "cancelled" ||
    (!isDone && !isFailed && !allowRunningIndicator);
  const isRunning = !isDone && !isFailed && !isInterrupted;

  const singleLineTitle = segment.title.replace(/\s+/g, " ").trim();
  const isLongCommandTitle =
    singleLineTitle.length > 68 || segment.title.includes("\n");
  const effectiveInputPreview =
    segment.rawInputPreview || (isLongCommandTitle ? segment.title : null);
  const hasDetails = Boolean(
    hasDiffs ||
      effectiveInputPreview ||
      segment.rawOutputPreview ||
      segment.contentPreview
  );
  const agent =
    showAgent && segment.agentId ? agentMap?.get(segment.agentId) : undefined;

  return (
    <div className="ct-acp-activity my-2 rounded-[11px] bg-[#F7F7F8] border border-[#E4E4E7] hover:border-[#D4D4D8] transition overflow-hidden">
      <button
        type="button"
        data-kubai-trigger
        disabled={!hasDetails}
        onClick={() => {
          if (!hasDetails) return;
          setUserToggled(true);
          setExpanded(!expanded);
        }}
        className={`w-full px-3 py-2 flex items-center gap-2.5 text-left ${
          hasDetails ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <span
          className={`w-6 h-6 rounded-[7px] inline-flex items-center justify-center shrink-0 ${visual.badgeBg} ${visual.iconColor}`}
        >
          <KubaiIcon icon={visual.icon} size={15} trigger="parent" />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              title={singleLineTitle}
              className="text-[14px] font-medium text-[#141518] truncate min-w-0"
            >
              {singleLineTitle}
            </span>
            {agent && (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-[#64748B] shrink-0">
                <AgentLogo
                  agentId={segment.agentId!}
                  name={agent.name}
                  size={13}
                />
                <span>{agent.name}</span>
              </span>
            )}
            {segment.autoApproved && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FFF1F2] text-[11px] font-medium text-[#E11D48] shrink-0">
                <KubaiIcon
                  icon={duoZap}
                  size={11.5}
                  trigger="none"
                  className="text-[#F43F5E]"
                />
                <span>最高权限放行</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#F0F0F2] text-[11.5px] font-semibold text-[#27272A]">
              <span className="ct-dots-wave-sm" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </span>
          ) : isDone ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[11px] font-semibold text-[#15803D]">
              <Check size={11} strokeWidth={2.6} />
              <span>完成</span>
            </span>
          ) : isInterrupted ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[11px] font-medium text-[#64748B]">
              <span>已中断</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[11px] font-semibold text-[#DC2626]">
              <XCircle size={11} />
              <span>失败</span>
            </span>
          )}
          {hasDetails &&
            (expanded ? (
              <ChevronDown size={13.5} className="text-[#94A3B8]" />
            ) : (
              <ChevronRight size={13.5} className="text-[#94A3B8]" />
            ))}
        </div>
      </button>

      {hasDetails && expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-[#E4E4E7]/70 space-y-2.5 bg-white">
          {hasDiffs && segment.diffs && (
            <InlineDiffList diffs={segment.diffs} />
          )}
          {!hasDiffs && effectiveInputPreview && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                {isLongCommandTitle ? "完整命令" : "输入参数"}
              </div>
              <pre className="p-2.5 rounded-[9px] bg-[#F7F7F8] border border-[#E4E4E7] text-[#27272A] font-mono text-[14px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                {effectiveInputPreview}
              </pre>
            </div>
          )}
          {!hasDiffs && (segment.rawOutputPreview || segment.contentPreview) && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                执行结果
              </div>
              <pre className="p-2.5 rounded-[9px] bg-[#F8FAFC] border border-slate-900/[0.08] text-[#1E293B] font-mono text-[14px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                {segment.contentPreview || segment.rawOutputPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Inline ACP Execution Plan checklist placed chronologically inside an Agent's turn */
export const InlinePlanCard: React.FC<{
  segment: TurnPlanSegment;
}> = ({ segment }) => {
  const entries = segment.entries;
  if (!entries || entries.length === 0) return null;

  const completedCount = entries.filter((e) => e.status === "completed").length;
  const pct = Math.round((completedCount / entries.length) * 100);

  return (
    <div
      data-kubai-trigger
      className="ct-acp-activity my-2.5 rounded-[12px] border border-[#E4E4E7] bg-[#F7F7F8] px-3.5 py-3 space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#141518]">
          <span className="w-5 h-5 rounded-[6px] bg-[#ECECEE] text-[#52525B] inline-flex items-center justify-center shrink-0">
            <KubaiIcon icon={duoListChecks} size={14} trigger="parent" />
          </span>
          <span>执行计划</span>
        </div>
        <span className="text-[11.5px] font-semibold text-[#475569] tabular-nums">
          {completedCount} / {entries.length}
        </span>
      </div>

      <div className="h-1 w-full rounded-full bg-[#E4E4E7]/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#52525B] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-1 pt-0.5">
        {entries.map((entry, idx) => {
          const done = entry.status === "completed";
          const active = entry.status === "in_progress";
          return (
            <li
              key={idx}
              className="flex items-start gap-2 text-[12.5px] leading-[1.5]"
            >
              {done ? (
                <CheckCircle2
                  size={14}
                  className="text-[#10B981] shrink-0 mt-0.5"
                />
              ) : active ? (
                <span
                  className="ct-dots-wave-sm text-[#27272A] shrink-0 mt-1"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                <Circle
                  size={13.5}
                  className="text-[#CBD5E1] shrink-0 mt-0.5"
                />
              )}
              <span
                className={
                  done
                    ? "text-[#94A3B8] line-through"
                    : active
                      ? "text-[#141518] font-medium"
                      : "text-[#475569]"
                }
              >
                {entry.content}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Fallback activity panel ONLY for legacy/interrupted turns saved without persisted segments */
export const AcpActivityPanel: React.FC<{
  events: CoreEvent[];
  agentMap: Map<string, AgentWithStatus>;
  isActive?: boolean;
}> = ({ events, agentMap, isActive = false }) => {
  const { toolSegments, latestPlan, primaryAgentId } = useMemo(() => {
    const toolMap = new Map<string, TurnToolSegment>();
    const autoApprovedIds = new Set<string>();
    let plan: TurnPlanSegment | null = null;
    let firstAgentId: string | null = null;

    for (const ev of events) {
      if (ev.type === "permission.resolved") {
        const p = ev.payload as { requestId?: string; decision?: string };
        if (p?.requestId && p.decision === "auto_approved") {
          autoApprovedIds.add(p.requestId);
        }
        continue;
      }
      if (ev.type === "plan.updated") {
        const p = ev.payload as {
          agentId?: string;
          entries?: TurnPlanSegment["entries"];
        };
        if (p?.agentId && !firstAgentId) firstAgentId = p.agentId;
        if (Array.isArray(p?.entries)) {
          plan = { type: "plan", agentId: p.agentId, entries: p.entries };
        }
        continue;
      }
      if (
        ev.type === "tool.started" ||
        ev.type === "tool.updated" ||
        ev.type === "tool.completed"
      ) {
        const p = ev.payload as {
          agentId?: string;
          toolCallId?: string;
          title?: string | null;
          kind?: string | null;
          status?: string | null;
          locations?: TurnToolSegment["locations"];
          rawInputPreview?: string | null;
          rawOutputPreview?: string | null;
          contentPreview?: string | null;
          diffs?: TurnToolDiff[];
        };
        if (p.agentId && !firstAgentId) firstAgentId = p.agentId;
        const id = p.toolCallId || ev.eventId;
        const prev = toolMap.get(id);
        toolMap.set(id, {
          type: "tool",
          toolCallId: id,
          agentId: p.agentId ?? prev?.agentId ?? "agent",
          title: p.title || prev?.title || "执行工具操作",
          kind: p.kind || prev?.kind || "other",
          status:
            p.status ||
            (ev.type === "tool.completed"
              ? "completed"
              : prev?.status ?? "in_progress"),
          locations:
            p.locations && p.locations.length > 0
              ? p.locations
              : prev?.locations ?? [],
          rawInputPreview: p.rawInputPreview ?? prev?.rawInputPreview ?? null,
          rawOutputPreview:
            p.rawOutputPreview ?? prev?.rawOutputPreview ?? null,
          contentPreview: p.contentPreview ?? prev?.contentPreview ?? null,
          diffs: p.diffs && p.diffs.length > 0 ? p.diffs : prev?.diffs,
          autoApproved: prev?.autoApproved || autoApprovedIds.has(id),
        });
      }
    }

    for (const seg of toolMap.values()) {
      if (autoApprovedIds.has(seg.toolCallId)) seg.autoApproved = true;
    }

    return {
      toolSegments: Array.from(toolMap.values()),
      latestPlan: plan,
      primaryAgentId: firstAgentId,
    };
  }, [events]);

  if (toolSegments.length === 0 && !latestPlan) return null;

  const agent = primaryAgentId ? agentMap.get(primaryAgentId) : null;

  return (
    <article className="ct-chat-assistant py-5 space-y-2.5">
      {primaryAgentId && (
        <div className="flex items-center gap-3">
          <span className="w-[32px] h-[32px] rounded-full bg-[#F8FAFC] inline-flex items-center justify-center shrink-0">
            <AgentLogo
              agentId={primaryAgentId}
              name={agent?.name}
              size={21}
            />
          </span>
          <span className="text-[15.5px] font-bold text-[#141518] tracking-[-0.02em]">
            {agent?.name ?? primaryAgentId}
          </span>
        </div>
      )}
      <div className={`${primaryAgentId ? "pl-[44px]" : ""} space-y-2`}>
        {latestPlan && <InlinePlanCard segment={latestPlan} />}
        {toolSegments.map((seg) => (
          <InlineToolCallCard
            key={seg.toolCallId}
            segment={seg}
            agentMap={agentMap}
            allowRunningIndicator={isActive}
          />
        ))}
      </div>
    </article>
  );
};
