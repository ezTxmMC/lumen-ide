/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * Colour maths for themes: hex ⇄ RGB ⇄ OKLab/OKLCH ⇄ HSL, WCAG contrast,
 * dark ↔ light inversion, contrast correction, palettes and a colour-blindness
 * simulation. No DOM — it runs in the Node check scripts too.
 */

import { readableOn } from './theme';
import { TOKEN_KINDS, UI_COLOR_KEYS, type SyntaxStyle, type Theme, type TokenKind, type UIColorKey } from './types';

/* ------------------------------------------------------------------ *
 * Base types and hex ⇄ RGB conversion
 * ------------------------------------------------------------------ */

/** Channels 0…1, alpha 0…1. */
export interface Rgba { r: number; g: number; b: number; a: number; }
export interface Oklab { l: number; a: number; b: number; }
/** Lightness 0…1, chroma ≥ 0, hue 0…360°. */
export interface Oklch { l: number; c: number; h: number; }
/** Hue 0…360°, saturation and lightness 0…1. */
export interface Hsl { h: number; s: number; l: number; }

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` → RGBA; invalid → `null`. */
export function parseHex(value: string): Rgba | null {
  const text = value.trim();
  if (!HEX.test(text)) {
    return null;
  }
  let digits = text.slice(1);
  if (digits.length <= 4) {
    digits = digits.split('').map((c) => c + c).join('');
  }
  const channel = (index: number) => Number.parseInt(digits.slice(index, index + 2), 16) / 255;
  return { r: channel(0), g: channel(2), b: channel(4), a: digits.length === 8 ? channel(6) : 1 };
}

const byte = (v: number) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0');

/** RGBA → `#rrggbb`, or `#rrggbbaa` when alpha is below 1. */
export function toHex({ r, g, b, a }: Rgba): string {
  const base = `#${byte(r)}${byte(g)}${byte(b)}`;
  if (Math.round(clamp(a) * 255) >= 255) {
    return base;
  }
  return base + byte(a);
}

/** The alpha suffix stays, the base colour is replaced. */
export function withAlpha(hex: string, alpha: number): string {
  const rgba = parseHex(hex);
  if (!rgba) {
    return hex;
  }
  return toHex({ ...rgba, a: alpha });
}

/* ------------------------------------------------------------------ *
 * sRGB ⇄ linear ⇄ OKLab ⇄ OKLCH
 * ------------------------------------------------------------------ */

export const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

export function rgbToOklab({ r, g, b }: Rgba): Oklab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab → linear RGB, unclamped, for the gamut check. */
function oklabToLinear({ l: L, a, b }: Oklab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklabToRgb(lab: Oklab, alpha = 1): Rgba {
  const [r, g, b] = oklabToLinear(lab);
  return { r: clamp(fromLinear(clamp(r))), g: clamp(fromLinear(clamp(g))), b: clamp(fromLinear(clamp(b))), a: alpha };
}

export function oklabToOklch({ l, a, b }: Oklab): Oklch {
  const c = Math.hypot(a, b);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c, h: (h + 360) % 360 };
}

export function oklchToOklab({ l, c, h }: Oklch): Oklab {
  const rad = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

const EPS = 1e-4;

function inGamut(lab: Oklab): boolean {
  return oklabToLinear(lab).every((v) => v >= -EPS && v <= 1 + EPS);
}

/** The largest chroma still inside sRGB at lightness `l` and hue `h`. */
export function maxChroma(l: number, h: number, upper = 0.4): number {
  const light = clamp(l);
  if (inGamut(oklchToOklab({ l: light, c: upper, h }))) {
    return upper;
  }
  let low = 0;
  let high = upper;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (inGamut(oklchToOklab({ l: light, c: mid, h }))) {
      low = mid;
      continue;
    }
    high = mid;
  }
  return low;
}

