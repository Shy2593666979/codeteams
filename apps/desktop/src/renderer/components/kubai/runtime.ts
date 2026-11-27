/*
 * Copyright (c) 2026 Kubai087. Licensed under the Kubai Icons License.
 * Minimal browser animation runtime (layered + duotone + line) adapted from kubai-icons/packages/core.
 */

import { attach as attachLineMotion } from "./line-motion";

export interface KubaiLayeredIcon {
  name: string;
  markup: string;
  viewBox?: string;
  style?: "layered";
  tap?: boolean;
  tone?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: (hover: boolean, state?: Record<string, unknown>) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draw: (p: any, E: Record<string, Element>, ctx?: Record<string, unknown>) => void;
}

export interface KubaiDuoPose {
  x?: number | number[];
  y?: number | number[];
  r?: number | number[];
  s?: number | number[];
  sx?: number | number[];
  sy?: number | number[];
  a?: number | number[];
  w?: number | number[];
  o?: [number, number];
  rest?: Partial<Record<"x" | "y" | "r" | "s" | "sx" | "sy" | "a" | "w", number>>;
}

export interface KubaiDuotoneIcon {
  name: string;
  markup: string;
  viewBox: string;
  style: "duotone";
  moves?: Record<string, KubaiDuoPose>;
  ms?: number;
  tone?: string;
  tap?: false;
}

export interface KubaiLineIcon {
  name: string;
  markup: string;
  viewBox: string;
  style: "line";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fx?: any;
  tone?: string;
  tap?: false;
}

export type KubaiIconData =
  | KubaiLayeredIcon
  | KubaiDuotoneIcon
  | KubaiLineIcon;

export interface KubaiController {
  hover: (next: boolean, instant?: boolean) => void;
  state: (next: Record<string, unknown>, instant?: boolean) => void;
  readonly hovered: boolean;
  readonly active: boolean;
  readonly svg: SVGSVGElement;
  destroy: () => void;
}

export const VIEWBOX = "0 -3 31 31";
export const DUO_VIEWBOX = "0 0 16 16";

export const VARIANTS: Record<"color" | "soft", Record<string, string>> = {
  color: {
    "--ki-c": "initial",
    "--ki-e": "initial",
    "--ki-w": "initial",
    "--ki-l": "initial",
  },
  soft: {
    "--ki-c": "color-mix(in srgb,currentColor 90%,#fff)",
    "--ki-e": "color-mix(in srgb,currentColor 84%,#000)",
    "--ki-w": "color-mix(in srgb,currentColor 65%,#000)",
    "--ki-l": "72%",
  },
};

export function badgeStyle(
  ic: KubaiIconData,
  badgeColor?: string
): Record<string, string> {
  const v = badgeColor === "semantic" ? ic.tone : badgeColor;
  return v ? { "--ki-b": v } : {};
}

// ---------- Motion primitives ----------

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return sy(t);
  };
}

export const EASE = bezier(0.22, 1, 0.36, 1);
export const DURATION = 460;
export const PHASE = Symbol.for("kubai-icons.phase");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function interp(a: any, b: any, t: number): any {
  if (typeof b === "number") return typeof a === "number" ? a + (b - a) * t : b;
  if (Array.isArray(b)) return b.map((v, i) => interp(a ? a[i] : v, v, t));
  if (b && typeof b === "object") {
    const o: Record<string, unknown> = {};
    for (const k in b) o[k] = interp(a ? a[k] : undefined, b[k], t);
    return o;
  }
  return b;
}

let easeTable: number[] | null = null;
export function unease(y: number): number {
  if (y <= 0) return 0;
  if (y >= 1) return 1;
  easeTable =
    easeTable || Array.from({ length: 129 }, (_, i) => EASE(i / 128));
  let lo = 0;
  let hi = 128;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (easeTable[m]! < y) lo = m;
    else hi = m;
  }
  return (
    (lo + (y - easeTable[lo]!) / (easeTable[hi]! - easeTable[lo]!)) / 128
  );
}

// ---------- Kit helpers used by layered icon draw() ----------

export const KR = 2.2;
export const f = (n: number) => +n.toFixed(3);
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const at = (
  el: Element | undefined | null,
  o: Record<string, string | number>
) => {
  if (!el) return;
  for (const k in o) el.setAttribute(k, String(o[k]));
};

