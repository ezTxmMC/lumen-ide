/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { TokenKind } from './language';

/* ------------------------------------------------------------------ *
 * Themes
 * ------------------------------------------------------------------ */

export const UI_COLOR_KEYS = [
  'bg',            // Fensterhintergrund
  'bgElevated',    // Panels, Seitenleiste
  'bgOverlay',     // Dialoge, Paletten
  'bgInput',
  'bgHover',
  'bgActive',
  'border',
  'borderStrong',
  'text',
  'textMuted',
  'textSubtle',
  'accent',
  'accentText',    // Text on accent surface
  'success',
  'warning',
  'danger',
  'selection',     // Editor-Auswahl
  'lineHighlight',
  'cursor',
  'gutter',
  'scrollbar',
] as const;

export type UIColorKey = (typeof UI_COLOR_KEYS)[number];

export interface SyntaxStyle {
  color: string;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
}

export interface Theme {
  id: string;
  name: string;
  type: 'dark' | 'light';
  author?: string;
  ui: Record<UIColorKey, string>;
  syntax: Partial<Record<TokenKind, string | SyntaxStyle>>;
}