/** OKLCH → RGB; outside sRGB the chroma is reduced, keeping the hue. */
export function oklchToRgb(lch: Oklch, alpha = 1): Rgba {
  const l = clamp(lch.l);
  const full = oklchToOklab({ ...lch, l });
  if (inGamut(full)) {
    return oklabToRgb(full, alpha);
  }
  return oklabToRgb(oklchToOklab({ l, c: maxChroma(l, lch.h, lch.c), h: lch.h }), alpha);
}

export function hexToOklch(hex: string): (Oklch & { alpha: number; }) | null {
  const rgba = parseHex(hex);
  if (!rgba) {
    return null;
  }
  return { ...oklabToOklch(rgbToOklab(rgba)), alpha: rgba.a };
}

export function oklchToHex(lch: Oklch, alpha = 1): string {
  return toHex(oklchToRgb(lch, alpha));
}

/* ------------------------------------------------------------------ *
 * HSL
 * ------------------------------------------------------------------ */

export function rgbToHsl({ r, g, b }: Rgba): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return { h: 0, s: 0, l };
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  return { h: hueOf(r, g, b, max, d), s, l };
}

function hueOf(r: number, g: number, b: number, max: number, d: number): number {
  if (max === r) {
    return (((g - b) / d) % 6 + 6) % 6 * 60;
  }
  if (max === g) {
    return ((b - r) / d + 2) * 60;
  }
  return ((r - g) / d + 4) * 60;
}

export function hslToRgb({ h, s, l }: Hsl, alpha = 1): Rgba {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4), a: alpha };
}

export function hexToHsl(hex: string): (Hsl & { alpha: number; }) | null {
  const rgba = parseHex(hex);
  if (!rgba) {
    return null;
  }
  return { ...rgbToHsl(rgba), alpha: rgba.a };
}

/* ------------------------------------------------------------------ *
 * WCAG 2 contrast
 * ------------------------------------------------------------------ */

export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Lays a semi-transparent colour over an opaque one, blending as a browser does, in sRGB. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

/** Contrast ratio 1…21; the foreground's alpha is taken into account. */
export function contrastRatio(fg: string, bg: string): number {
  const back = parseHex(bg);
  const front = parseHex(fg);
  if (!back || !front) {
    return 1;
  }
  const solidBack = composite(back, { r: 0, g: 0, b: 0, a: 1 });
  const l1 = relativeLuminance(composite(front, solidBack));
  const l2 = relativeLuminance(solidBack);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export type ContrastLevel = 'AAA' | 'AA' | 'AA18' | 'fail';

/** AAA ≥ 7, AA ≥ 4.5, AA18 — large type or controls — ≥ 3. */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) {
    return 'AAA';
  }
  if (ratio >= 4.5) {
    return 'AA';
  }
  if (ratio >= 3) {
    return 'AA18';
  }
  return 'fail';
}

/**
 * Adjusts the lightness (OKLCH) until `fg` reaches at least `min` against
 * every background. Hue, chroma (as far as the gamut allows) and alpha stay.
 * The direction needing the smaller change wins; where the target is out of
 * reach, the one with the highest contrast does.
 */
export function ensureContrast(fg: string, backgrounds: string | string[], min: number): string {
  const backs = Array.isArray(backgrounds) ? backgrounds : [backgrounds];
  const worst = (color: string) => Math.min(...backs.map((bg) => contrastRatio(color, bg)));
  if (worst(fg) >= min) {
    return fg;
  }
  const lch = hexToOklch(fg);
  if (!lch) {
    return fg;
  }

  const at = (l: number) => oklchToHex({ l, c: lch.c, h: lch.h }, lch.alpha);
  const search = (target: number): { color: string; ok: boolean; distance: number; } => {
    const end = at(target);
    if (worst(end) < min) {
      return { color: end, ok: false, distance: Math.abs(target - lch.l) };
    }
    let near = lch.l;
    let far = target;
    for (let i = 0; i < 28; i++) {
      const mid = (near + far) / 2;
      if (worst(at(mid)) >= min) {
        far = mid;
        continue;
      }
      near = mid;
    }
    return { color: at(far), ok: true, distance: Math.abs(far - lch.l) };
  };

  const candidates = [search(0), search(1)];
  const reached = candidates.filter((c) => c.ok).sort((x, y) => x.distance - y.distance);
  if (reached.length) {
    return reached[0].color;
  }
  return candidates.sort((x, y) => worst(y.color) - worst(x.color))[0].color;
}

