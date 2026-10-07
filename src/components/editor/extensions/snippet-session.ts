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
 * Tab-stop navigation for an inserted snippet.
 *
 * CodeMirror's own `snippet()` inserts text itself, so it cannot be combined
 * with auto-import edits in one transaction. This session takes the stops
 * computed by `planCompletion` (already in final coordinates) and only handles
 * what comes afterwards: Tab / Shift-Tab between stops, mirrors edited together
 * through a multi-selection, and Escape or a click elsewhere ending it.
 */

import { EditorSelection, Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view';
import type { SnippetStop } from '@/core/completion/snippet';

export interface Session { stops: SnippetStop[]; active: number; }

const setSession = StateEffect.define<Session | null>();

function contains(session: Session, selection: EditorSelection): boolean {
  const ranges = session.stops[session.active].ranges;
  return selection.ranges.every((sel) => ranges.some((r) => r.from <= sel.from && sel.to <= r.to));
}

const sessionField = StateField.define<Session | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSession)) {
        return effect.value;
      }
    }
    if (!value || (!tr.docChanged && !tr.selection)) {
      return value;
    }
    const next: Session = tr.docChanged
      ? {
        active: value.active,
        stops: value.stops.map((stop) => ({
          ...stop,
          ranges: stop.ranges.map((r) => ({ from: tr.changes.mapPos(r.from, -1), to: tr.changes.mapPos(r.to, 1) })),
        })),
      }
      : value;
    return contains(next, tr.newSelection) ? next : null;
  },
  provide: (field) => EditorView.decorations.from(field, (session): DecorationSet => {
    if (!session) {
      return Decoration.none;
    }
    const marks = session.stops.flatMap((stop, index) => stop.ranges
      .filter((r) => r.to > r.from)
      .map((r) => Decoration.mark({
        class: index === session.active ? 'cm-lm-snippet-field cm-lm-snippet-active' : 'cm-lm-snippet-field',
      }).range(r.from, r.to)));
    return Decoration.set(marks, true);
  }),
});

function move(view: EditorView, direction: 1 | -1): boolean {
  const session = view.state.field(sessionField, false);
  if (!session) {
    return false;
  }
  const index = session.active + direction;
  if (index < 0 || index >= session.stops.length) {
    return false;
  }
  const ranges = session.stops[index].ranges.map((r) => EditorSelection.range(r.from, r.to));
  const isLast = index === session.stops.length - 1;
  view.dispatch({
    selection: EditorSelection.create(ranges, 0),
    effects: setSession.of(isLast ? null : { stops: session.stops, active: index }),
    scrollIntoView: true,
    userEvent: 'select',
  });
  return true;
}

const sessionExtension: Extension = [
  sessionField,
  Prec.highest(keymap.of([
    { key: 'Tab', run: (view) => move(view, 1) },
    { key: 'Shift-Tab', run: (view) => move(view, -1) },
    {
      key: 'Escape',
      run: (view) => {
        if (!view.state.field(sessionField, false)) {
          return false;
        }
        view.dispatch({ effects: setSession.of(null) });
        return true;
      },
    },
  ])),
  EditorView.baseTheme({
    '.cm-lm-snippet-field': { backgroundColor: 'rgba(128, 128, 128, 0.16)', borderRadius: '2px' },
    '.cm-lm-snippet-active': { backgroundColor: 'rgba(128, 128, 128, 0.32)' },
  }),
];

/** Installs the session on first use (a separate, change-free transaction — no undo entry). */
export function ensureSnippetSession(view: EditorView) {
  if (view.state.field(sessionField, false) !== undefined) {
    return;
  }
  view.dispatch({ effects: StateEffect.appendConfig.of(sessionExtension) });
}

/** The effect that starts a session with stops in the coordinates of the transaction's result. */
export function startSnippetSession(stops: SnippetStop[]): StateEffect<Session | null> {
  return setSession.of({ stops, active: 0 });
}

export function snippetSessionActive(state: EditorState): boolean {
  return Boolean(state.field(sessionField, false));
}
