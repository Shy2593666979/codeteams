/*
 * Copyright (c) 2026 Kubai087. Licensed under the Kubai Icons License.
 * React binding adapted from kubai-icons/packages/react/src/create.js.
 */

import React, { forwardRef, useEffect, useId, useMemo, useRef } from "react";
import {
  animate,
  badgeStyle,
  bindTrigger,
  VARIANTS,
  VIEWBOX,
  type KubaiController,
  type KubaiIconData,
} from "./runtime";

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

export interface KubaiIconProps
  extends Omit<React.SVGProps<SVGSVGElement>, "color" | "ref"> {
  icon: KubaiIconData;
  size?: number;
  color?: string;
  variant?: "color" | "soft";
  badgeColor?: string;
  trigger?: "hover" | "parent" | "none";
  hover?: boolean;
  active?: boolean;
  defaultActive?: boolean;
  onActiveChange?: (active: boolean) => void;
  title?: string;
}

export const KubaiIcon = forwardRef<SVGSVGElement, KubaiIconProps>(
  function KubaiIcon(
    {
      icon,
      size = 24,
      color,
      variant,
      badgeColor,
      trigger = "hover",
      hover,
      active,
      defaultActive,
      onActiveChange,
      title,
      className,
      style,
      ...rest
    },
    ref
  ) {
    const raw = useId();
    const id = "k" + raw.replace(/[^a-zA-Z0-9_-]/g, "");
    const inner = useMemo(
      () => ({
        __html:
          (title ? `<title>${esc(title)}</title>` : "") +
          icon.markup.replace(/__K__/g, id),
      }),
      [icon.markup, id, title]
    );

    const svgRef = useRef<SVGSVGElement | null>(null);
    const ctlRef = useRef<KubaiController | null>(null);
    const toggleRef = useRef(onActiveChange);
    toggleRef.current = onActiveChange;
    const controlled = active !== undefined;
    const isDuotone = icon.style === "duotone";
    const isLine = icon.style === "line";
    const skipLayeredVariant = isDuotone || isLine;

    useEffect(() => {
      const svg = svgRef.current;
      if (!svg) return undefined;
      const start = controlled ? active : defaultActive;
      const ctl = animate(svg, icon, { state: start ? { active: true } : {} });
      ctlRef.current = ctl;
      if (hover !== undefined) ctl.hover(hover, true);
      let unbind: (() => void) | undefined;
      if (trigger !== "none") {
        const host =
          trigger === "parent"
            ? svg.closest("[data-kubai-trigger]") || svg.parentElement || svg
            : svg;
        unbind = bindTrigger(host, ctl, icon, (next) => {
          if (!controlled) ctl.state({ active: next });
          toggleRef.current?.(next);
        });
      }
      return () => {
        unbind?.();
        ctl.destroy();
        ctlRef.current = null;
      };
      // Re-attach only when the markup or trigger mode changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inner, trigger]);

    useEffect(() => {
      if (hover !== undefined) ctlRef.current?.hover(hover);
    }, [hover]);

    useEffect(() => {
      if (controlled) ctlRef.current?.state({ active });
    }, [active, controlled]);

    const setRef = (el: SVGSVGElement | null) => {
      svgRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    };

    const mergedStyle: React.CSSProperties = {
      ...(!skipLayeredVariant && variant ? VARIANTS[variant] : undefined),
      ...(color ? { color } : undefined),
      ...badgeStyle(icon, badgeColor),
      ...style,
    };

    return (
      <svg
        ref={setRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={icon.viewBox || VIEWBOX}
        width={size}
        height={size}
        fill="none"
        overflow="visible"
        role={title ? "img" : undefined}
        aria-hidden={title ? undefined : true}
        className={[
          "kubai-icon shrink-0",
          isDuotone ? "kubai-duotone" : isLine ? "kubai-line" : "kubai-layered",
          `kubai-icon-${icon.name}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={mergedStyle}
        dangerouslySetInnerHTML={inner}
        {...rest}
      />
    );
  }
);
