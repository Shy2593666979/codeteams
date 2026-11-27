import React, { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { TurnToolDiff } from "@codeteams/shared";
import {
  duoBraces,
  duoFile,
  duoFileCode,
  duoFileImage,
  duoFileText,
  duoSettings,
  duoTerminal,
  KubaiIcon,
  type KubaiIconData,
} from "./kubai";

type DiffLineKind = "context" | "removed" | "added";

interface WordPart {
  text: string;
  changed: boolean;
}

interface RenderDiffLine {
  kind: DiffLineKind;
  text: string;
  oldLineNo: number | null;
  newLineNo: number | null;
  parts?: WordPart[];
}

interface DiffHunk {
  lines: RenderDiffLine[];
}

const CONTEXT_LINES = 3;
const MAX_LCS_LINES = 600;
const INITIAL_MAX_LINES = 60;

function getDiffFileIcon(filePath: string): {
  icon: KubaiIconData;
  colorClass: string;
} {
  const normalized = filePath.replace(/\\/g, "/");
  const name = (normalized.split("/").pop() ?? normalized).toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
  if (ext === "ts" || ext === "tsx" || ext === "mts" || ext === "cts") {
    return { icon: duoFileCode, colorClass: "text-[#2563EB]" };
  }
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") {
    return { icon: duoFileCode, colorClass: "text-[#D97706]" };
  }
  if (ext === "json" || ext === "jsonc" || ext === "css" || ext === "scss" || ext === "html") {
    return { icon: duoBraces, colorClass: "text-[#0284C7]" };
  }
  if (ext === "md" || ext === "mdx" || ext === "txt") {
    return { icon: duoFileText, colorClass: "text-[#6366F1]" };
  }
  if (ext === "png" || ext === "jpg" || ext === "svg" || ext === "webp") {
    return { icon: duoFileImage, colorClass: "text-[#10B981]" };
  }
  if (ext === "sh" || ext === "ps1" || ext === "bat") {
    return { icon: duoTerminal, colorClass: "text-[#4F46E5]" };
  }
  if (name.startsWith(".") || ext === "toml" || ext === "yaml" || ext === "yml" || ext === "env") {
    return { icon: duoSettings, colorClass: "text-[#4086FF]" };
  }
  return { icon: duoFile, colorClass: "text-[#4086FF]" };
}

function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  if (normalized === "") return [];
  const lines = normalized.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/** Fast line-level LCS diff with trim-prefix/suffix optimization */
