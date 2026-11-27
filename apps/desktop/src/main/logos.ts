import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface AgentLogoAssetEntry {
  agentId: string;
  status: string;
  sourceUrl: string | null;
  version: string | null;
  licenseOrAttribution: string | null;
  dataUri: string | null;
  brandColor: string;
  notes?: string;
}

/**
 * Official vendor brand colors applied ONLY to monochrome `fill="currentColor"`
 * template SVGs distributed by the ACP Registry, preserving multi-color SVGs untouched.
 */
export const AGENT_BRAND_COLORS: Record<string, string> = {
  antigravity: "#2563EB",
  codex: "#10A37F",
  "claude-code": "#D97757",
  "gemini-cli": "#4285F4",
  "cursor-agent": "#111827",
  "github-copilot-cli": "#24292F",
  "grok-build": "#111113",
  "kiro-cli": "#7C3AED",
  "qwen-code": "#615CED",
  "kimi-code": "#18181B",
  "qoder-cli": "#4F46E5",
  "codebuddy-code": "#0052D9",
  "trae-cli": "#0EA5E9",
  "minimax-code": "#E11D48",
  "iflow-cli": "#2563EB",
  "deepseek-harness": "#4D6BFE",
  "glm-agent": "#2563EB",
  opencode: "#18181B",
  cline: "#0EA5E9",
  goose: "#111827",
};

function applyBrandColorToMonochromeSvg(svg: string, brandColor: string): string {
  const hasExplicitHex = /#[0-9a-fA-F]{3,6}/.test(svg);
  if (!hasExplicitHex && svg.includes("currentColor")) {
    return svg.replace(/currentColor/g, brandColor);
  }
  return svg;
}

export function loadOfficialAgentLogos(
  isPackaged: boolean,
  resourcesPath: string,
  appPath: string
): Record<string, AgentLogoAssetEntry> {
  const candidates = isPackaged
    ? [join(resourcesPath, "agents")]
    : [
        resolve(appPath, "..", "..", "resources", "agents"),
        resolve(appPath, "resources", "agents"),
        resolve(process.cwd(), "resources", "agents"),
        resolve(process.cwd(), "..", "..", "resources", "agents"),
      ];

  const baseDir = candidates.find((d) => existsSync(join(d, "manifest.json")));
  if (!baseDir) return {};

  try {
    const manifest = JSON.parse(
      readFileSync(join(baseDir, "manifest.json"), "utf8")
    ) as {
      assets: Array<{
        agentId: string;
        status: string;
        sourceUrl: string | null;
        version: string | null;
        licenseOrAttribution: string | null;
        localPath: string | null;
        notes?: string;
      }>;
    };

    const result: Record<string, AgentLogoAssetEntry> = {};
    for (const item of manifest.assets) {
      const brandColor = AGENT_BRAND_COLORS[item.agentId] ?? "#374151";
      let dataUri: string | null = null;
      if (item.localPath && item.status === "verified_official") {
        const assetPath = join(baseDir, item.localPath);
        if (existsSync(assetPath)) {
          if (item.localPath.toLowerCase().endsWith(".png")) {
            const rawPng = readFileSync(assetPath);
            dataUri = `data:image/png;base64,${rawPng.toString("base64")}`;
          } else {
            const rawSvg = readFileSync(assetPath, "utf8");
            const tintedSvg = applyBrandColorToMonochromeSvg(rawSvg, brandColor);
            dataUri = `data:image/svg+xml;base64,${Buffer.from(tintedSvg, "utf8").toString("base64")}`;
          }
        }
      }
      result[item.agentId] = {
        agentId: item.agentId,
        status: item.status,
        sourceUrl: item.sourceUrl,
        version: item.version,
        licenseOrAttribution: item.licenseOrAttribution,
        dataUri,
        brandColor,
        notes: item.notes,
      };
    }
    return result;
  } catch {
    return {};
  }
}
