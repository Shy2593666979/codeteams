import React from "react";
import { useAtomValue } from "jotai";
import { Terminal } from "lucide-react";
import { agentLogosAtom } from "../store/atoms";

export type AgentLogoSize = number;

interface AgentLogoProps {
  agentId: string;
  name?: string;
  size?: AgentLogoSize;
  className?: string;
}

/**
 * Unified official Agent Logo component.
 * Renders verified sanitized official SVG assets cleanly without borders or distortion.
 */
export const AgentLogo: React.FC<AgentLogoProps> = ({
  agentId,
  name,
  size = 24,
  className = "",
}) => {
  const logos = useAtomValue(agentLogosAtom);
  const entry = logos[agentId];

  const boxStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
  };

  if (entry?.dataUri) {
    return (
      <span
        style={boxStyle}
        className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
        title={
          entry.licenseOrAttribution
            ? `${name ?? agentId} — ${entry.licenseOrAttribution}`
            : name ?? agentId
        }
      >
        <img
          src={entry.dataUri}
          alt={name ?? agentId}
          width={size}
          height={size}
          className="w-full h-full object-contain select-none pointer-events-none"
          draggable={false}
        />
      </span>
    );
  }

  const brandColor = entry?.brandColor ?? "#4B5563";
  const iconSize = Math.max(12, Math.round(size * 0.56));
  return (
    <span
      style={{
        ...boxStyle,
        backgroundColor: `${brandColor}14`,
        color: brandColor,
        borderColor: `${brandColor}30`,
      }}
      className={`inline-flex items-center justify-center rounded-lg border shrink-0 ${className}`}
      title={`${name ?? agentId} (官方 SVG 资产待补充)`}
    >
      <Terminal size={iconSize} strokeWidth={2} />
    </span>
  );
};