/* ------------------------------------------------------------------ *
 * Dark ↔ light inversion
 * ------------------------------------------------------------------ */

/**
 * Exponent of the lightness mirroring. `(1 − Lᵍ)^(1/g)` is an involution —
 * applied twice it returns the original — and maps typical dark backgrounds
 * (L ≈ 0.16) onto typical light ones (L ≈ 0.99).
 */
export const MIRROR_GAMMA = 2.2;

export function mirrorLightness(l: number): number {
  const x = clamp(l);
  return (1 - x ** MIRROR_GAMMA) ** (1 / MIRROR_GAMMA);
}

/**
 * Sets a new lightness while keeping the relative chroma, meaning the share of
 * the largest possible chroma. Saturation is preserved and the step stays
 * reversible, even where the sRGB space grows narrow.
 */
export function relight(lch: Oklch, l: number): Oklch {
  const target = clamp(l);
  const available = maxChroma(lch.l, lch.h);
  if (available < 1e-6) {
    return { l: target, c: 0, h: lch.h };
  }
  const share = Math.min(1, lch.c / available);
  return { l: target, c: share * maxChroma(target, lch.h), h: lch.h };
}

/** Mirrors a single colour's lightness; hue, saturation and alpha stay. */
export function invertColor(hex: string): string {
  const lch = hexToOklch(hex);
  if (!lch) {
    return hex;
  }
  return oklchToHex(relight(lch, mirrorLightness(lch.l)), lch.alpha);
}

/**
 * Mirrors relative to the background: the background itself is mirrored, and
 * every other colour keeps its lightness distance with the sign flipped. That
 * preserves the steps between surfaces and the text hierarchy — and applying
 * it twice returns the original colour.
 */
export function invertAround(hex: string, bgLightness: number): string {
  const lch = hexToOklch(hex);
  if (!lch) {
    return hex;
  }
  const l = mirrorLightness(bgLightness) + (bgLightness - lch.l);
  return oklchToHex(relight(lch, l), lch.alpha);
}

/** Minimum contrast per role, against background, panel and overlay. */
export const UI_MIN_CONTRAST: Partial<Record<UIColorKey, number>> = {
  text: 7,
  textMuted: 4.5,
  textSubtle: 3,
  gutter: 2,
  accent: 3,
  success: 3,
  warning: 3,
  danger: 3,
  cursor: 3,
};

export const SYNTAX_MIN_CONTRAST = 4.5;
export const COMMENT_MIN_CONTRAST = 3;

export function syntaxMinContrast(kind: TokenKind): number {
  if (kind === 'comment' || kind === 'punctuation') {
    return COMMENT_MIN_CONTRAST;
  }
  return SYNTAX_MIN_CONTRAST;
}

export function syntaxColor(theme: Theme, kind: TokenKind): string {
  const raw = theme.syntax[kind];
  if (!raw) {
    return theme.ui.text;
  }
  if (typeof raw === 'string') {
    return raw;
  }
  return raw.color;
}

/** Sets a syntax entry's colour while keeping italic, bold and underline. */
export function withSyntaxColor(value: string | SyntaxStyle | undefined, color: string): string | SyntaxStyle {
  if (!value || typeof value === 'string') {
    return color;
  }
  return { ...value, color };
}

/** Surfaces that text has to stay readable against. */
export const textSurfaces = (theme: Theme) => [theme.ui.bg, theme.ui.bgElevated, theme.ui.bgOverlay];

/**
 * Switches dark ↔ light: every interface and syntax colour is mirrored
 * relative to the background, then text, signal and syntax colours are nudged
 * back to their minimum contrast; `accentText` is recomputed by `readableOn`.
 */