export function rp(
  pts: [number, number][],
  r: number | number[],
  full?: boolean
): string {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const v = pts[i]!;
    const a = pts[(i + n - 1) % n]!;
    const b = pts[(i + 1) % n]!;
    const ri = Array.isArray(r) ? r[i]! : r;
    const la = Math.hypot(a[0] - v[0], a[1] - v[1]) || 1e-6;
    const lb = Math.hypot(b[0] - v[0], b[1] - v[1]) || 1e-6;
    const lim = full ? 1 : 0.5;
    const k1 = Math.min(ri, la * lim) / la;
    const k2 = Math.min(ri, lb * lim) / lb;
    d +=
      (i ? "L" : "M") +
      f(v[0] + (a[0] - v[0]) * k1) +
      " " +
      f(v[1] + (a[1] - v[1]) * k1) +
      "Q" +
      f(v[0]) +
      " " +
      f(v[1]) +
      " " +
      f(v[0] + (b[0] - v[0]) * k2) +
      " " +
      f(v[1] + (b[1] - v[1]) * k2);
  }
  return d + "Z";
}

export function wave(o: number, fn: (t: number) => number): number {
  const m = (globalThis as Record<symbol, { out: boolean; e: number } | undefined>)[
    PHASE
  ];
  if (!m) return fn(unease(o));
  if (m.out) {
    const left = 1 - m.e;
    return (
      fn(left > 1e-4 ? unease(Math.min(1, o / left)) : 1) * left +
      fn(0) * m.e
    );
  }
  return fn(unease(o > m.e + 1e-3 ? m.e : o));
}

const SWING = 0.75;
const MAX_HALF_TURNS = 3;
export const rattle = (o: number, a: number, k = 3) =>
  wave(
    o,
    (t) =>
      a *
      SWING *
      (1 - t) *
      Math.sin(Math.min(k, MAX_HALF_TURNS) * Math.PI * t * t * (3 - 2 * t))
  );

export const settle = (t: number) => {
  if (t <= 0.5) return t;
  const u = Math.min(t, 1) - 0.5;
  return 0.5 + u + 2 * u * u - 4 * u * u * u;
};

export const bump = (o: number) => wave(o, (t) => Math.sin(Math.PI * settle(t)));

export function pose(
  E: Record<string, Element>,
  id: string,
  n: number,
  transform: string
) {
  for (let i = 0; i < n; i++) {
    at(E[id + i], { transform });
    at(E[id + i + "o"], { transform });
  }
}

// ---------- Environment helpers ----------

let motionQuery: MediaQueryList | null = null;
try {
  motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
} catch {
  /* not a browser */
}
const reduced = () => Boolean(motionQuery && motionQuery.matches);
const raf = (fn: FrameRequestCallback) =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(fn)
    : (setTimeout(() => fn(Date.now()), 16) as unknown as number);
const caf = (id: number) =>
  typeof cancelAnimationFrame === "function"
    ? cancelAnimationFrame(id)
    : clearTimeout(id);
const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

// ---------- Duotone motion runtime ----------

const DUO_DURATION = 480;
const DUO_STEP = 110;
const DUO_BACK = 360;
const DUO_EASE = bezier(0.34, 1.56, 0.64, 1);
const DUO_EASE_BACK = bezier(0.33, 1, 0.68, 1);

type DuoTrackKey = "x" | "y" | "r" | "s" | "sx" | "sy" | "a" | "w";
const REST: Record<DuoTrackKey, number> = {
  x: 0,
  y: 0,
  r: 0,
  s: 1,
  sx: 1,
  sy: 1,
  a: 1,
  w: 1,
};
const KEYS = Object.keys(REST) as DuoTrackKey[];
const n3 = (v: number) => +v.toFixed(3);
const unit = (v: number) => n3(Math.min(1, Math.max(0, v)));
const inOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const restOf = (p: KubaiDuoPose): Record<DuoTrackKey, number> => ({
  ...REST,
  ...(p.rest || {}),
});

function track(
  from: number,
  v: number | number[],
  q: number,
  ease: (t: number) => number
): number {
  const pts = [from, ...(Array.isArray(v) ? v : [v])];
  const m = pts.length - 1;
  if (m === 1) return from + (pts[1]! - from) * ease(q);
  const kq = Math.min(m - 1e-9, Math.max(0, q * m));
  const i = Math.floor(kq);
  const t = kq - i;
  return pts[i]! + (pts[i + 1]! - pts[i]!) * (i === m - 1 ? ease(t) : inOut(t));
}

function keyframeCount(p: KubaiDuoPose): number {
  return Math.max(
    1,
    ...KEYS.filter((k) => Array.isArray(p[k])).map((k) => (p[k] as number[]).length)
  );
}

function duoDuration(ic: KubaiDuotoneIcon): number {
  return (
    ic.ms ??
    DUO_DURATION +
      DUO_STEP *
        (Math.max(1, ...Object.values(ic.moves || {}).map(keyframeCount)) - 1)
  );
}

