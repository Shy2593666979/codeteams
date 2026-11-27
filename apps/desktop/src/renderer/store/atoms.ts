import { atom } from "jotai";
import type { CoreEvent, PermissionMode, TurnSegment } from "@codeteams/shared";
import type { AgentLogoAssetEntry } from "../../main/logos";

export const sidebarCollapsedAtom = atom<boolean>(false);
export const selectedProjectIdAtom = atom<string | null>(null);
export const selectedModeAtom = atom<"single" | "workflow">("single");
export const selectedAgentIdAtom = atom<string>("codex");
export const selectedWorkflowIdAtom = atom<string | null>(null);
export const acpPermissionModeAtom = atom<PermissionMode>("ask");

export const agentLogosAtom = atom<Record<string, AgentLogoAssetEntry>>({});

/**
 * Live streaming timeline buffer keyed by `${conversationId}:${nodeRunId || "chat"}`
 * preserving exact chronological interleaving of text chunks, tool calls, and plans.
 */
export const liveStreamMapAtom = atom<
  Record<
    string,
    {
      agentId: string;
      text: string;
      segments: TurnSegment[];
      updatedAt: number;
    }
  >
>({});

/**
 * Active in-flight single-agent chat turns keyed by conversationId so ChatRunPage
 * immediately shows the waiting/thinking wave animation even when launched from HomePage.
 */
export const pendingChatTurnsAtom = atom<
  Record<string, { agentId: string; startedAt: number; optimisticPrompt?: string }>
>({});

/**
 * Recent live tool/plan events per conversation for real-time display.
 */
export const liveEventsAtom = atom<CoreEvent[]>([]);
