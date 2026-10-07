/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { RangeSetBuilder, StateEffect, StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { debug } from '../manager';
import { samePath } from '../state/paths';
import { infoFacet } from './marks';

interface InlineInfo {
  line: number;
  values: Map<string, string>;
}

export const setInline = StateEffect.define<InlineInfo | null>();

export function inlineFor(path: string | null): InlineInfo | null {
  const inline = debug.inline;
  if (!inline || !debug.showInline || !samePath(inline.path, path)) {
    return null;
  }
  return { line: inline.line, values: inline.values };
}

export const inlineField = StateField.define<InlineInfo | null>({
  create: (state) => inlineFor(state.facet(infoFacet).path),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setInline)) {
        return effect.value;
      }
    }
    // After a change the values no longer line up with the text.
    if (tr.docChanged) {
      return null;
    }
    return value;
  },
});

class InlineWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: InlineWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'lm-debug-inline';
    span.textContent = this.text;
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

const MAX_INLINE = 60;

function shorten(value: string, max = 40) {
  const flat = value.replace(/\s+/g, ' ');
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Every variable at its last occurrence above the execution line. */
function inlineDecorations(state: EditorState): DecorationSet {
  const info = state.field(inlineField);
  if (!info || !info.values.size) {
    return Decoration.none;
  }
  const last = Math.min(info.line + 1, state.doc.lines);
  const first = Math.max(1, last - MAX_INLINE);
  const seen = new Set<string>();
  const perLine = new Map<number, string[]>();
  for (let number = last; number >= first; number--) {
    for (const match of state.doc.line(number).text.matchAll(IDENTIFIER)) {
      const name = match[0];
      if (seen.has(name) || !info.values.has(name)) {
        continue;
      }
      seen.add(name);
      const list = perLine.get(number) ?? [];
      list.push(`${name} = ${shorten(info.values.get(name) ?? '')}`);
      perLine.set(number, list);
    }
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const number of [...perLine.keys()].sort((a, b) => a - b)) {
    const text = perLine.get(number)!.slice(0, 5).join(', ');
    builder.add(state.doc.line(number).to, state.doc.line(number).to, Decoration.widget({ widget: new InlineWidget(text), side: 1 }));
  }
  return builder.finish();
}

export const inlineDecorationsExt = EditorView.decorations.compute([inlineField], inlineDecorations);