export function invertTheme(theme: Theme): Theme {
  const bg = hexToOklch(theme.ui.bg);
  const bgL = bg ? bg.l : 0.5;
  const ui = { ...theme.ui };
  for (const key of UI_COLOR_KEYS) {
    ui[key] = invertAround(theme.ui[key], bgL);
  }

  const syntax: Theme['syntax'] = {};
  for (const kind of TOKEN_KINDS) {
    const raw = theme.syntax[kind];
    if (!raw) {
      continue;
    }
    syntax[kind] = withSyntaxColor(raw, invertAround(syntaxColor(theme, kind), bgL));
  }

  const next: Theme = { ...theme, type: theme.type === 'dark' ? 'light' : 'dark', ui, syntax };
  return fixContrast(next);
}

/** Lifts every colour below its minimum contrast, keeping the hue. */
export function fixContrast(theme: Theme): Theme {
  const ui = { ...theme.ui };
  const surfaces = textSurfaces(theme);
  for (const [key, min] of Object.entries(UI_MIN_CONTRAST) as [UIColorKey, number][]) {
    ui[key] = ensureContrast(ui[key], surfaces, min);
  }
  ui.accentText = readableOn(ui.accent);
  // Where black or white on the accent is not enough, the accent moves further away.
  ui.accent = ensureContrast(ui.accent, ui.accentText, 4.5);

  const syntax: Theme['syntax'] = { ...theme.syntax };
  for (const kind of TOKEN_KINDS) {
    const raw = theme.syntax[kind];
    if (!raw) {
      continue;
    }
    syntax[kind] = withSyntaxColor(raw, ensureContrast(syntaxColor(theme, kind), ui.bg, syntaxMinContrast(kind)));
  }
  return { ...theme, ui, syntax };
}

/* ------------------------------------------------------------------ *
 * Contrast check
 * ------------------------------------------------------------------ */

export interface ContrastIssue {
  /** `ui:text` or `syntax:keyword`. */
  key: string;
  /** The background key it was checked against. */
  against: UIColorKey;
  ratio: number;
  min: number;
}

/** Every pair below its minimum contrast, worst first. */
export function contrastIssues(theme: Theme): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  const check = (key: string, fg: string, against: UIColorKey, min: number) => {
    const ratio = contrastRatio(fg, theme.ui[against]);
    if (ratio < min) {
      issues.push({ key, against, ratio, min });
    }
  };
  for (const [key, min] of Object.entries(UI_MIN_CONTRAST) as [UIColorKey, number][]) {
    for (const against of ['bg', 'bgElevated', 'bgOverlay'] as const) {
      check(`ui:${key}`, theme.ui[key], against, min);
    }
  }
  check('ui:accentText', theme.ui.accentText, 'accent', 4.5);
  for (const kind of TOKEN_KINDS) {
    if (!theme.syntax[kind]) {
      continue;
    }
    check(`syntax:${kind}`, syntaxColor(theme, kind), 'bg', syntaxMinContrast(kind));
  }
  // Only the worst background per colour.
  const worst = new Map<string, ContrastIssue>();
  for (const issue of issues) {
    const known = worst.get(issue.key);
    if (known && known.ratio <= issue.ratio) {
      continue;
    }
    worst.set(issue.key, issue);
  }
  return [...worst.values()].sort((a, b) => a.ratio / a.min - b.ratio / b.min);
}

/** Fixes exactly one colour out of `contrastIssues`. */
export function fixIssue(theme: Theme, issue: ContrastIssue): Theme {
  const [scope, name] = issue.key.split(':');
  if (scope === 'ui' && name === 'accentText') {
    return { ...theme, ui: { ...theme.ui, accentText: readableOn(theme.ui.accent) } };
  }
  if (scope === 'ui') {
    const key = name as UIColorKey;
    const color = ensureContrast(theme.ui[key], textSurfaces(theme), issue.min);
    return { ...theme, ui: { ...theme.ui, [key]: color } };
  }
  const kind = name as TokenKind;
  const color = ensureContrast(syntaxColor(theme, kind), theme.ui.bg, issue.min);
  return { ...theme, syntax: { ...theme.syntax, [kind]: withSyntaxColor(theme.syntax[kind], color) } };
}

