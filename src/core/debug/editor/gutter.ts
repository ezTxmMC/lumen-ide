/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Prec, RangeSetBuilder } from '@codemirror/state';
import { EditorView, GutterMarker, gutter } from '@codemirror/view';
import { breakpoints } from '../state/breakpoints';
import { infoFacet, marksField, execField } from './marks';
import { setMenu } from './menu';

/* ------------------------------------------------------------------ *
 * Gutter
 * ------------------------------------------------------------------ */

class BreakpointMarker extends GutterMarker {
  constructor(readonly classes: string, readonly title: string, readonly exec: 'top' | 'frame' | null) {
    super();
  }

  eq(other: BreakpointMarker) {
    return other.classes === this.classes && other.title === this.title && other.exec === this.exec;
  }

  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'lm-debug-mark';
    if (this.title) {
      wrap.title = this.title;
    }
    if (this.classes) {
      const dot = document.createElement('div');
      dot.className = this.classes;
      wrap.append(dot);
    }
    if (this.exec) {
      const arrow = document.createElement('div');
      arrow.className = this.exec === 'top' ? 'lm-exec-arrow' : 'lm-exec-arrow lm-exec-arrow-frame';
      wrap.append(arrow);
    }
    return wrap;
  }
}

function gutterMarkers(view: EditorView) {
  const state = view.state;
  const marks = state.field(marksField);
  const exec = state.field(execField);
  const byPos = new Map<number, { classes: string; title: string; exec: 'top' | 'frame' | null; }>();
  for (const mark of marks) {
    byPos.set(mark.pos, { classes: mark.classes, title: mark.title, exec: null });
  }
  if (exec) {
    const existing = byPos.get(exec.pos);
    byPos.set(exec.pos, { classes: existing?.classes ?? '', title: existing?.title ?? '', exec: exec.top ? 'top' : 'frame' });
  }
  const builder = new RangeSetBuilder<GutterMarker>();
  for (const pos of [...byPos.keys()].sort((a, b) => a - b)) {
    const entry = byPos.get(pos)!;
    builder.add(pos, pos, new BreakpointMarker(entry.classes, entry.title, entry.exec));
  }
  return builder.finish();
}

const spacer = new BreakpointMarker('lm-bp', '', null);

/* ------------------------------------------------------------------ *
 * The extension, per tab
 * ------------------------------------------------------------------ */

export const debugGutter = Prec.highest(gutter({
  class: 'lm-debug-gutter',
  markers: gutterMarkers,
  initialSpacer: () => spacer,
  domEventHandlers: {
    mousedown(view, line, event) {
      const mouse = event as MouseEvent;
      if (mouse.button !== 0) {
        return false;
      }
      const { path } = view.state.facet(infoFacet);
      if (!path) {
        return false;
      }
      breakpoints.toggle(path, view.state.doc.lineAt(line.from).number - 1);
      return true;
    },
    contextmenu(view, line, event) {
      const { path } = view.state.facet(infoFacet);
      if (!path) {
        return false;
      }
      event.preventDefault();
      view.dispatch({ effects: setMenu.of({ pos: line.from, line: view.state.doc.lineAt(line.from).number - 1 }) });
      return true;
    },
  },
}));
