/*
 * Copyright (c) 2026 Kubai087. Licensed under the Kubai Icons License.
 * Pre-compiled icon definitions (5 layered + 22 line solid-tint) generated from kubai-icons.
 */

import {
  at,
  bump,
  clamp01,
  f,
  KR,
  pose,
  rattle,
  rp,
  type KubaiLayeredIcon,
  type KubaiLineIcon,
} from "./runtime";

// ============================================================================
// Layered Animated Icons (分层动态 — Lumno style, 31x31 viewBox)
// ============================================================================

const FOLDER_BACK_R = [KR, 1.4, 1.4, KR, KR, KR];
const BUG_LEGS: [number, number, number, number][] = [
  [10, 11.6, 5.8, 9.4],
  [9.4, 15.4, 4.8, 15.4],
  [10, 19.2, 5.8, 21.6],
];
const BLOCKS_S = 8.4;
const BLOCKS_X0 = 4.4;
const BLOCKS_Y0 = 6.8;

export const layeredCode: KubaiLayeredIcon = {
  name: "code",
  style: "layered",
  viewBox: "0 -3 31 31",
  markup: "<defs><linearGradient id=\"loS-__K__\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 62.9%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 74.7%,#fff)\"/></linearGradient><linearGradient id=\"upS-__K__\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 29.6%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 47.9%,#fff)\"/></linearGradient><filter id=\"sh-__K__\" x=\"-40%\" y=\"-40%\" width=\"180%\" height=\"190%\" color-interpolation-filters=\"sRGB\"><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"2\"/><feOffset dy=\"2\" result=\"o\"/><feFlood style=\"flood-color:color-mix(in srgb,var(--ki-c,currentColor) 67.8%,#fff)\" flood-opacity=\"0.21\"/><feComposite in2=\"o\" operator=\"in\"/><feMerge><feMergeNode/><feMergeNode in=\"SourceGraphic\"/></feMerge></filter><filter id=\"hi-__K__\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"130%\" color-interpolation-filters=\"sRGB\"><feColorMatrix in=\"SourceAlpha\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0\" result=\"a\"/><feOffset in=\"a\" dy=\"0.7\"/><feGaussianBlur stdDeviation=\"0.35\"/><feComposite in2=\"a\" operator=\"arithmetic\" k2=\"-1\" k3=\"1\"/><feColorMatrix type=\"matrix\" values=\"0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0\"/><feBlend in2=\"SourceGraphic\" mode=\"overlay\"/></filter><mask id=\"ol-__K__-0\" maskUnits=\"userSpaceOnUse\" x=\"-40\" y=\"-40\" width=\"111\" height=\"109\"><rect x=\"-40\" y=\"-40\" width=\"111\" height=\"109\" fill=\"#fff\"/><path d=\"M4 5.5Q4 3.3 6.2 3.3L24.8 3.3Q27 3.3 27 5.5L27 19.5Q27 21.7 24.8 21.7L6.2 21.7Q4 21.7 4 19.5Z\" fill=\"#000\"/></mask></defs><path d=\"M4 5.5Q4 3.3 6.2 3.3L24.8 3.3Q27 3.3 27 5.5L27 19.5Q27 21.7 24.8 21.7L6.2 21.7Q4 21.7 4 19.5Z\" fill=\"none\" stroke-width=\"1\" data-under=\"0\" stroke=\"url(#loS-__K__)\"/><g filter=\"url(#sh-__K__)\"><g filter=\"url(#hi-__K__)\"><path d=\"M4 5.5Q4 3.3 6.2 3.3L24.8 3.3Q27 3.3 27 5.5L27 19.5Q27 21.7 24.8 21.7L6.2 21.7Q4 21.7 4 19.5Z\" fill=\"url(#loS-__K__)\" data-over=\"0\"/></g></g><path d=\"M4 5.5Q4 3.3 6.2 3.3L24.8 3.3Q27 3.3 27 5.5L27 19.5Q27 21.7 24.8 21.7L6.2 21.7Q4 21.7 4 19.5Z\" mask=\"url(#ol-__K__-0)\" fill=\"none\" stroke-width=\"2\" style=\"stroke:var(--ki-e,var(--ki-c,currentColor))\"/><path d=\"M6 11.1Q6 9.9 7.2 9.9L23.8 9.9Q25 9.9 25 11.1L25 18.5Q25 19.7 23.8 19.7L7.2 19.7Q6 19.7 6 18.5Z\" fill=\"#fff\"/><path data-n=\"br\" fill=\"none\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M12.2 12.2L9.5 14.8L12.2 17.4M18.8 12.2L21.5 14.8L18.8 17.4\" style=\"stroke:color-mix(in srgb,var(--ki-e,var(--ki-c,currentColor)) 72.9%,#000)\"/><path data-n=\"sl\" fill=\"none\" stroke-width=\"2.2\" stroke-linecap=\"round\" d=\"M16.6 12.1L14.4 17.5\" style=\"stroke:color-mix(in srgb,var(--ki-c,currentColor) 68.6%,#fff)\"/><g filter=\"url(#hi-__K__)\"><path d=\"M4 5.5Q4 3.3 6.2 3.3L24.8 3.3Q27 3.3 27 5.5L27 7.9Q27 7.9 27 7.9L4 7.9Q4 7.9 4 7.9Z\" fill=\"url(#upS-__K__)\"/></g><path d=\"M4 5.5Q4 3.3 6.2 3.3L24.8 3.3Q27 3.3 27 5.5L27 7.9Q27 7.9 27 7.9L4 7.9Q4 7.9 4 7.9Z\" fill=\"none\"/>",
  target: (h) => ({ a: h ? 1 : 0 }),
  draw(p, E) {
    const x = 1.1 * p.a + 0.9 * bump(p.a);
    const l = 12.2 - x;
    const r = 18.8 + x;
    at(E.br, {
      d: `M${f(l)} 12.2L${f(l - 2.7)} 14.8L${f(l)} 17.4M${f(r)} 12.2L${f(r + 2.7)} 14.8L${f(r)} 17.4`,
    });
    const dx = 1.1 + 0.5 * p.a;
    at(E.sl, { d: `M${f(15.5 + dx)} 12.1L${f(15.5 - dx)} 17.5` });
  },
};

