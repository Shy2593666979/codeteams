import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Folder, ShieldCheck } from "lucide-react";
import { getBridge, rpc } from "../lib/bridge";

export const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [notice, setNotice] = useState<string | null>(null);

  const { data: meta } = useQuery({
    queryKey: ["app-meta"],
    queryFn: () => getBridge().getAppMeta(),
  });

  const { data: diag, refetch: refetchDiag } = useQuery<{
    dbPath: string;
    journalMode: string;
    foreignKeys: number;
    synchronous: number;
    schemaVersions: number[];
    tableCounts: Record<string, number>;
  }>({
    queryKey: ["storage-diagnostics"],
    queryFn: () => rpc("storage.diagnostics"),
  });

  const handleLanguageChange = async (lang: "zh-CN" | "en") => {
    await i18n.changeLanguage(lang);
    await rpc("settings.set", { key: "language", value: lang });
  };

  const handleBackup = async () => {
    const res = await rpc<
      "storage.backup",
      { backupPath: string; createdAt: string }
    >("storage.backup");
    setNotice(`已完成在线 SQLite 备份：${res.backupPath}`);
    await refetchDiag();
  };

  const handleExport = async () => {
    const data = await rpc("storage.export", {});
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codeteams-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("已导出本地历史记录 JSON 文件。");
  };

  const en = i18n.language === "en";

  return (
    <div className="ct-page ct-settings h-full overflow-y-auto bg-[#F8F9FC]">
      <div className="max-w-[860px] mx-auto px-9 py-9">
        {/* Heading */}
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] leading-[1.2] text-[#141518]">
            {t("settings.title")}
          </h1>
          <p className="text-[14.5px] text-[#64748B] mt-1.5">
            {t("settings.subtitle")}
          </p>
        </div>

        {notice && (
          <div
            role="status"
            className="mt-5 flex items-center gap-2.5 rounded-[12px] bg-[#ECFDF5] px-4 py-3 text-[13.5px] font-medium text-[#059669]"
          >
            <CheckCircle2 size={16} className="shrink-0" />
            <span className="break-all">{notice}</span>
          </div>
        )}

        {/* Group 1: General */}
        <section className="mt-7 space-y-2.5">
          <h2 className="text-[15.5px] font-bold text-[#141518] px-0.5">
            {t("settings.general")}
          </h2>
          <div className="ct-card px-6 py-4 flex flex-wrap items-center justify-between gap-5">
            <div>
              <h3 className="text-[15px] font-semibold text-[#141518]">
                {t("settings.language")}
              </h3>
              <p className="text-[13.5px] text-[#64748B] mt-0.5">
                {t("settings.languageDesc")}
              </p>
            </div>
            <div className="ct-segmented h-[40px]">
              {(["zh-CN", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  aria-pressed={i18n.language === lang}
                  onClick={() => void handleLanguageChange(lang)}
                  className="ct-segmented-item px-5"
                >
                  {lang === "en" ? "English" : "简体中文"}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Group 2: Local Data */}
        <section className="mt-6 space-y-2.5">
          <h2 className="text-[15.5px] font-bold text-[#141518] px-0.5">
            {t("settings.localData")}
          </h2>
          <div className="ct-card divide-y divide-slate-900/[0.06]">
            <div className="px-6 py-4 flex flex-wrap items-center gap-5">
              <h3 className="text-[15px] font-semibold text-[#141518] shrink-0">
                {t("settings.dataDir")}
              </h3>
              <div className="flex-1 min-w-[240px] h-[38px] px-3.5 rounded-[10px] bg-[#F3F4F8] flex items-center gap-2 text-[13.5px] text-[#141518]">
                <Folder
                  size={15}
                  strokeWidth={1.75}
                  className="text-[#475569] shrink-0"
                />
                <span className="truncate">{meta?.userDataDir ?? "—"}</span>
              </div>
              <button
                type="button"
                onClick={() => void getBridge().openDataDirectory()}
                className="ct-btn-secondary h-[38px] px-4 text-[13.5px] font-medium shrink-0"
              >
                {t("settings.openDataDir")}
              </button>
            </div>

            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-5">
              <div>
                <h3 className="text-[15px] font-semibold text-[#141518]">
                  {t("settings.backupTitle")}
                </h3>
                <p className="text-[13.5px] text-[#64748B] mt-0.5">
                  {t("settings.backupDesc")}
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleBackup()}
                  className="ct-btn-secondary h-[38px] px-4 text-[13.5px] font-medium"
                >
                  {t("settings.backup")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  className="ct-btn-secondary h-[38px] px-4 text-[13.5px] font-medium"
                >
                  {t("settings.export")}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Group 3: Storage Status */}
        {diag && (
          <section className="mt-6 space-y-2.5">
            <h2 className="text-[15.5px] font-bold text-[#141518] px-0.5">
              {t("settings.diagnostics")}
            </h2>
            <div className="ct-card px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-y-3 items-center text-[14px] font-medium text-[#141518]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                <span>{diag.journalMode.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-2 sm:border-l sm:border-slate-900/[0.08] sm:pl-5">
                <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                <span>
                  {diag.foreignKeys === 1
                    ? en
                      ? "Foreign keys enabled"
                      : "已启用外键"
                    : en
                      ? "Foreign keys off"
                      : "外键未启用"}
                </span>
              </div>
              <div className="flex items-center gap-2 sm:border-l sm:border-slate-900/[0.08] sm:pl-5">
                <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                <span>Schema v{diag.schemaVersions.at(-1) ?? 0}</span>
              </div>
              <div className="flex items-center gap-2 sm:border-l sm:border-slate-900/[0.08] sm:pl-5 tabular-nums">
                <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                <span>
                  {en ? "Saved events" : "已保存事件"}
                  {(diag.tableCounts.events ?? 0) > 0
                    ? ` · ${new Intl.NumberFormat(i18n.language).format(
                        diag.tableCounts.events ?? 0
                      )}`
                    : ""}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-7 pt-4 flex items-center justify-between gap-4 text-[13.5px] text-[#64748B]">
          <span className="inline-flex items-center gap-2 text-[#475569]">
            <ShieldCheck size={16} strokeWidth={1.75} className="text-[#475569]" />
            <span>{t("settings.securityNote")}</span>
          </span>
          <span className="whitespace-nowrap">
            CodeTeams v{meta?.version ?? "0.1.0"}
          </span>
        </footer>
      </div>
    </div>
  );
};
