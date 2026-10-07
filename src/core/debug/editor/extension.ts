/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useStore } from '@/state/store';
import type { EditorContext } from '@/lib/editor/editor-extensions';
import { infoFacet, marksField, execField } from './marks';
import { inlineField, inlineDecorationsExt } from './inline';
import { debugGutter } from './gutter';
import { menuField } from './menu';
import { debugHover } from './hover';
import { syncPlugin, wire } from './sync';

/* ------------------------------------------------------------------ *
 * Presentation
 * ------------------------------------------------------------------ */

const theme = EditorView.baseTheme({
  '.lm-debug-gutter': { cursor: 'pointer', minWidth: '14px' },
  '.lm-debug-gutter .cm-gutterElement': { padding: '0 2px', position: 'relative' },
  '.lm-debug-mark': {
    position: 'relative', height: '100%', minHeight: '1em', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  '.lm-debug-gutter .cm-gutterElement:empty:hover::before': {
    content: '""', position: 'absolute', left: '50%', top: '50%', width: '9px', height: '9px', borderRadius: '50%',
    backgroundColor: 'var(--c-danger)', opacity: '0.3', transform: 'translate(-50%, -50%)',
  },
  '.lm-bp': {
    width: '9px', height: '9px', borderRadius: '50%', backgroundColor: 'var(--c-danger)', boxSizing: 'border-box', position: 'relative',
  },
  '.lm-bp-disabled': { backgroundColor: 'transparent', border: '1.5px solid var(--c-text-subtle)' },
  '.lm-bp-unverified': { opacity: '0.45' },
  '.lm-bp-conditional::after': {
    content: '""', position: 'absolute', left: '2px', right: '2px', top: '3px', height: '1.5px', backgroundColor: 'var(--c-bg)',
  },
  '.lm-bp-disabled.lm-bp-conditional::after': { backgroundColor: 'var(--c-text-subtle)', left: '1px', right: '1px', top: '2px' },
  '.lm-bp-log': { borderRadius: '1px', transform: 'rotate(45deg) scale(0.9)' },
  '.lm-exec-arrow': {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-40%, -50%)', width: '0', height: '0',
    borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '8px solid var(--c-warning)',
    filter: 'drop-shadow(0 0 1px var(--c-bg))',
  },
  '.lm-exec-arrow-frame': { borderLeftColor: 'var(--c-success)' },
  '.lm-debug-exec-line': { backgroundColor: 'color-mix(in srgb, var(--c-warning) 15%, transparent)' },
  '.lm-debug-frame-line': { backgroundColor: 'color-mix(in srgb, var(--c-success) 12%, transparent)' },
  '.lm-debug-inline': {
    color: 'var(--c-text-subtle)', fontStyle: 'italic', marginLeft: '2.5em', fontSize: '0.9em', whiteSpace: 'pre', pointerEvents: 'none',
  },
  '.lm-debug-hover': { padding: '6px 10px', maxWidth: '560px', maxHeight: '320px', overflow: 'auto', fontSize: '12px' },
  '.lm-debug-hover-head': { display: 'flex', gap: '2px', whiteSpace: 'pre', lineHeight: '1.6' },
  '.lm-debug-hover-twisty': { width: '10px', display: 'inline-block', color: 'var(--c-text-subtle)' },
  '.lm-debug-hover-name': { color: 'var(--c-accent)' },
  '.lm-debug-hover-value': { color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis' },
  '.lm-debug-menu-danger': { color: 'var(--c-danger)' },
});

/** Called by the editor for each tab (`registerEditorExtension`). */
export function debugEditorExtension(ctx: EditorContext): Extension {
  wire();
  // Virtual documents (dap-source://, jdt://) get only the execution line.
  const info = infoFacet.of({ path: ctx.path, tabId: ctx.tabId });
  const base: Extension[] = [info, execField, inlineField, inlineDecorationsExt, syncPlugin, theme, debugHover];
  if (!ctx.path || /^[a-z][\w+.-]*:\/\//i.test(ctx.path)) {
    return base;
  }
  return [...base, marksField, menuField, debugGutter];
}

/** Cursor line of the active editor, 0-based — for the commands. */
export function cursorLine(): { path: string; line: number; } | null {
  const state = useStore.getState();
  const tab = state.activeTab();
  if (!tab?.path || tab.virtual) {
    return null;
  }
  return { path: tab.path, line: state.cursor.line };
}