function computeLineOps(
  oldLines: string[],
  newLines: string[]
): RenderDiffLine[] {
  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (
    oldEnd >= start &&
    newEnd >= start &&
    oldLines[oldEnd] === newLines[newEnd]
  ) {
    oldEnd--;
    newEnd--;
  }

  const out: RenderDiffLine[] = [];
  for (let i = 0; i < start; i++) {
    out.push({
      kind: "context",
      text: oldLines[i]!,
      oldLineNo: i + 1,
      newLineNo: i + 1,
    });
  }

  const midOld = oldLines.slice(start, oldEnd + 1);
  const midNew = newLines.slice(start, newEnd + 1);

  if (midOld.length === 0 && midNew.length === 0) {
    // identical
  } else if (midOld.length === 0) {
    midNew.forEach((line, idx) => {
      out.push({
        kind: "added",
        text: line,
        oldLineNo: null,
        newLineNo: start + idx + 1,
      });
    });
  } else if (midNew.length === 0) {
    midOld.forEach((line, idx) => {
      out.push({
        kind: "removed",
        text: line,
        oldLineNo: start + idx + 1,
        newLineNo: null,
      });
    });
  } else if (midOld.length * midNew.length > MAX_LCS_LINES * MAX_LCS_LINES) {
    // Graceful fallback for very large files: show removed then added
    midOld.forEach((line, idx) => {
      out.push({
        kind: "removed",
        text: line,
        oldLineNo: start + idx + 1,
        newLineNo: null,
      });
    });
    midNew.forEach((line, idx) => {
      out.push({
        kind: "added",
        text: line,
        oldLineNo: null,
        newLineNo: start + idx + 1,
      });
    });
  } else {
    const m = midOld.length;
    const n = midNew.length;
    const dp = new Uint32Array((m + 1) * (n + 1));
    const stride = n + 1;

    for (let i = m - 1; i >= 0; i--) {
      const row = i * stride;
      const nextRow = (i + 1) * stride;
      const a = midOld[i]!;
      for (let j = n - 1; j >= 0; j--) {
        if (a === midNew[j]) {
          dp[row + j] = dp[nextRow + j + 1]! + 1;
        } else {
          const down = dp[nextRow + j]!;
          const right = dp[row + j + 1]!;
          dp[row + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midOld[i] === midNew[j]) {
        out.push({
          kind: "context",
          text: midOld[i]!,
          oldLineNo: start + i + 1,
          newLineNo: start + j + 1,
        });
        i++;
        j++;
      } else if (dp[(i + 1) * stride + j]! >= dp[i * stride + j + 1]!) {
        out.push({
          kind: "removed",
          text: midOld[i]!,
          oldLineNo: start + i + 1,
          newLineNo: null,
        });
        i++;
      } else {
        out.push({
          kind: "added",
          text: midNew[j]!,
          oldLineNo: null,
          newLineNo: start + j + 1,
        });
        j++;
      }
    }
    while (i < m) {
      out.push({
        kind: "removed",
        text: midOld[i]!,
        oldLineNo: start + i + 1,
        newLineNo: null,
      });
      i++;
    }
    while (j < n) {
      out.push({
        kind: "added",
        text: midNew[j]!,
        oldLineNo: null,
        newLineNo: start + j + 1,
      });
      j++;
    }
  }

  for (let k = 0; k < oldLines.length - 1 - oldEnd; k++) {
    const oi = oldEnd + 1 + k;
    const ni = newEnd + 1 + k;
    out.push({
      kind: "context",
      text: oldLines[oi]!,
      oldLineNo: oi + 1,
      newLineNo: ni + 1,
    });
  }

  return out;
}

/** Tokenize a line into words, whitespace, and punctuation for crisp inline word-level diff */
function tokenizeInline(line: string): string[] {
  return line.match(/[A-Za-z0-9_#-]+|\s+|[^\sA-Za-z0-9_#-]/g) ?? [];
}

function mergeWordParts(parts: WordPart[]): WordPart[] {
  const merged: WordPart[] = [];
  for (const p of parts) {
    if (!p.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.changed === p.changed) {
      prev.text += p.text;
    } else {
      merged.push({ ...p });
    }
  }
  return merged;
}

function computeInlineWordDiff(
  oldLine: string,
  newLine: string
): { oldParts: WordPart[]; newParts: WordPart[] } {
  const a = tokenizeInline(oldLine);
  const b = tokenizeInline(newLine);
  if (a.length * b.length > 160 * 160) {
    return {
      oldParts: [{ text: oldLine, changed: true }],
      newParts: [{ text: newLine, changed: true }],
    };
  }

  const m = a.length;
  const n = b.length;
  const dp = new Uint16Array((m + 1) * (n + 1));
  const stride = n + 1;

  for (let i = m - 1; i >= 0; i--) {
    const row = i * stride;
    const nextRow = (i + 1) * stride;
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[row + j] = dp[nextRow + j + 1]! + 1;
      } else {
        const down = dp[nextRow + j]!;
        const right = dp[row + j + 1]!;
        dp[row + j] = down >= right ? down : right;
      }
    }
  }

  const oldParts: WordPart[] = [];
  const newParts: WordPart[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      oldParts.push({ text: a[i]!, changed: false });
      newParts.push({ text: b[j]!, changed: false });
      i++;
      j++;
    } else if (dp[(i + 1) * stride + j]! >= dp[i * stride + j + 1]!) {
      oldParts.push({ text: a[i]!, changed: true });
      i++;
    } else {
      newParts.push({ text: b[j]!, changed: true });
      j++;
    }
  }
  while (i < m) {
    oldParts.push({ text: a[i]!, changed: true });
    i++;
  }
  while (j < n) {
    newParts.push({ text: b[j]!, changed: true });
    j++;
  }

  return {
    oldParts: mergeWordParts(oldParts),
    newParts: mergeWordParts(newParts),
  };
}

/** Attach inline word-level diffs to adjacent removed/added line runs */
function annotateWordDiffs(lines: RenderDiffLine[]): RenderDiffLine[] {
  const result = lines.map((l) => ({ ...l }));
  let i = 0;
  while (i < result.length) {
    if (result[i]!.kind !== "removed") {
      i++;
      continue;
    }
    const remStart = i;
    while (i < result.length && result[i]!.kind === "removed") i++;
    const remEnd = i;
    const addStart = i;
    while (i < result.length && result[i]!.kind === "added") i++;
    const addEnd = i;

    const pairCount = Math.min(remEnd - remStart, addEnd - addStart);
    for (let k = 0; k < pairCount; k++) {
      const rem = result[remStart + k]!;
      const add = result[addStart + k]!;
      const { oldParts, newParts } = computeInlineWordDiff(rem.text, add.text);
      rem.parts = oldParts;
      add.parts = newParts;
    }
  }
  return result;
}

function buildHunks(lines: RenderDiffLine[]): DiffHunk[] {
  const changedIndices: number[] = [];
  lines.forEach((l, idx) => {
    if (l.kind !== "context") changedIndices.push(idx);
  });
  if (changedIndices.length === 0) return [];

  const ranges: Array<[number, number]> = [];
  for (const idx of changedIndices) {
    const start = Math.max(0, idx - CONTEXT_LINES);
    const end = Math.min(lines.length - 1, idx + CONTEXT_LINES);
    const prev = ranges[ranges.length - 1];
    if (prev && start <= prev[1] + 1) {
      prev[1] = Math.max(prev[1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  return ranges.map(([start, end]) => ({
    lines: lines.slice(start, end + 1),
  }));
}

/** Lightweight syntax tinting for code tokens on our crisp sky/frost diff surface */
const SYNTAX_TOKEN_RE =
  /(\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|import|export|from|type|interface|class|extends|implements|async|await|if|else|for|while|switch|case|break|continue|new|try|catch|finally|throw|typeof|keyof|true|false|null|undefined|void|def|fn|pub|struct|enum|impl)\b|\b[A-Z][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b)/g;

function renderSyntaxTinted(text: string): React.ReactNode {
  if (!text) return " ";
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  SYNTAX_TOKEN_RE.lastIndex = 0;
  let key = 0;

  while ((match = SYNTAX_TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0]!;
    let cls = "";
    if (token.startsWith("//") || token.startsWith("/*")) {
      cls = "text-[#94A3B8] italic";
    } else if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      token.startsWith("`")
    ) {
      cls = "text-[#0F766E]";
    } else if (/^\d/.test(token)) {
      cls = "text-[#B45309]";
    } else if (/^[A-Z]/.test(token)) {
      cls = "text-[#0369A1]";
    } else {
      cls = "text-[#7C3AED]";
    }
    nodes.push(
      <span key={key++} className={cls}>
        {token}
      </span>
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length > 0 ? nodes : " ";
}

function renderDiffLineContent(line: RenderDiffLine): React.ReactNode {
  if (!line.parts || line.parts.length === 0) {
    return renderSyntaxTinted(line.text);
  }
  const highlightCls =
    line.kind === "removed"
      ? "bg-[#FECACA] text-[#991B1B] rounded-[3px] px-[1px]"
      : "bg-[#A7F3D0] text-[#065F46] rounded-[3px] px-[1px]";

  return line.parts.map((part, idx) =>
    part.changed ? (
      <mark key={idx} className={highlightCls}>
        {part.text}
      </mark>
    ) : (
      <React.Fragment key={idx}>{renderSyntaxTinted(part.text)}</React.Fragment>
    )
  );
}

/** Single file inline hunk diff card with file header, +N/-M counters, and word-level diff highlights */
export const SingleFileDiffCard: React.FC<{
  diff: TurnToolDiff;
  maxHeightClass?: string;
}> = ({ diff, maxHeightClass = "max-h-[380px]" }) => {
  const [copiedPath, setCopiedPath] = useState(false);
  const [showAllLines, setShowAllLines] = useState(false);

  const { hunks, addedCount, removedCount, isNewFile } = useMemo(() => {
    const oldLines = diff.oldText == null ? [] : splitLines(diff.oldText);
    const newLines = splitLines(diff.newText);
    const ops = annotateWordDiffs(computeLineOps(oldLines, newLines));
    const added = ops.filter((l) => l.kind === "added").length;
    const removed = ops.filter((l) => l.kind === "removed").length;
    return {
      hunks: buildHunks(ops),
      addedCount: added,
      removedCount: removed,
      isNewFile: diff.oldText == null || oldLines.length === 0,
    };
  }, [diff.oldText, diff.newText]);

  const fileVisual = getDiffFileIcon(diff.path);
  const displayPath = diff.path.replace(/\\/g, "/");

  const totalRenderLines = hunks.reduce((sum, h) => sum + h.lines.length, 0);
  const shouldClamp = !showAllLines && totalRenderLines > INITIAL_MAX_LINES;

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(displayPath).catch(() => {});
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1400);
  };

  let emittedLines = 0;

  return (
    <div
      data-testid="inline-diff-card"
      className="rounded-[11px] overflow-hidden border border-[#BFDBFE] bg-white shadow-[0_1px_6px_rgba(59,130,246,0.06)]"
    >
      {/* Crisp Sky-Blue File Header */}
      <div
        data-kubai-trigger
        className="h-[34px] px-3 bg-[#EFF6FF] border-b border-[#BFDBFE]/80 flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <KubaiIcon
            icon={fileVisual.icon}
            size={15}
            trigger="parent"
            className={fileVisual.colorClass}
          />
          <span
            title={displayPath}
            className="font-mono text-[12px] font-medium text-[#1E3A8A] truncate"
          >
            {displayPath}
          </span>
          {isNewFile && (
            <span className="px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[10.5px] font-semibold text-[#15803D] shrink-0">
              新建
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-semibold tabular-nums">
            {addedCount > 0 && (
              <span className="text-[#059669]">+{addedCount}</span>
            )}
            {removedCount > 0 && (
              <span className="text-[#DC2626]">-{removedCount}</span>
            )}
          </span>
          <button
            type="button"
            onClick={handleCopyPath}
            title="复制文件路径"
            aria-label="复制文件路径"
            className="w-6 h-6 rounded-[6px] inline-flex items-center justify-center text-[#3B82F6] hover:bg-white/80 hover:text-[#1D4ED8] transition"
          >
            {copiedPath ? (
              <Check size={12} className="text-[#059669]" />
            ) : (
              <Copy size={12} />
            )}
          </button>
        </div>
      </div>

      {/* Hunk Diff Body */}
      {hunks.length === 0 ? (
        <div className="px-3.5 py-2.5 text-[12px] text-[#64748B] bg-[#FAFCFF]">
          文件内容无变化
        </div>
      ) : (
        <div
          className={`overflow-auto font-mono text-[12.5px] leading-[1.6] bg-[#FAFCFF] ${maxHeightClass}`}
        >
          <div className="min-w-max py-1">
            {hunks.map((hunk, hIdx) => {
              if (shouldClamp && emittedLines >= INITIAL_MAX_LINES) return null;
              const remaining = shouldClamp
                ? INITIAL_MAX_LINES - emittedLines
                : hunk.lines.length;
              const visibleLines = hunk.lines.slice(0, remaining);
              emittedLines += visibleLines.length;

              return (
                <React.Fragment key={hIdx}>
                  {hIdx > 0 && (
                    <div
                      aria-hidden="true"
                      className="my-1 border-t border-dashed border-[#CBD5E1] bg-[#F1F5F9]/60 h-[6px]"
                    />
                  )}
                  {visibleLines.map((line, lIdx) => {
                    const rowClass =
                      line.kind === "removed"
                        ? "bg-[#FEF2F2] border-l-[3px] border-[#F87171] text-[#334155]"
                        : line.kind === "added"
                          ? "bg-[#ECFDF5] border-l-[3px] border-[#34D399] text-[#0F172A]"
                          : "bg-transparent border-l-[3px] border-transparent text-[#334155]";
                    const sign =
                      line.kind === "removed"
                        ? "-"
                        : line.kind === "added"
                          ? "+"
                          : " ";
                    const signClass =
                      line.kind === "removed"
                        ? "text-[#DC2626]"
                        : line.kind === "added"
                          ? "text-[#059669]"
                          : "text-transparent";

                    return (
                      <div
                        key={`${hIdx}-${lIdx}`}
                        className={`flex items-baseline pr-4 ${rowClass}`}
                      >
                        <span className="w-9 shrink-0 pr-2 text-right text-[11px] text-[#94A3B8] select-none tabular-nums">
                          {line.newLineNo ?? line.oldLineNo ?? ""}
                        </span>
                        <span
                          className={`w-4 shrink-0 text-center font-bold select-none ${signClass}`}
                        >
                          {sign}
                        </span>
                        <span className="whitespace-pre">
                          {renderDiffLineContent(line)}
                        </span>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>

          {shouldClamp && (
            <button
              type="button"
              onClick={() => setShowAllLines(true)}
              className="w-full py-1.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] border-t border-[#BFDBFE]/80 text-[12px] font-medium text-[#2563EB] transition"
            >
              展开全部 {totalRenderLines} 行改动
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const InlineDiffList: React.FC<{
  diffs: TurnToolDiff[];
  maxHeightClass?: string;
}> = ({ diffs, maxHeightClass }) => {
  if (!diffs || diffs.length === 0) return null;
  return (
    <div className="space-y-2">
      {diffs.map((d, idx) => (
        <SingleFileDiffCard
          key={`${d.path}-${idx}`}
          diff={d}
          maxHeightClass={maxHeightClass}
        />
      ))}
    </div>
  );
};

/** Helper to extract inline file diffs from a PermissionRequest's rawInput (for pre-approval diff preview) */
export function extractDiffsFromPermissionInput(
  rawInput: unknown,
  fallbackPaths?: string[]
): TurnToolDiff[] {
  if (!rawInput || typeof rawInput !== "object") return [];
  const obj = rawInput as Record<string, unknown>;
  const path =
    (typeof obj.path === "string" && obj.path) ||
    (typeof obj.file_path === "string" && obj.file_path) ||
    (typeof obj.filePath === "string" && obj.filePath) ||
    (typeof obj.TargetFile === "string" && obj.TargetFile) ||
    fallbackPaths?.[0] ||
    "";

  const oldText =
    typeof obj.oldText === "string"
      ? obj.oldText
      : typeof obj.old_string === "string"
        ? obj.old_string
        : typeof obj.old_str === "string"
          ? obj.old_str
          : typeof obj.Target === "string"
            ? obj.Target
            : undefined;
  const newText =
    typeof obj.newText === "string"
      ? obj.newText
      : typeof obj.new_string === "string"
        ? obj.new_string
        : typeof obj.new_str === "string"
          ? obj.new_str
          : typeof obj.Replacement === "string"
            ? obj.Replacement
            : undefined;

  if (path && newText !== undefined) {
    return [{ path, oldText: oldText ?? null, newText }];
  }
  return [];
}
