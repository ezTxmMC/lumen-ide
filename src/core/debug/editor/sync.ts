/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { useStore } from '@/state/store';
import { breakpoints } from '../state/breakpoints';
import { debug } from '../manager';
import { infoFacet, type Mark, setMarks, marksFor, marksField, setExec, execFor, execField } from './marks';
import { setInline, inlineFor, inlineField } from './inline';

/* ------------------------------------------------------------------ *
 * Keeping store and debugger in step
 * ------------------------------------------------------------------ */

const liveViews = new Set<EditorView>();

function sameMarks(a: Mark[], b: Mark[]) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((mark, i) => mark.id === b[i].id && mark.pos === b[i].pos && mark.classes === b[i].classes && mark.title === b[i].title);
}

/** Does the editor text match the tab? If not, a change is still pending. */
function inSync(view: EditorView) {
  const { tabId } = view.state.facet(infoFacet);
  const tab = useStore.getState().tabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    return true;
  }
  return tab.content === view.state.doc.toString();
}

function syncView(view: EditorView) {
  const { path } = view.state.facet(infoFacet);
  const effects: StateEffect<unknown>[] = [];
  const currentMarks = view.state.field(marksField, false);
  const marks = currentMarks ? marksFor(view.state, path) : [];
  if (currentMarks && !pendingPush.has(view) && !sameMarks(marks, currentMarks) && inSync(view)) {
    effects.push(setMarks.of(marks));
  }
  const exec = execFor(view.state, path);
  const current = view.state.field(execField);
  if (exec?.pos !== current?.pos || exec?.top !== current?.top) {
    effects.push(setExec.of(exec));
  }
  const inline = inlineFor(path);
  const currentInline = view.state.field(inlineField);
  if (inline?.values !== currentInline?.values || inline?.line !== currentInline?.line) {
    effects.push(setInline.of(inline));
  }
  if (!effects.length) {
    return;
  }
  view.dispatch({ effects });
}

let syncQueued = false;

function syncAll() {
  if (syncQueued) {
    return;
  }
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    for (const view of liveViews) {
      syncView(view);
    }
  });
}

/** Views with mapped but not yet reported lines — the store must not overwrite them. */
const pendingPush = new WeakSet<EditorView>();

/**
 * After text changes: hand the mapped lines to the store. In a microtask, so
 * the tab contents are already up to date — other views of the same file that
 * have not seen the change count as out of step and wait.
 */
function pushLines(view: EditorView) {
  if (pendingPush.has(view)) {
    return;
  }
  pendingPush.add(view);
  queueMicrotask(() => {
    pendingPush.delete(view);
    if (!liveViews.has(view)) {
      return;
    }
    const { path } = view.state.facet(infoFacet);
    if (!path) {
      return;
    }
    const lines = new Map<string, number>();
    for (const mark of view.state.field(marksField)) {
      lines.set(mark.id, view.state.doc.lineAt(mark.pos).number - 1);
    }
    breakpoints.moveLines(path, lines);
  });
}

export const syncPlugin = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {
    liveViews.add(view);
    // Cached states, from switching tabs, may be stale.
    queueMicrotask(() => {
      if (liveViews.has(view)) {
        syncView(view);
      }
    });
  }

  update(update: ViewUpdate) {
    if (update.docChanged && update.state.field(marksField, false)?.length) {
      pushLines(update.view);
    }
  }

  destroy() {
    liveViews.delete(this.view);
  }
});

let wired = false;

export function wire() {
  if (wired) {
    return;
  }
  wired = true;
  breakpoints.subscribe(syncAll);
  debug.subscribe(syncAll);
}
