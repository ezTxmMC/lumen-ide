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
 * A narrow bridge between the store or the panels and the running CodeMirror
 * view.
 *
 * The editor registers itself here; everything else — the references panel,
 * the outline, workspace edits, navigation commands — talks to it only through
 * these functions.
 */

import { EditorView } from '@codemirror/view';
import type { ChangeSpec } from '@codemirror/state';

let view: EditorView | null = null;
let currentTabId: string | null = null;
const listeners = new Set<() => void>();

export const editorBridge = {
  /**
   * Set by the editor: runs before the active tab is saved (formatting,
   * organising imports) and changes the document through a transaction.
   */
  beforeSave: null as ((tabId: string) => Promise<void>) | null,

  attach(next: EditorView | null, tabId: string | null) {
    view = next;
    currentTabId = tabId;
    for (const fn of listeners) {
      fn();
    }
  },

  get view() {
    return view;
  },

  get tabId() {
    return currentTabId;
  },

  /** Place the cursor and scroll the line to the middle (0-based, as in LSP). */
  reveal(line: number, character: number, endLine?: number, endCharacter?: number) {
    if (!view) {
      return;
    }
    const doc = view.state.doc;
    const lineNumber = Math.min(Math.max(line + 1, 1), doc.lines);
    const target = doc.line(lineNumber);
    const anchor = Math.min(target.from + Math.max(0, character), target.to);
    let head = anchor;
    if (endLine !== undefined && endCharacter !== undefined) {
      const endLineNumber = Math.min(Math.max(endLine + 1, 1), doc.lines);
      const endTarget = doc.line(endLineNumber);
      head = Math.min(endTarget.from + Math.max(0, endCharacter), endTarget.to);
    }
    view.dispatch({
      selection: { anchor, head },
      effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
    });
    view.focus();
  },

  /** Apply changes as one transaction, so undo works. */
  applyChanges(changes: ChangeSpec[]) {
    if (!view || !changes.length) {
      return false;
    }
    view.dispatch({ changes, userEvent: 'lsp.edit' });
    return true;
  },

  focus() {
    view?.focus();
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