export const layeredSearch: KubaiLayeredIcon = {
  name: "search",
  style: "layered",
  viewBox: "0 -3 31 31",
  markup: "<defs><linearGradient id=\"loS-__K__\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 62.9%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 74.7%,#fff)\"/></linearGradient><linearGradient id=\"upS-__K__\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 29.6%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 47.9%,#fff)\"/></linearGradient><linearGradient id=\"lo-__K__-941\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 62.9%,#fff)\"/><stop offset=\"0.941\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 73.2%,#fff)\"/><stop offset=\"0.941\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 90.7%,#000)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 60.3%,#fff)\"/></linearGradient><filter id=\"sh-__K__\" x=\"-40%\" y=\"-40%\" width=\"180%\" height=\"190%\" color-interpolation-filters=\"sRGB\"><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"2\"/><feOffset dy=\"2\" result=\"o\"/><feFlood style=\"flood-color:color-mix(in srgb,var(--ki-c,currentColor) 67.8%,#fff)\" flood-opacity=\"0.21\"/><feComposite in2=\"o\" operator=\"in\"/><feMerge><feMergeNode/><feMergeNode in=\"SourceGraphic\"/></feMerge></filter><filter id=\"hi-__K__\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"130%\" color-interpolation-filters=\"sRGB\"><feColorMatrix in=\"SourceAlpha\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0\" result=\"a\"/><feOffset in=\"a\" dy=\"0.7\"/><feGaussianBlur stdDeviation=\"0.35\"/><feComposite in2=\"a\" operator=\"arithmetic\" k2=\"-1\" k3=\"1\"/><feColorMatrix type=\"matrix\" values=\"0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0\"/><feBlend in2=\"SourceGraphic\" mode=\"overlay\"/></filter><mask id=\"ol-__K__-0\" maskUnits=\"userSpaceOnUse\" x=\"-40\" y=\"-40\" width=\"111\" height=\"109\"><rect x=\"-40\" y=\"-40\" width=\"111\" height=\"109\" fill=\"#fff\"/><path d=\"M4 3.2Q4 1 6.2 1L18.6 1Q20.8 1 20.8 3.2L20.8 19Q20.8 21.2 18.6 21.2L6.2 21.2Q4 21.2 4 19Z\" fill=\"#000\"/></mask></defs><path d=\"M4 3.2Q4 1 6.2 1L18.6 1Q20.8 1 20.8 3.2L20.8 19Q20.8 21.2 18.6 21.2L6.2 21.2Q4 21.2 4 19Z\" fill=\"none\" stroke-width=\"1\" data-under=\"0\" stroke=\"url(#lo-__K__-941)\"/><g filter=\"url(#sh-__K__)\"><g filter=\"url(#hi-__K__)\"><path d=\"M4 3.2Q4 1 6.2 1L18.6 1Q20.8 1 20.8 3.2L20.8 19Q20.8 21.2 18.6 21.2L6.2 21.2Q4 21.2 4 19Z\" fill=\"url(#lo-__K__-941)\" data-over=\"0\"/></g></g><path d=\"M4 3.2Q4 1 6.2 1L18.6 1Q20.8 1 20.8 3.2L20.8 19Q20.8 21.2 18.6 21.2L6.2 21.2Q4 21.2 4 19Z\" mask=\"url(#ol-__K__-0)\" fill=\"none\" stroke-width=\"2\" style=\"stroke:var(--ki-e,var(--ki-c,currentColor))\"/><path d=\"M7.4 4.8H17.4M7.4 7.8H14\" fill=\"none\" stroke-width=\"1.6\" stroke-linecap=\"round\" style=\"stroke:var(--ki-w,#fff)\"/><g filter=\"url(#hi-__K__)\"><path d=\"M4 12.4Q4 10.8 5.6 10.8L19.2 10.8Q20.8 10.8 20.8 12.4L20.8 19Q20.8 21.2 18.6 21.2L6.2 21.2Q4 21.2 4 19Z\" fill=\"url(#upS-__K__)\"/></g><path d=\"M4 12.4Q4 10.8 5.6 10.8L19.2 10.8Q20.8 10.8 20.8 12.4L20.8 19Q20.8 21.2 18.6 21.2L6.2 21.2Q4 21.2 4 19Z\" fill=\"none\"/><g data-n=\"lens\" filter=\"url(#sh-__K__)\" transform=\"translate(19.8 16.8) scale(1)\"><circle r=\"3.6\" fill=\"#fff\" fill-opacity=\".8\"/><circle r=\"3.6\" fill=\"url(#upS-__K__)\" fill-opacity=\".35\"/><circle r=\"4.5\" fill=\"none\" stroke-width=\"1.8\" style=\"stroke:color-mix(in srgb,var(--ki-e,var(--ki-c,currentColor)) 72.9%,#000)\"/><path d=\"M3.8 3.8L6.6 6.6\" stroke-width=\"2.2\" stroke-linecap=\"round\" style=\"stroke:color-mix(in srgb,var(--ki-e,var(--ki-c,currentColor)) 72.9%,#000)\"/></g>",
  target: (h) => ({ lens: h ? [13.2, 10.4, 1.05] : [19.8, 16.8, 1] }),
  draw(p, E) {
    const [x, y, s] = p.lens;
    at(E.lens, { transform: `translate(${f(x)} ${f(y)}) scale(${f(s)})` });
  },
};

export const layeredBug: KubaiLayeredIcon = {
  name: "bug",
  style: "layered",
  viewBox: "0 -3 31 31",
  markup: "<defs><linearGradient id=\"loS-__K__\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 62.9%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 74.7%,#fff)\"/></linearGradient><linearGradient id=\"upS-__K__\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 29.6%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 47.9%,#fff)\"/></linearGradient><filter id=\"sh-__K__\" x=\"-40%\" y=\"-40%\" width=\"180%\" height=\"190%\" color-interpolation-filters=\"sRGB\"><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"2\"/><feOffset dy=\"2\" result=\"o\"/><feFlood style=\"flood-color:color-mix(in srgb,var(--ki-c,currentColor) 67.8%,#fff)\" flood-opacity=\"0.21\"/><feComposite in2=\"o\" operator=\"in\"/><feMerge><feMergeNode/><feMergeNode in=\"SourceGraphic\"/></feMerge></filter><filter id=\"hi-__K__\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"130%\" color-interpolation-filters=\"sRGB\"><feColorMatrix in=\"SourceAlpha\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0\" result=\"a\"/><feOffset in=\"a\" dy=\"0.7\"/><feGaussianBlur stdDeviation=\"0.35\"/><feComposite in2=\"a\" operator=\"arithmetic\" k2=\"-1\" k3=\"1\"/><feColorMatrix type=\"matrix\" values=\"0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0\"/><feBlend in2=\"SourceGraphic\" mode=\"overlay\"/></filter><mask id=\"ol-__K__-0\" maskUnits=\"userSpaceOnUse\" x=\"-40\" y=\"-40\" width=\"111\" height=\"109\"><rect x=\"-40\" y=\"-40\" width=\"111\" height=\"109\" fill=\"#fff\"/><path d=\"M11.5 7.2A4 4 0 1 0 19.5 7.2A4 4 0 1 0 11.5 7.2Z\" fill=\"#000\"/></mask><mask id=\"ol-__K__-1\" maskUnits=\"userSpaceOnUse\" x=\"-40\" y=\"-40\" width=\"111\" height=\"109\"><rect x=\"-40\" y=\"-40\" width=\"111\" height=\"109\" fill=\"#fff\"/><path d=\"M8.9 15.4A6.6 7.6 0 1 0 22.1 15.4A6.6 7.6 0 1 0 8.9 15.4Z\" fill=\"#000\"/></mask></defs><g data-n=\"lg\" fill=\"none\" stroke-width=\"2.2\" stroke-linecap=\"round\" style=\"stroke:color-mix(in srgb,var(--ki-e,var(--ki-c,currentColor)) 72.9%,#000)\"><path data-n=\"l0\" d=\"M10 11.6L5.8 9.4\" transform=\"rotate(0 10 11.6)\"/><path data-n=\"r0\" d=\"M21 11.6L25.2 9.4\" transform=\"rotate(0 21 11.6)\"/><path data-n=\"l1\" d=\"M9.4 15.4L4.8 15.4\" transform=\"rotate(0 9.4 15.4)\"/><path data-n=\"r1\" d=\"M21.6 15.4L26.2 15.4\" transform=\"rotate(0 21.6 15.4)\"/><path data-n=\"l2\" d=\"M10 19.2L5.8 21.6\" transform=\"rotate(0 10 19.2)\"/><path data-n=\"r2\" d=\"M21 19.2L25.2 21.6\" transform=\"rotate(0 21 19.2)\"/><path d=\"M13.6 4L11.6 1.4M17.4 4L19.4 1.4\"/></g><path d=\"M11.5 7.2A4 4 0 1 0 19.5 7.2A4 4 0 1 0 11.5 7.2Z\" fill=\"none\" stroke-width=\"1\" data-under=\"0\" stroke=\"url(#loS-__K__)\"/><g filter=\"url(#sh-__K__)\"><g filter=\"url(#hi-__K__)\"><path d=\"M11.5 7.2A4 4 0 1 0 19.5 7.2A4 4 0 1 0 11.5 7.2Z\" fill=\"url(#loS-__K__)\" data-over=\"0\"/></g></g><path d=\"M11.5 7.2A4 4 0 1 0 19.5 7.2A4 4 0 1 0 11.5 7.2Z\" mask=\"url(#ol-__K__-0)\" fill=\"none\" stroke-width=\"2\" style=\"stroke:var(--ki-e,var(--ki-c,currentColor))\"/><path d=\"M8.9 15.4A6.6 7.6 0 1 0 22.1 15.4A6.6 7.6 0 1 0 8.9 15.4Z\" fill=\"none\" stroke-width=\"1\" data-under=\"1\" stroke=\"url(#upS-__K__)\"/><g filter=\"url(#sh-__K__)\"><g filter=\"url(#hi-__K__)\"><path d=\"M8.9 15.4A6.6 7.6 0 1 0 22.1 15.4A6.6 7.6 0 1 0 8.9 15.4Z\" fill=\"url(#upS-__K__)\" data-over=\"1\"/></g></g><path d=\"M8.9 15.4A6.6 7.6 0 1 0 22.1 15.4A6.6 7.6 0 1 0 8.9 15.4Z\" mask=\"url(#ol-__K__-1)\" fill=\"none\" stroke-width=\"2\" style=\"stroke:var(--ki-e,var(--ki-c,currentColor))\"/><path d=\"M15.5 11V20.4\" fill=\"none\" stroke-width=\"1.6\" stroke-linecap=\"round\" style=\"stroke:color-mix(in srgb,var(--ki-e,var(--ki-c,currentColor)) 72.9%,#000)\"/>",
  target: (h) => ({ o: h ? 1 : 0 }),
  draw(p, E) {
    const o = clamp01(p.o);
    BUG_LEGS.forEach((l, i) => {
      const a = rattle(o, 16, 3) * (i % 2 ? -1 : 1);
      at(E["l" + i], { transform: `rotate(${f(a)} ${l[0]} ${l[1]})` });
      at(E["r" + i], {
        transform: `rotate(${f(a)} ${f(31 - l[0])} ${l[1]})`,
      });
    });
  },
};

