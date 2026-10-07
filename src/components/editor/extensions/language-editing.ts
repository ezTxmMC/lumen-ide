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
 * The typing behaviour a language declares: Enter inside a doc comment
 * (`LanguageSpec.comments.docBlock`) and self-completing text such as
 * `<?nv` (`LanguageSpec.autoClose`). The rules themselves are pure and live
 * in `core/editor`; this only applies them to the editor.
 */

import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { continuesDocBlock, docBlockEnter, type EnterContext } from '@/core/editor/comment-rules';
import { autoCloseFor } from '@/core/editor/typing-rules';
import type { LanguageSpec } from '@/core/types';

/** How far below the cursor the search for a closing `*\/` reaches. */
const BELOW_LIMIT = 4000;

function enterContext(state: EditorState, close: boolean): EnterContext {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return {
    lineBefore: line.text.slice(0, head - line.from),
    lineAfter: line.text.slice(head - line.from),
    above: (n) => (line.number - n < 1 ? null : state.doc.line(line.number - n).text),
    below: state.sliceDoc(line.to, Math.min(state.doc.length, line.to + BELOW_LIMIT)),
    close,
  };
}

function enterInDocBlock(close: boolean) {
  return (view: EditorView): boolean => {
    const { state } = view;
    if (state.readOnly || state.selection.ranges.length !== 1 || !state.selection.main.empty) {
      return false;
    }
    const edit = docBlockEnter(enterContext(state, close));
    if (!edit) {
      return false;
    }
    const head = state.selection.main.head;
    view.dispatch({
      changes: { from: head, to: head + edit.deleteAfter, insert: edit.insert },
      selection: { anchor: head + edit.cursor },
      scrollIntoView: true,
      userEvent: 'input',
    });
    return true;
  };
}

const typedRules = (spec: LanguageSpec) => EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to || view.state.readOnly) {
    return false;
  }
  const line = view.state.doc.lineAt(from);
  const edit = autoCloseFor(spec.autoClose, line.text.slice(0, from - line.from), text, line.text.slice(from - line.from));
  if (!edit) {
    return false;
  }
  view.dispatch({
    changes: { from, insert: edit.insert },
    selection: { anchor: from + edit.cursor },
    userEvent: 'input.type',
  });
  return true;
});

export interface LanguageEditingOptions {
  /** The "close brackets automatically" setting: it also decides on the closing line of a new doc comment and on `autoClose`. */
  autoClose: boolean;
}

/** The extensions for this language; empty when it declares nothing. */
export function languageEditing(spec: LanguageSpec | null, options: LanguageEditingOptions): Extension[] {
  const out: Extension[] = [];
  if (!spec) {
    return out;
  }
  if (continuesDocBlock(spec)) {
    out.push(Prec.high(keymap.of([{ key: 'Enter', run: enterInDocBlock(options.autoClose) }])));
  }
  if (options.autoClose && spec.autoClose?.length) {
    out.push(typedRules(spec));
  }
  return out;
}
