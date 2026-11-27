import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type {
  AgentWithStatus,
  Conversation,
  Project,
  WorkflowRecord,
} from "@codeteams/shared";
import { getBridge, rpc } from "../lib/bridge";
import {
  selectedProjectIdAtom,
  sidebarCollapsedAtom,
} from "../store/atoms";
import { AgentLogo } from "./AgentLogo";
import { BrandLogo } from "./BrandLogo";
import {
  duoBot,
  duoFolder,
  duoFolderOpen,
  duoSettings,
  duoShield,
  duoUsers,
  KubaiIcon,
} from "./kubai";

function formatShortTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "刚刚";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "昨天";
  if (diffDay < 7) return `${diffDay}天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [, setSelectedProjectId] = useAtom(selectedProjectIdAtom);
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const [expandedProjects, setExpandedProjects] = useState<
    Record<string, boolean>
  >({});
  const [showAllConvsByProject, setShowAllConvsByProject] = useState<
    Record<string, boolean>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => rpc("projects.list", { includeArchived: false }),
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: () => rpc("conversations.list", { includeArchived: false }),
  });

  const { data: agents = [] } = useQuery<AgentWithStatus[]>({
    queryKey: ["agents"],
    queryFn: () => rpc("agents.list"),
  });

  const { data: workflows = [] } = useQuery<WorkflowRecord[]>({
    queryKey: ["workflows"],
    queryFn: () => rpc("workflows.list", {}),
  });

  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents]
  );

  const workflowMap = useMemo(
    () => new Map(workflows.map((w) => [w.id, w])),
    [workflows]
  );

  const availableAgentsCount = useMemo(
    () =>
      agents.filter(
        (a) =>
          a.status?.installState === "installed" ||
          a.status?.installState === "via_npx"
      ).length,
    [agents]
  );

  // Global keyboard shortcuts: Ctrl+N (new chat), Ctrl+K (focus sidebar search)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === "n") {
          e.preventDefault();
          navigate("/");
        } else if (key === "k") {
          e.preventDefault();
          if (collapsed) {
            setCollapsed(false);
            setTimeout(() => searchInputRef.current?.focus(), 60);
          } else {
            searchInputRef.current?.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, collapsed, setCollapsed]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredTree = useMemo(() => {
    return projects
      .map((proj) => {
        const projConvs = conversations.filter((c) => c.projectId === proj.id);
        if (!normalizedQuery) {
          return { proj, convs: projConvs };
        }
        const projMatches = proj.name.toLowerCase().includes(normalizedQuery);
        const matchingConvs = projConvs.filter((c) =>
          c.title.toLowerCase().includes(normalizedQuery)
        );
        if (projMatches) {
          return { proj, convs: projConvs };
        }
        if (matchingConvs.length > 0) {
          return { proj, convs: matchingConvs };
        }
        return null;
      })
      .filter(
        (entry): entry is { proj: Project; convs: Conversation[] } =>
          entry !== null
      );
  }, [projects, conversations, normalizedQuery]);

  const handleOpenProject = async () => {
    const dir = await getBridge().selectProjectDirectory();
    if (!dir) return;
    const opened = await rpc<"projects.open", Project>("projects.open", {
      path: dir,
    });
    setSelectedProjectId(opened.id);
    setSearchQuery("");
    setExpandedProjects((prev) => ({ ...prev, [opened.id]: true }));
    queryClient.setQueryData<Project[]>(["projects"], (prev = []) => [
      opened,
      ...prev.filter((p) => p.id !== opened.id),
    ]);
    await queryClient.invalidateQueries({
      queryKey: ["projects"],
      refetchType: "all",
    });
  };

  const handleStartRename = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    e.preventDefault();
    setRenamingId(conv.id);
    setRenameDraft(conv.title);
  };

  const handleCommitRename = async (convId: string) => {
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (!trimmed) return;
    await rpc("conversations.rename", {
      conversationId: convId,
      title: trimmed,
    });
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    await queryClient.invalidateQueries({ queryKey: ["conversation", convId] });
  };

  const handleArchiveProject = async (
    e: React.MouseEvent,
    proj: Project
  ) => {
    e.stopPropagation();
    const ok = window.confirm(
      `确认从工作区列表中移除「${proj.name}」吗？（不会删除你的本地代码文件）`
    );
    if (!ok) return;
    await rpc("projects.archive", { projectId: proj.id, archived: true });
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    if (location.pathname === `/projects/${proj.id}`) {
      navigate("/");
    }
  };

  const handleDeleteConversation = async (
    e: React.MouseEvent,
    convId: string
  ) => {
    e.stopPropagation();
    const ok = window.confirm(
      "确认删除这条本地对话记录吗？（Agent 自身外部缓存不一定同步删除）"
    );
    if (!ok) return;
    await rpc("conversations.delete", { conversationId: convId });
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    if (location.pathname === `/chat/${convId}`) {
      navigate("/");
    }
  };

  const navItems = [
    { to: "/workflows", label: t("nav.workflows"), icon: duoUsers },
    { to: "/agents", label: t("nav.agents"), icon: duoBot },
    { to: "/settings", label: t("nav.settings"), icon: duoSettings },
  ];

  return (
    <aside
      className={`ct-sidebar shrink-0 h-full flex flex-col select-none ${
        collapsed ? "ct-sidebar-collapsed" : ""
      }`}
    >
      {/* Top Brand Header + Collapse Button */}
      <div
        className={`ct-drag h-[52px] flex items-center shrink-0 ${
          collapsed ? "justify-center px-2" : "justify-between px-4"
        }`}
      >
        {!collapsed && (
          <Link
            to="/"
            aria-label="CodeTeams"
            className="inline-flex items-center gap-2 text-[#141518]"
          >
            <BrandLogo size={26} className="text-[#141518]" />
            <span
              translate="no"
              className="text-[20px] font-bold tracking-[-0.025em]"
            >
              CodeTeams
            </span>
          </Link>
        )}

        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          className="w-7 h-7 rounded-[8px] inline-flex items-center justify-center text-[#64748B] hover:bg-slate-900/[0.06] hover:text-[#141518] transition shrink-0"
        >
          {collapsed ? (
            <ChevronsRight size={16} strokeWidth={1.9} />
          ) : (
            <ChevronsLeft size={16} strokeWidth={1.9} />
          )}
        </button>
      </div>

      {/* High-Contrast Obsidian Primary CTA: + 新建对话 */}
      <div className={`${collapsed ? "px-2.5" : "px-3.5"} pt-1 pb-2.5 shrink-0`}>
        <Link
          to="/"
          aria-label={t("nav.newChat")}
          title={`${t("nav.newChat")} (Ctrl+N)`}
          aria-current={location.pathname === "/" ? "page" : undefined}
          className={`w-full h-[40px] flex items-center rounded-[11px] bg-[#141518] text-[15px] font-semibold text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)] hover:bg-[#23252a] active:scale-[0.99] transition ${
            collapsed ? "justify-center px-0" : "justify-between px-3.5"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Plus size={15} strokeWidth={2.2} />
            {!collapsed && <span>{t("nav.newChat")}</span>}
          </span>
          {!collapsed && (
            <kbd className="px-1.5 py-0.5 rounded-[5px] bg-white/[0.12] text-[11px] font-medium text-white/80 font-mono leading-none">
              Ctrl N
            </kbd>
          )}
        </Link>
      </div>

      {/* Compact Always-Available Quick Search Bar (Ctrl K) */}
      {!collapsed && (
        <div className="px-3.5 pb-3 shrink-0">
          <div className="relative flex items-center">
            <Search
              size={14}
              className="absolute left-3 text-[#94A3B8] pointer-events-none"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchQuery("");
                  searchInputRef.current?.blur();
                }
              }}
              placeholder="搜索对话或项目..."
              aria-label="搜索对话或项目"
              className="w-full h-[35px] pl-8.5 pr-13 rounded-[10px] bg-white border border-slate-900/[0.08] text-[14px] text-[#141518] placeholder:text-[#94A3B8] shadow-[0_1px_2px_rgba(15,23,42,0.03)] focus:outline-none focus:border-[#71717A] focus:shadow-[0_0_0_2px_rgba(39,39,42,0.10)] transition"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="清除搜索"
                className="absolute right-2.5 text-[#94A3B8] hover:text-[#475569]"
              >
                <X size={13} />
              </button>
            ) : (
              <kbd className="absolute right-2.5 px-1.5 py-0.5 rounded-[5px] bg-[#F1F5F9] text-[10.5px] font-medium text-[#64748B] font-mono leading-none pointer-events-none">
                Ctrl K
              </kbd>
            )}
          </div>
        </div>
      )}

      {/* Main Nav */}
      <nav
        aria-label="主导航"
        className={`${collapsed ? "px-2.5" : "px-3.5"} space-y-0.5 shrink-0`}
      >
        {navItems.map((item) => {
          const active = location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              data-kubai-trigger
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`w-full h-[37px] flex items-center rounded-[10px] text-[15px] transition ${
                collapsed ? "justify-center px-0" : "gap-2.5 px-3"
              } ${
                active
                  ? "bg-white text-[#141518] font-semibold shadow-[0_1px_4px_rgba(15,23,42,0.06)]"
                  : "text-[#374151] font-medium hover:bg-slate-900/[0.045] hover:text-[#141518]"
              }`}
            >
              <KubaiIcon
                icon={item.icon}
                size={18}
                trigger="parent"
                className={active ? "text-[#27272A]" : "text-[#52525B]"}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3.5 my-3 h-px bg-slate-900/[0.06] shrink-0" />

      {/* Projects Section */}
      {collapsed ? (
        <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-1.5 flex flex-col items-center">
          <button
            type="button"
            onClick={handleOpenProject}
            className="w-10 h-10 rounded-[10px] inline-flex items-center justify-center text-[#27272A] hover:bg-white transition"
            aria-label={t("nav.openProject")}
            title={t("nav.openProject")}
          >
            <FolderPlus size={18} strokeWidth={1.9} />
          </button>
          {projects.map((proj) => {
            const isProjectPage = location.pathname === `/projects/${proj.id}`;
            return (
              <button
                key={proj.id}
                type="button"
                data-kubai-trigger
                onClick={() => {
                  setSelectedProjectId(proj.id);
                  navigate(`/projects/${proj.id}`);
                }}
                title={proj.name}
                aria-label={proj.name}
                className={`w-10 h-10 rounded-[10px] inline-flex items-center justify-center transition ${
                  isProjectPage
                    ? "bg-white text-[#27272A] shadow-[0_1px_4px_rgba(15,23,42,0.08)]"
                    : "text-[#52525B] hover:bg-white/70 hover:text-[#27272A]"
                }`}
              >
                <KubaiIcon icon={duoFolder} size={20} trigger="parent" />
              </button>
            );
          })}
        </div>
      ) : (
        <>
          {/* Section Header: 项目工作区 + 蓝字 "+ 添加目录" */}
          <div className="px-4 pb-2.5 flex items-center justify-between shrink-0">
            <span className="text-[14px] font-semibold text-[#71717A]">
              项目工作区
            </span>
            <button
              type="button"
              onClick={handleOpenProject}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] text-[14px] font-semibold text-[#27272A] hover:bg-[#F0F0F2] transition"
              aria-label={t("nav.openProject")}
              title={t("nav.openProject")}
            >
              <Plus size={13.5} strokeWidth={2.3} />
              <span>添加目录</span>
            </button>
          </div>

          {/* Projects & Conversations Tree */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3.5">
            {projects.length === 0 ? (
              <div className="mx-1 px-3.5 py-4 rounded-[12px] bg-white/75 border border-dashed border-slate-900/[0.1] text-[13.5px] text-[#64748B] space-y-2.5">
                <p>{t("nav.noProjects")}</p>
                <button
                  type="button"
                  onClick={handleOpenProject}
                  className="ct-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium"
                >
                  <FolderPlus size={14} />
                  <span>{t("nav.openProject")}</span>
                </button>
              </div>
            ) : filteredTree.length === 0 ? (
              <div className="px-2 py-4 text-[13.5px] text-[#94A3B8] text-center">
                没有匹配的项目或对话
              </div>
            ) : (
              filteredTree.map(({ proj, convs: projConvs }) => {
                const isExpanded =
                  normalizedQuery.length > 0
                    ? true
                    : (expandedProjects[proj.id] ?? true);
                const isProjectPage =
                  location.pathname === `/projects/${proj.id}`;

                return (
                  <div key={proj.id}>
                    {/* Clean Codex/Linear-style Project Workspace Header Row */}
                    <div
                      className={`group h-[36px] flex items-center gap-1.5 px-2 rounded-[9px] text-[15px] transition ${
                        isProjectPage
                          ? "bg-white text-[#141518] font-semibold shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.05]"
                          : "text-[#1E293B] font-semibold hover:bg-slate-900/[0.045]"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={proj.name}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedProjects((prev) => ({
                            ...prev,
                            [proj.id]: !isExpanded,
                          }))
                        }
                        className="w-5 h-5 inline-flex items-center justify-center rounded text-[#94A3B8] hover:text-[#141518] shrink-0 transition"
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} strokeWidth={2.1} />
                        ) : (
                          <ChevronRight size={14} strokeWidth={2.1} />
                        )}
                      </button>

                      <button
                        type="button"
                        data-kubai-trigger
                        onClick={() => {
                          setSelectedProjectId(proj.id);
                          navigate(`/projects/${proj.id}`);
                        }}
                        className="flex-1 flex items-center gap-2 min-w-0 text-left"
                        title={
                          proj.isGitRepo && proj.gitBranch
                            ? `${proj.canonicalPath} · ${proj.gitBranch}${proj.hasUncommittedChanges ? " (有未提交改动)" : ""}`
                            : proj.canonicalPath
                        }
                      >
                        <KubaiIcon
                          icon={isExpanded ? duoFolderOpen : duoFolder}
                          size={19}
                          trigger="parent"
                          className={
                            isProjectPage ? "text-[#27272A]" : "text-[#52525B]"
                          }
                        />
                        <span className="truncate tracking-[-0.01em]">
                          {proj.name}
                        </span>
                        {proj.hasUncommittedChanges && (
                          <span
                            aria-hidden="true"
                            className="w-1.5 h-1.5 rounded-full bg-[#71717A] shrink-0"
                          />
                        )}
                      </button>

                      {/* Quiet Count (no noisy boxes; replaced by quick actions on hover) */}
                      {projConvs.length > 0 && (
                        <span className="pr-1.5 text-[12px] font-medium text-[#94A3B8] tabular-nums shrink-0 group-hover:hidden group-focus-within:hidden">
                          {projConvs.length}
                        </span>
                      )}

                      {/* Project Quick Actions on Hover */}
                      <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProjectId(proj.id);
                            navigate("/");
                          }}
                          className="w-6.5 h-6.5 inline-flex items-center justify-center rounded-[6px] text-[#64748B] hover:bg-white hover:text-[#27272A] hover:shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition"
                          aria-label={`在 ${proj.name} 中新建对话`}
                          title="新建对话"
                        >
                          <Plus size={14.5} strokeWidth={2.2} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void getBridge().openPathInExplorer(
                              proj.canonicalPath
                            );
                          }}
                          className="w-6.5 h-6.5 inline-flex items-center justify-center rounded-[6px] text-[#64748B] hover:bg-white hover:text-[#141518] hover:shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition"
                          aria-label={`打开 ${proj.name} 目录`}
                          title="在资源管理器中打开"
                        >
                          <FolderOpen size={13.5} strokeWidth={1.9} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => void handleArchiveProject(e, proj)}
                          className="w-6.5 h-6.5 inline-flex items-center justify-center rounded-[6px] text-[#64748B] hover:bg-white hover:text-[#DC2626] hover:shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition"
                          aria-label={`移除工作区 ${proj.name}`}
                          title="从工作区移除"
                        >
                          <Archive size={13} strokeWidth={1.9} />
                        </button>
                      </div>
                    </div>

                    {/* Indented Tree Branch with Hairline Guide Rail */}
                    {isExpanded && (() => {
                      const COLLAPSE_LIMIT = 6;
                      const showAll =
                        normalizedQuery.length > 0 ||
                        Boolean(showAllConvsByProject[proj.id]);
                      let visibleConvs = showAll
                        ? projConvs
                        : projConvs.slice(0, COLLAPSE_LIMIT);
                      if (!showAll) {
                        const activeOutside = projConvs
                          .slice(COLLAPSE_LIMIT)
                          .find((c) => location.pathname === `/chat/${c.id}`);
                        if (activeOutside) {
                          visibleConvs = [...visibleConvs, activeOutside];
                        }
                      }
                      const hiddenCount = projConvs.length - visibleConvs.length;

                      return (
                        <div className="mt-1.5 ml-[15px] pl-[11px] border-l border-slate-900/[0.08] space-y-1">
                          {projConvs.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProjectId(proj.id);
                                navigate("/");
                              }}
                              className="w-full px-2.5 py-2 rounded-[8px] text-left text-[13px] text-[#94A3B8] hover:text-[#475569] hover:bg-white/60 transition"
                            >
                              暂无对话 · 点击新建
                            </button>
                          ) : (
                            visibleConvs.map((conv) => {
                              const isActiveConv =
                                location.pathname === `/chat/${conv.id}`;
                              const isWaitingPermission =
                                conv.latestRunState === "waiting_permission" ||
                                conv.activeTurn?.state === "waiting_permission";
                              const isInterrupted =
                                conv.latestRunState === "interrupted";
                              const isRunning =
                                conv.latestRunState === "running" ||
                                conv.activeTurn?.state === "running";
                              const isRenaming = renamingId === conv.id;

                              return (
                                <div
                                  key={conv.id}
                                  className={`group relative h-[36px] flex items-center gap-2 px-2.5 rounded-[9px] text-[15px] transition ${
                                    isActiveConv
                                      ? "bg-white text-[#141518] font-medium shadow-[0_1px_4px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.05]"
                                      : "text-[#475569] hover:bg-white/70 hover:text-[#141518]"
                                  }`}
                                >
                                  {/* Active indicator aligned cleanly on the tree rail */}
                                  {isActiveConv && (
                                    <span
                                      aria-hidden="true"
                                      className="absolute -left-[12px] top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-[#27272A]"
                                    />
                                  )}

                                  {isRenaming ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={renameDraft}
                                      onChange={(e) =>
                                        setRenameDraft(e.target.value)
                                      }
                                      onBlur={() =>
                                        void handleCommitRename(conv.id)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          void handleCommitRename(conv.id);
                                        } else if (e.key === "Escape") {
                                          setRenamingId(null);
                                        }
                                      }}
                                      className="w-full h-7 px-2 rounded bg-white border border-[#71717A] text-[14px] text-[#141518] focus:outline-none"
                                    />
                                  ) : (
                                    <>
                                      <Link
                                        to={`/chat/${conv.id}`}
                                        data-kubai-trigger
                                        onClick={() =>
                                          setSelectedProjectId(proj.id)
                                        }
                                        aria-current={
                                          isActiveConv ? "page" : undefined
                                        }
                                        title={conv.title}
                                        className="flex flex-1 min-w-0 items-center gap-2.5"
                                      >
                                        {(() => {
                                          if (conv.mode === "workflow") {
                                            const wf = conv.workflowId
                                              ? workflowMap.get(conv.workflowId)
                                              : undefined;
                                            const teamAgentIds = Array.from(
                                              new Set(
                                                (
                                                  wf?.definition.steps ?? []
                                                ).map((s) => s.agentId)
                                              )
                                            ).slice(0, 3);
                                            if (teamAgentIds.length > 0) {
                                              return (
                                                <span
                                                  className="inline-flex items-center -space-x-[7.5px] shrink-0"
                                                  title={
                                                    wf?.name
                                                      ? `团队：${wf.name}`
                                                      : "团队对话"
                                                  }
                                                >
                                                  {teamAgentIds.map(
                                                    (agentId, idx) => (
                                                      <span
                                                        key={agentId}
                                                        style={{
                                                          zIndex:
                                                            teamAgentIds.length -
                                                            idx,
                                                        }}
                                                        className={`relative w-[22px] h-[22px] rounded-full bg-white border border-slate-900/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.06)] inline-flex items-center justify-center ring-2 ${
                                                          isActiveConv
                                                            ? "ring-white"
                                                            : "ring-[#F5F6FA]"
                                                        }`}
                                                      >
                                                        <AgentLogo
                                                          agentId={agentId}
                                                          name={
                                                            agentMap.get(
                                                              agentId
                                                            )?.name
                                                          }
                                                          size={14}
                                                        />
                                                      </span>
                                                    )
                                                  )}
                                                </span>
                                              );
                                            }
                                            return (
                                              <KubaiIcon
                                                icon={duoUsers}
                                                size={17}
                                                trigger="parent"
                                                className="text-[#52525B]"
                                              />
                                            );
                                          }

                                          const singleAgentId =
                                            conv.agentId ?? "codex";
                                          const singleAgent =
                                            agentMap.get(singleAgentId);
                                          return (
                                            <span
                                              className="w-[19px] h-[19px] inline-flex items-center justify-center shrink-0"
                                              title={
                                                singleAgent?.name ??
                                                singleAgentId
                                              }
                                            >
                                              <AgentLogo
                                                agentId={singleAgentId}
                                                name={singleAgent?.name}
                                                size={17.5}
                                              />
                                            </span>
                                          );
                                        })()}
                                        <span className="truncate flex-1">
                                          {conv.title}
                                        </span>
                                      </Link>

                                      {/* Live status icon (kept separate from the fixed left Coding Agent logo) */}
                                      {isWaitingPermission ? (
                                        <span
                                          title="等待你的授权批准"
                                          className="inline-flex items-center shrink-0 group-hover:hidden group-focus-within:hidden"
                                        >
                                          <KubaiIcon
                                            icon={duoShield}
                                            size={15}
                                            trigger="parent"
                                            className="text-[#52525B]"
                                          />
                                        </span>
                                      ) : isRunning ? (
                                        <Loader2
                                          size={13.5}
                                          className="text-[#27272A] animate-spin shrink-0 group-hover:hidden group-focus-within:hidden"
                                        />
                                      ) : isInterrupted ? (
                                        <AlertTriangle
                                          size={13.5}
                                          className="text-[#EA580C] shrink-0 group-hover:hidden group-focus-within:hidden"
                                        />
                                      ) : null}

                                      {/* Quiet timestamp (hidden on hover when actions show) */}
                                      <span className="text-[12px] text-[#94A3B8] tabular-nums shrink-0 group-hover:hidden group-focus-within:hidden">
                                        {formatShortTime(conv.updatedAt)}
                                      </span>

                                      {/* Hover actions: Rename & Delete */}
                                      <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={(e) =>
                                            handleStartRename(e, conv)
                                          }
                                          className="p-1 rounded hover:bg-slate-900/[0.08] text-[#64748B] hover:text-[#141518] transition"
                                          aria-label="重命名对话"
                                          title="重命名"
                                        >
                                          <Pencil size={12.5} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) =>
                                            handleDeleteConversation(e, conv.id)
                                          }
                                          className="p-1 rounded hover:bg-slate-900/[0.08] text-[#64748B] hover:text-[#DC2626] transition"
                                          aria-label="删除对话"
                                          title="删除对话"
                                        >
                                          <Trash2 size={12.5} />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })
                          )}

                          {projConvs.length > COLLAPSE_LIMIT &&
                            normalizedQuery.length === 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setShowAllConvsByProject((prev) => ({
                                    ...prev,
                                    [proj.id]: !showAll,
                                  }))
                                }
                                className="w-full px-2.5 py-1.5 rounded-[8px] text-left text-[12.5px] font-medium text-[#94A3B8] hover:text-[#475569] hover:bg-white/60 transition"
                              >
                                {showAll
                                  ? "收起历史对话"
                                  : `展开其余 ${hiddenCount} 条`}
                              </button>
                            )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Bottom Floating Workspace Status Card with Live Ready Agent Count */}
      <div className={`${collapsed ? "px-2.5" : "px-3"} pb-3 pt-1 shrink-0`}>
        <div
          className={`h-[44px] rounded-[12px] bg-white border border-slate-900/[0.07] shadow-[0_2px_8px_rgba(15,23,42,0.04)] flex items-center ${
            collapsed ? "justify-center px-0" : "justify-between px-3.5"
          }`}
        >
          <span
            className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[#141518] min-w-0"
            title={t("shell.localWorkspace")}
          >
            <span
              className="w-2 h-2 rounded-full bg-[#10B981] shrink-0"
              aria-hidden="true"
            />
            {!collapsed && (
              <span className="truncate">
                {availableAgentsCount > 0
                  ? `本地运行 · ${availableAgentsCount} Agent 就绪`
                  : t("shell.localWorkspace")}
              </span>
            )}
          </span>
          {!collapsed && (
            <Link
              to="/settings"
              aria-label="工作空间设置"
              title="设置"
              className="w-6 h-6 rounded-[6px] inline-flex items-center justify-center text-[#64748B] hover:bg-[#F3F4F6] hover:text-[#141518] transition shrink-0"
            >
              <SlidersHorizontal size={14} strokeWidth={1.85} />
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
};