function duoValues(
  p: KubaiDuoPose,
  q: number,
  from: Record<DuoTrackKey, number> | null,
  on: boolean
): Partial<Record<DuoTrackKey, number>> {
  const r = restOf(p);
  const o: Partial<Record<DuoTrackKey, number>> = {};
  for (const k of KEYS) {
    if (k in p || (p.rest && k in p.rest)) {
      o[k] = track(
        (from || r)[k] ?? r[k],
        on ? (k in p ? (p[k] as number | number[]) : r[k]) : r[k],
        q,
        on ? DUO_EASE : DUO_EASE_BACK
      );
    }
  }
  return o;
}

function duoTransform(
  p: KubaiDuoPose,
  v: Partial<Record<DuoTrackKey, number>>
): string {
  const g = (k: DuoTrackKey) => (k in v ? v[k]! : REST[k]);
  const [ox, oy] = p.o || [8, 8];
  const s = g("s");
  return `translate(${n3(g("x") + ox)} ${n3(g("y") + oy)}) rotate(${n3(g("r"))}) scale(${n3(s * g("sx"))} ${n3(s * g("sy"))}) translate(${-ox} ${-oy})`;
}

export function animateDuotone(
  svg: SVGSVGElement,
  ic: KubaiDuotoneIcon
): KubaiController {
  const els = Object.keys(ic.moves || {}).map((k) => ({
    p: ic.moves![k]!,
    list: [...svg.querySelectorAll(`[data-l="${k}"]`)],
    cur: restOf(ic.moves![k]!),
  }));
  const long = duoDuration(ic);
  let on = false;
  let frame = 0;
  let stopped = false;

  const paint = (el: (typeof els)[number]) => {
    const t = duoTransform(el.p, el.cur);
    for (const node of el.list) {
      node.setAttribute("transform", t);
      if ("a" in el.p || el.p.rest?.a !== undefined) {
        node.setAttribute("opacity", String(unit(el.cur.a)));
      }
      if ("w" in el.p) {
        node.setAttribute("stroke-dasharray", `${unit(el.cur.w)} 2`);
        node.setAttribute("stroke-opacity", el.cur.w < 0.01 ? "0" : "1");
      }
    }
  };

  for (const el of els) if (el.p.rest) paint(el);

  const go = (instant?: boolean) => {
    caf(frame);
    const from = els.map((el) => ({ ...el.cur }));
    if (instant || reduced()) {
      els.forEach((el, i) => {
        el.cur = { ...el.cur, ...duoValues(el.p, 1, from[i]!, on) };
        paint(el);
      });
      return;
    }
    const run = on ? long : DUO_BACK;
    const t0 = now();
    const tick = (t: number) => {
      if (stopped) return;
      const q = Math.min(
        1,
        Math.max(0, ((typeof t === "number" ? t : now()) - t0) / run)
      );
      els.forEach((el, i) => {
        el.cur = { ...el.cur, ...duoValues(el.p, q, from[i]!, on) };
        paint(el);
      });
      if (q < 1) frame = raf(tick);
    };
    frame = raf(tick);
  };

  return {
    hover(next, instant) {
      if (Boolean(next) !== on && els.length) {
        on = Boolean(next);
        go(instant);
      }
    },
    state() {},
    get hovered() {
      return on;
    },
    get active() {
      return false;
    },
    svg,
    destroy() {
      stopped = true;
      caf(frame);
    },
  };
}

// ---------- Line (solid-tint) motion runtime ----------

export function animateLine(
  svg: SVGSVGElement,
  ic: KubaiLineIcon
): KubaiController {
  svg.setAttribute("data-variant", "solid-tint");
  const m = attachLineMotion(svg, ic.fx);
  let on = false;
  return {
    hover(next) {
      const v = Boolean(next);
      if (v === on) return;
      on = v;
      m.hover(v);
    },
    state() {},
    get hovered() {
      return on;
    },
    get active() {
      return false;
    },
    svg,
    destroy() {
      m.hover(false);
      m.at(1e9);
    },
  };
}

// ---------- Unified animate() & bindTrigger() ----------

