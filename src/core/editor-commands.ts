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
 * Editor commands routed through the shortcut system rather than CodeMirror's
 * hard-wired keymaps, so they can be rebound freely.
 */

import type { EditorView } from '@codemirror/view';
import { EditorSelection, type StateCommand } from '@codemirror/state';
import {
  addCursorAbove, addCursorBelow, copyLineDown, copyLineUp, cursorMatchingBracket, deleteLine,
  indentLess, indentMore, insertBlankLine, moveLineDown, moveLineUp, redo, selectLine,
  selectParentSyntax, toggleBlockComment, toggleComment, undo,
} from '@codemirror/commands';
import { foldAll, foldCode, toggleFold, unfoldAll, unfoldCode } from '@codemirror/language';
import {
  findNext, findPrevious, gotoLine, openSearchPanel, selectNextOccurrence, selectSelectionMatches,
} from '@codemirror/search';
import { startCompletion } from '@codemirror/autocomplete';

type ViewCommand = (view: EditorView) => boolean;

const fromState = (command: StateCommand): ViewCommand => (view) =>
  command({ state: view.state, dispatch: (tr) => view.dispatch(tr) });

/** Replaces every selection, or the word under the cursor, with `transform(text)`. */
function transformSelection(transform: (text: string) => string): ViewCommand {
  return (view) => {
    const changes = view.state.changeByRange((range) => {
      const target = range.empty ? view.state.wordAt(range.head) ?? range : range;
      const text = view.state.sliceDoc(target.from, target.to);
      const next = transform(text);
      return {
        changes: { from: target.from, to: target.to, insert: next },
        range: EditorSelection.range(target.from, target.from + next.length),
      };
    });
    view.dispatch(view.state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

/** Append the next line to the current one (JetBrains' “join lines”). */
const joinLines: ViewCommand = (view) => {
  const changes = view.state.changeByRange((range) => {
    const line = view.state.doc.lineAt(range.head);
    if (line.number >= view.state.doc.lines) {
      return { range };
    }
    const next = view.state.doc.line(line.number + 1);
    const trimmedEnd = line.text.replace(/\s+$/, '').length;
    const from = line.from + trimmedEnd;
    const leading = /^\s*/.exec(next.text)![0].length;
    return {
      changes: { from, to: next.from + leading, insert: ' ' },
      range: EditorSelection.cursor(from + 1),
    };
  });
  view.dispatch(view.state.update(changes, { userEvent: 'input' }));
  return true;
};

/** Strip trailing whitespace throughout the document. */
const trimWhitespace: ViewCommand = (view) => {
  const changes = [];
  for (let n = 1; n <= view.state.doc.lines; n++) {
    const line = view.state.doc.line(n);
    const match = /[ \t]+$/.exec(line.text);
    if (match) {
      changes.push({ from: line.from + match.index, to: line.to });
    }
  }
  if (!changes.length) {
    return false;
  }
  view.dispatch({ changes, userEvent: 'delete' });
  return true;
};

/** Insert a line above and jump to it. */
const insertLineAbove: ViewCommand = (view) => {
  const changes = view.state.changeByRange((range) => {
    const line = view.state.doc.lineAt(range.head);
    const indent = /^\s*/.exec(line.text)![0];
    return {
      changes: { from: line.from, insert: `${indent}\n` },
      range: EditorSelection.cursor(line.from + indent.length),
    };
  });
  view.dispatch(view.state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

/** Sort the selected lines. */
const sortLines: ViewCommand = (view) => {
  const { from, to } = view.state.selection.main;
  const start = view.state.doc.lineAt(from);
  const end = view.state.doc.lineAt(to);
  if (start.number === end.number) {
    return false;
  }
  const lines = view.state.sliceDoc(start.from, end.to).split('\n');
  const sorted = [...lines].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  view.dispatch({ changes: { from: start.from, to: end.to, insert: sorted.join('\n') }, userEvent: 'input' });
  return true;
};

export const EDITOR_COMMANDS: Record<string, ViewCommand> = {
  'editor.undo': undo,
  'editor.redo': redo,
  'editor.toggleComment': toggleComment,
  'editor.toggleBlockComment': toggleBlockComment,
  'editor.copyLineDown': copyLineDown,
  'editor.copyLineUp': copyLineUp,
  'editor.deleteLine': deleteLine,
  'editor.moveLineUp': moveLineUp,
  'editor.moveLineDown': moveLineDown,
  'editor.selectLine': selectLine,
  'editor.expandSelection': selectParentSyntax,
  'editor.addCursorAbove': addCursorAbove,
  'editor.addCursorBelow': addCursorBelow,
  'editor.selectNextOccurrence': fromState(selectNextOccurrence),
  'editor.selectAllOccurrences': fromState(selectSelectionMatches),
  'editor.gotoLine': gotoLine,
  'editor.toggleFold': toggleFold,
  'editor.fold': foldCode,
  'editor.unfold': unfoldCode,
  'editor.foldAll': foldAll,
  'editor.unfoldAll': unfoldAll,
  'editor.indent': indentMore,
  'editor.outdent': indentLess,
  'editor.find': openSearchPanel,
  'editor.replace': openSearchPanel,
  'editor.findNext': findNext,
  'editor.findPrevious': findPrevious,
  'editor.jumpToBracket': cursorMatchingBracket,
  'editor.insertLineBelow': insertBlankLine,
  'editor.insertLineAbove': insertLineAbove,
  'editor.upperCase': transformSelection((s) => s.toUpperCase()),
  'editor.lowerCase': transformSelection((s) => s.toLowerCase()),
  'editor.joinLines': joinLines,
  'editor.sortLines': sortLines,
  'editor.trimWhitespace': trimWhitespace,
  'editor.triggerSuggest': startCompletion,
};