export const layeredBlocks: KubaiLayeredIcon = {
  name: "blocks",
  style: "layered",
  viewBox: "0 -3 31 31",
  markup: "<defs><linearGradient id=\"loS-__K__\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 62.9%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 74.7%,#fff)\"/></linearGradient><linearGradient id=\"upS-__K__\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 29.6%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 47.9%,#fff)\"/></linearGradient><filter id=\"sh-__K__\" x=\"-40%\" y=\"-40%\" width=\"180%\" height=\"190%\" color-interpolation-filters=\"sRGB\"><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"2\"/><feOffset dy=\"2\" result=\"o\"/><feFlood style=\"flood-color:color-mix(in srgb,var(--ki-c,currentColor) 67.8%,#fff)\" flood-opacity=\"0.21\"/><feComposite in2=\"o\" operator=\"in\"/><feMerge><feMergeNode/><feMergeNode in=\"SourceGraphic\"/></feMerge></filter><filter id=\"hi-__K__\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"130%\" color-interpolation-filters=\"sRGB\"><feColorMatrix in=\"SourceAlpha\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0\" result=\"a\"/><feOffset in=\"a\" dy=\"0.7\"/><feGaussianBlur stdDeviation=\"0.35\"/><feComposite in2=\"a\" operator=\"arithmetic\" k2=\"-1\" k3=\"1\"/><feColorMatrix type=\"matrix\" values=\"0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0\"/><feBlend in2=\"SourceGraphic\" mode=\"overlay\"/></filter><mask id=\"ol-__K__-0\" maskUnits=\"userSpaceOnUse\" x=\"-40\" y=\"-40\" width=\"111\" height=\"109\"><rect x=\"-40\" y=\"-40\" width=\"111\" height=\"109\" fill=\"#fff\"/><path d=\"M4.4 9Q4.4 6.8 6.6 6.8L10.6 6.8Q12.8 6.8 12.8 9L12.8 14.8Q12.8 15.2 13.2 15.2L19 15.2Q21.2 15.2 21.2 17.4L21.2 21.4Q21.2 23.6 19 23.6L6.6 23.6Q4.4 23.6 4.4 21.4Z\" fill=\"#000\"/></mask><mask id=\"ol-__K__-1\" maskUnits=\"userSpaceOnUse\" x=\"-40\" y=\"-40\" width=\"111\" height=\"109\"><rect x=\"-40\" y=\"-40\" width=\"111\" height=\"109\" fill=\"#fff\"/><path d=\"M12.8 9Q12.8 6.8 15 6.8L19 6.8Q21.2 6.8 21.2 9L21.2 13Q21.2 15.2 19 15.2L15 15.2Q12.8 15.2 12.8 13Z\" fill=\"#000\"/></mask></defs><g filter=\"url(#sh-__K__)\"><g filter=\"url(#hi-__K__)\"><g data-n=\"l0\"><path d=\"M4.4 9Q4.4 6.8 6.6 6.8L10.6 6.8Q12.8 6.8 12.8 9L12.8 14.8Q12.8 15.2 13.2 15.2L19 15.2Q21.2 15.2 21.2 17.4L21.2 21.4Q21.2 23.6 19 23.6L6.6 23.6Q4.4 23.6 4.4 21.4Z\" fill=\"none\" stroke-width=\"1\" data-under=\"0\" stroke=\"url(#loS-__K__)\"/><path d=\"M4.4 9Q4.4 6.8 6.6 6.8L10.6 6.8Q12.8 6.8 12.8 9L12.8 14.8Q12.8 15.2 13.2 15.2L19 15.2Q21.2 15.2 21.2 17.4L21.2 21.4Q21.2 23.6 19 23.6L6.6 23.6Q4.4 23.6 4.4 21.4Z\" fill=\"url(#loS-__K__)\" data-over=\"0\"/></g></g></g><g data-n=\"l0o\"><path d=\"M4.4 9Q4.4 6.8 6.6 6.8L10.6 6.8Q12.8 6.8 12.8 9L12.8 14.8Q12.8 15.2 13.2 15.2L19 15.2Q21.2 15.2 21.2 17.4L21.2 21.4Q21.2 23.6 19 23.6L6.6 23.6Q4.4 23.6 4.4 21.4Z\" mask=\"url(#ol-__K__-0)\" fill=\"none\" stroke-width=\"2\" style=\"stroke:var(--ki-e,var(--ki-c,currentColor))\"/></g><g filter=\"url(#sh-__K__)\"><g filter=\"url(#hi-__K__)\"><g data-n=\"b0\" transform=\"translate(4.2 -4.2) rotate(12 17 11)\"><path d=\"M12.8 9Q12.8 6.8 15 6.8L19 6.8Q21.2 6.8 21.2 9L21.2 13Q21.2 15.2 19 15.2L15 15.2Q12.8 15.2 12.8 13Z\" fill=\"none\" stroke-width=\"1\" data-under=\"1\" stroke=\"url(#upS-__K__)\"/><path d=\"M12.8 9Q12.8 6.8 15 6.8L19 6.8Q21.2 6.8 21.2 9L21.2 13Q21.2 15.2 19 15.2L15 15.2Q12.8 15.2 12.8 13Z\" fill=\"url(#upS-__K__)\" data-over=\"1\"/></g></g></g><g data-n=\"b0o\" transform=\"translate(4.2 -4.2) rotate(12 17 11)\"><path d=\"M12.8 9Q12.8 6.8 15 6.8L19 6.8Q21.2 6.8 21.2 9L21.2 13Q21.2 15.2 19 15.2L15 15.2Q12.8 15.2 12.8 13Z\" mask=\"url(#ol-__K__-1)\" fill=\"none\" stroke-width=\"2\" style=\"stroke:var(--ki-e,var(--ki-c,currentColor))\"/></g>",
  target: (h) => ({ k: h ? 0 : 1 }),
  draw(p, E) {
    const k = p.k;
    pose(
      E,
      "b",
      1,
      `translate(${f(4.2 * k)} ${f(-4.2 * k)}) rotate(${f(12 * k)} ${BLOCKS_X0 + 1.5 * BLOCKS_S} ${BLOCKS_Y0 + 0.5 * BLOCKS_S})`
    );
  },
};

