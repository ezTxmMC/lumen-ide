/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tokenTags } from '../editor/tokenizer';
import { TOKEN_KINDS, type Theme } from '../types';
import type { Effects } from './effects';
import { cursorStyles, completionPopupStyles } from './popup-styles';
import { hexToRgbChannels, selectionColors, normalizeSyntax } from './helpers';

/* ------------------------------------------------------------------ *
 * CodeMirror theme
 * ------------------------------------------------------------------ */

/** Text, gutters and the active line. */
function baseEditorStyles(ui: Theme['ui'], effects: Effects): Record<string, Record<string, string | number>> {
  return {
    '&': {
      color: ui.text,
      backgroundColor: 'transparent',
      fontSize: `${effects.fontSize}px`,
      height: '100%',
    },
    '.cm-content': {
      fontFamily: effects.fontFamily,
      fontVariantLigatures: effects.ligatures ? 'normal' : 'none',
      lineHeight: String(effects.lineHeight),
      padding: '10px 0 40vh 0',
      caretColor: ui.cursor,
    },
    '.cm-scroller': {
      fontFamily: effects.fontFamily,
      lineHeight: String(effects.lineHeight),
      overflow: 'auto',
    },
    // Opaque: the gutters stick to the left edge while scrolling sideways —
    // without a background of their own the code would run visibly behind them.
    '.cm-gutters': {
      backgroundColor: ui.bg,
      color: ui.gutter,
      border: 'none',
      paddingRight: '6px',
    },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '38px', padding: '0 4px 0 12px' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: ui.text },
    '.cm-activeLine': { backgroundColor: ui.lineHighlight },
  };
}

/** Selection, matching brackets and search matches. */
function selectionStyles(ui: Theme['ui'], selection: ReturnType<typeof selectionColors>): Record<string, Record<string, string | number>> {
  return {
    // Selection: CodeMirror's base theme sets its own colours with more specific
    // selectors (#233 and #d7d4f0) — without this weighting the theme colour never showed.
    '&.cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground.cm-selectionBackground': {
      background: selection.inactive,
    },
    '&.cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground.cm-selectionBackground': {
      background: selection.focused,
    },
    '.cm-panels ::selection, .cm-tooltip ::selection': { backgroundColor: selection.focused },
    // Further occurrences of the selected text: outlined discreetly rather than filled,
    // so they read differently from the selection itself.
    '.cm-selectionMatch': {
      backgroundColor: selection.match,
      boxShadow: `inset 0 0 0 1px ${selection.matchBorder}`,
      borderRadius: '2px',
    },
    '.cm-selectionMatch-main': { backgroundColor: 'transparent', boxShadow: 'none' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: ui.bgActive,
      outline: `1px solid ${ui.accent}`,
      borderRadius: '2px',
    },
    '.cm-nonmatchingBracket': { color: ui.danger },
    '.cm-searchMatch': {
      backgroundColor: `rgb(${hexToRgbChannels(ui.warning)} / 30%)`,
      outline: `1px solid ${ui.warning}`,
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: `rgb(${hexToRgbChannels(ui.accent)} / 45%)`,
    },
  };
}

