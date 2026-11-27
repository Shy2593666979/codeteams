import React from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRight, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import type { AgentWithStatus, WorkflowRecord } from "@codeteams/shared";
import { rpc } from "../lib/bridge";
import { AgentLogo } from "../components/AgentLogo";

function describeWorkflow(stepNames: string[]): string {
  if (stepNames.length === 0) {
    return "尚未添加团队成员，点击“编辑编排”配置 Agent 协作顺序。";
  }
  if (stepNames.length === 1) {
    return `由 ${stepNames[0]} 独立执行任务并产出结果。`;
  }
  if (stepNames.length === 2) {
    return `先使用 ${stepNames[0]} 完成前置步骤，再交由 ${stepNames[1]} 进行下一步协作。`;
  }
  return `从 ${stepNames[0]} 开始，依次经过 ${stepNames.slice(1, -1).join("、")}，最后由 ${stepNames.at(-1)} 完成完善与收尾。`;
}

export const WorkflowsListPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: workflows = [] } = useQuery<WorkflowRecord[]>({
    queryKey: ["workflows"],
    queryFn: () => rpc("workflows.list", {}),
  });

  const { data: agents = [] } = useQuery<AgentWithStatus[]>({
    queryKey: ["agents"],
    queryFn: () => rpc("agents.list"),
  });

  const agentName = (id: string) => {
    const raw = agents.find((a) => a.id === id)?.name ?? id;
    return raw === "Gemini CLI" ? "Gemini" : raw;
  };

  const handleDelete = async (wfId: string) => {
    if (!window.confirm(t("workflow.deleteConfirm"))) return;
    await rpc("workflows.delete", { workflowId: wfId });
    await queryClient.invalidateQueries({ queryKey: ["workflows"] });
  };

  return (
    <div className="ct-page ct-workflows h-full overflow-y-auto bg-[#F8F9FC]">
      <div className="max-w-[920px] mx-auto px-9 py-9">
        {/* Page Heading */}
        <div className="ct-page-heading pb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.03em] leading-[1.2] text-[#141518]">
              {t("workflow.title")}
            </h1>
            <p className="text-[14.5px] text-[#64748B] mt-1.5">
              {t("workflow.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/workflows/new")}
            className="ct-btn-primary inline-flex items-center gap-2 h-[42px] px-5 text-[14px] font-semibold"
          >
            <Plus size={16} strokeWidth={2.2} />
            <span>{t("workflow.create")}</span>
          </button>
        </div>

        {/* Elevated Workflow Cards matching redesign-v3/02-workflows.png */}
        {workflows.length === 0 ? (
          <div className="ct-card py-16 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-[14px] bg-[#E8F0FE] text-[#2563EB] flex items-center justify-center">
              <Layers size={22} />
            </div>
            <p className="text-[14.5px] text-[#64748B]">{t("workflow.empty")}</p>
            <button
              type="button"
              onClick={() => navigate("/workflows/new")}
              className="ct-btn-primary inline-flex items-center gap-2 h-[40px] px-5 text-[14px] font-semibold"
            >
              <Plus size={15} />
              <span>{t("workflow.create")}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {workflows.map((wf) => {
                const names = wf.definition.steps.map((s) => agentName(s.agentId));
                return (
                  <div
                    key={wf.id}
                    className="ct-workflow-row ct-card px-6 py-5 space-y-4 hover:shadow-[0_4px_20px_rgba(15,23,42,0.06)] transition"
                  >
                    <div>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/workflows/${wf.id}`)}
                          className="text-[18.5px] font-bold text-[#141518] hover:text-[#2563EB] truncate transition text-left"
                        >
                          {wf.name}
                        </button>
                        <span className="px-2.5 py-0.5 rounded-full bg-[#F1F3F7] text-[#64748B] text-[12.5px] font-medium shrink-0">
                          v{wf.currentVersion}.0
                        </span>
                      </div>
                      <p className="text-[14px] text-[#64748B] mt-1.5 leading-[1.55]">
                        {describeWorkflow(names)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {wf.definition.steps.map((step, idx) => (
                          <React.Fragment key={step.id}>
                            <span className="inline-flex items-center gap-2 h-[40px] px-3.5 rounded-[10px] bg-[#F4F6FA] border border-slate-900/[0.05] text-[14px] font-medium text-[#141518]">
                              <AgentLogo
                                agentId={step.agentId}
                                name={agentName(step.agentId)}
                                size={22}
                              />
                              <span>{agentName(step.agentId)}</span>
                            </span>
                            {idx < wf.definition.steps.length - 1 && (
                              <ArrowRight
                                size={15}
                                strokeWidth={1.75}
                                className="text-[#64748B] shrink-0"
                              />
                            )}
                          </React.Fragment>
                        ))}
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => navigate(`/workflows/${wf.id}`)}
                          className="ct-btn-secondary inline-flex items-center gap-1.5 h-[38px] px-4 text-[13.5px] font-medium"
                        >
                          <Pencil size={14} strokeWidth={1.8} />
                          <span>{t("workflow.editCanvas")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(wf.id)}
                          className="ct-btn-secondary w-[38px] h-[38px] inline-flex items-center justify-center text-[#64748B] hover:text-[#DC2626] hover:border-[#FECACA] hover:bg-[#FEF2F2]"
                          aria-label="删除团队"
                          title="删除团队"
                        >
                          <Trash2 size={15} strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="pt-5 text-[13.5px] text-[#64748B]">
              {t("workflow.footerNote")}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