export const layeredFolder: KubaiLayeredIcon = {
  name: "folder",
  style: "layered",
  viewBox: "0 -3 31 31",
  markup: "<defs><linearGradient id=\"loS-__K__\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 62.9%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 74.7%,#fff)\"/></linearGradient><linearGradient id=\"upS-__K__\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 29.6%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 47.9%,#fff)\"/></linearGradient><linearGradient id=\"lo-__K__-943\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 62.9%,#fff)\"/><stop offset=\"0.943\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 73.2%,#fff)\"/><stop offset=\"0.943\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 90.7%,#000)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 60.3%,#fff)\"/></linearGradient><linearGradient id=\"up-__K__-933\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 29.6%,#fff)\"/><stop offset=\"0.933\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 45.1%,#fff)\"/><stop offset=\"0.933\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 68.6%,#fff)\"/><stop offset=\"1\" style=\"stop-color:color-mix(in srgb,var(--ki-c,currentColor) 60.3%,#fff)\"/></linearGradient><filter id=\"sh-__K__\" x=\"-40%\" y=\"-40%\" width=\"180%\" height=\"190%\" color-interpolation-filters=\"sRGB\"><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"2\"/><feOffset dy=\"2\" result=\"o\"/><feFlood style=\"flood-color:color-mix(in srgb,var(--ki-c,currentColor) 67.8%,#fff)\" flood-opacity=\"0.21\"/><feComposite in2=\"o\" operator=\"in\"/><feMerge><feMergeNode/><feMergeNode in=\"SourceGraphic\"/></feMerge></filter><filter id=\"hi-__K__\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"130%\" color-interpolation-filters=\"sRGB\"><feColorMatrix in=\"SourceAlpha\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0\" result=\"a\"/><feOffset in=\"a\" dy=\"0.7\"/><feGaussianBlur stdDeviation=\"0.35\"/><feComposite in2=\"a\" operator=\"arithmetic\" k2=\"-1\" k3=\"1\"/><feColorMatrix type=\"matrix\" values=\"0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0\"/><feBlend in2=\"SourceGraphic\" mode=\"overlay\"/></filter><mask id=\"ol-__K__-0\" maskUnits=\"userSpaceOnUse\" x=\"-40\" y=\"-40\" width=\"111\" height=\"109\"><rect x=\"-40\" y=\"-40\" width=\"111\" height=\"109\" fill=\"#fff\"/><path d=\"M4 4.2Q4 2 6.2 2L9.8 2Q11.2 2 12.19 2.99L13.21 4.01Q14.2 5 15.6 5L24.8 5Q27 5 27 7.2L27 20.8Q27 23 24.8 23L6.2 23Q4 23 4 20.8Z\" fill=\"#000\"/></mask><mask id=\"ol-__K__-1\" maskUnits=\"userSpaceOnUse\" x=\"-40\" y=\"-40\" width=\"111\" height=\"109\"><rect x=\"-40\" y=\"-40\" width=\"111\" height=\"109\" fill=\"#fff\"/><path d=\"M4 7.2Q4 5 6.2 5L24.8 5Q27 5 27 7.2L27 20.8Q27 23 24.8 23L6.2 23Q4 23 4 20.8Z\" fill=\"#000\"/></mask></defs><path d=\"M4 4.2Q4 2 6.2 2L9.8 2Q11.2 2 12.19 2.99L13.21 4.01Q14.2 5 15.6 5L24.8 5Q27 5 27 7.2L27 20.8Q27 23 24.8 23L6.2 23Q4 23 4 20.8Z\" fill=\"none\" stroke-width=\"1\" data-under=\"0\" stroke=\"url(#lo-__K__-943)\"/><g filter=\"url(#sh-__K__)\"><path data-n=\"back\" fill=\"url(#lo-__K__-943)\" d=\"M4 4.2Q4 2 6.2 2L9.8 2Q11.2 2 12.19 2.99L13.21 4.01Q14.2 5 15.6 5L24.8 5Q27 5 27 7.2L27 20.8Q27 23 24.8 23L6.2 23Q4 23 4 20.8Z\" data-over=\"0\"/></g><path data-n=\"backO\" d=\"M4 4.2Q4 2 6.2 2L9.8 2Q11.2 2 12.19 2.99L13.21 4.01Q14.2 5 15.6 5L24.8 5Q27 5 27 7.2L27 20.8Q27 23 24.8 23L6.2 23Q4 23 4 20.8Z\" mask=\"url(#ol-__K__-0)\" fill=\"none\" stroke-width=\"2\" style=\"stroke:var(--ki-e,var(--ki-c,currentColor))\"/><g data-n=\"file\" transform=\"translate(7 9)\"><path d=\"M0 1Q0 0 1 0L16 0Q17 0 17 1L17 8Q17 9 16 9L1 9Q0 9 0 8Z\" fill=\"#fff\"/><path d=\"M5.5 2.3H11.5\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\" style=\"stroke:color-mix(in srgb,var(--ki-c,currentColor) 26.2%,#fff)\"/></g><path d=\"M4 7.2Q4 5 6.2 5L24.8 5Q27 5 27 7.2L27 20.8Q27 23 24.8 23L6.2 23Q4 23 4 20.8Z\" fill=\"none\" stroke-width=\"1\" data-under=\"1\" stroke=\"url(#up-__K__-933)\"/><g filter=\"url(#hi-__K__)\"><path data-n=\"front\" fill=\"url(#up-__K__-933)\" d=\"M4 7.2Q4 5 6.2 5L24.8 5Q27 5 27 7.2L27 20.8Q27 23 24.8 23L6.2 23Q4 23 4 20.8Z\" data-over=\"1\"/></g><path data-n=\"frontO\" d=\"M4 7.2Q4 5 6.2 5L24.8 5Q27 5 27 7.2L27 20.8Q27 23 24.8 23L6.2 23Q4 23 4 20.8Z\" mask=\"url(#ol-__K__-1)\" fill=\"none\" stroke-width=\"2\" style=\"stroke:var(--ki-e,var(--ki-c,currentColor))\"/>",
  target: (h) => ({
    back: h
      ? [
          [4, 3],
          [11.2, 3],
          [14.2, 6],
          [27, 6],
          [27.6, 23],
          [4.6, 23],
        ]
      : [
          [4, 2],
          [11.2, 2],
          [14.2, 5],
          [27, 5],
          [27, 23],
          [4, 23],
        ],
    fx: h ? 7.9 : 7,
    front: h
      ? [
          [6.8, 13],
          [29.3, 13],
          [27.6, 23],
          [5.4, 23],
        ]
      : [
          [4, 5],
          [27, 5],
          [27, 23],
          [4, 23],
        ],
    fr: h ? 1.8 : KR,
  }),
  draw(p, E) {
    const b = rp(p.back, FOLDER_BACK_R);
    const fr = rp(p.front, p.fr);
    at(E.back, { d: b });
    at(E.backO, { d: b });
    at(E.file, { transform: `translate(${f(p.fx)} 9)` });
    at(E.front, { d: fr });
    at(E.frontO, { d: fr });
  },
};

// ============================================================================
// Line Solid-Tint Icons (面性填充 — 24x24 grid, crisp line + 20% soft fill)
// ============================================================================

export const duoUsers: KubaiLineIcon = {
  name: "users",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<defs><mask id=\"__K__-t0\" maskUnits=\"userSpaceOnUse\" x=\"-6\" y=\"-6\" width=\"36\" height=\"36\"><rect x=\"-6\" y=\"-6\" width=\"36\" height=\"36\" fill=\"#fff\"/><g data-l=\"head1\"><path d=\"M5.25 8.25A3.25 3.25 0 1 1 11.75 8.25A3.25 3.25 0 1 1 5.25 8.25Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"5.5\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"body1\"><path d=\"M3 18.2C3 16.433 4.433 15 6.2 15L10.8 15C12.567 15 14 16.433 14 18.2L14 18.2C14 18.642 13.642 19 13.2 19L3.8 19C3.358 19 3 18.642 3 18.2Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"5.5\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></mask><mask id=\"__K__-m0\" maskUnits=\"userSpaceOnUse\" x=\"-6\" y=\"-6\" width=\"36\" height=\"36\"><rect x=\"-6\" y=\"-6\" width=\"36\" height=\"36\" fill=\"#fff\"/><g data-l=\"head1\"><path d=\"M5.25 8.25A3.25 3.25 0 1 1 11.75 8.25A3.25 3.25 0 1 1 5.25 8.25Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"5.5\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"body1\"><path d=\"M3 18.2C3 16.433 4.433 15 6.2 15L10.8 15C12.567 15 14 16.433 14 18.2L14 18.2C14 18.642 13.642 19 13.2 19L3.8 19C3.358 19 3 18.642 3 18.2Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"5.5\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></mask><mask id=\"__K__-t1\" maskUnits=\"userSpaceOnUse\" x=\"-6\" y=\"-6\" width=\"36\" height=\"36\"><rect x=\"-6\" y=\"-6\" width=\"36\" height=\"36\" fill=\"#fff\"/><g data-l=\"head1\"><path d=\"M5.25 8.25A3.25 3.25 0 1 1 11.75 8.25A3.25 3.25 0 1 1 5.25 8.25Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"5.5\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"body1\"><path d=\"M3 18.2C3 16.433 4.433 15 6.2 15L10.8 15C12.567 15 14 16.433 14 18.2L14 18.2C14 18.642 13.642 19 13.2 19L3.8 19C3.358 19 3 18.642 3 18.2Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"5.5\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></mask><mask id=\"__K__-m1\" maskUnits=\"userSpaceOnUse\" x=\"-6\" y=\"-6\" width=\"36\" height=\"36\"><rect x=\"-6\" y=\"-6\" width=\"36\" height=\"36\" fill=\"#fff\"/><g data-l=\"head1\"><path d=\"M5.25 8.25A3.25 3.25 0 1 1 11.75 8.25A3.25 3.25 0 1 1 5.25 8.25Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"5.5\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"body1\"><path d=\"M3 18.2C3 16.433 4.433 15 6.2 15L10.8 15C12.567 15 14 16.433 14 18.2L14 18.2C14 18.642 13.642 19 13.2 19L3.8 19C3.358 19 3 18.642 3 18.2Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"5.5\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></mask><mask id=\"__K__-t2\" maskUnits=\"userSpaceOnUse\" x=\"-6\" y=\"-6\" width=\"36\" height=\"36\"><rect x=\"-6\" y=\"-6\" width=\"36\" height=\"36\" fill=\"#fff\"/><g data-l=\"body1\"><path d=\"M3 18.2C3 16.433 4.433 15 6.2 15L10.8 15C12.567 15 14 16.433 14 18.2L14 18.2C14 18.642 13.642 19 13.2 19L3.8 19C3.358 19 3 18.642 3 18.2Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"5.5\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></mask><mask id=\"__K__-m2\" maskUnits=\"userSpaceOnUse\" x=\"-6\" y=\"-6\" width=\"36\" height=\"36\"><rect x=\"-6\" y=\"-6\" width=\"36\" height=\"36\" fill=\"#fff\"/><g data-l=\"body1\"><path d=\"M3 18.2C3 16.433 4.433 15 6.2 15L10.8 15C12.567 15 14 16.433 14 18.2L14 18.2C14 18.642 13.642 19 13.2 19L3.8 19C3.358 19 3 18.642 3 18.2Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"5.5\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></mask></defs><g data-l=\"all\"><g mask=\"url(#__K__-t0)\"><g data-l=\"head2\"><path d=\"M14.15 7.6A2.6 2.6 0 1 1 19.35 7.6A2.6 2.6 0 1 1 14.15 7.6Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g></g><g mask=\"url(#__K__-t1)\"><g data-l=\"body2\"><path d=\"M14 18C14 16.343 15.343 15 17 15L18 15C19.657 15 21 16.343 21 18L21 18C21 18.552 20.552 19 20 19L15 19C14.448 19 14 18.552 14 18Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g></g><g mask=\"url(#__K__-t2)\"><g data-l=\"head1\"><path d=\"M5.25 8.25A3.25 3.25 0 1 1 11.75 8.25A3.25 3.25 0 1 1 5.25 8.25Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g></g><g data-l=\"body1\"><path d=\"M3 18.2C3 16.433 4.433 15 6.2 15L10.8 15C12.567 15 14 16.433 14 18.2L14 18.2C14 18.642 13.642 19 13.2 19L3.8 19C3.358 19 3 18.642 3 18.2Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g mask=\"url(#__K__-m0)\"><g data-l=\"head2\"><path d=\"M14.15 7.6A2.6 2.6 0 1 1 19.35 7.6A2.6 2.6 0 1 1 14.15 7.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g><g mask=\"url(#__K__-m1)\"><g data-l=\"body2\"><path d=\"M14 18C14 16.343 15.343 15 17 15L18 15C19.657 15 21 16.343 21 18L21 18C21 18.552 20.552 19 20 19L15 19C14.448 19 14 18.552 14 18Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g><g mask=\"url(#__K__-m2)\"><g data-l=\"head1\"><path d=\"M5.25 8.25A3.25 3.25 0 1 1 11.75 8.25A3.25 3.25 0 1 1 5.25 8.25Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g><g data-l=\"body1\"><path d=\"M3 18.2C3 16.433 4.433 15 6.2 15L10.8 15C12.567 15 14 16.433 14 18.2L14 18.2C14 18.642 13.642 19 13.2 19L3.8 19C3.358 19 3 18.642 3 18.2Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"bounce","on":[["head2","body2"],["head1","body1"]],"by":true,"o":[12,20],"amp":1.2},
  tap: false,
};

