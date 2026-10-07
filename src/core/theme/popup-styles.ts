/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { type Theme, type TokenKind } from '../types';
import type { Effects } from './effects';
import { hexToRgbChannels, normalizeSyntax } from './helpers';

/**
 * The text cursor. CodeMirror sets position and line height inline; one
 * character is `1ch` of the editor font. Block and underline cover exactly the
 * character at the cursor — the block semi-transparent so that character
 * stays readable.
 */
export function cursorStyles(effects: Effects, color: string): Record<string, Record<string, string>> {
  const smooth = effects.smoothCaret ? 'left var(--duration-fast) var(--ease-out), top var(--duration-fast) var(--ease-out)' : 'none';
  const width = `${Math.min(4, Math.max(1, Math.round(effects.cursorWidth || 2)))}px`;
  const drop = { '.cm-dropCursor': { borderLeftColor: color, borderLeftWidth: width } };
  if (effects.cursorStyle === 'block') {
    return {
      ...drop,
      '.cm-cursor': {
        borderLeft: 'none',
        width: '1ch',
        marginLeft: '0',
        backgroundColor: `rgb(${hexToRgbChannels(color)} / 55%)`,
        borderRadius: '1px',
        transition: smooth,
      },
    };
  }
  if (effects.cursorStyle === 'underline') {
    return {
      ...drop,
      '.cm-cursor': {
        borderLeft: 'none',
        width: '1ch',
        marginLeft: '0',
        boxSizing: 'border-box',
        borderBottom: `${width} solid ${color}`,
        transition: smooth,
      },
    };
  }
  return {
    ...drop,
    '.cm-cursor': { borderLeftColor: color, borderLeftWidth: width, transition: smooth },
  };
}

/** Completion symbol kind → syntax colour; without one, dimmed type. */
const COMPLETION_KIND_COLORS: [string, TokenKind][] = [
  ['function', 'function'], ['method', 'function'],
  ['class', 'type'], ['interface', 'type'], ['enum', 'type'], ['type', 'type'],
  ['variable', 'variable'], ['constant', 'constant'], ['property', 'property'],
  ['keyword', 'keyword'], ['namespace', 'meta'], ['snippet', 'string'], ['operator', 'operator'],
];

/**
 * The suggestion list: tall enough for many entries, the symbol kind as a
 * coloured chip, typed characters in the accent colour, details right-aligned
 * and dimmed, and the selection as a tinted row with an accent bar — text and
 * details stay readable.
 *
 * Selectors start with `&.cm-editor .cm-tooltip` because CodeMirror's base
 * theme otherwise wins with more specific rules: a blue selection, 10em tall.
 */
export function completionPopupStyles(theme: Theme, effects: Effects): Record<string, Record<string, string | number | Record<string, string>>> {
  const ui = theme.ui;
  const accent = hexToRgbChannels(ui.accent);
  const popup = '&.cm-editor .cm-tooltip.cm-tooltip-autocomplete';
  const size = effects.fontSize;
  const styles: Record<string, Record<string, string | number | Record<string, string>>> = {
    [popup]: { padding: '4px', backgroundColor: ui.bgOverlay },
    [`${popup} > ul`]: {
      fontFamily: effects.fontFamily,
      fontSize: `${size}px`,
      maxHeight: `min(${Math.round(size * 1.75 * 14)}px, 46vh)`,
      minWidth: '340px',
      maxWidth: 'min(760px, 92vw)',
      scrollbarWidth: 'thin',
    },
    [`${popup} > ul > li`]: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '2px 8px 2px 6px',
      lineHeight: '1.6',
      borderRadius: 'var(--radius-sm)',
      color: ui.text,
    },
    [`${popup} > ul > li:hover`]: { backgroundColor: ui.bgHover },
    [`${popup} > ul > li[aria-selected]`]: {
      backgroundColor: `rgb(${accent} / 20%)`,
      color: ui.text,
      boxShadow: `inset 2px 0 0 ${ui.accent}`,
    },
    [`${popup}.cm-tooltip-autocomplete-disabled > ul > li[aria-selected]`]: {
      backgroundColor: ui.bgActive,
      boxShadow: 'none',
    },
    [`${popup} > ul > completion-section`]: {
      padding: '6px 8px 2px',
      borderBottom: `1px solid ${ui.border}`,
      color: ui.textSubtle,
      fontSize: '0.8em',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
    '.cm-completionLabel': { flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
    '.cm-completionMatchedText': { textDecoration: 'none', color: ui.accent, fontWeight: 600 },
    '.cm-completionDetail': {
      marginLeft: 'auto',
      paddingLeft: '16px',
      maxWidth: '48%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontStyle: 'normal',
      fontSize: '0.88em',
      color: ui.textMuted,
    },
    '.cm-completionDetail + .cm-lumen-completionOrigin': { marginLeft: 0 },
    '.cm-lumen-completionOrigin': { marginLeft: 'auto', opacity: 0.75, color: ui.textSubtle },
    [`${popup} .cm-completionIcon`]: {
      flex: 'none',
      width: '1.45em',
      height: '1.45em',
      lineHeight: '1.45em',
      padding: 0,
      borderRadius: '4px',
      fontSize: '0.8em',
      textAlign: 'center',
      opacity: 1,
      color: ui.textMuted,
      backgroundColor: ui.bgActive,
    },
    '.cm-completionIcon-snippet': { '&:after': { content: "'{}'" } },
    '.cm-completionIcon-deprecated': { opacity: 0.5, textDecoration: 'line-through' },
    '.cm-completionIcon-operator': { '&:after': { content: "'±'" } },
    '&.cm-editor .cm-tooltip.cm-completionInfo': {
      padding: '8px 10px',
      maxWidth: '440px',
      backgroundColor: ui.bgOverlay,
      color: ui.text,
    },
    '.cm-completionInfo .lm-lsp-doc': { borderTop: 'none', padding: 0, maxWidth: 'none' },
  };
  for (const [kind, token] of COMPLETION_KIND_COLORS) {
    const raw = theme.syntax[token];
    if (!raw) {
      continue;
    }
    const color = normalizeSyntax(raw).color;
    styles[`${popup} .cm-completionIcon-${kind}`] = {
      color,
      backgroundColor: `rgb(${hexToRgbChannels(color)} / 16%)`,
    };
  }
  return styles;
}