/** Panels, including the floating find and replace box. */
function panelStyles(ui: Theme['ui'], effects: Effects): Record<string, Record<string, string | number>> {
  return {
    '.cm-panels': {
      backgroundColor: ui.bgElevated,
      color: ui.text,
      borderColor: ui.border,
    },
    // Find and replace floats at the top right over the text instead of
    // pushing the editor down as a bar would (as in VS Code). The strip
    // itself lets clicks through — only the box inside catches them.
    '.cm-panels.cm-panels-top': {
      position: 'absolute',
      top: '0',
      left: 'auto',
      right: '0',
      width: 'auto',
      maxWidth: 'calc(100% - 16px)',
      zIndex: '6',
      border: 'none',
      backgroundColor: 'transparent',
      pointerEvents: 'none',
    },
    '.cm-panels.cm-panels-top > *': { pointerEvents: 'auto' },
    '&.lm-has-minimap .cm-panels.cm-panels-top': { right: 'var(--minimap-width, 0px)' },
    '.cm-panel.cm-search': {
      position: 'relative',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '4px',
      margin: '6px',
      padding: '6px 26px 6px 8px',
      backgroundColor: ui.bgOverlay,
      border: `1px solid ${ui.border}`,
      borderRadius: 'var(--radius)',
      boxShadow: '0 12px 32px rgb(0 0 0 / 35%)',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
    },
    // The `<br>` between the search and replace rows is a flex child of its
    // own — given full width it becomes the line break.
    '.cm-panel.cm-search br': { flexBasis: '100%', width: '100%', height: '0' },
    '.cm-panel.cm-search input.cm-textfield': {
      flex: '1 1 190px',
      minWidth: '150px',
      fontFamily: effects.fontFamily,
    },
    '.cm-panel.cm-search label': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      whiteSpace: 'nowrap',
      color: ui.textMuted,
    },
    '.cm-panel.cm-search button[name="close"]': {
      position: 'absolute',
      top: '4px',
      right: '4px',
      padding: '0 4px',
      border: 'none',
      backgroundColor: 'transparent',
      color: ui.textMuted,
      fontSize: '15px',
      lineHeight: '1.1',
    },
    '.cm-panel.cm-search button[name="close"]:hover': { color: ui.text, backgroundColor: ui.bgHover },
    '.cm-panel input, .cm-panel button': {
      backgroundColor: ui.bgInput,
      color: ui.text,
      border: `1px solid ${ui.border}`,
      borderRadius: 'var(--radius-sm)',
      padding: '2px 6px',
    },
    '.cm-panel button:hover': { backgroundColor: ui.bgHover },
    '.cm-panel input:focus-visible, .cm-panel button:focus-visible': {
      outline: `1px solid ${ui.accent}`,
      outlineOffset: '0',
    },
    '.cm-panel input[type="checkbox"]': { padding: '0', accentColor: ui.accent },
  };
}

/** The tooltip frame shared by hover, completion and lint. */
function tooltipStyles(ui: Theme['ui']): Record<string, Record<string, string | number>> {
  return {
    '.cm-tooltip': {
      backgroundColor: ui.bgOverlay,
      border: `1px solid ${ui.border}`,
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      boxShadow: '0 12px 32px rgb(0 0 0 / 35%)',
    },
  };
}

/** Diagnostic underlines, messages and markers. */
function lintStyles(ui: Theme['ui'], effects: Effects): Record<string, Record<string, string | number>> {
  return {
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      textDecoration: `underline wavy ${ui.danger}`,
      textDecorationSkipInk: 'none',
      textUnderlineOffset: '2px',
    },
    '.cm-lintRange-warning': {
      backgroundImage: 'none',
      textDecoration: `underline wavy ${ui.warning}`,
      textDecorationSkipInk: 'none',
      textUnderlineOffset: '2px',
    },
    '.cm-lintRange-info, .cm-lintRange-hint': {
      backgroundImage: 'none',
      textDecoration: `underline dotted ${ui.textMuted}`,
      textDecorationSkipInk: 'none',
      textUnderlineOffset: '2px',
    },
    '.cm-diagnostic': {
      padding: '4px 10px',
      borderLeft: '3px solid transparent',
      fontFamily: effects.fontFamily,
      fontSize: `${Math.max(11, effects.fontSize - 1)}px`,
      whiteSpace: 'pre-wrap',
    },
    '.cm-diagnostic-error': { borderLeftColor: ui.danger },
    '.cm-diagnostic-warning': { borderLeftColor: ui.warning },
    '.cm-diagnostic-info': { borderLeftColor: ui.accent },
    '.cm-diagnostic-hint': { borderLeftColor: ui.textMuted },
    '.cm-lint-marker': { width: '11px', height: '11px' },
    '.cm-panel.cm-panel-lint ul': { maxHeight: '160px' },
  };
}