export const duoBot: KubaiLineIcon = {
  name: "bot",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"head\"><path d=\"M5 14C5 12.171 5 10.757 5.879 9.879C6.757 9 8.171 9 10 9L14 9C15.829 9 17.243 9 18.121 9.879C19 10.757 19 12.171 19 14L19 14C19 15.829 19 17.243 18.121 18.121C17.243 19 15.829 19 14 19L10 19C8.171 19 6.757 19 5.879 18.121C5 17.243 5 15.829 5 14Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"antenna\"><path d=\"M12 4L12 8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"tip\"><path d=\"M10.4 3.6A1.6 1.6 0 1 1 13.6 3.6A1.6 1.6 0 1 1 10.4 3.6Z\" fill=\"currentColor\"/></g><g data-l=\"ears\"><path d=\"M3 14L4 14M20 14L21 14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"head\"><path d=\"M5 14C5 12.171 5 10.757 5.879 9.879C6.757 9 8.171 9 10 9L14 9C15.829 9 17.243 9 18.121 9.879C19 10.757 19 12.171 19 14L19 14C19 15.829 19 17.243 18.121 18.121C17.243 19 15.829 19 14 19L10 19C8.171 19 6.757 19 5.879 18.121C5 17.243 5 15.829 5 14Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"eyes\"><path d=\"M9 13L9 15M15 13L15 15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"keys","on":["eyes"],"o":[12,14],"sy":[0.1,1,0.1],"ms":420},
  tap: false,
};

export const duoSettings: KubaiLineIcon = {
  name: "settings",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<defs><mask id=\"__K__-t0\" maskUnits=\"userSpaceOnUse\" x=\"-6\" y=\"-6\" width=\"36\" height=\"36\"><rect x=\"-6\" y=\"-6\" width=\"36\" height=\"36\" fill=\"#fff\"/><g data-l=\"hole\"><path d=\"M9.375 12A2.625 2.625 0 1 1 14.625 12A2.625 2.625 0 1 1 9.375 12Z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"2\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></mask></defs><g data-l=\"all\"><g mask=\"url(#__K__-t0)\"><g data-l=\"gear\"><path d=\"M9.479 5.914C9.336 5.973 9.191 5.833 9.245 5.688L9.898 3.942C9.968 3.756 10.103 3.392 10.386 3.196C10.669 3 11.057 3 11.255 3L12.745 3C12.943 3 13.331 3 13.614 3.196C13.897 3.392 14.032 3.756 14.102 3.942L14.755 5.688C14.809 5.833 14.664 5.973 14.521 5.914L14.521 5.914C14.378 5.855 14.374 5.653 14.515 5.589L16.212 4.816C16.393 4.733 16.745 4.572 17.084 4.634C17.423 4.695 17.697 4.969 17.837 5.11L18.89 6.163C19.031 6.303 19.305 6.577 19.366 6.916C19.428 7.255 19.267 7.607 19.184 7.788L18.411 9.485C18.347 9.626 18.145 9.622 18.086 9.479L18.086 9.479C18.027 9.336 18.167 9.191 18.312 9.245L20.058 9.898C20.244 9.968 20.608 10.103 20.804 10.386C21 10.669 21 11.057 21 11.255L21 12.745C21 12.943 21 13.331 20.804 13.614C20.608 13.897 20.244 14.032 20.058 14.102L18.312 14.755C18.167 14.809 18.027 14.664 18.086 14.521L18.086 14.521C18.145 14.378 18.347 14.374 18.411 14.515L19.184 16.212C19.267 16.393 19.428 16.745 19.366 17.084C19.305 17.423 19.031 17.697 18.89 17.837L17.837 18.89C17.697 19.031 17.423 19.305 17.084 19.366C16.745 19.428 16.393 19.267 16.212 19.184L14.515 18.411C14.374 18.347 14.378 18.145 14.521 18.086L14.521 18.086C14.664 18.027 14.809 18.167 14.755 18.312L14.102 20.058C14.032 20.244 13.897 20.608 13.614 20.804C13.331 21 12.943 21 12.745 21L11.255 21C11.057 21 10.669 21 10.386 20.804C10.103 20.608 9.968 20.244 9.898 20.058L9.245 18.312C9.191 18.167 9.336 18.027 9.479 18.086L9.479 18.086C9.622 18.145 9.626 18.347 9.485 18.411L7.788 19.184C7.607 19.267 7.255 19.428 6.916 19.366C6.577 19.305 6.303 19.031 6.163 18.89L5.11 17.837C4.969 17.697 4.695 17.423 4.634 17.084C4.572 16.745 4.733 16.393 4.816 16.212L5.589 14.515C5.653 14.374 5.855 14.378 5.914 14.521L5.914 14.521C5.973 14.664 5.833 14.809 5.688 14.755L3.942 14.102C3.756 14.032 3.392 13.897 3.196 13.614C3 13.331 3 12.943 3 12.745L3 11.255C3 11.057 3 10.669 3.196 10.386C3.392 10.103 3.756 9.968 3.942 9.898L5.688 9.245C5.833 9.191 5.973 9.336 5.914 9.479L5.914 9.479C5.855 9.622 5.653 9.626 5.589 9.485L4.816 7.788C4.733 7.607 4.572 7.255 4.634 6.916C4.695 6.577 4.969 6.303 5.11 6.163L6.163 5.11C6.303 4.969 6.577 4.695 6.916 4.634C7.255 4.572 7.607 4.733 7.788 4.816L9.485 5.589C9.626 5.653 9.622 5.855 9.479 5.914Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g></g><g data-l=\"gear\"><path d=\"M9.479 5.914C9.336 5.973 9.191 5.833 9.245 5.688L9.898 3.942C9.968 3.756 10.103 3.392 10.386 3.196C10.669 3 11.057 3 11.255 3L12.745 3C12.943 3 13.331 3 13.614 3.196C13.897 3.392 14.032 3.756 14.102 3.942L14.755 5.688C14.809 5.833 14.664 5.973 14.521 5.914L14.521 5.914C14.378 5.855 14.374 5.653 14.515 5.589L16.212 4.816C16.393 4.733 16.745 4.572 17.084 4.634C17.423 4.695 17.697 4.969 17.837 5.11L18.89 6.163C19.031 6.303 19.305 6.577 19.366 6.916C19.428 7.255 19.267 7.607 19.184 7.788L18.411 9.485C18.347 9.626 18.145 9.622 18.086 9.479L18.086 9.479C18.027 9.336 18.167 9.191 18.312 9.245L20.058 9.898C20.244 9.968 20.608 10.103 20.804 10.386C21 10.669 21 11.057 21 11.255L21 12.745C21 12.943 21 13.331 20.804 13.614C20.608 13.897 20.244 14.032 20.058 14.102L18.312 14.755C18.167 14.809 18.027 14.664 18.086 14.521L18.086 14.521C18.145 14.378 18.347 14.374 18.411 14.515L19.184 16.212C19.267 16.393 19.428 16.745 19.366 17.084C19.305 17.423 19.031 17.697 18.89 17.837L17.837 18.89C17.697 19.031 17.423 19.305 17.084 19.366C16.745 19.428 16.393 19.267 16.212 19.184L14.515 18.411C14.374 18.347 14.378 18.145 14.521 18.086L14.521 18.086C14.664 18.027 14.809 18.167 14.755 18.312L14.102 20.058C14.032 20.244 13.897 20.608 13.614 20.804C13.331 21 12.943 21 12.745 21L11.255 21C11.057 21 10.669 21 10.386 20.804C10.103 20.608 9.968 20.244 9.898 20.058L9.245 18.312C9.191 18.167 9.336 18.027 9.479 18.086L9.479 18.086C9.622 18.145 9.626 18.347 9.485 18.411L7.788 19.184C7.607 19.267 7.255 19.428 6.916 19.366C6.577 19.305 6.303 19.031 6.163 18.89L5.11 17.837C4.969 17.697 4.695 17.423 4.634 17.084C4.572 16.745 4.733 16.393 4.816 16.212L5.589 14.515C5.653 14.374 5.855 14.378 5.914 14.521L5.914 14.521C5.973 14.664 5.833 14.809 5.688 14.755L3.942 14.102C3.756 14.032 3.392 13.897 3.196 13.614C3 13.331 3 12.943 3 12.745L3 11.255C3 11.057 3 10.669 3.196 10.386C3.392 10.103 3.756 9.968 3.942 9.898L5.688 9.245C5.833 9.191 5.973 9.336 5.914 9.479L5.914 9.479C5.855 9.622 5.653 9.626 5.589 9.485L4.816 7.788C4.733 7.607 4.572 7.255 4.634 6.916C4.695 6.577 4.969 6.303 5.11 6.163L6.163 5.11C6.303 4.969 6.577 4.695 6.916 4.634C7.255 4.572 7.607 4.733 7.788 4.816L9.485 5.589C9.626 5.653 9.622 5.855 9.479 5.914Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"hole\"><path d=\"M9.375 12A2.625 2.625 0 1 1 14.625 12A2.625 2.625 0 1 1 9.375 12Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"rotate","on":"all","deg":90},
  tap: false,
};

