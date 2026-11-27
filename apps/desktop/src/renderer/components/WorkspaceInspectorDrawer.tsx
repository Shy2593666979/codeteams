import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  FolderOpen,
  GitBranch,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type {
  AgentWithStatus,
  Artifact,
  ContextHandoff,
  CoreEvent,
  WorkflowRun,
  WorkspaceFilePreview,
  WorkspaceGitDiff,
  WorkspaceStatus,
  WorkspaceTreeEntry,
} from "@codeteams/shared";
import { getBridge, rpc } from "../lib/bridge";
import {
  duoBraces,
  duoFile,
  duoFileCode,
  duoFileImage,
  duoFileText,
  duoFolder,
  duoFolderOpen,
  duoSettings,
  duoTerminal,
  KubaiIcon,
  type KubaiIconData,
} from "./kubai";

export type InspectorDrawerTab = "files" | "diff" | "handoff" | "logs";

export function getGitStatusBadgeStyle(status: string): {
  label: string;
  className: string;
  textColor: string;
} {
  const s = status.trim().toUpperCase();
  if (s === "??" || s === "A") {
    return {
      label: s === "??" ? "U" : "A",
      className: "bg-[#DCFCE7] text-[#15803D]",
      textColor: "text-[#059669]",
    };
  }
  if (s === "D") {
    return {
      label: "D",
      className: "bg-[#FEE2E2] text-[#DC2626]",
      textColor: "text-[#DC2626]",
    };
  }
  if (s === "R") {
    return {
      label: "R",
      className: "bg-[#F3E8FF] text-[#7C3AED]",
      textColor: "text-[#7C3AED]",
    };
  }
  return {
    label: s || "M",
    className: "bg-[#DBEAFE] text-[#1D4ED8]",
    textColor: "text-[#D97706]",
  };
}

function getFileVisual(fileName: string): {
  icon: KubaiIconData;
  colorClass: string;
} {
  const lower = fileName.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop() ?? "" : "";

  if (ext === "ts" || ext === "tsx" || ext === "mts" || ext === "cts") {
    return { icon: duoFileCode, colorClass: "text-[#3B82F6]" };
  }
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") {
    return { icon: duoFileCode, colorClass: "text-[#D97706]" };
  }
  if (ext === "json" || ext === "jsonc") {
    return { icon: duoBraces, colorClass: "text-[#EA580C]" };
  }
  if (ext === "css" || ext === "scss" || ext === "less" || ext === "html") {
    return { icon: duoBraces, colorClass: "text-[#0284C7]" };
  }
  if (ext === "md" || ext === "mdx" || ext === "txt") {
    return { icon: duoFileText, colorClass: "text-[#6366F1]" };
  }
  if (
    ext === "png" ||
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "svg" ||
    ext === "ico" ||
    ext === "webp" ||
    ext === "gif"
  ) {
    return { icon: duoFileImage, colorClass: "text-[#10B981]" };
  }
  if (ext === "sh" || ext === "ps1" || ext === "bat" || ext === "cmd") {
    return { icon: duoTerminal, colorClass: "text-[#4F46E5]" };
  }
  if (
    lower.startsWith(".") ||
    ext === "toml" ||
    ext === "yaml" ||
    ext === "yml" ||
    ext === "ini" ||
    ext === "env" ||
    ext === "lock"
  ) {
    return { icon: duoSettings, colorClass: "text-[#4086FF]" };
  }
  return { icon: duoFile, colorClass: "text-[#4086FF]" };
}