/** LSP hover, documentation and rendered Markdown. */
function hoverStyles(ui: Theme['ui'], effects: Effects): Record<string, Record<string, string | number>> {
  return {
    '.lm-lsp-hover': {
      padding: '8px 11px',
      maxWidth: '620px',
      maxHeight: '360px',
      overflow: 'auto',
      fontFamily: 'system-ui, sans-serif',
      fontSize: `${Math.max(11, effects.fontSize - 1)}px`,
      lineHeight: '1.5',
      color: ui.text,
    },
    '.lm-lsp-doc': {
      padding: '6px 9px',
      maxWidth: '460px',
      maxHeight: '260px',
      overflow: 'auto',
      borderTop: `1px solid ${ui.border}`,
      color: ui.textMuted,
      fontFamily: 'system-ui, sans-serif',
      fontSize: `${Math.max(10, effects.fontSize - 2)}px`,
    },
    '.lm-md p, .lm-md ul, .lm-md ol, .lm-md blockquote': { margin: '0 0 6px 0' },
    '.lm-md > :last-child': { marginBottom: 0 },
    '.lm-md pre': {
      margin: '0 0 6px 0',
      padding: '6px 8px',
      borderRadius: 'var(--radius-sm)',
      backgroundColor: ui.bgInput,
      overflow: 'auto',
      fontFamily: effects.fontFamily,
      fontSize: `${Math.max(10, effects.fontSize - 1)}px`,
      whiteSpace: 'pre',
    },
    '.lm-md code': {
      fontFamily: effects.fontFamily,
      fontSize: '0.95em',
      padding: '0 3px',
      borderRadius: '3px',
      backgroundColor: ui.bgInput,
    },
    '.lm-md pre code': { padding: 0, backgroundColor: 'transparent' },
    '.lm-md h3, .lm-md h4, .lm-md h5, .lm-md h6': { margin: '4px 0', fontSize: '1em', fontWeight: '600' },
    '.lm-md ul, .lm-md ol': { paddingLeft: '18px' },
    '.lm-md hr': { border: 'none', borderTop: `1px solid ${ui.border}`, margin: '6px 0' },
    '.lm-md a': { color: ui.accent, textDecoration: 'none' },
    '.lm-md blockquote': { borderLeft: `2px solid ${ui.border}`, paddingLeft: '8px', color: ui.textMuted },
  };
}

/** Signature help and inlay hints. */
function signatureStyles(ui: Theme['ui'], effects: Effects): Record<string, Record<string, string | number>> {
  return {
    '.lm-signature': {
      padding: '7px 10px',
      maxWidth: '620px',
      fontFamily: effects.fontFamily,
      fontSize: `${Math.max(11, effects.fontSize - 1)}px`,
      color: ui.text,
    },
    '.lm-signature-label': { whiteSpace: 'pre-wrap' },
    '.lm-signature-active': {
      fontWeight: '700',
      color: ui.accent,
      textDecoration: 'underline',
      textDecorationColor: ui.accent,
      textUnderlineOffset: '2px',
    },
    '.lm-signature-doc': {
      marginTop: '5px',
      paddingTop: '5px',
      borderTop: `1px solid ${ui.border}`,
      color: ui.textMuted,
      fontFamily: 'system-ui, sans-serif',
      fontSize: `${Math.max(10, effects.fontSize - 2)}px`,
    },
    '.lm-signature-count': { float: 'right', marginLeft: '10px', color: ui.textSubtle, fontSize: '0.85em' },
    '.lm-inlay': {
      display: 'inline-block',
      padding: '0 4px',
      margin: '0 1px',
      borderRadius: '4px',
      fontSize: '0.82em',
      lineHeight: '1.3',
      verticalAlign: 'baseline',
      color: ui.textMuted,
      backgroundColor: ui.bgActive,
      opacity: 0.85,
      pointerEvents: 'none',
      fontFamily: effects.fontFamily,
    },
    '.lm-inlay-type': { fontStyle: 'italic' },
    '.lm-highlight-read': { backgroundColor: `rgb(${hexToRgbChannels(ui.accent)} / 16%)`, borderRadius: '2px' },
    '.lm-highlight-write': { backgroundColor: `rgb(${hexToRgbChannels(ui.warning)} / 22%)`, borderRadius: '2px' },
    '.lm-highlight-text': { backgroundColor: ui.bgActive, borderRadius: '2px' },
  };
}

