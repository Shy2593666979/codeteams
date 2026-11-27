import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dir, "..");
const logosDir = join(rootDir, "resources", "agents", "logos");
mkdirSync(logosDir, { recursive: true });

interface RegistryAgent {
  id: string;
  name: string;
  version: string;
  description?: string;
  repository?: string;
  icon?: string;
  license?: string;
  authors?: string[];
  distribution?: {
    npx?: { package: string; args?: string[]; env?: Record<string, string> };
    binary?: Record<string, { archive: string; cmd: string; args?: string[] }>;
    uvx?: { package: string; args?: string[] };
  };
}

interface RegistryPayload {
  version: string;
  agents: RegistryAgent[];
}

// Mapping from CodeTeams stable agentId to official ACP Registry id (when listed)
const REGISTRY_MAP: Record<string, string> = {
  antigravity: "antigravity-acp",
  codex: "codex-acp",
  "claude-code": "claude-acp",
  "gemini-cli": "gemini",
  "cursor-agent": "cursor",
  "github-copilot-cli": "github-copilot-cli",
  "grok-build": "grok-build",
  "kiro-cli": "kiro",
  "qwen-code": "qwen-code",
  "kimi-code": "kimi-code",
  "qoder-cli": "qoder",
  "codebuddy-code": "codebuddy-code",
  "minimax-code": "minimax-code",
  "glm-agent": "glm-acp-agent",
  opencode: "opencode",
  cline: "cline",
  goose: "goose",
};

function sanitizeSvg(raw: string): string {
  // Strip script tags, foreignObject, event handlers, javascript:/data: hrefs, remote url() refs
  let clean = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|xlink:href)\s*=\s*["']\s*(https?:|javascript:|data:)[^"']*["']/gi, "")
    .replace(/url\(\s*['"]?\s*https?:[^)]*\)/gi, "none")
    .trim();

  if (!clean.startsWith("<svg") && !clean.startsWith("<?xml")) {
    throw new Error("Invalid SVG payload");
  }
  // Remove XML declaration if present so inline or img usage stays uniform
  clean = clean.replace(/^<\?xml[^>]*\?>\s*/i, "");
  return clean;
}

async function main() {
  const registryUrl = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
  const res = await fetch(registryUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch registry: ${res.status}`);
  }
  const registry = (await res.json()) as RegistryPayload;
  const byId = new Map(registry.agents.map((a) => [a.id, a]));

  // Cache registry snapshot
  writeFileSync(
    join(rootDir, "resources", "agents", "registry-snapshot.json"),
    JSON.stringify(registry, null, 2) + "\n",
    "utf8"
  );

  const downloadedAt = new Date().toISOString();
  const manifestAssets: Array<Record<string, unknown>> = [];

  for (const [agentId, regId] of Object.entries(REGISTRY_MAP)) {
    const entry = byId.get(regId);
    if (!entry || !entry.icon) {
      manifestAssets.push({
        agentId,
        registryId: regId,
        status: "missing_official_asset",
        sourceUrl: null,
        localPath: null,
        notes: "Not found or no icon in ACP Registry snapshot",
      });
      continue;
    }

    const iconRes = await fetch(entry.icon);
    if (!iconRes.ok) {
      manifestAssets.push({
        agentId,
        registryId: regId,
        status: "download_failed",
        sourceUrl: entry.icon,
        localPath: null,
        notes: `HTTP ${iconRes.status}`,
      });
      continue;
    }

    const rawSvg = await iconRes.text();
    const sanitized = sanitizeSvg(rawSvg);
    const filename = `${agentId}.svg`;
    const localRelPath = `logos/${filename}`;
    writeFileSync(join(logosDir, filename), sanitized + "\n", "utf8");

    manifestAssets.push({
      agentId,
      registryId: regId,
      status: "verified_official",
      sourceUrl: entry.icon,
      downloadedAt,
      version: entry.version,
      assetType: "image/svg+xml",
      licenseOrAttribution: entry.license ?? `Official ACP Registry icon (${entry.name})`,
      repository: entry.repository ?? null,
      localPath: localRelPath,
    });
  }

  // Explicitly record the 3 vendor presets not yet in ACP Registry
  for (const pending of [
    {
      agentId: "trae-cli",
      notes: "Not listed in ACP Registry v1 snapshot; neutral fallback used until official brand SVG asset is verified.",
    },
    {
      agentId: "iflow-cli",
      notes: "Experimental vendor candidate not listed in ACP Registry v1 snapshot; neutral fallback used.",
    },
    {
      agentId: "deepseek-harness",
      notes: "Vendor ACP preset (deepseek-ai/deepseek-harness) not listed in ACP Registry v1 snapshot; neutral fallback used until official SVG icon license is verified.",
    },
  ]) {
    manifestAssets.push({
      agentId: pending.agentId,
      registryId: null,
      status: "pending_official_asset",
      sourceUrl: null,
      downloadedAt: null,
      version: null,
      assetType: null,
      licenseOrAttribution: null,
      localPath: null,
      notes: pending.notes,
    });
  }

  const manifest = {
    schemaVersion: 1,
    registryUrl,
    registryVersion: registry.version,
    generatedAt: downloadedAt,
    assets: manifestAssets,
  };

  writeFileSync(
    join(rootDir, "resources", "agents", "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  const okCount = manifestAssets.filter((a) => a.status === "verified_official").length;
  console.log(`[sync-agent-assets] Synced ${okCount}/${manifestAssets.length} official SVG logos.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
