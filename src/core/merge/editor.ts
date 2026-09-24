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
 * Conflict blocks in the code editor: the sides tinted, and a row of actions
 * above each block — accept current, incoming or both, or compare them in the
 * merge editor. Every action is one transaction, so a single undo reverts it.
 */

import { Facet, StateField, type EditorState, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { t } from '@/i18n';
import type { EditorContext } from '@/lib/editor-extensions';
import {
  conflictAt, neighbourConflict, parseConflicts, resolutionText,
  type Conflict, type Resolution, type Span,
} from './conflicts';
import { openMergeEditorForTab } from './session';

interface Info {
  tabId: string | null;
  readonly: boolean;
}

const infoFacet = Facet.define<Info, Info>({
  combine: (values) => values[0] ?? { tabId: null, readonly: true },
});

/** Cheap test before parsing: does any line open a block? */
function hasStartMarker(doc: Text): boolean {
  for (const iter = doc.iterLines(); !iter.next().done;) {
    if (iter.value.startsWith('<<<<<<<')) {
      return true;
    }
  }
  return false;
}

const readConflicts = (doc: Text) => (hasStartMarker(doc) ? parseConflicts(doc.toString()) : []);

/** The blocks of the document, re-read on every change. */
export const conflictsField = StateField.define<Conflict[]>({
  create: (state) => readConflicts(state.doc),
  update: (value, tr) => (tr.docChanged ? readConflicts(tr.newDoc) : value),
});

/** The blocks of a view — empty when the view does not carry the extension. */
export const conflictsOf = (state: EditorState): Conflict[] => state.field(conflictsField, false) ?? [];

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/** Replace one block with a resolution. */
export function acceptConflict(view: EditorView, conflict: Conflict, resolution: Resolution) {
  const text = view.state.doc.toString();
  const insert = resolutionText(text, conflict, resolution);
  view.dispatch({
    changes: { from: conflict.from, to: conflict.to, insert },
    selection: { anchor: conflict.from },
    scrollIntoView: true,
    userEvent: 'merge.accept',
  });
}

/** Resolve the block under the cursor. False when the cursor is outside every block. */
export function acceptAtCursor(view: EditorView, resolution: Resolution): boolean {
  const conflict = conflictAt(conflictsOf(view.state), view.state.selection.main.head);
  if (!conflict) {
    return false;
  }
  acceptConflict(view, conflict, resolution);
  return true;
}

/** Resolve every block of the file the same way — one transaction. */
export function acceptAll(view: EditorView, resolution: Resolution): boolean {
  const conflicts = conflictsOf(view.state);
  if (!conflicts.length) {
    return false;
  }
  const text = view.state.doc.toString();
  view.dispatch({
    changes: conflicts.map((conflict) => ({ from: conflict.from, to: conflict.to, insert: resolutionText(text, conflict, resolution) })),
    userEvent: 'merge.accept',
  });
  return true;
}

/** Put the cursor on the next (or previous) block and scroll it into the middle. */
export function gotoConflict(view: EditorView, direction: 1 | -1): boolean {
  const target = neighbourConflict(conflictsOf(view.state), view.state.selection.main.head, direction);
  if (!target) {
    return false;
  }
  view.dispatch({
    selection: { anchor: target.from },
    effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
  });
  view.focus();
  return true;
}

export function openMergeEditorFromView(view: EditorView): boolean {
  return openMergeEditorForTab(view.state.facet(infoFacet).tabId, view.state.doc.toString());
}

/* ------------------------------------------------------------------ *
 * Decorations
 * ------------------------------------------------------------------ */

type LensAction = Resolution | 'compare';

const LENS: { action: LensAction; label: string; }[] = [
  { action: 'current', label: 'merge.lens.acceptCurrent' },
  { action: 'incoming', label: 'merge.lens.acceptIncoming' },
  { action: 'both', label: 'merge.lens.acceptBoth' },
  { action: 'compare', label: 'merge.lens.compare' },
];

/** The row of actions above a block, like a code lens. */
class ConflictLens extends WidgetType {
  constructor(readonly index: number) {
    super();
  }

  eq(other: ConflictLens) {
    return other.index === this.index;
  }

  toDOM(view: EditorView) {
    const row = document.createElement('div');
    row.className = 'lm-merge-lens';
    row.setAttribute('data-conflict', String(this.index));
    LENS.forEach(({ action, label }, index) => {
      if (index > 0) {
        row.append(Object.assign(document.createElement('span'), { className: 'lm-merge-lens-sep', textContent: '|' }));
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lm-merge-lens-action';
      button.textContent = t(label);
      button.setAttribute('data-action', action);
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        runLens(view, row, action);
      });
      row.append(button);
    });
    return row;
  }

  ignoreEvent() {
    return true;
  }
}

function runLens(view: EditorView, dom: HTMLElement, action: LensAction) {
  const pos = view.posAtDOM(dom);
  const conflict = conflictsOf(view.state).find((candidate) => candidate.to > pos);
  if (!conflict) {
    return;
  }
  if (action === 'compare') {
    openMergeEditorFromView(view);
    return;
  }
  acceptConflict(view, conflict, action);
  view.focus();
}

