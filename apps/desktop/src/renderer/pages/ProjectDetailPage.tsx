import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  FileText,
  FolderOpen,
  GitBranch,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import type {
  AgentWithStatus,
  Conversation,
  Project,
  ProjectMemory,
  ProjectRuleFile,
  WorkflowRecord,
  WorkflowRun,
  WorkspaceGitDiff,
  WorkspaceStatus,
} from "@codeteams/shared";
import { getBridge, rpc } from "../lib/bridge";
import { selectedProjectIdAtom } from "../store/atoms";
import { AgentLogo } from "../components/AgentLogo";
import { KubaiIcon, layeredFolder } from "../components/kubai";
import { StatusBadge } from "../components/StatusBadge";
import {
  getGitStatusBadgeStyle,
  GitDiffViewer,
} from "../components/WorkspaceInspectorDrawer";

export const ProjectDetailPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [, setSelectedProjectId] = useAtom(selectedProjectIdAtom);
  const gitChangesSectionRef = useRef<HTMLElement>(null);

  const [memoryDraft, setMemoryDraft] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [activityFilter, setActivityFilter] = useState<
    "all" | "single" | "workflow"
  >("all");
  const [expandedDiffPath, setExpandedDiffPath] = useState<string | null>(null);

  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => rpc("projects.get", { projectId: projectId! }),
    enabled: Boolean(projectId),
  });

  const {
    data: ws,
    isFetching: refreshingWs,
    refetch: refetchWs,
  } = useQuery<WorkspaceStatus>({
    queryKey: ["workspace", projectId],
    queryFn: () => rpc("projects.workspaceStatus", { projectId: projectId! }),
    enabled: Boolean(projectId),
  });

  const { data: memoryData } = useQuery<{
    memory: ProjectMemory | null;
    ruleFiles: ProjectRuleFile[];
  }>({
    queryKey: ["project-memory", projectId],
    queryFn: () => rpc("projects.memory.get", { projectId: projectId! }),
    enabled: Boolean(projectId),
  });

  const { data: workflows = [] } = useQuery<WorkflowRecord[]>({
    queryKey: ["workflows", projectId],
    queryFn: () => rpc("workflows.list", { projectId: projectId! }),
    enabled: Boolean(projectId),
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["project-conversations", projectId],
    queryFn: () =>
      rpc("conversations.list", { projectId: projectId!, includeArchived: false }),
    enabled: Boolean(projectId),
  });

  const { data: runs = [] } = useQuery<WorkflowRun[]>({
    queryKey: ["runs", projectId],
    queryFn: () => rpc("runs.list", { projectId: projectId!, limit: 30 }),
    enabled: Boolean(projectId),
  });

  const { data: agents = [] } = useQuery<AgentWithStatus[]>({
    queryKey: ["agents"],
    queryFn: () => rpc("agents.list"),
  });

  const { data: selectedFileDiff, isLoading: loadingDiff } =
    useQuery<WorkspaceGitDiff>({
      queryKey: ["project-file-diff", projectId, expandedDiffPath],
      queryFn: () =>
        rpc("projects.gitDiff", {
          projectId: projectId!,
          relativePath: expandedDiffPath!,
        }),
      enabled: Boolean(projectId && expandedDiffPath && ws?.isGitRepo),
    });

  useEffect(() => {
    setMemoryDraft(memoryData?.memory?.content ?? "");
  }, [memoryData?.memory?.content]);

  useEffect(() => {
    setExpandedDiffPath(null);
  }, [projectId]);

  const workflowById = useMemo(
    () => new Map(workflows.map((w) => [w.id, w])),
    [workflows]
  );

  const latestRunByConvId = useMemo(() => {
    const map = new Map<string, WorkflowRun>();
    for (const r of runs) {
      if (!map.has(r.conversationId)) {
        map.set(r.conversationId, r);
      }
    }
    return map;
  }, [runs]);

  const filteredConversations = useMemo(() => {
    if (activityFilter === "all") return conversations;
    return conversations.filter((c) => c.mode === activityFilter);
  }, [conversations, activityFilter]);

  const handleSaveMemory = async () => {
    if (!projectId) return;
    await rpc("projects.memory.update", {
      projectId,
      content: memoryDraft,
    });
    await queryClient.invalidateQueries({
      queryKey: ["project-memory", projectId],
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleStartTask = () => {
    if (project) {
      setSelectedProjectId(project.id);
    }
    navigate("/");
  };

  const handleCopyPath = () => {
    if (!project) return;
    void navigator.clipboard?.writeText(project.canonicalPath).catch(() => {});
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1600);
  };

  const handleArchiveProject = async () => {
    if (!project) return;
    const ok = window.confirm(
      `确认从工作区列表中移除「${project.name}」吗？（不会删除你的本地代码文件）`
    );
    if (!ok) return;
    await rpc("projects.archive", { projectId: project.id, archived: true });
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    navigate("/");
  };

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center text-[14px] text-[#64748B] bg-[#F8F9FC]">
        加载项目信息...
      </div>
    );
  }

  const agentName = (id: string) => {
    const raw = agents.find((a) => a.id === id)?.name ?? id;
    return raw === "Gemini CLI" ? "Gemini" : raw;
  };

  const memoryDirty = memoryDraft !== (memoryData?.memory?.content ?? "");

  return (
    <div className="ct-page ct-project h-full overflow-y-auto bg-[#F8F9FC]">
      <div className="max-w-[1060px] mx-auto px-9 py-8">
        {/* Project Workspace Header */}
        <div className="pb-6 flex flex-wrap items-start justify-between gap-5">
          <div data-kubai-trigger className="flex items-start gap-4 min-w-0">
            <span className="w-[54px] h-[54px] inline-flex items-center justify-center shrink-0">
              <KubaiIcon
                icon={layeredFolder}
                size={52}
                color="#3B82F6"
                trigger="parent"
              />
            </span>
            <div className="min-w-0">
              <h1 className="text-[28px] font-bold tracking-[-0.03em] leading-[1.2] text-[#141518] truncate">
                {project.name}
              </h1>
              <div className="mt-1 flex items-center gap-2 min-w-0">
                <p className="text-[13.5px] text-[#64748B] break-all font-mono">
                  {project.canonicalPath}
                </p>
                <button
                  type="button"
                  onClick={handleCopyPath}
                  title="复制路径"
                  aria-label="复制项目路径"
                  className="p-1 rounded-md text-[#94A3B8] hover:text-[#141518] hover:bg-slate-900/[0.05] transition shrink-0"
                >
                  {copiedPath ? (
                    <Check size={13.5} className="text-[#10B981]" />
                  ) : (
                    <Copy size={13.5} />
                  )}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 h-[31px] px-3 rounded-[9px] bg-white border border-slate-900/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03)] text-[13px] font-medium text-[#141518]">
                  <GitBranch size={13} className="text-[#475569]" />
                  <span>
                    {ws?.isGitRepo
                      ? ws.branch ?? "detached"
                      : t("project.notGit")}
                  </span>
                </span>
                {ws?.isGitRepo && (
                  <button
                    type="button"
                    onClick={() =>
                      gitChangesSectionRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                    className={`inline-flex items-center gap-1.5 h-[31px] px-3 rounded-[9px] text-[13px] font-medium transition ${
                      ws.changedFiles.length > 0
                        ? "bg-[#EEF4FF] text-[#1D4ED8] hover:bg-[#DCEAFE]"
                        : "bg-[#ECEFF5] text-[#475569]"
                    }`}
                  >
                    <span>
                      {ws.changedFiles.length} {t("project.changedFiles")}
                    </span>
                  </button>
                )}
                <span className="inline-flex items-center h-[31px] px-3 rounded-[9px] bg-white border border-slate-900/[0.07] text-[12.5px] text-[#64748B] tabular-nums">
                  {conversations.length} 条对话
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-center shrink-0">
            <button
              type="button"
              onClick={() =>
                void getBridge().openPathInExplorer(project.canonicalPath)
              }
              title="在资源管理器中打开目录"
              className="ct-btn-secondary inline-flex items-center gap-1.5 h-[40px] px-3.5 text-[13.5px] font-medium"
            >
              <FolderOpen size={15} strokeWidth={1.9} />
              <span>打开目录</span>
            </button>
            <button
              type="button"
              onClick={() => void handleArchiveProject()}
              title="从工作区列表移除"
              aria-label="从工作区列表移除"
              className="ct-btn-secondary inline-flex items-center justify-center w-[40px] h-[40px] text-[#64748B] hover:text-[#DC2626]"
            >
              <Archive size={15} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              onClick={handleStartTask}
              className="ct-btn-primary inline-flex items-center gap-2 h-[40px] px-4.5 text-[14px] font-semibold"
            >
              <ArrowUp size={15} strokeWidth={2.2} />
              <span>{t("project.startTask")}</span>
            </button>
          </div>
        </div>

        {/* 2-Column Elevated Cards Body */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_336px] gap-5 items-start">
          {/* Left Column */}
          <div className="space-y-5 min-w-0">
            {/* Unified Recent Conversations & Runs Card (Single Agent + Teams) */}
            <section className="ct-card overflow-hidden">
              <div className="px-5 pt-4.5 pb-3.5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[17px] font-bold text-[#141518]">
                  最近对话与运行
                </h2>
                <div className="flex items-center gap-2.5">
                  <div className="ct-segmented h-[30px]">
                    {(
                      [
                        { id: "all", label: "全部" },
                        { id: "single", label: "单 Agent" },
                        { id: "workflow", label: "团队" },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        data-active={activityFilter === item.id}
                        onClick={() => setActivityFilter(item.id)}
                        className="ct-segmented-item px-2.5 text-[12px]"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {filteredConversations.length === 0 ? (
                <div className="px-5 pb-7 pt-2 text-center text-[13.5px] text-[#64748B]">
                  {conversations.length === 0
                    ? "该项目还没有对话记录，点击右上角「开始任务」即可发起"
                    : "当前筛选条件下暂无记录"}
                </div>
              ) : (
                <div className="divide-y divide-slate-900/[0.06] border-t border-slate-900/[0.06]">
                  {filteredConversations.slice(0, 15).map((conv) => {
                    const linkedRun = latestRunByConvId.get(conv.id);
                    const wf = conv.workflowId
                      ? workflowById.get(conv.workflowId)
                      : undefined;
                    const liveState =
                      conv.activeTurn?.state ?? conv.latestRunState ?? null;
                    const displayAgentId =
                      conv.activeTurn?.agentId ??
                      conv.agentId ??
                      linkedRun?.workflowSnapshot.steps[0]?.agentId ??
                      null;

                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          navigate(`/chat/${conv.id}`);
                        }}
                        className="w-full px-5 py-3.5 text-left flex items-center justify-between gap-4 hover:bg-[#F8FAFC] transition"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[14.5px] font-semibold text-[#141518] truncate">
                            {conv.title}
                          </div>
                          <div className="text-[12.5px] text-[#64748B] mt-0.5 flex items-center gap-2">
                            <span>
                              {new Date(conv.updatedAt).toLocaleString()}
                            </span>
                            {conv.mode === "workflow" && wf && (
                              <span className="text-[#94A3B8] truncate">
                                · {wf.name}
                              </span>
                            )}
                          </div>
                        </div>

                        {conv.mode === "workflow" ? (
                          <span className="hidden sm:inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-[8px] bg-[#F4F6FA] text-[12.5px] font-medium text-[#334155] shrink-0">
                            <Users size={13} className="text-[#64748B]" />
                            <span>团队</span>
                          </span>
                        ) : (
                          displayAgentId && (
                            <span className="hidden sm:inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-[8px] bg-[#F4F6FA] text-[12.5px] font-medium text-[#141518] shrink-0">
                              <AgentLogo
                                agentId={displayAgentId}
                                name={agentName(displayAgentId)}
                                size={16}
                              />
                              <span>{agentName(displayAgentId)}</span>
                            </span>
                          )
                        )}

                        <div className="flex items-center gap-2.5 shrink-0">
                          {liveState && <StatusBadge state={liveState} compact />}
                          <ChevronRight size={16} className="text-[#94A3B8]" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Interactive Workspace Git Changes Card */}
            {ws?.isGitRepo && (
              <section
                ref={gitChangesSectionRef}
                className="ct-card overflow-hidden"
              >
                <div className="px-5 pt-4.5 pb-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[17px] font-bold text-[#141518]">
                      工作区 Git 变更
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[12px] font-semibold text-[#475569] tabular-nums">
                      {ws.changedFiles.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refetchWs()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[12.5px] font-medium text-[#64748B] hover:text-[#141518] hover:bg-[#F3F4F8] transition"
                  >
                    <RefreshCw
                      size={13}
                      className={refreshingWs ? "animate-spin" : ""}
                    />
                    <span>刷新</span>
                  </button>
                </div>

                {ws.changedFiles.length === 0 ? (
                  <div className="px-5 pb-6 pt-1 text-[13.5px] text-[#64748B]">
                    工作区干净，暂无未提交改动。
                  </div>
                ) : (
                  <div className="divide-y divide-slate-900/[0.06] border-t border-slate-900/[0.06]">
                    {ws.changedFiles.map((file) => {
                      const badge = getGitStatusBadgeStyle(file.status);
                      const isExpanded = expandedDiffPath === file.path;
                      return (
                        <div key={file.path}>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDiffPath(isExpanded ? null : file.path)
                            }
                            className={`w-full px-5 py-3 text-left flex items-center gap-3 hover:bg-[#F8FAFC] transition ${
                              isExpanded ? "bg-[#F8FAFC]" : ""
                            }`}
                          >
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] font-bold font-mono shrink-0 ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            <span className="font-mono text-[13px] text-[#141518] truncate flex-1">
                              {file.path}
                            </span>
                            <ChevronRight
                              size={15}
                              className={`text-[#94A3B8] transition shrink-0 ${
                                isExpanded ? "rotate-90" : ""
                              }`}
                            />
                          </button>

                          {isExpanded && (
                            <div className="px-5 pb-4 pt-1 bg-[#FAFBFD]">
                              {loadingDiff ? (
                                <div className="py-4 text-center text-[12.5px] text-[#94A3B8]">
                                  加载文件差异...
                                </div>
                              ) : (
                                <GitDiffViewer
                                  diff={selectedFileDiff?.diff ?? ""}
                                  maxHeightClass="max-h-[320px]"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Project Teams Card */}
            <section className="ct-card overflow-hidden">
              <div className="px-5 pt-4.5 pb-3.5 flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-bold text-[#141518]">
                  {t("project.workflows")}
                </h2>
                <button
                  type="button"
                  onClick={() => navigate("/workflows/new")}
                  className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-[#2563EB] hover:underline"
                >
                  <Plus size={14} strokeWidth={2.2} />
                  <span>{t("workflow.create")}</span>
                </button>
              </div>

              {workflows.length === 0 ? (
                <div className="px-5 pb-6 text-center text-[13.5px] text-[#64748B]">
                  {t("workflow.empty")}
                </div>
              ) : (
                <div className="divide-y divide-slate-900/[0.06] border-t border-slate-900/[0.06]">
                  {workflows.map((wf) => (
                    <button
                      type="button"
                      key={wf.id}
                      onClick={() => navigate(`/workflows/${wf.id}`)}
                      className="w-full px-5 py-3.5 hover:bg-[#F8FAFC] transition flex items-center gap-3.5 text-left"
                    >
                      <span className="w-[104px] shrink-0 text-[14.5px] font-semibold text-[#141518] truncate">
                        {wf.name}
                      </span>
                      <span
                        className="h-4 w-px bg-slate-900/[0.08] shrink-0"
                        aria-hidden="true"
                      />
                      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                        {wf.definition.steps.map((s, idx) => (
                          <React.Fragment key={s.id}>
                            <span className="inline-flex items-center gap-1.5 h-[32px] px-2.5 rounded-[8px] bg-[#F4F6FA] text-[13px] font-medium text-[#141518] whitespace-nowrap">
                              <AgentLogo
                                agentId={s.agentId}
                                name={agentName(s.agentId)}
                                size={18}
                              />
                              <span>{agentName(s.agentId)}</span>
                            </span>
                            {idx < wf.definition.steps.length - 1 && (
                              <ArrowRight
                                size={13}
                                className="text-[#94A3B8] shrink-0"
                              />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-[#94A3B8] shrink-0"
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            {/* Project Memory Card */}
            <section className="ct-card p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[17px] font-bold text-[#141518]">
                  {t("project.memoryTitle")}
                </h2>
                {savedNotice ? (
                  <span className="text-[12.5px] font-medium text-[#059669]">
                    已保存
                  </span>
                ) : memoryDirty ? (
                  <span className="text-[12px] text-[#64748B]">未保存</span>
                ) : null}
              </div>
              <p className="text-[13px] text-[#64748B] leading-relaxed">
                {t("project.memoryHint")}
              </p>
              <textarea
                aria-label={t("project.memoryTitle")}
                name="project-memory"
                rows={5}
                value={memoryDraft}
                onChange={(e) => setMemoryDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                    e.preventDefault();
                    void handleSaveMemory();
                  }
                }}
                placeholder="记录项目架构约定、构建命令或注意事项..."
                className="w-full rounded-[11px] border border-slate-900/[0.08] bg-[#F4F6FA] focus:bg-white p-3.5 text-[13.5px] leading-[1.65] text-[#141518] focus:outline-none focus:border-[#3B82F6] resize-y transition"
              />
              <button
                type="button"
                onClick={() => void handleSaveMemory()}
                className="ct-btn-primary w-full h-[40px] text-[14px] font-semibold"
              >
                {t("project.saveMemory")}
              </button>
            </section>

            {/* Rule Files Card */}
            <section className="ct-card p-5">
              <h2 className="text-[17px] font-bold text-[#141518] mb-2.5">
                {t("project.ruleFilesTitle")}
              </h2>
              {(memoryData?.ruleFiles ?? []).length === 0 ? (
                <p className="text-[13px] text-[#64748B]">
                  未发现 AGENTS.md / CLAUDE.md / GEMINI.md。
                </p>
              ) : (
                <div className="divide-y divide-slate-900/[0.06]">
                  {memoryData!.ruleFiles.map((rf) => (
                    <details
                      key={rf.relativePath}
                      className="group py-2.5 first:pt-1 last:pb-0"
                    >
                      <summary className="cursor-pointer list-none flex items-center gap-2.5 text-[14px] font-medium text-[#141518]">
                        <FileText
                          size={16}
                          strokeWidth={1.75}
                          className="text-[#475569] shrink-0"
                        />
                        <span className="truncate">{rf.relativePath}</span>
                        <ChevronRight
                          size={15}
                          className="ml-auto text-[#94A3B8] group-open:rotate-90 transition shrink-0"
                        />
                      </summary>
                      <pre className="mt-2 p-3 rounded-[9px] bg-[#F8F9FC] border border-slate-900/[0.07] text-[12.5px] font-mono text-[#374151] whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {rf.content}
                      </pre>
                    </details>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