export const duoFolder: KubaiLineIcon = {
  name: "folder",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"folder\"><path d=\"M3 7.7C3 6.585 3 5.879 3.439 5.439C3.879 5 4.585 5 5.7 5L7.923 5C8.45 5 8.825 5 9.123 5.151C9.422 5.302 9.643 5.605 9.955 6.03L10.915 7.338C11.115 7.611 11.257 7.806 11.449 7.903C11.641 8 11.882 8 12.221 8L16.5 8C18.357 8 19.536 8 20.268 8.732C21 9.464 21 10.643 21 12.5L21 13.6C21 15.829 21 17.243 20.121 18.121C19.243 19 17.829 19 15.6 19L8.4 19C6.171 19 4.757 19 3.879 18.121C3 17.243 3 15.829 3 13.6Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"folder\"><path d=\"M3 7.7C3 6.585 3 5.879 3.439 5.439C3.879 5 4.585 5 5.7 5L7.923 5C8.45 5 8.825 5 9.123 5.151C9.422 5.302 9.643 5.605 9.955 6.03L10.915 7.338C11.115 7.611 11.257 7.806 11.449 7.903C11.641 8 11.882 8 12.221 8L16.5 8C18.357 8 19.536 8 20.268 8.732C21 9.464 21 10.643 21 12.5L21 13.6C21 15.829 21 17.243 20.121 18.121C19.243 19 17.829 19 15.6 19L8.4 19C6.171 19 4.757 19 3.879 18.121C3 17.243 3 15.829 3 13.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"front\"><path d=\"M7.4 12L16.6 12\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"bounce","on":"all","o":[12,20]},
  tap: false,
};

export const duoFolderOpen: KubaiLineIcon = {
  name: "folder-open",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"folder\"><path d=\"M3 7.7C3 6.585 3 5.879 3.439 5.439C3.879 5 4.585 5 5.7 5L7.923 5C8.45 5 8.825 5 9.123 5.151C9.422 5.302 9.643 5.605 9.955 6.03L10.915 7.338C11.115 7.611 11.257 7.806 11.449 7.903C11.641 8 11.882 8 12.221 8L15.4 8C16.886 8 17.828 8 18.414 8.586C19 9.172 19 10.114 19 11.6L19 12L19.219 12C19.954 12 20.392 12 20.633 12.297C20.873 12.594 20.781 13.023 20.627 13.742L20.034 16.51C19.813 17.538 19.667 18.222 19.185 18.611C18.704 19 18.005 19 16.953 19L8.4 19C6.171 19 4.757 19 3.879 18.121C3 17.243 3 15.829 3 13.6Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"folder\"><path d=\"M3 7.7C3 6.585 3 5.879 3.439 5.439C3.879 5 4.585 5 5.7 5L7.923 5C8.45 5 8.825 5 9.123 5.151C9.422 5.302 9.643 5.605 9.955 6.03L10.915 7.338C11.115 7.611 11.257 7.806 11.449 7.903C11.641 8 11.882 8 12.221 8L15.4 8C16.886 8 17.828 8 18.414 8.586C19 9.172 19 10.114 19 11.6L19 12L19.219 12C19.954 12 20.392 12 20.633 12.297C20.873 12.594 20.781 13.023 20.627 13.742L20.034 16.51C19.813 17.538 19.667 18.222 19.185 18.611C18.704 19 18.005 19 16.953 19L8.4 19C6.171 19 4.757 19 3.879 18.121C3 17.243 3 15.829 3 13.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"front\"><path d=\"M19 12H7.5L6 19\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"bounce","on":"all","o":[12,20]},
  tap: false,
};

export const duoFileCode: KubaiLineIcon = {
  name: "file-code",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"page\"><path d=\"M5 8.4C5 6.171 5 4.757 5.879 3.879C6.757 3 8.171 3 10.4 3L13.6 3C15.829 3 17.243 3 18.121 3.879C19 4.757 19 6.171 19 8.4L19 15.6C19 17.829 19 19.243 18.121 20.121C17.243 21 15.829 21 13.6 21L10.4 21C8.171 21 6.757 21 5.879 20.121C5 19.243 5 17.829 5 15.6Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"page\"><path d=\"M5 8.4C5 6.171 5 4.757 5.879 3.879C6.757 3 8.171 3 10.4 3L13.6 3C15.829 3 17.243 3 18.121 3.879C19 4.757 19 6.171 19 8.4L19 15.6C19 17.829 19 19.243 18.121 20.121C17.243 21 15.829 21 13.6 21L10.4 21C8.171 21 6.757 21 5.879 20.121C5 19.243 5 17.829 5 15.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"lt\"><path d=\"M10.25 9L8.5 12L10.25 15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"gt\"><path d=\"M13.75 9L15.5 12L13.75 15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: [{"t":"keys","on":["lt"],"x":[-0.8,0.2]},{"t":"keys","on":["gt"],"x":[0.8,-0.2]}],
  tap: false,
};

export const duoFileText: KubaiLineIcon = {
  name: "file-text",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"page\"><path d=\"M5 8.4C5 6.171 5 4.757 5.879 3.879C6.757 3 8.171 3 10.4 3L13.6 3C15.829 3 17.243 3 18.121 3.879C19 4.757 19 6.171 19 8.4L19 15.6C19 17.829 19 19.243 18.121 20.121C17.243 21 15.829 21 13.6 21L10.4 21C8.171 21 6.757 21 5.879 20.121C5 19.243 5 17.829 5 15.6Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"page\"><path d=\"M5 8.4C5 6.171 5 4.757 5.879 3.879C6.757 3 8.171 3 10.4 3L13.6 3C15.829 3 17.243 3 18.121 3.879C19 4.757 19 6.171 19 8.4L19 15.6C19 17.829 19 19.243 18.121 20.121C17.243 21 15.829 21 13.6 21L10.4 21C8.171 21 6.757 21 5.879 20.121C5 19.243 5 17.829 5 15.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"l1\"><path d=\"M9 8L15 8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"l2\"><path d=\"M9 12L15 12\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"l3\"><path d=\"M9 16L12.3 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"draw","on":["l1","l2","l3"]},
  tap: false,
};

