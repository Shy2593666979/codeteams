import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  FolderPlus,
  Layers,
} from "lucide-react";
import type {
  AgentWithStatus,
  Conversation,
  Project,
  WorkflowRecord,
} from "@codeteams/shared";
import { getBridge, rpc } from "../lib/bridge";
import {
  acpPermissionModeAtom,
  pendingChatTurnsAtom,
  selectedAgentIdAtom,
  selectedModeAtom,
  selectedProjectIdAtom,
  selectedWorkflowIdAtom,
} from "../store/atoms";
import { AgentLogo } from "../components/AgentLogo";
import { BrandLogo } from "../components/BrandLogo";
import {
  duoFolder,
  duoShieldCheck,
  duoZap,
  KubaiIcon,
  layeredBlocks,
  layeredBug,
  layeredCode,
  layeredSearch,
} from "../components/kubai";

export const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const targetPickerRef = useRef<HTMLDivElement>(null);

  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedProjectIdAtom);
  const [mode, setMode] = useAtom(selectedModeAtom);
  const [selectedAgentId, setSelectedAgentId] = useAtom(selectedAgentIdAtom);
  const [selectedWorkflowId, setSelectedWorkflowId] = useAtom(selectedWorkflowIdAtom);
  const [permissionMode, setPermissionMode] = useAtom(acpPermissionModeAtom);
  const [, setPendingChatTurns] = useAtom(pendingChatTurnsAtom);

  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<"project" | "target" | null>(null);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => rpc("projects.list", { includeArchived: false }),
  });

  const { data: agents = [] } = useQuery<AgentWithStatus[]>({
    queryKey: ["agents"],
    queryFn: () => rpc("agents.list"),
  });

  const { data: workflows = [] } = useQuery<WorkflowRecord[]>({
    queryKey: ["workflows", selectedProjectId],
    queryFn: () =>
      rpc(
        "workflows.list",
        selectedProjectId ? { projectId: selectedProjectId } : {}
      ),
  });

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0]!.id);
    }
  }, [projects, selectedProjectId, setSelectedProjectId]);

  useEffect(() => {
    if (mode === "workflow" && !selectedWorkflowId && workflows.length > 0) {
      setSelectedWorkflowId(workflows[0]!.id);
    }
  }, [mode, selectedWorkflowId, workflows, setSelectedWorkflowId]);

  // Auto-close open popovers whenever the user clicks anywhere outside or presses Escape
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const activeContainer =
        pickerOpen === "project"
          ? projectPickerRef.current
          : targetPickerRef.current;
      if (target && activeContainer?.contains(target)) {
        return;
      }
      setPickerOpen(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPickerOpen(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const activeAgent = agents.find((a) => a.id === selectedAgentId) ?? agents[0] ?? null;
  const activeWorkflow =
    workflows.find((w) => w.id === selectedWorkflowId) ?? workflows[0] ?? null;

  const handleOpenFolder = async () => {
    setError(null);
    try {
      const dir = await getBridge().selectProjectDirectory();
      if (!dir) return;
      const opened = await rpc<"projects.open", Project>("projects.open", {
        path: dir,
      });
      setSelectedProjectId(opened.id);
      setPickerOpen(null);
      // Update shared projects cache immediately so both HomePage and the left Sidebar reflect it on the same frame
      queryClient.setQueryData<Project[]>(["projects"], (prev = []) => [
        opened,
        ...prev.filter((p) => p.id !== opened.id),
      ]);
      await queryClient.invalidateQueries({
        queryKey: ["projects"],
        refetchType: "all",
      });
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async () => {
    setError(null);
    const trimmed = prompt.trim();
    if (!trimmed) {
      textareaRef.current?.focus();
      return;
    }
    if (!activeProject) {
      setError(t("home.needProjectWarning"));
      return;
    }

    if (mode === "single" && !activeAgent) {
      setError(t("home.needTargetWarning"));
      return;
    }
    if (mode === "workflow" && !activeWorkflow) {
      setError(t("home.needTargetWarning"));
      return;
    }

    setSubmitting(true);
    try {
      const conv = await rpc<"conversations.create", Conversation>(
        "conversations.create",
        {
          projectId: activeProject.id,
          title: trimmed.replace(/\s+/g, " ").slice(0, 60),
          mode,
          ...(mode === "single"
            ? { agentId: activeAgent!.id }
            : { workflowId: activeWorkflow!.id }),
        }
      );

      const nowIso = new Date().toISOString();
      const leadAgentId =
        mode === "single"
          ? activeAgent!.id
          : activeWorkflow!.definition.steps[0]?.agentId ?? "codex";

      const initialActiveTurn =
        mode === "single"
          ? { agentId: leadAgentId, state: "running" as const, startedAt: nowIso }
          : null;

      // Seed caches synchronously so ChatRunPage opens INSTANTLY with zero loading flash
      queryClient.setQueryData(["conversation", conv.id], {
        conversation: {
          ...conv,
          activeTurn: initialActiveTurn,
        },
        messages: [
          {
            id: `optimistic-user-${conv.id}`,
            conversationId: conv.id,
            sessionId: null,
            role: "user",
            seq: 1,
            kind: "text",
            content: trimmed,
            createdAt: nowIso,
          },
        ],
        sessions: [],
        runs: [],
        pendingPermissions: [],
        activeTurn: initialActiveTurn,
      });
      queryClient.setQueryData<Conversation[]>(["conversations"], (prev = []) => [
        { ...conv, activeTurn: initialActiveTurn },
        ...prev.filter((c) => c.id !== conv.id),
      ]);

      setPendingChatTurns((prev) => ({
        ...prev,
        [conv.id]: {
          agentId: leadAgentId,
          startedAt: Date.now(),
          optimisticPrompt: trimmed,
        },
      }));

      navigate(`/chat/${conv.id}`);

      const idempotencyKey = `send-${conv.id}-${Date.now()}`;
      void rpc("conversations.send", {
        conversationId: conv.id,
        content: trimmed,
        idempotencyKey,
        mode,
        permissionMode,
        async: true,
        ...(mode === "single"
          ? { agentId: activeAgent!.id }
          : { workflowId: activeWorkflow!.id }),
      })
        .catch(() => {
          // Clear optimistic turn state if submit itself failed
          queryClient.setQueryData<Record<string, unknown> | undefined>(
            ["conversation", conv.id],
            (prev) => (prev ? { ...prev, activeTurn: null } : prev)
          );
        })
        .finally(() => {
          setPendingChatTurns((prev) => {
            if (!(conv.id in prev)) return prev;
            const copy = { ...prev };
            delete copy[conv.id];
            return copy;
          });
          void queryClient.invalidateQueries({
            queryKey: ["conversation", conv.id],
          });
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const featuredAgents = (() => {
    const fallback: Array<{ id: string; name: string }> = [
      { id: "codex", name: "Codex" },
      { id: "claude-code", name: "Claude Code" },
      { id: "gemini-cli", name: "Gemini" },
    ];
    if (agents.length === 0) return fallback;
    const preferred = ["codex", "claude-code", "gemini-cli"]
      .map((id) => agents.find((a) => a.id === id))
      .filter((a): a is AgentWithStatus => Boolean(a));
    return preferred.length > 0 ? preferred : agents.slice(0, 3);
  })();

  const starterCards = [
    {
      title: "实现功能",
      desc: "从需求出发，构建完整功能",
      prompt: "实现一个新功能：",
      icon: layeredCode,
      color: "#3B82F6",
    },
    {
      title: "代码审查",
      desc: "发现潜在问题，提升代码质量",
      prompt: "审查当前仓库代码改动，发现问题并提供改进建议：",
      icon: layeredSearch,
      color: "#10B981",
    },
    {
      title: "修复问题",
      desc: "定位错误根因，快速完成修复",
      prompt: "定位并修复以下问题：",
      icon: layeredBug,
      color: "#F43F5E",
    },
    {
      title: "技术方案",
      desc: "梳理实现思路，制定技术方案",
      prompt: "针对以下需求，提供可执行的技术方案与实现思路：",
      icon: layeredBlocks,
      color: "#8B5CF6",
    },
  ];

  return (
    <div className="ct-home h-full overflow-y-auto bg-[#F8F9FC]">
      <div className="ct-home-content min-h-full max-w-[780px] mx-auto px-8 py-10 flex flex-col items-center justify-center">
        {/* Centered Transparent Brand Logo + Heading */}
        <div className="ct-home-heading flex flex-col items-center text-center">
          <BrandLogo size={52} className="text-[#141518]" />
          <h1 className="text-[32px] font-bold tracking-[-0.03em] leading-[1.2] text-[#141518] mt-3.5">
            {t("home.heading")}
          </h1>
          <p className="text-[14.5px] text-[#64748B] mt-2">
            选择一个本地仓库与 Agent 或团队，描述一次需求即可开始。
          </p>
        </div>

        {/* Elevated Hero Composer Card */}
        <div className="ct-composer w-full mt-7 rounded-[18px] bg-white border border-[#BFD6FE] shadow-[0_2px_10px_rgba(37,99,235,0.05),0_12px_32px_rgba(15,23,42,0.04)] focus-within:border-[#3B82F6] focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.12),0_12px_32px_rgba(15,23,42,0.05)] transition">
          <textarea
            ref={textareaRef}
            aria-label={t("home.inputPlaceholder")}
            name="task"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            rows={4}
            placeholder="描述你的需求，或粘贴相关代码与错误信息..."
            className="w-full min-h-[116px] resize-none px-6 pt-5 pb-2 text-[15px] leading-[1.65] text-[#141518] placeholder:text-[#64748B] focus:outline-none rounded-t-[18px] bg-transparent"
          />

          {/* Composer Footer Controls */}
          <div className="px-4 pb-4 pt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Project Picker Pill */}
              <div ref={projectPickerRef} className="relative">
                <button
                  type="button"
                  data-kubai-trigger
                  onClick={() =>
                    setPickerOpen(pickerOpen === "project" ? null : "project")
                  }
                  className={`inline-flex items-center gap-1.5 h-[36px] px-3 rounded-[10px] text-[13px] font-medium transition ${
                    activeProject
                      ? "bg-[#F3F4F8] text-[#141518] hover:bg-[#EAECEF]"
                      : "bg-[#FEF3C7] text-[#B45309] hover:bg-[#FDE68A]"
                  }`}
                >
                  <KubaiIcon
                    icon={duoFolder}
                    size={15.5}
                    trigger="parent"
                    className={activeProject ? "text-[#4086FF]" : "text-[#B45309]"}
                  />
                  <span className="max-w-32 truncate">
                    {activeProject ? activeProject.name : t("home.selectProject")}
                  </span>
                  <ChevronDown size={13.5} className="text-[#64748B]" />
                </button>

                {pickerOpen === "project" && (
                  <div className="absolute left-0 bottom-full mb-2 w-[204px] bg-white border border-slate-900/[0.08] rounded-[14px] shadow-xl py-1.5 z-30">
                    <div className="max-h-56 overflow-y-auto">
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          title={`${p.name}\n${p.canonicalPath}`}
                          onClick={() => {
                            setSelectedProjectId(p.id);
                            setPickerOpen(null);
                          }}
                          className={`w-full px-3 py-2 text-left text-[13px] flex flex-col hover:bg-[#F8FAFC] ${
                            p.id === selectedProjectId ? "bg-[#E8F0FE]" : ""
                          }`}
                        >
                          <span className="font-semibold text-[#141518] truncate w-full">
                            {p.name}
                          </span>
                          <span className="text-[11.5px] text-[#64748B] truncate w-full">
                            {p.canonicalPath}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-slate-900/[0.06] mt-1 pt-1 px-1.5">
                      <button
                        type="button"
                        onClick={() => void handleOpenFolder()}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] font-medium text-[#2563EB] hover:bg-[#E8F0FE]"
                      >
                        <FolderPlus size={14} className="shrink-0" />
                        <span className="truncate">{t("nav.openProject")}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Segmented Mode Toggle */}
              <div className="ct-segmented h-[36px]">
                <button
                  type="button"
                  data-active={mode === "single"}
                  onClick={() => {
                    setMode("single");
                    setPickerOpen(null);
                  }}
                  className="ct-segmented-item px-3 text-[13px]"
                >
                  {t("home.singleMode")}
                </button>
                <button
                  type="button"
                  data-active={mode === "workflow"}
                  onClick={() => {
                    setMode("workflow");
                    setPickerOpen(null);
                  }}
                  className="ct-segmented-item px-3 text-[13px]"
                >
                  {t("home.workflowMode")}
                </button>
              </div>

              {/* Target Picker Pill */}
              <div ref={targetPickerRef} className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setPickerOpen(pickerOpen === "target" ? null : "target")
                  }
                  className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-[10px] text-[13px] font-medium bg-[#F3F4F8] text-[#141518] hover:bg-[#EAECEF] transition"
                >
                  {mode === "single" ? (
                    <>
                      <AgentLogo
                        agentId={activeAgent?.id ?? selectedAgentId ?? "codex"}
                        name={activeAgent?.name ?? "Codex"}
                        size={20}
                      />
                      <span>{activeAgent?.name ?? "Codex"}</span>
                    </>
                  ) : mode === "workflow" && activeWorkflow ? (
                    <>
                      <span className="inline-flex items-center gap-1">
                        {activeWorkflow.definition.steps.slice(0, 3).map((s) => (
                          <AgentLogo key={s.id} agentId={s.agentId} size={17} />
                        ))}
                      </span>
                      <span className="max-w-36 truncate">
                        {activeWorkflow.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <Layers size={15} className="text-[#64748B]" />
                      <span className="text-[#64748B]">选择团队</span>
                    </>
                  )}
                  <ChevronDown size={14} className="text-[#64748B]" />
                </button>

                {pickerOpen === "target" && mode === "single" && (
                  <div className="absolute left-0 bottom-full mb-2 w-[256px] bg-white border border-slate-900/[0.08] rounded-[14px] shadow-xl py-1.5 z-30 max-h-72 overflow-y-auto">
                    {agents.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        title={`${a.name} · ${a.vendor}`}
                        onClick={() => {
                          setSelectedAgentId(a.id);
                          setPickerOpen(null);
                        }}
                        className={`w-full px-3 py-2 text-left text-[13px] flex items-center justify-between hover:bg-[#F8FAFC] ${
                          a.id === selectedAgentId ? "bg-[#E8F0FE]" : ""
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <AgentLogo agentId={a.id} name={a.name} size={19} />
                          <span className="truncate font-semibold text-[#141518]">
                            {a.name}
                          </span>
                          <span className="text-[12px] text-[#64748B] truncate">
                            {a.vendor}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {pickerOpen === "target" && mode === "workflow" && (
                  <div className="absolute left-0 bottom-full mb-2 w-[268px] bg-white border border-slate-900/[0.08] rounded-[14px] shadow-xl py-1.5 z-30">
                    <div className="max-h-60 overflow-y-auto">
                      {workflows.length === 0 ? (
                        <div className="px-4 py-4 text-center text-[13px] text-[#64748B]">
                          {t("workflow.empty")}
                        </div>
                      ) : (
                        workflows.map((wf) => (
                          <button
                            key={wf.id}
                            type="button"
                            title={wf.name}
                            onClick={() => {
                              setSelectedWorkflowId(wf.id);
                              setPickerOpen(null);
                            }}
                            className={`w-full px-3 py-2 text-left text-[13px] space-y-1.5 hover:bg-[#F8FAFC] ${
                              wf.id === selectedWorkflowId ? "bg-[#E8F0FE]" : ""
                            }`}
                          >
                            <div className="font-semibold text-[#141518] truncate">
                              {wf.name}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {wf.definition.steps.map((s, idx) => (
                                <React.Fragment key={s.id}>
                                  <AgentLogo agentId={s.agentId} size={16} />
                                  {idx < wf.definition.steps.length - 1 && (
                                    <ArrowRight
                                      size={11}
                                      className="text-[#64748B]"
                                    />
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="border-t border-slate-900/[0.06] mt-1 pt-1 px-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPickerOpen(null);
                          navigate("/workflows/new");
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-[#2563EB] hover:bg-[#E8F0FE]"
                      >
                        <span className="truncate">+ {t("workflow.create")}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ACP Permission Mode Toggle (默认审批 vs 最高权限) */}
              <button
                type="button"
                data-kubai-trigger
                onClick={() =>
                  setPermissionMode(
                    permissionMode === "full_access" ? "ask" : "full_access"
                  )
                }
                title={
                  permissionMode === "full_access"
                    ? "已开启最高权限：自动放行 ACP Agent 的文件写入与命令执行请求"
                    : "默认审批模式：高风险操作前弹窗确认（点击切换为最高权限）"
                }
                className={`inline-flex items-center gap-1.5 h-[36px] px-2.5 rounded-[10px] text-[12.5px] font-medium transition ${
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
                    className="text-[#4086FF]"
                  />
                )}
                <span>
                  {permissionMode === "full_access" ? "最高权限" : "默认审批"}
                </span>
              </button>
            </div>

            {/* Right Obsidian Start Task Button */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="ct-btn-primary inline-flex items-center gap-1.5 h-[36px] px-4 text-[13.5px] font-semibold disabled:opacity-70 shrink-0"
            >
              <ArrowUp size={15} strokeWidth={2.2} />
              <span>{t("home.send")}</span>
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="w-full mt-4 px-4 py-2.5 rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] text-[13.5px] text-[#DC2626]"
          >
            {error}
          </div>
        )}

        {/* 4 Elevated Starter Cards */}
        <div className="w-full mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {starterCards.map((card) => (
            <button
              key={card.title}
              type="button"
              data-kubai-trigger
              onClick={() => {
                setPrompt(card.prompt);
                textareaRef.current?.focus();
              }}
              className="ct-card group text-left px-5 py-4 rounded-[14px] hover:shadow-[0_4px_18px_rgba(15,23,42,0.07)] hover:-translate-y-[1px] transition flex items-center gap-4"
            >
              <span className="w-11 h-11 flex items-center justify-center shrink-0">
                <KubaiIcon
                  icon={card.icon}
                  size={40}
                  color={card.color}
                  trigger="parent"
                />
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-[#141518] group-hover:text-[#2563EB] transition">
                  {card.title}
                </div>
                <p className="text-[13px] text-[#64748B] mt-0.5 truncate">
                  {card.desc}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Bottom Floating Available Agents Strip */}
        {featuredAgents.length > 0 && (
          <div className="ct-home-agents w-full mt-5 ct-card rounded-[14px] px-5 py-3.5 flex flex-wrap items-center gap-5">
            <span className="text-[14px] font-semibold text-[#141518] shrink-0">
              {t("home.availableAgents")}
            </span>
            <span className="h-5 w-px bg-slate-900/[0.08] hidden sm:inline-block" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-6 flex-1 min-w-0">
              {featuredAgents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setMode("single");
                    setSelectedAgentId(a.id);
                    textareaRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-2 text-[14px] font-medium text-[#141518] hover:text-[#2563EB] transition"
                >
                  <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" aria-hidden="true" />
                  <AgentLogo agentId={a.id} name={a.name} size={22} />
                  <span>{a.name === "Gemini CLI" ? "Gemini" : a.name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigate("/agents")}
              className="inline-flex items-center gap-1 pl-4 border-l border-slate-900/[0.08] text-[13.5px] font-medium text-[#475569] hover:text-[#141518] shrink-0 transition"
            >
              <span>{t("home.manageAgents")}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
