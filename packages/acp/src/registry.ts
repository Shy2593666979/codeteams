import {
  BUILTIN_AGENT_PRESETS,
  type AgentDefinition,
  type AgentInstallState,
  type AgentRuntimeStatus,
  type AgentWithStatus,
} from "@codeteams/shared";
import { resolveExecutable } from "./process-utils";

export function detectAgentInstallation(agent: AgentDefinition): {
  installState: AgentInstallState;
  resolvedExecutable: string | null;
} {
  // Check primary detectBinary first (if provided), then command
  if (agent.detectBinary) {
    const direct = resolveExecutable(agent.detectBinary);
    if (direct) {
      return { installState: "installed", resolvedExecutable: direct };
    }
  }

  const cmdPath = resolveExecutable(agent.command);
  if (cmdPath) {
    if (agent.command === "npx" || agent.command === "npx.cmd") {
      return { installState: "via_npx", resolvedExecutable: cmdPath };
    }
    return { installState: "installed", resolvedExecutable: cmdPath };
  }

  return { installState: "not_installed", resolvedExecutable: null };
}

export function buildDefaultRuntimeStatus(
  agent: AgentDefinition,
  overrides?: Partial<AgentRuntimeStatus>
): AgentRuntimeStatus {
  const detected = detectAgentInstallation(agent);
  const authState =
    agent.automationPolicy === "restricted" ? "restricted" : "unknown";
  return {
    agentId: agent.id,
    installState: detected.installState,
    resolvedExecutable: detected.resolvedExecutable,
    authState,
    connectionState: "disconnected",
    lastTestedAt: null,
    lastError: null,
    protocolVersion: null,
    capabilities: null,
    ...overrides,
  };
}

export function getBuiltinPresetsWithStatus(): AgentWithStatus[] {
  return BUILTIN_AGENT_PRESETS.map((preset) => ({
    ...preset,
    status: buildDefaultRuntimeStatus(preset),
  }));
}