/* ------------------------------------------------------------------ *
 * Palettes
 * ------------------------------------------------------------------ */

export const HARMONIES = ['analogous', 'complementary', 'split', 'triadic', 'tetradic', 'monochrome'] as const;
export type Harmony = (typeof HARMONIES)[number];

const HARMONY_OFFSETS: Record<Harmony, number[]> = {
  analogous: [0, 30, -30, 60, -60],
  complementary: [0, 180, 20, 200],
  split: [0, 150, 210],
  triadic: [0, 120, 240],
  tetradic: [0, 90, 180, 270],
  monochrome: [0],
};

/** Colours of a harmony in OKLCH, at the accent's lightness and chroma. */
export function harmonyColors(accent: string, harmony: Harmony): string[] {
  const lch = hexToOklch(accent);
  if (!lch) {
    return [accent];
  }
  return HARMONY_OFFSETS[harmony].map((offset) => oklchToHex({ ...lch, h: (lch.h + offset + 360) % 360 }));
}

/** The order in which token kinds receive colours of the harmony. */
const TOKEN_SLOTS: { kind: TokenKind; slot: number; shift: number; chroma: number; }[] = [
  { kind: 'keyword', slot: 0, shift: 0, chroma: 1 },
  { kind: 'function', slot: 1, shift: 0.04, chroma: 0.9 },
  { kind: 'string', slot: 2, shift: 0.02, chroma: 0.85 },
  { kind: 'type', slot: 3, shift: 0.05, chroma: 0.8 },
  { kind: 'number', slot: 4, shift: 0.06, chroma: 0.9 },
  { kind: 'constant', slot: 4, shift: 0.06, chroma: 0.9 },
  { kind: 'control', slot: 1, shift: -0.04, chroma: 1.1 },
  { kind: 'builtin', slot: 3, shift: -0.02, chroma: 0.9 },
  { kind: 'property', slot: 2, shift: 0.08, chroma: 0.55 },
  { kind: 'tag', slot: 1, shift: 0, chroma: 1 },
  { kind: 'attribute', slot: 4, shift: 0.03, chroma: 0.75 },
  { kind: 'meta', slot: 0, shift: 0.06, chroma: 0.6 },
  { kind: 'escape', slot: 4, shift: -0.03, chroma: 1 },
  { kind: 'regexp', slot: 2, shift: -0.03, chroma: 1 },
];

/**
 * Sets accent, cursor, selection and syntax colours from one accent colour and
 * a harmony. Neutral tokens — comment, operator, punctuation, variable — stay
 * as they are, and everything is checked for contrast against the background.
 */
export function applyAccentHarmony(theme: Theme, accent: string, harmony: Harmony): Theme {
  const lch = hexToOklch(accent);
  if (!lch) {
    return theme;
  }
  const hues = HARMONY_OFFSETS[harmony].map((o) => (lch.h + o + 360) % 360);
  const dark = theme.type === 'dark';
  const baseL = dark ? 0.8 : 0.5;
  const baseC = Math.max(0.06, Math.min(lch.c, 0.16));

  const syntax: Theme['syntax'] = { ...theme.syntax };
  for (const { kind, slot, shift, chroma } of TOKEN_SLOTS) {
    const h = hues[slot % hues.length];
    // Monochrome: the steps differ in lightness rather than in hue.
    const spread = harmony === 'monochrome' ? (slot - 2) * 0.05 : 0;
    const l = baseL + (dark ? shift : -shift) + spread;
    const color = oklchToHex({ l, c: baseC * chroma, h });
    syntax[kind] = withSyntaxColor(theme.syntax[kind], ensureContrast(color, theme.ui.bg, syntaxMinContrast(kind)));
  }

  const selection = oklchToHex({ l: dark ? 0.4 : 0.85, c: Math.min(lch.c, 0.08), h: lch.h }, dark ? 0.6 : 1);
  const ui = {
    ...theme.ui,
    accent,
    cursor: accent,
    accentText: readableOn(accent),
    selection,
  };
  return { ...theme, ui, syntax };
}