/** A dim note after a marker line: “(Current Change)”. */
class MarkerHint extends WidgetType {
  constructor(readonly key: string) {
    super();
  }

  eq(other: MarkerHint) {
    return other.key === this.key;
  }

  toDOM() {
    return Object.assign(document.createElement('span'), { className: 'lm-merge-hint', textContent: `(${t(this.key)})` });
  }
}

function lineClass(doc: Text, span: Span, className: string, out: Range<Decoration>[]) {
  const decoration = Decoration.line({ class: className });
  let pos = span.from;
  while (pos < span.to) {
    const line = doc.lineAt(pos);
    out.push(decoration.range(line.from));
    pos = line.to + 1;
  }
}

const markerLine = (doc: Text, span: Span, className: string, out: Range<Decoration>[]) =>
  out.push(Decoration.line({ class: `lm-merge-marker ${className}` }).range(doc.lineAt(span.from).from));

function buildDecorations(state: EditorState): DecorationSet {
  const conflicts = conflictsOf(state);
  if (!conflicts.length) {
    return Decoration.none;
  }
  const { doc } = state;
  const { readonly } = state.facet(infoFacet);
  const out: Range<Decoration>[] = [];
  conflicts.forEach((conflict, index) => {
    if (!readonly) {
      out.push(Decoration.widget({ widget: new ConflictLens(index), block: true, side: -1 }).range(conflict.from));
    }
    markerLine(doc, conflict.startMarker, 'lm-merge-marker-current', out);
    out.push(Decoration.widget({ widget: new MarkerHint('merge.lens.current'), side: 1 }).range(conflict.startMarker.to));
    lineClass(doc, conflict.current, 'lm-merge-current', out);
    if (conflict.baseMarker && conflict.base) {
      markerLine(doc, conflict.baseMarker, 'lm-merge-marker-base', out);
      out.push(Decoration.widget({ widget: new MarkerHint('merge.lens.base'), side: 1 }).range(conflict.baseMarker.to));
      lineClass(doc, conflict.base, 'lm-merge-base', out);
    }
    markerLine(doc, conflict.separator, 'lm-merge-separator', out);
    lineClass(doc, conflict.incoming, 'lm-merge-incoming', out);
    markerLine(doc, conflict.endMarker, 'lm-merge-marker-incoming', out);
    out.push(Decoration.widget({ widget: new MarkerHint('merge.lens.incoming'), side: 1 }).range(conflict.endMarker.to));
  });
  return Decoration.set(out, true);
}

const decorations = EditorView.decorations.compute([conflictsField, infoFacet], buildDecorations);

/** Tints shared with the merge editor: current in the success colour, incoming in the accent. */
export const mergeTheme = EditorView.baseTheme({
  '.lm-merge-current': { backgroundColor: 'color-mix(in srgb, var(--c-success) 12%, transparent)' },
  '.lm-merge-incoming': { backgroundColor: 'color-mix(in srgb, var(--c-accent) 12%, transparent)' },
  '.lm-merge-base': { backgroundColor: 'color-mix(in srgb, var(--c-text-subtle) 10%, transparent)' },
  '.lm-merge-marker': { fontWeight: '600' },
  '.lm-merge-marker-current': { backgroundColor: 'color-mix(in srgb, var(--c-success) 26%, transparent)' },
  '.lm-merge-marker-incoming': { backgroundColor: 'color-mix(in srgb, var(--c-accent) 26%, transparent)' },
  '.lm-merge-marker-base': { backgroundColor: 'color-mix(in srgb, var(--c-text-subtle) 22%, transparent)' },
  '.lm-merge-separator': { backgroundColor: 'color-mix(in srgb, var(--c-text-subtle) 16%, transparent)' },
  '.lm-merge-hint': { color: 'var(--c-text-subtle)', fontStyle: 'italic', marginLeft: '1em', fontWeight: '400' },
  '.lm-merge-lens': {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', padding: '3px 0 1px 2px',
    fontFamily: 'system-ui, sans-serif', fontSize: '11px', lineHeight: '16px', color: 'var(--c-text-subtle)',
  },
  '.lm-merge-lens-sep': { opacity: '0.5' },
  '.lm-merge-lens-action': {
    background: 'none', border: 'none', padding: '0 2px', margin: '0', cursor: 'pointer',
    font: 'inherit', color: 'var(--c-text-muted)', borderRadius: '3px',
  },
  '.lm-merge-lens-action:hover': { color: 'var(--c-accent)', textDecoration: 'underline' },
});

/** Called by the editor for each tab (`registerEditorExtension`). */
export function mergeEditorExtension(ctx: EditorContext): Extension {
  return [infoFacet.of({ tabId: ctx.tabId, readonly: ctx.readonly }), conflictsField, decorations, mergeTheme];
}