export const duoFileImage: KubaiLineIcon = {
  name: "file-image",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<defs><mask id=\"__K__-t0\" maskUnits=\"userSpaceOnUse\" x=\"-6\" y=\"-6\" width=\"36\" height=\"36\"><rect x=\"-6\" y=\"-6\" width=\"36\" height=\"36\" fill=\"#fff\"/><g data-l=\"sun\"><path d=\"M7.92 9A1.68 1.68 0 1 1 11.28 9A1.68 1.68 0 1 1 7.92 9Z\" fill=\"#000\"/></g></mask></defs><g data-l=\"all\"><g mask=\"url(#__K__-t0)\"><g data-l=\"page\"><path d=\"M5 8.4C5 6.171 5 4.757 5.879 3.879C6.757 3 8.171 3 10.4 3L13.6 3C15.829 3 17.243 3 18.121 3.879C19 4.757 19 6.171 19 8.4L19 15.6C19 17.829 19 19.243 18.121 20.121C17.243 21 15.829 21 13.6 21L10.4 21C8.171 21 6.757 21 5.879 20.121C5 19.243 5 17.829 5 15.6Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g></g><g data-l=\"page\"><path d=\"M5 8.4C5 6.171 5 4.757 5.879 3.879C6.757 3 8.171 3 10.4 3L13.6 3C15.829 3 17.243 3 18.121 3.879C19 4.757 19 6.171 19 8.4L19 15.6C19 17.829 19 19.243 18.121 20.121C17.243 21 15.829 21 13.6 21L10.4 21C8.171 21 6.757 21 5.879 20.121C5 19.243 5 17.829 5 15.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"hill\"><path d=\"M9.002 21A12.11 12.11 0 0 1 19 14.001\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"sun\"><path d=\"M7.92 9A1.68 1.68 0 1 1 11.28 9A1.68 1.68 0 1 1 7.92 9Z\" fill=\"currentColor\"/></g></g>",
  fx: {"t":"keys","on":["sun"],"y":[3,3,0],"a":[0,0,1]},
  tap: false,
};

export const duoFileDiff: KubaiLineIcon = {
  name: "file-diff",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"page\"><path d=\"M5 8.4C5 6.171 5 4.757 5.879 3.879C6.757 3 8.171 3 10.4 3L13.6 3C15.829 3 17.243 3 18.121 3.879C19 4.757 19 6.171 19 8.4L19 15.6C19 17.829 19 19.243 18.121 20.121C17.243 21 15.829 21 13.6 21L10.4 21C8.171 21 6.757 21 5.879 20.121C5 19.243 5 17.829 5 15.6Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"page\"><path d=\"M5 8.4C5 6.171 5 4.757 5.879 3.879C6.757 3 8.171 3 10.4 3L13.6 3C15.829 3 17.243 3 18.121 3.879C19 4.757 19 6.171 19 8.4L19 15.6C19 17.829 19 19.243 18.121 20.121C17.243 21 15.829 21 13.6 21L10.4 21C8.171 21 6.757 21 5.879 20.121C5 19.243 5 17.829 5 15.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"plus\"><path d=\"M9 10L15 10M12 7L12 13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"minus\"><path d=\"M9 17L15 17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"draw","on":["plus","minus"]},
  tap: false,
};

export const duoFile: KubaiLineIcon = {
  name: "file",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"page\"><path d=\"M5 8.4C5 6.171 5 4.757 5.879 3.879C6.757 3 8.171 3 10.4 3L13.6 3C15.829 3 17.243 3 18.121 3.879C19 4.757 19 6.171 19 8.4L19 15.6C19 17.829 19 19.243 18.121 20.121C17.243 21 15.829 21 13.6 21L10.4 21C8.171 21 6.757 21 5.879 20.121C5 19.243 5 17.829 5 15.6Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"page\"><path d=\"M5 8.4C5 6.171 5 4.757 5.879 3.879C6.757 3 8.171 3 10.4 3L13.6 3C15.829 3 17.243 3 18.121 3.879C19 4.757 19 6.171 19 8.4L19 15.6C19 17.829 19 19.243 18.121 20.121C17.243 21 15.829 21 13.6 21L10.4 21C8.171 21 6.757 21 5.879 20.121C5 19.243 5 17.829 5 15.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"bounce","on":"all","o":[12,22],"amp":0.9},
  tap: false,
};

export const duoBraces: KubaiLineIcon = {
  name: "braces",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"left\"><path d=\"M10 4H9A2 2 0 0 0 7 6V9A3 3 0 0 1 4 12A3 3 0 0 1 7 15V18A2 2 0 0 0 9 20H10\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"right\"><path d=\"M14 4H15A2 2 0 0 1 17 6V9A3 3 0 0 0 20 12A3 3 0 0 0 17 15V18A2 2 0 0 1 15 20H14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: [{"t":"keys","on":["left"],"x":[-1.2,0.2],"ms":300},{"t":"keys","on":["right"],"x":[1.2,-0.2],"ms":300}],
  tap: false,
};

export const duoTerminal: KubaiLineIcon = {
  name: "terminal",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"window\"><path d=\"M3 10.4C3 8.171 3 6.757 3.879 5.879C4.757 5 6.171 5 8.4 5L15.6 5C17.829 5 19.243 5 20.121 5.879C21 6.757 21 8.171 21 10.4L21 13.6C21 15.829 21 17.243 20.121 18.121C19.243 19 17.829 19 15.6 19L8.4 19C6.171 19 4.757 19 3.879 18.121C3 17.243 3 15.829 3 13.6Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"window\"><path d=\"M3 10.4C3 8.171 3 6.757 3.879 5.879C4.757 5 6.171 5 8.4 5L15.6 5C17.829 5 19.243 5 20.121 5.879C21 6.757 21 8.171 21 10.4L21 13.6C21 15.829 21 17.243 20.121 18.121C19.243 19 17.829 19 15.6 19L8.4 19C6.171 19 4.757 19 3.879 18.121C3 17.243 3 15.829 3 13.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"prompt\"><path d=\"M7 9L10 12L7 15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"cursor\"><path d=\"M12.5 15L16.5 15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"keys","on":["cursor"],"a":[0,1,0,1],"ms":720},
  tap: false,
};

export const duoSearch: KubaiLineIcon = {
  name: "search",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"lens\"><path d=\"M4 10A6 6 0 1 1 16 10A6 6 0 1 1 4 10Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"lens\"><path d=\"M4 10A6 6 0 1 1 16 10A6 6 0 1 1 4 10Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"handle\"><path d=\"M14.243 14.243L20 20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"orbit","on":"all","R":0.9},
  tap: false,
};

export const duoGlobe: KubaiLineIcon = {
  name: "globe",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"ring\"><path d=\"M3 12A9 9 0 1 1 21 12A9 9 0 1 1 3 12Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"ring\"><path d=\"M3 12A9 9 0 1 1 21 12A9 9 0 1 1 3 12Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"west\"><path d=\"M12 3A4.6 9 0 0 0 12 21\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"east\"><path d=\"M12 3A4.6 9 0 0 1 12 21\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"equator\"><path d=\"M3 12L21 12\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"back\" opacity=\"0\"><path d=\"M12 3A8.993 9 0 0 0 12 21\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"turn","on":["west","east","back"],"at":[-30.74,30.74,-92.22],"step":61.48,"ms":900,"o":[12,12],"edge":[66,90],"fill":{"edge":[38,54]}},
  tap: false,
};

