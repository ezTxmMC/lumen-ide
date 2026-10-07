/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { TOKEN_KINDS, UI_COLOR_KEYS, type Theme } from '../types';
import type { Effects } from './effects';
import { kebab, hexToRgbChannels, normalizeSyntax } from './helpers';

/* ------------------------------------------------------------------ *
 * Applying it to the document
 * ------------------------------------------------------------------ */

const CUSTOM_CSS_ID = 'lumen-custom-css';

export function applyTheme(theme: Theme, effects: Effects) {
  const root = document.documentElement;
  const style = root.style;

  for (const key of UI_COLOR_KEYS) {
    const value = theme.ui[key];
    style.setProperty(`--c-${kebab(key)}`, value);
    if (value.startsWith('#')) {
      style.setProperty(`--c-${kebab(key)}-rgb`, hexToRgbChannels(value));
    }
  }

  for (const kind of TOKEN_KINDS) {
    const raw = theme.syntax[kind];
    if (raw) {
      style.setProperty(`--s-${kind}`, normalizeSyntax(raw).color);
    }
  }

  root.dataset.themeType = theme.type;
  root.dataset.themeId = theme.id;
  applyEffects(effects);
}

/** `normal` follows the system's “reduce motion”; `rich` and `reduced` are a deliberate choice. */
function motionLevel(effects: Effects): string {
  if (!effects.animations) {
    return 'none';
  }
  if (effects.animationLevel !== 'normal') {
    return effects.animationLevel;
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return 'reduced';
  }
  return 'normal';
}

/** Base durations in seconds, scaled by `animationSpeed`; the easing curves live in index.css. */
const MOTION_DURATIONS: [string, number][] = [
  ['--duration-fast', 0.09],
  ['--duration', 0.16],
  ['--duration-slow', 0.28],
  ['--duration-exit', 0.13],
];

export function applyEffects(effects: Effects) {
  const root = document.documentElement;
  const style = root.style;

  style.setProperty('--radius', `${effects.radius}px`);
  style.setProperty('--radius-sm', `${Math.max(2, effects.radius - 4)}px`);
  style.setProperty('--radius-lg', `${effects.radius + 4}px`);
  for (const [name, seconds] of MOTION_DURATIONS) {
    style.setProperty(name, effects.animations ? `${(seconds * effects.animationSpeed).toFixed(3)}s` : '0s');
  }
  style.setProperty('--blur', effects.glass ? '14px' : '0px');
  style.setProperty('--panel-alpha', String(1 - effects.transparency));
  style.setProperty('--font-mono', effects.fontFamily);
  style.setProperty('--font-size', `${effects.fontSize}px`);
  style.setProperty('--line-height', String(effects.lineHeight));
  style.setProperty('--ligatures', effects.ligatures ? 'normal' : 'none');
  style.setProperty('--row-height', effects.density === 'compact' ? '22px' : '26px');
  style.setProperty('--pad', effects.density === 'compact' ? '4px' : '8px');

  root.dataset.animations = String(effects.animations);
  root.dataset.motion = motionLevel(effects);
  root.dataset.glass = String(effects.glass);
  root.dataset.glow = String(effects.glow);
  root.dataset.shadows = String(effects.shadows);
  root.dataset.indentGuides = String(effects.showIndentGuides);

  let tag = document.getElementById(CUSTOM_CSS_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = CUSTOM_CSS_ID;
    document.head.append(tag);
  }
  tag.textContent = effects.customCss;
}