export function animate(
  svg: SVGSVGElement,
  icon: KubaiIconData,
  { state = {} }: { state?: Record<string, unknown> } = {}
): KubaiController {
  if (icon.style === "duotone") return animateDuotone(svg, icon);
  if (icon.style === "line") return animateLine(svg, icon);

  const E: Record<string, Element> = {};
  for (const el of svg.querySelectorAll("[data-n]")) {
    const key = el.getAttribute("data-n");
    if (key) E[key] = el;
  }

  const clips: [Element, Element][] = [];
  for (const el of svg.querySelectorAll("[mask]")) {
    const id = (el.getAttribute("mask")?.match(/url\(#([^)]+)\)/) || [])[1];
    const shape = id ? svg.querySelector(`mask[id="${id}"] path`) : null;
    if (shape && shape.getAttribute("d") === el.getAttribute("d")) {
      clips.push([el, shape]);
    }
  }

  const unders: [Element, Element][] = [];
  for (const under of svg.querySelectorAll("[data-under]")) {
    const fill = svg.querySelector(
      `[data-over="${under.getAttribute("data-under")}"]`
    );
    if (fill) unders.push([fill, under]);
  }

  let on = false;
  let s: Record<string, unknown> = { ...state };
  let frame = 0;
  let stopped = false;
  let cur = icon.target(false, s);

  const style = svg.style;
  const will = style ? style.willChange : "";
  const lift = (up: boolean) => {
    if (style) style.willChange = up ? "transform" : will;
  };

  const paint = (phase?: { out: boolean; e: number }) => {
    (globalThis as Record<symbol, unknown>)[PHASE] = phase;
    icon.draw(cur, E, {});
    (globalThis as Record<symbol, unknown>)[PHASE] = undefined;
    for (const [el, shape] of clips) {
      const d = el.getAttribute("d");
      if (d && shape.getAttribute("d") !== d) shape.setAttribute("d", d);
    }
    for (const [fill, under] of unders) {
      for (const attr of ["d", "transform"]) {
        const v = fill.getAttribute(attr);
        if (v === under.getAttribute(attr)) continue;
        if (v === null) under.removeAttribute(attr);
        else under.setAttribute(attr, v);
      }
    }
  };

  const go = (instant?: boolean) => {
    const to = icon.target(on, s);
    caf(frame);
    if (instant || reduced()) {
      cur = to;
      paint();
      lift(false);
      return;
    }
    const from = cur;
    const t0 = now();
    lift(true);
    const tick = (t: number) => {
      if (stopped) return;
      const k = Math.min(
        1,
        Math.max(0, ((typeof t === "number" ? t : now()) - t0) / DURATION)
      );
      const e = EASE(k);
      cur = interp(from, to, e);
      paint({ out: !on, e });
      if (k < 1) frame = raf(tick);
      else lift(false);
    };
    frame = raf(tick);
  };

  if (Object.keys(s).length) go(true);

  return {
    hover(next, instant) {
      if (Boolean(next) !== on) {
        on = Boolean(next);
        go(instant);
      }
    },
    state(next, instant) {
      s = { ...s, ...next };
      go(instant);
    },
    get hovered() {
      return on;
    },
    get active() {
      return Boolean(s.active);
    },
    svg,
    destroy() {
      stopped = true;
      caf(frame);
      lift(false);
    },
  };
}

export function bindTrigger(
  target: Element,
  ctl: KubaiController,
  icon: KubaiIconData,
  onToggle?: (active: boolean) => void
): () => void {
  let count = 0;
  const enter = (e: Event) => {
    const pe = e as PointerEvent;
    if (!pe.pointerType || pe.pointerType === "mouse") {
      count++;
      ctl.hover(true);
    }
  };
  const leave = (e: Event) => {
    const pe = e as PointerEvent;
    if (!pe.pointerType || pe.pointerType === "mouse") {
      count = Math.max(0, count - 1);
      if (!count) ctl.hover(false);
    }
  };
  let focused = false;
  const focus = (e: Event) => {
    let visible = true;
    try {
      visible = (e.target as Element).matches(":focus-visible");
    } catch {
      /* ignore */
    }
    if (!visible || focused) return;
    focused = true;
    count++;
    ctl.hover(true);
  };
  const blur = () => {
    if (!focused) return;
    focused = false;
    count = Math.max(0, count - 1);
    if (!count) ctl.hover(false);
  };
  const click = (e: Event) => {
    if (icon.tap) {
      const active = !ctl.active;
      if (onToggle) onToggle(active);
      else ctl.state({ active });
      return;
    }
    const pe = e as PointerEvent;
    if (pe.pointerType && pe.pointerType !== "mouse") {
      ctl.hover(true);
      setTimeout(() => ctl.hover(false), DURATION + 240);
    }
  };
  const handlers: Record<string, (e: Event) => void> = {
    pointerenter: enter,
    pointerleave: leave,
    focusin: focus,
    focusout: blur,
    click,
  };
  const off = () => {
    for (const type in handlers) target.removeEventListener(type, run);
  };
  const run = (e: Event) => {
    if (ctl.svg && !ctl.svg.isConnected) off();
    else handlers[e.type]?.(e);
  };
  for (const type in handlers) target.addEventListener(type, run);
  return off;
}
