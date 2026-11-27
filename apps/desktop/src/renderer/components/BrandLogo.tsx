import React from "react";

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/** Official CodeTeams transparent vector logo mark */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 24,
  className = "text-[#141518]",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="120 120 784 784"
    fill="none"
    aria-hidden="true"
    className={`shrink-0 ${className}`}
  >
    <g stroke="currentColor" strokeWidth="80" strokeLinecap="round">
      <line x1="236" y1="568" x2="388" y2="412" />
      <line x1="228" y1="724" x2="572" y2="372" />
      <line x1="376" y1="724" x2="796" y2="296" />
      <line x1="524" y1="724" x2="788" y2="456" />
    </g>
  </svg>
);