function formatCompactSize(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Crisp colored unified Git diff viewer shared across ProjectDetailPage & ChatRunPage */
export const GitDiffViewer: React.FC<{
  diff: string;
  maxHeightClass?: string;
}> = ({ diff, maxHeightClass = "max-h-[340px]" }) => {
  if (!diff.trim()) {
    return (
      <div className="rounded-[10px] border border-slate-900/[0.07] bg-[#F8FAFC] px-3.5 py-3 text-[12.5px] text-[#64748B]">
        当前无文本差异可展示
      </div>
    );
  }

  const lines = diff.split(/\r?\n/);
  return (
    <div
      className={`rounded-[10px] border border-slate-900/[0.08] bg-white overflow-auto font-mono text-[12px] leading-[1.6] ${maxHeightClass}`}
    >
      <div className="min-w-max py-1.5">
        {lines.map((line, idx) => {
          let rowClass = "text-[#334155]";
          if (line.startsWith("@@")) {
            rowClass = "bg-[#EEF4FF] text-[#1D4ED8] font-medium";
          } else if (
            line.startsWith("diff --git") ||
            line.startsWith("---") ||
            line.startsWith("+++") ||
            line.startsWith("index ")
          ) {
            rowClass = "bg-[#F8FAFC] text-[#64748B] font-semibold";
          } else if (line.startsWith("+")) {
            rowClass = "bg-[#ECFDF5] text-[#065F46]";
          } else if (line.startsWith("-")) {
            rowClass = "bg-[#FEF2F2] text-[#991B1B]";
          }
          return (
            <div key={idx} className={`px-3 whitespace-pre ${rowClass}`}>
              {line || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface FileTreeBranchProps {
  projectId: string;
  canonicalPath?: string;
  relativePath: string;
  depth: number;
  selectedFilePath: string | null;
  filterQuery: string;
  onSelectFile: (relPath: string) => void;
  refreshToken: number;
  collapseSignal: number;
}

const FileTreeBranch: React.FC<FileTreeBranchProps> = ({
  projectId,
  canonicalPath,
  relativePath,
  depth,
  selectedFilePath,
  filterQuery,
  onSelectFile,
  refreshToken,
  collapseSignal,
}) => {
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (collapseSignal > 0) {
      setExpandedDirs({});
    }
  }, [collapseSignal]);

  const { data, isLoading } = useQuery<{
    entries: WorkspaceTreeEntry[];
    truncated: boolean;
  }>({
    queryKey: ["workspace-tree", projectId, relativePath, refreshToken],
    queryFn: () =>
      rpc("projects.listFiles", {
        projectId,
        ...(relativePath ? { relativePath } : {}),
      }),
    staleTime: 10_000,
  });

  const normalizedFilter = filterQuery.trim().toLowerCase();
  const entries = useMemo(() => {
    const raw = data?.entries ?? [];
    if (!normalizedFilter) return raw;
    return raw.filter(
      (e) =>
        e.kind === "dir" ||
        e.name.toLowerCase().includes(normalizedFilter) ||
        e.relativePath.toLowerCase().includes(normalizedFilter)
    );
  }, [data?.entries, normalizedFilter]);

  if (isLoading) {
    return (
      <div className="space-y-1.5 py-1.5 px-2">
        {[0, 1, 2].map((n) => (
          <div
            key={n}
            className="h-[22px] rounded-[6px] bg-slate-900/[0.04] animate-pulse"
            style={{ width: `${72 - n * 14}%` }}
          />
        ))}
      </div>
    );
  }

  if (entries.length === 0 && depth === 0) {
    return (
      <div className="py-8 text-center text-[12.5px] text-[#94A3B8]">
        {normalizedFilter ? "没有匹配的文件" : "当前目录为空"}
      </div>
    );
  }

  return (
    <div
      className={
        depth > 0
          ? "ml-[14px] pl-[6px] border-l border-slate-900/[0.07] space-y-[1px]"
          : "space-y-[1px]"
      }
    >
      {entries.map((entry) => {
        const isDir = entry.kind === "dir";
        const isOpen = Boolean(expandedDirs[entry.relativePath]);
        const isSelected = !isDir && selectedFilePath === entry.relativePath;
        const badge = entry.gitStatus
          ? getGitStatusBadgeStyle(entry.gitStatus)
          : null;
        const fileVisual = !isDir ? getFileVisual(entry.name) : null;

        return (
          <div key={entry.relativePath}>
            <div
              className={`group relative h-[28px] px-2 rounded-[7px] flex items-center gap-1.5 transition ${
                isSelected
                  ? "bg-[#E8F0FE] text-[#1D4ED8] font-medium"
                  : "text-[#27272A] hover:bg-[#F3F5F9]"
              }`}
            >
              <button
                type="button"
                data-kubai-trigger
                onClick={() => {
                  if (isDir) {
                    setExpandedDirs((prev) => ({
                      ...prev,
                      [entry.relativePath]: !prev[entry.relativePath],
                    }));
                  } else {
                    onSelectFile(entry.relativePath);
                  }
                }}
                title={
                  !isDir && entry.size != null
                    ? `${entry.relativePath} (${formatCompactSize(entry.size)})`
                    : entry.relativePath
                }
                className="flex-1 min-w-0 h-full flex items-center gap-1.5 text-left"
              >
                {isDir ? (
                  <>
                    <span className="w-3.5 inline-flex items-center justify-center text-[#94A3B8] shrink-0">
                      {isOpen ? (
                        <ChevronDown size={13} strokeWidth={2} />
                      ) : (
                        <ChevronRight size={13} strokeWidth={2} />
                      )}
                    </span>
                    <KubaiIcon
                      icon={isOpen ? duoFolderOpen : duoFolder}
                      size={16.5}
                      trigger="parent"
                      className={isOpen ? "text-[#2563EB]" : "text-[#4086FF]"}
                    />
                  </>
                ) : (
                  <>
                    <span className="w-3.5 shrink-0" aria-hidden="true" />
                    <KubaiIcon
                      icon={fileVisual?.icon ?? duoFile}
                      size={16}
                      trigger="parent"
                      className={
                        isSelected
                          ? "text-[#2563EB]"
                          : fileVisual?.colorClass ?? "text-[#4086FF]"
                      }
                    />
                  </>
                )}

                <span
                  className={`truncate flex-1 text-[13px] tracking-[-0.005em] ${
                    isDir
                      ? "font-medium text-[#18181B]"
                      : badge && !isSelected
                        ? badge.textColor
                        : ""
                  }`}
                >
                  {entry.name}
                </span>
              </button>

              {/* Right status indicator (VS Code style crisp single letter / subtle dot) */}
              {badge && (
                <span
                  className={`shrink-0 group-hover:hidden ${
                    isDir
                      ? "w-1.5 h-1.5 rounded-full bg-[#3B82F6] mr-1"
                      : `font-mono text-[11px] font-bold pr-0.5 ${badge.textColor}`
                  }`}
                >
                  {isDir ? "" : badge.label}
                </span>
              )}

              {/* Subtle Hover Action: Reveal in Explorer */}
              {canonicalPath && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const fullPath = `${canonicalPath.replace(/[\\/]+$/, "")}/${entry.relativePath}`;
                    void getBridge().openPathInExplorer(fullPath);
                  }}
                  title="在资源管理器中定位"
                  aria-label={`定位 ${entry.name}`}
                  className="hidden group-hover:inline-flex w-5 h-5 items-center justify-center rounded-[5px] text-[#94A3B8] hover:text-[#141518] hover:bg-white transition shrink-0"
                >
                  <FolderOpen size={11.5} />
                </button>
              )}
            </div>

            {isDir && isOpen && (
              <FileTreeBranch
                projectId={projectId}
                canonicalPath={canonicalPath}
                relativePath={entry.relativePath}
                depth={depth + 1}
                selectedFilePath={selectedFilePath}
                filterQuery={filterQuery}
                onSelectFile={onSelectFile}
                refreshToken={refreshToken}
                collapseSignal={collapseSignal}
              />
            )}
          </div>
        );
      })}
      {data?.truncated && (
        <div className="py-1.5 pl-6 text-[11.5px] text-[#94A3B8]">
          仅展示前 250 项…
        </div>
      )}
    </div>
  );
};

interface WorkspaceInspectorDrawerProps {
  projectId: string;
  tab: InspectorDrawerTab;
  onTabChange: (tab: InspectorDrawerTab) => void;
  onClose: () => void;
  wsStatus?: WorkspaceStatus;
  run?: WorkflowRun | null;
  handoffs?: ContextHandoff[];
  artifacts?: Artifact[];
  events?: CoreEvent[];
  agentMap: Map<string, AgentWithStatus>;
  summaryBullets: string[];
  allHandoffChangedFiles: string[];
}

export const WorkspaceInspectorDrawer: React.FC<
  WorkspaceInspectorDrawerProps
> = ({
  projectId,
  tab,
  onTabChange,
  onClose,
  wsStatus,
  run,
  handoffs = [],
  artifacts = [],
  events = [],
  agentMap,
  summaryBullets,
  allHandoffChangedFiles,
}) => {
  const queryClient = useQueryClient();
  const [expandedWidth, setExpandedWidth] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null);
  const [treeFilter, setTreeFilter] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [copiedKey, setCopiedKey] = useState<"path" | "code" | null>(null);

  useEffect(() => {
    setSelectedFile(null);
    setSelectedDiffFile(null);
    setTreeFilter("");
  }, [projectId]);

  const { data: filePreview, isLoading: loadingFile } =
    useQuery<WorkspaceFilePreview>({
      queryKey: ["workspace-file", projectId, selectedFile, refreshToken],
      queryFn: () =>
        rpc("projects.readFile", {
          projectId,
          relativePath: selectedFile!,
        }),
      enabled: Boolean(projectId && selectedFile && tab === "files"),
    });

  const { data: diffData, isLoading: loadingDiff } = useQuery<WorkspaceGitDiff>(
    {
      queryKey: ["workspace-diff", projectId, selectedDiffFile, refreshToken],
      queryFn: () =>
        rpc("projects.gitDiff", {
          projectId,
          ...(selectedDiffFile ? { relativePath: selectedDiffFile } : {}),
        }),
      enabled: Boolean(projectId && tab === "diff" && wsStatus?.isGitRepo),
    }
  );

  const handleRefresh = () => {
    setRefreshToken((n) => n + 1);
    void queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
  };

  const handleOpenFolder = () => {
    if (!wsStatus?.canonicalPath) return;
    if (selectedFile && tab === "files") {
      const fullPath = `${wsStatus.canonicalPath.replace(/[\\/]+$/, "")}/${selectedFile}`;
      void getBridge().openPathInExplorer(fullPath);
      return;
    }
    void getBridge().openPathInExplorer(wsStatus.canonicalPath);
  };

  const handleCopy = (kind: "path" | "code", text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(kind);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const previewLines = useMemo(() => {
    if (!filePreview || filePreview.binary) return [];
    return filePreview.content.split(/\r?\n/);
  }, [filePreview]);

  return (
    <aside
      className={`ct-chat-drawer shrink-0 ct-card rounded-[16px] flex flex-col overflow-hidden transition-[width] duration-150 ${
        expandedWidth ? "w-[520px]" : "w-[348px]"
      }`}
    >
      {/* Top Tabs & Quick Actions */}
      <div className="px-3.5 pt-3 pb-2.5 border-b border-slate-900/[0.06] flex items-center justify-between gap-2 shrink-0">
        <div className="ct-segmented h-[32px]">
          <button
            type="button"
            aria-pressed={tab === "files"}
            onClick={() => onTabChange("files")}
            className="ct-segmented-item px-2.5 text-[12px]"
          >
            文件
          </button>
          <button
            type="button"
            aria-pressed={tab === "diff"}
            onClick={() => onTabChange("diff")}
            className="ct-segmented-item px-2.5 text-[12px] inline-flex items-center gap-1"
          >
            <span>变更</span>
            {wsStatus && wsStatus.changedFiles.length > 0 && (
              <span className="px-1.5 py-0 rounded-full bg-[#DBEAFE] text-[#1D4ED8] text-[10.5px] font-semibold tabular-nums leading-[16px]">
                {wsStatus.changedFiles.length}
              </span>
            )}
          </button>
          {run && (
            <button
              type="button"
              aria-pressed={tab === "handoff"}
              onClick={() => onTabChange("handoff")}
              className="ct-segmented-item px-2.5 text-[12px]"
            >
              交接
            </button>
          )}
          <button
            type="button"
            aria-pressed={tab === "logs"}
            onClick={() => onTabChange("logs")}
            className="ct-segmented-item px-2.5 text-[12px]"
          >
            日志
          </button>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenFolder}
            title="在资源管理器中打开"
            aria-label="在资源管理器中打开"
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#141518] transition"
          >
            <FolderOpen size={14} />
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            title="刷新工作区状态"
            aria-label="刷新工作区状态"
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#141518] transition"
          >
            <RefreshCw size={13.5} />
          </button>
          <button
            type="button"
            onClick={() => setExpandedWidth((v) => !v)}
            title={expandedWidth ? "收窄面板" : "展宽面板"}
            aria-label={expandedWidth ? "收窄面板" : "展宽面板"}
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#141518] transition"
          >
            {expandedWidth ? (
              <Minimize2 size={13.5} />
            ) : (
              <Maximize2 size={13.5} />
            )}
          </button>
          <button
            type="button"
            aria-label="关闭详情面板"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#141518] transition"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Sub-header: Filter bar for Files tree OR Repo branch bar for Diff */}
      {tab === "files" && !selectedFile && (
        <div className="px-3 py-2 bg-[#FAFBFD] border-b border-slate-900/[0.05] flex items-center gap-2 shrink-0">
          <div className="relative flex-1 flex items-center">
            <Search
              size={13}
              className="absolute left-2.5 text-[#94A3B8] pointer-events-none"
            />
            <input
              type="text"
              value={treeFilter}
              onChange={(e) => setTreeFilter(e.target.value)}
              placeholder="筛选当前目录文件..."
              aria-label="筛选文件"
              className="w-full h-[30px] pl-7.5 pr-7 rounded-[8px] bg-white border border-slate-900/[0.08] text-[12.5px] text-[#141518] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#3B82F6] transition"
            />
            {treeFilter && (
              <button
                type="button"
                onClick={() => setTreeFilter("")}
                aria-label="清除筛选"
                className="absolute right-2 text-[#94A3B8] hover:text-[#475569]"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapseSignal((n) => n + 1)}
            title="全部折叠"
            className="h-[30px] px-2 rounded-[8px] text-[11.5px] font-medium text-[#64748B] hover:text-[#141518] hover:bg-slate-900/[0.05] shrink-0 transition"
          >
            折叠
          </button>
        </div>
      )}

      {wsStatus && tab === "diff" && (
        <div className="px-4 py-2 bg-[#FAFBFD] border-b border-slate-900/[0.05] flex items-center justify-between gap-2 text-[12px] shrink-0">
          <span
            className="text-[#64748B] truncate font-mono"
            title={wsStatus.canonicalPath}
          >
            {wsStatus.canonicalPath}
          </span>
          {wsStatus.isGitRepo && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-900/[0.07] text-[#334155] font-medium shrink-0">
              <GitBranch size={11.5} className="text-[#64748B]" />
              <span className="max-w-24 truncate">
                {wsStatus.branch ?? "detached"}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Drawer Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 text-[13px]">
        {/* TAB 1: Interactive File Tree & Line-Numbered Code Preview */}
        {tab === "files" && (
          <>
            {selectedFile ? (
              <div className="space-y-2.5 px-1">
                {/* Breadcrumb & Quick Actions */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#2563EB] hover:underline shrink-0"
                  >
                    <ArrowLeft size={13} />
                    <span>文件树</span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {filePreview && !filePreview.binary && (
                      <button
                        type="button"
                        onClick={() => handleCopy("code", filePreview.content)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-[7px] bg-[#F3F4F8] text-[11.5px] font-medium text-[#475569] hover:text-[#141518] transition"
                      >
                        {copiedKey === "code" ? (
                          <>
                            <Check size={11.5} className="text-[#10B981]" />
                            <span>已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11.5} />
                            <span>复制代码</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy("path", selectedFile)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-[7px] bg-[#F3F4F8] text-[11.5px] font-medium text-[#475569] hover:text-[#141518] transition"
                    >
                      {copiedKey === "path" ? (
                        <>
                          <Check size={11.5} className="text-[#10B981]" />
                          <span>已复制</span>
                        </>
                      ) : (
                        <span>路径</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Clean Path Breadcrumb */}
                <div className="px-2.5 py-1.5 rounded-[9px] bg-[#F8FAFC] border border-slate-900/[0.06] flex items-center flex-wrap gap-1 text-[12px] text-[#64748B]">
                  {selectedFile.split("/").map((part, idx, arr) => (
                    <React.Fragment key={`${part}-${idx}`}>
                      <span
                        className={
                          idx === arr.length - 1
                            ? "font-semibold text-[#141518]"
                            : ""
                        }
                      >
                        {part}
                      </span>
                      {idx < arr.length - 1 && (
                        <ChevronRight size={11} className="text-[#CBD5E1]" />
                      )}
                    </React.Fragment>
                  ))}
                  {filePreview && (
                    <span className="ml-auto text-[11px] text-[#94A3B8] tabular-nums">
                      {formatCompactSize(filePreview.size)}
                    </span>
                  )}
                </div>

                {loadingFile ? (
                  <div className="py-10 text-center text-[#94A3B8] text-[12.5px]">
                    读取文件内容...
                  </div>
                ) : filePreview?.binary ? (
                  <div className="rounded-[11px] border border-slate-900/[0.07] bg-[#F8FAFC] px-4 py-7 text-center text-[12.5px] text-[#64748B]">
                    二进制文件（{formatCompactSize(filePreview.size)}），暂不支持文本预览
                  </div>
                ) : (
                  <div className="rounded-[12px] bg-[#181C24] border border-slate-900/[0.1] overflow-auto max-h-[64vh] shadow-[0_2px_10px_rgba(15,23,42,0.08)]">
                    <div className="py-2.5 min-w-max font-mono text-[12px] leading-[1.62]">
                      {previewLines.map((line, idx) => (
                        <div
                          key={idx}
                          className="flex hover:bg-white/[0.03] px-3"
                        >
                          <span className="w-9 pr-3 text-right text-[#64748B] select-none shrink-0 tabular-nums">
                            {idx + 1}
                          </span>
                          <span className="text-[#E2E8F0] whitespace-pre">
                            {line || " "}
                          </span>
                        </div>
                      ))}
                    </div>
                    {filePreview?.truncated && (
                      <div className="px-3.5 py-2 border-t border-white/[0.08] text-[11.5px] text-[#94A3B8]">
                        文件较大，仅展示前 120 KB
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <FileTreeBranch
                projectId={projectId}
                canonicalPath={wsStatus?.canonicalPath}
                relativePath=""
                depth={0}
                selectedFilePath={selectedFile}
                filterQuery={treeFilter}
                onSelectFile={setSelectedFile}
                refreshToken={refreshToken}
                collapseSignal={collapseSignal}
              />
            )}
          </>
        )}

        {/* TAB 2: Real-Time Git Diff & Artifacts */}
        {tab === "diff" && (
          <div className="px-1 space-y-3">
            {!wsStatus ? (
              <div className="text-[#64748B]">加载工作区状态...</div>
            ) : !wsStatus.isGitRepo ? (
              <div className="rounded-[11px] border border-slate-900/[0.07] bg-[#F8FAFC] p-4 text-[13px] text-[#64748B]">
                当前目录不是 Git 仓库，无法查看 Git 变更差异。
              </div>
            ) : wsStatus.changedFiles.length === 0 ? (
              <div className="rounded-[11px] border border-slate-900/[0.07] bg-[#F8FAFC] p-4 text-[13px] text-[#64748B]">
                工作区干净，暂无未提交的文件改动。
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-[#141518]">
                    变更文件 ({wsStatus.changedFiles.length})
                  </span>
                  {selectedDiffFile && (
                    <button
                      type="button"
                      onClick={() => setSelectedDiffFile(null)}
                      className="text-[12px] font-medium text-[#2563EB] hover:underline"
                    >
                      查看全部 Diff
                    </button>
                  )}
                </div>

                <div className="space-y-1 max-h-[190px] overflow-y-auto pr-0.5">
                  {wsStatus.changedFiles.map((f) => {
                    const badge = getGitStatusBadgeStyle(f.status);
                    const active = selectedDiffFile === f.path;
                    return (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() =>
                          setSelectedDiffFile(active ? null : f.path)
                        }
                        className={`w-full px-2.5 py-1.5 rounded-[8px] flex items-center gap-2 text-left transition ${
                          active
                            ? "bg-[#E8F0FE] text-[#1D4ED8]"
                            : "bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#141518]"
                        }`}
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold font-mono shrink-0 ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        <span
                          title={f.path}
                          className="font-mono text-[12px] truncate flex-1"
                        >
                          {f.path}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-1.5">
                  <div className="text-[12px] font-semibold text-[#64748B] truncate">
                    {selectedDiffFile
                      ? `差异：${selectedDiffFile}`
                      : "全部变更差异"}
                  </div>
                  {loadingDiff ? (
                    <div className="py-6 text-center text-[#94A3B8] text-[12.5px]">
                      加载 Git Diff...
                    </div>
                  ) : (
                    <GitDiffViewer
                      diff={diffData?.diff ?? ""}
                      maxHeightClass="max-h-[44vh]"
                    />
                  )}
                </div>
              </div>
            )}

            {artifacts.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-900/[0.06]">
                <div className="text-[13px] font-bold text-[#141518]">
                  已保存产物 ({artifacts.length})
                </div>
                <div className="space-y-1.5">
                  {artifacts.map((art) => (
                    <div
                      key={art.id}
                      className="rounded-[10px] border border-slate-900/[0.07] bg-[#F8F9FC] px-3 py-2 space-y-0.5"
                    >
                      <div className="font-mono text-[12px] text-[#141518] truncate">
                        {art.relativePath}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        {art.size} bytes · sha256 {art.contentHash.slice(0, 10)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Context Handoff (Workflow Runs) */}
        {tab === "handoff" && (
          <div className="px-1 space-y-4">
            {handoffs.length === 0 ? (
              <div className="text-[#64748B] leading-relaxed">
                尚无已提交的跨 Agent 交接记录。节点执行结束后会自动生成。
              </div>
            ) : (
              <>
                <div className="space-y-3.5">
                  {handoffs.map((h, idx) => {
                    const isLast = idx === handoffs.length - 1;
                    return (
                      <div
                        key={h.sourceNodeRunId}
                        className="relative flex gap-3"
                      >
                        <div className="flex flex-col items-center shrink-0">
                          <span className="w-6 h-6 rounded-full bg-[#10B981] text-white inline-flex items-center justify-center">
                            <Check size={14} strokeWidth={2.6} />
                          </span>
                          {!isLast && (
                            <span className="w-[1.5px] flex-1 bg-[#A7F3D0] my-1 min-h-[22px]" />
                          )}
                        </div>
                        <div className="min-w-0 pb-1">
                          <div className="text-[13.5px] font-bold text-[#141518]">
                            步骤 {idx + 1} ·{" "}
                            {agentMap.get(h.sourceAgentId)?.name ??
                              h.sourceAgentId}
                          </div>
                          <p className="text-[12.5px] text-[#64748B] mt-0.5 line-clamp-2 leading-relaxed">
                            {h.summary}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="h-px bg-slate-900/[0.06]" />

                {run?.objective && (
                  <div>
                    <h3 className="text-[14px] font-bold text-[#141518]">
                      任务目标
                    </h3>
                    <p className="text-[13px] text-[#374151] mt-1.5 leading-relaxed">
                      {run.objective}
                    </p>
                  </div>
                )}

                {summaryBullets.length > 0 && (
                  <div>
                    <h3 className="text-[14px] font-bold text-[#141518]">
                      关键摘要
                    </h3>
                    <ul className="mt-1.5 space-y-1.5 list-disc pl-4 text-[13px] text-[#374151] leading-relaxed">
                      {summaryBullets.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {allHandoffChangedFiles.length > 0 && (
                  <div>
                    <h3 className="text-[14px] font-bold text-[#141518] mb-2">
                      变更文件 ({allHandoffChangedFiles.length})
                    </h3>
                    <div className="space-y-1.5">
                      {allHandoffChangedFiles.map((filePath) => (
                        <div
                          key={filePath}
                          className="rounded-[9px] bg-[#F4F6FA] px-3 py-2 flex items-center gap-2 font-mono text-[12px] text-[#141518]"
                        >
                          <FileText
                            size={13.5}
                            className="text-[#475569] shrink-0"
                          />
                          <span className="truncate">{filePath}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 4: Structured Event Logs */}
        {tab === "logs" && (
          <div className="px-1 space-y-2 font-mono text-[11.5px]">
            {events.map((ev) => (
              <div
                key={ev.eventId}
                className="rounded-[9px] border border-slate-900/[0.07] bg-[#F8F9FC] px-3 py-2 space-y-1"
              >
                <div className="flex items-center justify-between text-[#64748B]">
                  <span className="font-semibold text-[#141518]">
                    #{ev.seq} {ev.type}
                  </span>
                  <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-[#475569] break-all">
                  {JSON.stringify(ev.payload).slice(0, 180)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