/** Context menus and highlight ranges. */
function menuStyles(ui: Theme['ui'], effects: Effects): Record<string, Record<string, string | number>> {
  return {
    '.lm-menu': { minWidth: '260px', maxWidth: '520px', maxHeight: '300px', overflow: 'auto', padding: '4px' },
    '.lm-menu-title': {
      padding: '4px 8px 6px',
      fontSize: '10.5px',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: ui.textSubtle,
    },
    '.lm-menu-item': {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '5px 8px',
      borderRadius: 'var(--radius-sm)',
      cursor: 'pointer',
      fontSize: `${Math.max(11, effects.fontSize - 1)}px`,
      color: ui.text,
      fontFamily: 'system-ui, sans-serif',
    },
    '.lm-menu-item[aria-selected="true"], .lm-menu-item:hover': {
      backgroundColor: ui.accent,
      color: ui.accentText,
    },
    '.lm-menu-item[aria-disabled="true"]': { opacity: 0.45, cursor: 'default' },
    '.lm-menu-kind': { fontSize: '0.8em', opacity: 0.7, marginLeft: 'auto', whiteSpace: 'nowrap' },
    '.lm-menu-empty': { padding: '8px', color: ui.textMuted, fontSize: '12px' },
  };
}

/** The inline rename box. */
function renameStyles(ui: Theme['ui'], effects: Effects): Record<string, Record<string, string | number>> {
  return {
    '.lm-rename': { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px' },
    '.lm-rename input': {
      minWidth: '180px',
      padding: '3px 6px',
      border: `1px solid ${ui.accent}`,
      borderRadius: 'var(--radius-sm)',
      backgroundColor: ui.bgInput,
      color: ui.text,
      fontFamily: effects.fontFamily,
      fontSize: `${effects.fontSize}px`,
      outline: 'none',
    },
    '.lm-rename-hint': { fontSize: '10.5px', color: ui.textSubtle, whiteSpace: 'nowrap' },
  };
}

/** Quick-fix actions and fold placeholders. */
function miscStyles(ui: Theme['ui']): Record<string, Record<string, string | number>> {
  return {
    '.cm-lintRange-deprecated': { textDecoration: 'line-through', textDecorationColor: ui.textMuted },
    '.cm-lintRange-unnecessary': { opacity: 0.6 },
    '.cm-diagnosticAction': {
      backgroundColor: ui.bgActive,
      color: ui.text,
      borderRadius: 'var(--radius-sm)',
      padding: '1px 6px',
      marginLeft: '6px',
      fontSize: '11px',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: ui.bgActive,
      border: 'none',
      color: ui.textMuted,
      borderRadius: '4px',
      padding: '0 6px',
    },
  };
}

export function editorTheme(theme: Theme, effects: Effects): Extension {
  const ui = theme.ui;
  const dark = theme.type === 'dark';

  const highlight = HighlightStyle.define(
    TOKEN_KINDS.flatMap((kind) => {
      const raw = theme.syntax[kind];
      if (!raw) {
        return [];
      }
      const s = normalizeSyntax(raw);
      return [{
        tag: tokenTags[kind],
        color: s.color,
        fontStyle: s.italic ? 'italic' : undefined,
        fontWeight: s.bold ? '600' : undefined,
        textDecoration: s.underline ? 'underline' : undefined,
      }];
    }),
  );

  const selection = selectionColors(ui);
  const view = EditorView.theme(
    {
      ...baseEditorStyles(ui, effects),
      ...cursorStyles(effects, ui.cursor),
      '&.cm-focused .cm-cursor': { animationDuration: effects.cursorBlink ? '1.2s' : '0s' },
      ...selectionStyles(ui, selection),
      ...panelStyles(ui, effects),
      ...tooltipStyles(ui),
      ...completionPopupStyles(theme, effects),
      ...lintStyles(ui, effects),
      ...hoverStyles(ui, effects),
      ...signatureStyles(ui, effects),
      ...menuStyles(ui, effects),
      ...renameStyles(ui, effects),
      ...miscStyles(ui),
    },
    { dark },
  );

  return [view, syntaxHighlighting(highlight)];
}
