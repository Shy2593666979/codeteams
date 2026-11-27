import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import type { AgentWithStatus } from "@codeteams/shared";
import { getBridge, rpc } from "../lib/bridge";
import { Modal } from "../components/Modal";
import { AgentLogo } from "../components/AgentLogo";

export const AgentsPage: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "detected" | "verified">("all");
  const [selectedId, setSelectedId] = useState<string>("codex");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const [editCmd, setEditCmd] = useState("");
  const [editArgs, setEditArgs] = useState("");
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [savingConfig, setSavingConfig] = useState(false);

  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customId, setCustomId] = useState("");
  const [customName, setCustomName] = useState("");
  const [customVendor, setCustomVendor] = useState("Custom");
  const [customCmd, setCustomCmd] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [customUrl, setCustomUrl] = useState("https://agentclientprotocol.com");

  const { data: agents = [], refetch } = useQuery<AgentWithStatus[]>({
    queryKey: ["agents"],
    queryFn: () => rpc("agents.list"),
    refetchOnMount: "always",
  });

  const filteredAgents = useMemo(() => {
    return agents.filter((a) => {
      if (filter === "detected" && a.status.installState === "not_installed") {
        return false;
      }
      if (filter === "verified" && a.verification !== "verified") {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          a.vendor.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [agents, filter, search]);

  const selectedAgent =
    agents.find((a) => a.id === selectedId) ?? filteredAgents[0] ?? null;

  const selectAgent = (agent: AgentWithStatus) => {
    setSelectedId(agent.id);
    setEditCmd(agent.command);
    setEditArgs(agent.args.join(" "));
    setSecretValues({});
    setShowSecret({});
    setTestResult(null);
  };

  React.useEffect(() => {
    if (selectedAgent && editCmd === "") {
      setEditCmd(selectedAgent.command);
      setEditArgs(selectedAgent.args.join(" "));
    }
  }, [selectedAgent, editCmd]);

  const handleTestConnection = async (agent: AgentWithStatus) => {
    setTestingId(agent.id);
    setTestResult(null);
    try {
      const res = await rpc<
        "agents.testConnection",
        {
          ok: boolean;
          agent: AgentWithStatus;
          initializeResult?: {
            protocolVersion: number;
            agentInfo?: { name?: string; version?: string };
          };
          error?: string;
        }
      >("agents.testConnection", { agentId: agent.id });

      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      if (res.ok) {
        setTestResult({
          ok: true,
          message: `ACP v${res.initializeResult?.protocolVersion ?? 1} 握手成功${
            res.initializeResult?.agentInfo?.version
              ? ` · ${res.initializeResult.agentInfo.version}`
              : ""
          }`,
        });
      } else {
        setTestResult({
          ok: false,
          message: res.error ?? "ACP 握手失败",
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedAgent) return;
    setSavingConfig(true);
    try {
      const parsedArgs = editArgs
        .trim()
        .split(/\s+/)
        .filter((s) => s.length > 0);
      await rpc("agents.configure", {
        id: selectedAgent.id,
        command: editCmd.trim() || selectedAgent.command,
        args: parsedArgs,
      });

      for (const [envKey, val] of Object.entries(secretValues)) {
        if (val.trim()) {
          await rpc("agents.setSecret", {
            agentId: selectedAgent.id,
            envKey,
            value: val.trim(),
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      setTestResult({ ok: true, message: "配置已保存。" });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddCustom = async () => {
    if (!customId.trim() || !customName.trim() || !customCmd.trim()) return;
    const args = customArgs.trim().split(/\s+/).filter(Boolean);
    const created = await rpc<"agents.registerCustom", AgentWithStatus>(
      "agents.registerCustom",
      {
        id: customId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
        name: customName.trim(),
        vendor: customVendor.trim() || "Custom",
        officialUrl: customUrl.trim() || "https://agentclientprotocol.com",
        command: customCmd.trim(),
        args,
        automationPolicy: "allowed",
      }
    );
    await queryClient.invalidateQueries({ queryKey: ["agents"] });
    setCustomModalOpen(false);
    setCustomId("");
    setCustomName("");
    setCustomCmd("");
    setCustomArgs("");
    selectAgent(created);
  };

  const detectedCount = agents.filter(
    (a) => a.status.installState !== "not_installed"
  ).length;
  const verifiedCount = agents.filter((a) => a.verification === "verified").length;

  const cleanVendor = (vendor: string) => vendor.replace(/\s*\/\s*ACP$/i, "");

  return (
    <div className="ct-agents h-full flex flex-col bg-[#F8F9FC] min-h-0 overflow-hidden">
      {/* Header matching redesign-v3/05-agents.png */}
      <header className="ct-catalog-heading shrink-0 px-9 pt-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.03em] leading-[1.2] text-[#141518]">
              {t("agents.title")}
            </h1>
            <p className="text-[14px] text-[#64748B] mt-1.5">
              {t("agents.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void refetch()}
              className="ct-btn-secondary inline-flex items-center gap-2 h-[40px] px-4 text-[14px] font-medium"
            >
              <RefreshCw size={15} strokeWidth={1.8} />
              <span>{t("agents.detectAll")}</span>
            </button>
            <button
              type="button"
              onClick={() => setCustomModalOpen(true)}
              className="ct-btn-primary inline-flex items-center gap-2 h-[40px] px-4.5 text-[14px] font-semibold"
            >
              <Plus size={16} strokeWidth={2.2} />
              <span>{t("agents.addCustom")}</span>
            </button>
          </div>
        </div>

        {/* Search + Segmented Pill Tabs */}
        <div className="ct-agent-filters mt-5 flex flex-wrap items-center gap-4">
          <div className="relative w-[290px] max-w-full">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]"
            />
            <input
              type="text"
              aria-label={t("agents.searchAria")}
              name="agent-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("agents.searchPlaceholder")}
              className="w-full h-[40px] pl-10 pr-3.5 text-[14px] bg-white border border-slate-900/[0.08] rounded-[11px] shadow-[0_1px_2px_rgba(15,23,42,0.03)] text-[#141518] placeholder:text-[#64748B] focus:outline-none focus:border-[#3B82F6] transition"
            />
          </div>

          <div className="ct-segmented h-[40px]">
            {(["all", "detected", "verified"] as const).map((tab) => {
              const active = filter === tab;
              const label =
                tab === "all"
                  ? `全部 ${agents.length}`
                  : tab === "detected"
                    ? `本地可用 ${detectedCount}`
                    : `已验证 ${verifiedCount}`;
              return (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(tab)}
                  className="ct-segmented-item px-4"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Elevated 2-Card Split */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_328px] xl:grid-cols-[minmax(0,1fr)_380px] gap-5 px-9 py-5 min-h-0 overflow-hidden">
        {/* Left Catalog Card */}
        <div className="ct-agent-catalog ct-card rounded-[16px] overflow-y-auto p-2.5 min-h-0">
          {filteredAgents.length === 0 && (
            <div className="ct-empty" role="status">
              {t("agents.noMatches")}
            </div>
          )}
          {filteredAgents.map((agent, idx) => {
            const isSelected = selectedAgent?.id === agent.id;
            const isVerified = agent.verification === "verified";
            const isAvailable = agent.status.installState !== "not_installed";
            const isLast = idx === filteredAgents.length - 1;
            return (
              <button
                key={agent.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => selectAgent(agent)}
                className={`ct-agent-row w-full text-left px-4 py-3.5 flex items-center justify-between gap-4 transition ${
                  isSelected
                    ? "bg-[#EEF4FF] rounded-[11px] shadow-[inset_3.5px_0_0_#2563EB]"
                    : `${!isLast ? "border-b border-slate-900/[0.06]" : ""} hover:bg-[#F8FAFC] rounded-[9px]`
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="w-11 h-11 rounded-[12px] bg-[#F5F7FA] inline-flex items-center justify-center shrink-0">
                    <AgentLogo agentId={agent.id} name={agent.name} size={28} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15.5px] font-bold text-[#141518] truncate leading-snug">
                      {agent.name}
                    </div>
                    <div className="text-[13px] text-[#64748B] truncate mt-0.5">
                      {cleanVendor(agent.vendor)}
                    </div>
                  </div>
                </div>

                {isVerified ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ECFDF5] text-[#059669] text-[13px] font-medium shrink-0">
                    <Check size={13} strokeWidth={2.5} />
                    <span>{t("agents.status.verified")}</span>
                  </span>
                ) : isAvailable ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#EEF4FF] text-[#2563EB] text-[13px] font-medium shrink-0">
                    {t("agents.status.installed")}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#F1F5F9] text-[#64748B] text-[13px] font-medium shrink-0">
                    {t("agents.status.not_installed")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Inspector Card */}
        {selectedAgent && (
          <aside className="ct-agent-inspector ct-card rounded-[16px] flex flex-col overflow-y-auto p-6 space-y-5 min-h-0">
            {/* Identity Header */}
            <div className="flex items-start gap-3.5 pb-4 border-b border-slate-900/[0.06]">
              <span className="w-12 h-12 rounded-[13px] bg-[#F1F5F9] inline-flex items-center justify-center shrink-0">
                <AgentLogo
                  agentId={selectedAgent.id}
                  name={selectedAgent.name}
                  size={30}
                />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[20px] font-bold text-[#141518] leading-tight truncate">
                  {selectedAgent.name}
                </h2>
                <div className="text-[13.5px] text-[#64748B] mt-0.5">
                  {cleanVendor(selectedAgent.vendor)} · ACP
                </div>
                <div className="mt-2 flex items-center gap-2 text-[13px] text-[#475569]">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      selectedAgent.verification === "verified"
                        ? "bg-[#10B981]"
                        : selectedAgent.status.installState !== "not_installed"
                          ? "bg-[#3B82F6]"
                          : "bg-[#94A3B8]"
                    }`}
                  />
                  <span>
                    {selectedAgent.verification === "verified"
                      ? "已通过连接测试"
                      : selectedAgent.status.installState !== "not_installed"
                        ? "本地可用（尚未测试连接）"
                        : "未在本地检测到"}
                  </span>
                </div>
              </div>
            </div>

            {/* Connection Config Form */}
            <div className="space-y-3.5">
              <h3 className="text-[15.5px] font-bold text-[#141518]">
                {t("agents.connectionConfig")}
              </h3>

              <label className="block space-y-1.5">
                <span className="text-[13.5px] font-medium text-[#374151]">
                  {t("agents.commandLabel")}
                </span>
                <input
                  type="text"
                  name="agent-command"
                  autoComplete="off"
                  spellCheck={false}
                  value={editCmd}
                  onChange={(e) => setEditCmd(e.target.value)}
                  className="w-full h-[38px] px-3 rounded-[10px] border border-slate-900/[0.1] bg-[#FAFBFD] font-mono text-[13.5px] text-[#141518] focus:bg-white focus:outline-none focus:border-[#3B82F6]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[13.5px] font-medium text-[#374151]">
                  {t("agents.argsLabel")}
                </span>
                <textarea
                  rows={2}
                  name="agent-arguments"
                  autoComplete="off"
                  spellCheck={false}
                  value={editArgs}
                  onChange={(e) => setEditArgs(e.target.value)}
                  className="w-full px-3 py-2 rounded-[10px] border border-slate-900/[0.1] bg-[#FAFBFD] font-mono text-[13px] leading-relaxed text-[#141518] resize-none focus:bg-white focus:outline-none focus:border-[#3B82F6]"
                />
              </label>

              {Object.keys(selectedAgent.envRefs).length > 0 && (
                <div className="space-y-2">
                  {Object.keys(selectedAgent.envRefs).map((envKey, idx) => (
                    <label key={envKey} className="block space-y-1.5">
                      <span className="text-[13.5px] font-medium text-[#374151]">
                        {idx === 0 ? t("agents.apiKeyLabel") : envKey}
                      </span>
                      <div className="relative">
                        <input
                          type={showSecret[envKey] ? "text" : "password"}
                          name={envKey}
                          autoComplete="off"
                          value={secretValues[envKey] ?? ""}
                          onChange={(e) =>
                            setSecretValues((prev) => ({
                              ...prev,
                              [envKey]: e.target.value,
                            }))
                          }
                          placeholder="••••••••••••••••••••"
                          className="w-full h-[38px] pl-3 pr-9 rounded-[10px] border border-slate-900/[0.1] bg-[#FAFBFD] font-mono text-[13px] text-[#141518] focus:bg-white focus:outline-none focus:border-[#3B82F6]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowSecret((prev) => ({
                              ...prev,
                              [envKey]: !prev[envKey],
                            }))
                          }
                          aria-label={showSecret[envKey] ? "隐藏密钥" : "显示密钥"}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#64748B] hover:text-[#141518]"
                        >
                          {showSecret[envKey] ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </label>
                  ))}
                  {selectedAgent.id === "codex" && (
                    <p className="text-[12.5px] text-[#64748B]">
                      {t("agents.codexAuthHint")}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={savingConfig}
                  onClick={() => void handleSaveConfig()}
                  className="ct-btn-secondary h-[40px] text-[14px] font-medium"
                >
                  {t("agents.saveConfig")}
                </button>
                <button
                  type="button"
                  disabled={testingId === selectedAgent.id}
                  onClick={() => void handleTestConnection(selectedAgent)}
                  className="ct-btn-primary inline-flex items-center justify-center gap-1.5 h-[40px] text-[14px] font-semibold disabled:opacity-50"
                >
                  {testingId === selectedAgent.id && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  <span>
                    {testingId === selectedAgent.id
                      ? t("agents.testing")
                      : t("agents.testConnection")}
                  </span>
                </button>
              </div>
            </div>

            {testResult && (
              <div
                role="status"
                className={`rounded-[10px] px-3.5 py-2.5 text-[13.5px] font-medium flex items-center gap-2 ${
                  testResult.ok
                    ? "bg-[#ECFDF5] text-[#059669]"
                    : "bg-[#FEF2F2] text-[#DC2626]"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 size={15} className="shrink-0" />
                ) : (
                  <AlertTriangle size={15} className="shrink-0" />
                )}
                <span className="break-all">{testResult.message}</span>
              </div>
            )}

            {!testResult && selectedAgent.verification === "verified" && (
              <div className="rounded-[10px] bg-[#ECFDF5] text-[#059669] px-3.5 py-2.5 text-[13.5px] font-medium flex items-center gap-2">
                <Check size={15} strokeWidth={2.4} className="shrink-0" />
                <span>
                  ACP v{selectedAgent.status.protocolVersion ?? 1} 握手成功
                  {selectedAgent.installedVersion || selectedAgent.pinnedVersion
                    ? ` · ${selectedAgent.installedVersion ?? selectedAgent.pinnedVersion}`
                    : ""}
                </span>
              </div>
            )}

            {/* Official Docs & Restriction Note */}
            <div className="pt-2 border-t border-slate-900/[0.06] space-y-3">
              <button
                type="button"
                onClick={() =>
                  void getBridge().openExternalUrl(selectedAgent.officialUrl)
                }
                className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#475569] hover:text-[#141518] transition"
              >
                <span>{t("agents.officialDocs")}</span>
                <ArrowUpRight size={14} />
              </button>

              {selectedAgent.automationPolicy === "restricted" &&
                selectedAgent.automationNote && (
                  <div className="rounded-[10px] bg-[#FFFBEB] border border-[#FDE68A] px-3.5 py-2.5 text-[12.5px] text-[#92400E] flex items-start gap-2">
                    <ShieldAlert size={14} className="shrink-0 mt-0.5 text-[#D97706]" />
                    <span className="leading-relaxed">
                      {selectedAgent.automationNote}
                    </span>
                  </div>
                )}
            </div>
          </aside>
        )}
      </div>

      {/* Custom ACP Modal */}
      {customModalOpen && (
        <Modal
          open={customModalOpen}
          onOpenChange={setCustomModalOpen}
          title={t("agents.addCustom")}
        >
          <div className="w-full p-6 space-y-4 text-[13.5px]">
            <div className="flex items-center justify-between">
              <h3 className="text-[17px] font-bold text-[#141518]">
                {t("agents.addCustom")}
              </h3>
              <button
                type="button"
                onClick={() => setCustomModalOpen(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#64748B]"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-[#64748B] leading-relaxed">
              自定义 ACP Server 仅在用户明确确认后按校验参数启动，不执行未授权脚本。
            </p>
            <label className="block space-y-1.5">
              <span className="font-medium text-[#374151]">Agent ID（唯一标识）</span>
              <input
                type="text"
                value={customId}
                onChange={(e) => setCustomId(e.target.value)}
                placeholder="my-local-acp"
                className="w-full h-[38px] px-3.5 rounded-[10px] border border-slate-900/[0.12] font-mono"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-medium text-[#374151]">显示名称</span>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="My ACP Coding Agent"
                className="w-full h-[38px] px-3.5 rounded-[10px] border border-slate-900/[0.12]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-medium text-[#374151]">启动命令</span>
              <input
                type="text"
                value={customCmd}
                onChange={(e) => setCustomCmd(e.target.value)}
                placeholder="bun / node / my-agent-cli"
                className="w-full h-[38px] px-3.5 rounded-[10px] border border-slate-900/[0.12] font-mono"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-medium text-[#374151]">启动参数（空格分隔）</span>
              <input
                type="text"
                value={customArgs}
                onChange={(e) => setCustomArgs(e.target.value)}
                placeholder="--acp"
                className="w-full h-[38px] px-3.5 rounded-[10px] border border-slate-900/[0.12] font-mono"
              />
            </label>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCustomModalOpen(false)}
                className="ct-btn-secondary h-[38px] px-4 font-medium"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleAddCustom()}
                className="ct-btn-primary h-[38px] px-5 font-semibold"
              >
                保存并添加
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
