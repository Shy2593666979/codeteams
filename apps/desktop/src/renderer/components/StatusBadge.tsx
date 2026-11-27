import React from "react";
import { useTranslation } from "react-i18next";

interface StatusBadgeProps {
  state: string;
  compact?: boolean;
  dot?: boolean;
}

const STATE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: "bg-[#F1F5F9]", text: "text-[#475569]", dot: "bg-[#94A3B8]" },
  queued: { bg: "bg-[#F1F5F9]", text: "text-[#475569]", dot: "bg-[#94A3B8]" },
  running: { bg: "bg-[#EFF6FF]", text: "text-[#2563EB]", dot: "bg-[#3B82F6]" },
  waiting_permission: { bg: "bg-[#EEF2FF]", text: "text-[#4F46E5]", dot: "bg-[#6366F1]" },
  paused: { bg: "bg-[#F1F5F9]", text: "text-[#334155]", dot: "bg-[#64748B]" },
  completed: { bg: "bg-[#ECFDF5]", text: "text-[#059669]", dot: "bg-[#10B981]" },
  interrupted: { bg: "bg-[#FEF3C7]", text: "text-[#B45309]", dot: "bg-[#F59E0B]" },
  failed: { bg: "bg-[#FEF2F2]", text: "text-[#DC2626]", dot: "bg-[#EF4444]" },
  cancelled: { bg: "bg-[#F1F5F9]", text: "text-[#64748B]", dot: "bg-[#94A3B8]" },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ state, compact, dot }) => {
  const { t } = useTranslation();
  const cfg = STATE_STYLES[state] ?? STATE_STYLES.pending!;
  const label = t(`states.${state}`, state);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${
        compact ? "px-2.5 py-0.5 text-[12.5px]" : "px-3 py-1 text-[13px]"
      } ${cfg.bg} ${cfg.text}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
};