/** Lightness distances of the surface steps from the background (dark: lighter, light: darker). */
const SURFACE_STEPS: Record<'dark' | 'light', Partial<Record<UIColorKey, number>>> = {
  dark: {
    bg: 0, bgElevated: 0.03, bgOverlay: 0.055, bgInput: 0.05, bgHover: 0.065, bgActive: 0.1,
    border: 0.07, borderStrong: 0.13, lineHighlight: 0.015, scrollbar: 0.13, gutter: 0.26,
    textSubtle: 0.34, textMuted: 0.52,
  },
  light: {
    bg: 0, bgElevated: -0.02, bgOverlay: 0.01, bgInput: 0.01, bgHover: -0.035, bgActive: -0.075,
    border: -0.055, borderStrong: -0.1, lineHighlight: -0.015, scrollbar: -0.1, gutter: -0.26,
    textSubtle: -0.36, textMuted: -0.5,
  },
};

/** Derives every surface, line and text step from one base colour. */
export function deriveSurfaces(theme: Theme, base: string): Theme {
  const lch = hexToOklch(base);
  if (!lch) {
    return theme;
  }
  const steps = SURFACE_STEPS[theme.type];
  const tint = Math.min(lch.c, 0.04);
  const ui = { ...theme.ui };
  for (const [key, delta] of Object.entries(steps) as [UIColorKey, number][]) {
    // Steps further from the background lose chroma, so text stays neutral.
    const c = tint * Math.max(0.25, 1 - Math.abs(delta) * 1.5);
    ui[key] = oklchToHex({ l: clamp(lch.l + delta), c, h: lch.h });
  }
  ui.text = oklchToHex({ l: theme.type === 'dark' ? 0.93 : 0.24, c: Math.min(tint, 0.015), h: lch.h });
  return fixContrast({ ...theme, ui });
}

/* ------------------------------------------------------------------ *
 * Colour blindness (Machado et al. 2009, severity 1.0, linear RGB)
 * ------------------------------------------------------------------ */

export const VISION_MODES = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'grayscale'] as const;
export type VisionMode = (typeof VISION_MODES)[number];

export const VISION_MATRICES: Record<Exclude<VisionMode, 'none'>, number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.01182, 0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779,
    -0.078411, 0.930809, 0.147602,
    0.004733, 0.691367, 0.3039,
  ],
  grayscale: [
    0.2126, 0.7152, 0.0722,
    0.2126, 0.7152, 0.0722,
    0.2126, 0.7152, 0.0722,
  ],
};

/** A value for `<feColorMatrix type="matrix">` (4×5, alpha untouched). */
export function svgColorMatrix(mode: Exclude<VisionMode, 'none'>): string {
  const m = VISION_MATRICES[mode];
  return [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
    0, 0, 0, 1, 0,
  ].join(' ');
}

/** Simulates a colour-vision deficiency for a single colour. */
export function simulateVision(hex: string, mode: VisionMode): string {
  const rgba = parseHex(hex);
  if (!rgba || mode === 'none') {
    return hex;
  }
  const m = VISION_MATRICES[mode];
  const lin = [toLinear(rgba.r), toLinear(rgba.g), toLinear(rgba.b)];
  const row = (i: number) => fromLinear(clamp(m[i] * lin[0] + m[i + 1] * lin[1] + m[i + 2] * lin[2]));
  return toHex({ r: row(0), g: row(3), b: row(6), a: rgba.a });
}

/** Distance in OKLab (ΔE_ok, 0.02 ≈ just noticeable). */
export function deltaE(x: string, y: string): number {
  const a = parseHex(x);
  const b = parseHex(y);
  if (!a || !b) {
    return Infinity;
  }
  const p = rgbToOklab(a);
  const q = rgbToOklab(b);
  return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
}