export const duoSparkles: KubaiLineIcon = {
  name: "sparkles",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"big\"><path d=\"M9.441 8.114C10.084 5.831 10.319 5 11 5C11.681 5 11.916 5.831 12.559 8.114L13.154 10.224C13.211 10.424 13.25 10.565 13.343 10.657C13.435 10.75 13.576 10.789 13.776 10.846L15.886 11.441C18.169 12.084 19 12.319 19 13C19 13.681 18.169 13.916 15.886 14.559L13.776 15.154C13.576 15.211 13.435 15.25 13.343 15.343C13.25 15.435 13.211 15.576 13.154 15.776L12.559 17.886C11.916 20.169 11.681 21 11 21C10.319 21 10.084 20.169 9.441 17.886L8.846 15.776C8.789 15.576 8.75 15.435 8.657 15.343C8.565 15.25 8.424 15.211 8.224 15.154L6.114 14.559C3.831 13.916 3 13.681 3 13C3 12.319 3.831 12.084 6.114 11.441L8.224 10.846C8.424 10.789 8.565 10.75 8.657 10.657C8.75 10.565 8.789 10.424 8.846 10.224Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"big\"><path d=\"M9.441 8.114C10.084 5.831 10.319 5 11 5C11.681 5 11.916 5.831 12.559 8.114L13.154 10.224C13.211 10.424 13.25 10.565 13.343 10.657C13.435 10.75 13.576 10.789 13.776 10.846L15.886 11.441C18.169 12.084 19 12.319 19 13C19 13.681 18.169 13.916 15.886 14.559L13.776 15.154C13.576 15.211 13.435 15.25 13.343 15.343C13.25 15.435 13.211 15.576 13.154 15.776L12.559 17.886C11.916 20.169 11.681 21 11 21C10.319 21 10.084 20.169 9.441 17.886L8.846 15.776C8.789 15.576 8.75 15.435 8.657 15.343C8.565 15.25 8.424 15.211 8.224 15.154L6.114 14.559C3.831 13.916 3 13.681 3 13C3 12.319 3.831 12.084 6.114 11.441L8.224 10.846C8.424 10.789 8.565 10.75 8.657 10.657C8.75 10.565 8.789 10.424 8.846 10.224Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"small\"><path d=\"M18.396 3.148C18.646 2.314 18.739 2 19 2C19.261 2 19.354 2.314 19.604 3.148L19.835 3.923C19.858 4 19.875 4.054 19.91 4.09C19.946 4.125 20 4.142 20.077 4.165L20.852 4.396C21.686 4.646 22 4.739 22 5C22 5.261 21.686 5.354 20.852 5.604L20.077 5.835C20 5.858 19.946 5.875 19.91 5.91C19.875 5.946 19.858 6 19.835 6.077L19.604 6.852C19.354 7.686 19.261 8 19 8C18.739 8 18.646 7.686 18.396 6.852L18.165 6.077C18.142 6 18.125 5.946 18.09 5.91C18.054 5.875 18 5.858 17.923 5.835L17.148 5.604C16.314 5.354 16 5.261 16 5C16 4.739 16.314 4.646 17.148 4.396L17.923 4.165C18 4.142 18.054 4.125 18.09 4.09C18.125 4.054 18.142 4 18.165 3.923Z\" fill=\"currentColor\"/></g></g>",
  fx: [{"t":"keys","on":["big"],"o":[11,13],"s":[0.82,1.05]},{"t":"keys","on":["small"],"o":[19,5],"s":[1.3,0.6],"ms":380}],
  tap: false,
};

export const duoShield: KubaiLineIcon = {
  name: "shield",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"shield\"><path d=\"M5 6A3 3 0 0 1 8 3H16A3 3 0 0 1 19 6V11.5A9.946 9.946 0 0 1 12 21A9.946 9.946 0 0 1 5 11.5Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"shield\"><path d=\"M5 6A3 3 0 0 1 8 3H16A3 3 0 0 1 19 6V11.5A9.946 9.946 0 0 1 12 21A9.946 9.946 0 0 1 5 11.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"keys","on":"all","o":[12,12],"s":[0.88,1.05],"ms":300},
  tap: false,
};

export const duoShieldCheck: KubaiLineIcon = {
  name: "shield-check",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"shield\"><path d=\"M5 6A3 3 0 0 1 8 3H16A3 3 0 0 1 19 6V11.5A9.946 9.946 0 0 1 12 21A9.946 9.946 0 0 1 5 11.5Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"shield\"><path d=\"M5 6A3 3 0 0 1 8 3H16A3 3 0 0 1 19 6V11.5A9.946 9.946 0 0 1 12 21A9.946 9.946 0 0 1 5 11.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"check\"><path d=\"M8.75 11.5L11 13.75L15.25 9.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"draw","on":["check"]},
  tap: false,
};

export const duoZap: KubaiLineIcon = {
  name: "zap",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"bolt\"><path d=\"M13.25 6.905C13.452 4.405 13.528 3.469 12.832 3.2C12.135 2.931 11.562 3.675 10.031 5.66L5.836 11.101C4.913 12.298 4.462 12.882 4.736 13.441C5.011 14 5.75 14 7.261 14L11 14L10.75 17.095C10.548 19.595 10.472 20.531 11.168 20.8C11.865 21.069 12.438 20.325 13.969 18.34L18.164 12.899C19.087 11.702 19.538 11.118 19.264 10.559C18.989 10 18.25 10 16.739 10L13 10Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"bolt\"><path d=\"M13.25 6.905C13.452 4.405 13.528 3.469 12.832 3.2C12.135 2.931 11.562 3.675 10.031 5.66L5.836 11.101C4.913 12.298 4.462 12.882 4.736 13.441C5.011 14 5.75 14 7.261 14L11 14L10.75 17.095C10.548 19.595 10.472 20.531 11.168 20.8C11.865 21.069 12.438 20.325 13.969 18.34L18.164 12.899C19.087 11.702 19.538 11.118 19.264 10.559C18.989 10 18.25 10 16.739 10L13 10Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"keys","on":"all","a":[0.15,1,0.15,1],"s":[1.05],"o":[12,12],"ms":520},
  tap: false,
};

export const duoTrash: KubaiLineIcon = {
  name: "trash",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"can\"><path d=\"M6 10H18V18.75A2.25 2.25 0 0 1 15.75 21H8.25A2.25 2.25 0 0 1 6 18.75Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"can\"><path d=\"M6 10V18.75A2.25 2.25 0 0 0 8.25 21H15.75A2.25 2.25 0 0 0 18 18.75V10\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"r1\"><path d=\"M10 12.9L10 17.3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"r2\"><path d=\"M14 12.9L14 17.3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"lid\"><path d=\"M9 6V4A1 1 0 0 1 10 3H14A1 1 0 0 1 15 4V6M5 6L19 6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"keys","on":["lid"],"o":[19.5,6.1],"y":[-1.6,-1.3],"r":[-12,-10]},
  tap: false,
};

export const duoListChecks: KubaiLineIcon = {
  name: "list-checks",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"c1\"><path d=\"M4 7L5.7 8.7L8.4 4.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"c2\"><path d=\"M4 17L5.7 18.7L8.4 14.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"l0\"><path d=\"M12 4L20 4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"l1\"><path d=\"M12 9L20 9\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"l2\"><path d=\"M12 14L20 14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"l3\"><path d=\"M12 19L20 19\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"draw","on":["c1","c2"],"stagger":220},
  tap: false,
};

export const duoGitBranch: KubaiLineIcon = {
  name: "git-branch",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"n1\"><path d=\"M15.75 6.5A2.25 2.25 0 1 1 20.25 6.5A2.25 2.25 0 1 1 15.75 6.5Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"n2\"><path d=\"M3.75 18.5A2.25 2.25 0 1 1 8.25 18.5A2.25 2.25 0 1 1 3.75 18.5Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"main\"><path d=\"M6 4.5L6 16.25\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"branch\"><path d=\"M8.25 18.5A9.75 9.75 0 0 0 18 8.75\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"n1\"><path d=\"M15.75 6.5A2.25 2.25 0 1 1 20.25 6.5A2.25 2.25 0 1 1 15.75 6.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"n2\"><path d=\"M3.75 18.5A2.25 2.25 0 1 1 8.25 18.5A2.25 2.25 0 1 1 3.75 18.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: [{"t":"draw","on":["branch"]},{"t":"keys","on":["n1"],"o":[18,6.5],"s":[0.6,1.1],"ms":320}],
  tap: false,
};

export const duoWrench: KubaiLineIcon = {
  name: "wrench",
  style: "line",
  viewBox: "0 0 24 24",
  markup: "<g data-l=\"all\"><g data-l=\"handle\"><path d=\"M3.561 20.439C2.78 19.658 2.78 18.392 3.561 17.611L12.682 8.489L15.511 11.318L6.389 20.439C5.608 21.22 4.342 21.22 3.561 20.439Z\" fill=\"var(--kl-fill, color-mix(in srgb, currentColor 20%, var(--kl-bg, #FFFFFF)))\"/></g><g data-l=\"handle\"><path d=\"M10.474 10.698L3.207 17.964A2 2 0 0 0 6.036 20.793L13.302 13.526\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g><g data-l=\"head\"><path d=\"M20.97 9.16A5.5 5.5 0 1 1 14.84 3.03\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" pathLength=\"1\"/></g></g>",
  fx: {"t":"keys","on":"all","o":[15.5,8.5],"r":[11,-3],"ms":380},
  tap: false,
};
