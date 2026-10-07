/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { type SyntaxStyle, type Theme } from '../types';
import { contrastRatio } from './colors';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

export const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * `#a1b2c3` → `161 178 195`, for `rgb(var(--x) / 40%)`. Spaces, not commas:
 * `rgb(161, 178, 195 / 40%)` is invalid and browsers drop it silently. An
 * alpha part (`#rrggbbaa`) is ignored.
 */
export function hexToRgbChannels(hex: string): string {
  const clean = splitAlpha(hex).base.replace('#', '');
  if (clean.length !== 6) {
    return '127 127 127';
  }
  const n = Number.parseInt(clean, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Splits `#rrggbbaa` into the base colour and the alpha suffix. */
export function splitAlpha(color: string): { base: string; alpha: string; } {
  const match = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(color.trim());
  if (match) {
    return { base: `#${match[1]}`, alpha: match[2] };
  }
  const short = /^#([0-9a-fA-F]{3})$/.exec(color.trim());
  if (short) {
    const [r, g, b] = short[1];
    return { base: `#${r}${r}${g}${g}${b}${b}`, alpha: '' };
  }
  return { base: /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : '#000000', alpha: '' };
}

/**
 * Selection colours from `ui.selection`, always clearly visible. When the
 * theme's colour is too weak against the background — contrast below 1.4 —
 * its opacity rises; if that is not enough it is mixed towards the accent.
 * Unfocused, roughly half the opacity applies, and further occurrences take
 * the accent colour.
 */
export function selectionColors(ui: Pick<Theme['ui'], 'selection' | 'accent' | 'bg'>) {
  const accent = rgbOf(ui.accent);
  const { alpha } = splitAlpha(ui.selection);
  let color = rgbOf(ui.selection);
  let opacity = alpha ? Number.parseInt(alpha, 16) / 255 : 1;

  for (let step = 0; step < 16 && contrastRatio(withAlpha(color, opacity), ui.bg) < SELECTION_MIN_CONTRAST; step++) {
    if (opacity < 0.85) {
      opacity = Math.min(0.85, opacity + 0.1);
      continue;
    }
    color = mix(color, accent, 0.25);
  }

  const channels = color.map(Math.round).join(' ');
  const accentChannels = accent.join(' ');
  return {
    focused: `rgb(${channels} / ${Math.round(opacity * 100)}%)`,
    inactive: `rgb(${channels} / ${Math.round(opacity * 60)}%)`,
    match: `rgb(${accentChannels} / 12%)`,
    matchBorder: `rgb(${accentChannels} / 45%)`,
  };
}

const SELECTION_MIN_CONTRAST = 1.4;

type Rgb = [number, number, number];

function rgbOf(color: string): Rgb {
  const n = Number.parseInt(splitAlpha(color).base.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function withAlpha(color: Rgb, opacity: number): string {
  const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  return `#${color.map(hex).join('')}${hex(opacity * 255)}`;
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as Rgb;
}

/** Picks black or white as readable type on the given surface. */
export function readableOn(color: string): string {
  const { base } = splitAlpha(color);
  const n = Number.parseInt(base.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? '#000000' : '#ffffff';
}

export function normalizeSyntax(value: string | SyntaxStyle): SyntaxStyle {
  return typeof value === 'string' ? { color: value } : value;
}
