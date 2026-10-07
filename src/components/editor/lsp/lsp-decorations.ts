/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { offsetToPos, posToOffset } from '@/core/completion/apply';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { plainText, type DocumentHighlight, type InlayHint } from '@/core/lsp/protocol';
import { symbolStore } from '@/lib/editor/symbols';
import { rangeToOffsets, readyClient } from './lsp-support';

const setHighlights = StateEffect.define<DecorationSet>();

export const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setHighlights)) {
        return e.value;
      }
    }
    return tr.docChanged ? Decoration.none : value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const HIGHLIGHT_MARK: Record<number, Decoration> = {
  1: Decoration.mark({ class: 'lm-highlight-text' }),
  2: Decoration.mark({ class: 'lm-highlight-read' }),
  3: Decoration.mark({ class: 'lm-highlight-write' }),
};

export function highlightPlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private lastPos = -1;

    update(update: ViewUpdate) {
      if (!update.selectionSet && !update.docChanged) {
        return;
      }
      const head = update.state.selection.main.head;
      if (head === this.lastPos && !update.docChanged) {
        return;
      }
      this.lastPos = head;
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.request(update.view, head);
      }, 220);
    }

    async request(view: EditorView, head: number) {
      const client = readyClient(filePath);
      if (!client?.supports('documentHighlightProvider')) {
        return;
      }
      if (!view.state.wordAt(head)) {
        if (view.state.field(highlightField, false)?.size) {
          view.dispatch({ effects: setHighlights.of(Decoration.none) });
        }
        return;
      }
      const hits: DocumentHighlight[] = await client.documentHighlight(filePath, offsetToPos(view.state.doc, head));
      if (view.state.selection.main.head !== head) {
        return;
      }
      const doc = view.state.doc;
      const ranges = hits
        .map((h) => {
          const { from, to } = rangeToOffsets(doc, h.range);
          return from < to ? HIGHLIGHT_MARK[h.kind ?? 1].range(from, to) : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => a.from - b.from);
      view.dispatch({ effects: setHighlights.of(Decoration.set(ranges)) });
    }

    destroy() {
      if (this.timer) {
        clearTimeout(this.timer);
      }
    }
  });
}

class InlayWidget extends WidgetType {
  constructor(readonly text: string, readonly kind: number | undefined, readonly padLeft: boolean, readonly padRight: boolean, readonly tooltip: string) {
    super();
  }
  eq(other: InlayWidget) {
    return other.text === this.text && other.kind === this.kind;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = `lm-inlay${this.kind === 1 ? ' lm-inlay-type' : ' lm-inlay-param'}`;
    span.textContent = `${this.padLeft ? ' ' : ''}${this.text}${this.padRight ? ' ' : ''}`;
    if (this.tooltip) {
      span.title = this.tooltip;
    }
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

const setInlayHints = StateEffect.define<DecorationSet>();

/** Triggered by the editor when the server asks for a recomputation, or becomes ready. */
export const lspRefresh = StateEffect.define<'inlayHint' | 'symbols' | 'all'>();

export const inlayField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setInlayHints)) {
        return e.value;
      }
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function inlayPlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private generation = 0;

    constructor(readonly view: EditorView) {
      this.schedule(400);
    }

    update(update: ViewUpdate) {
      const refresh = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(lspRefresh) && (e.value === 'inlayHint' || e.value === 'all')));
      if (update.docChanged || update.viewportChanged || refresh) {
        this.schedule(update.docChanged ? 350 : 120);
      }
    }

    schedule(delay: number) {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.request();
      }, delay);
    }

    async request() {
      const client = readyClient(filePath);
      if (!client?.supports('inlayHintProvider')) {
        return;
      }
      const view = this.view;
      const generation = ++this.generation;
      const doc = view.state.doc;
      const from = Math.max(0, view.viewport.from - 2000);
      const to = Math.min(doc.length, view.viewport.to + 2000);
      const hints: InlayHint[] = await client.inlayHints(filePath, {
        start: offsetToPos(doc, from),
        end: offsetToPos(doc, to),
      });
      if (generation !== this.generation || view.state.doc !== doc) {
        if (generation === this.generation) {
          this.schedule(200);
        }
        return;
      }
      const decorations = hints
        .map((hint) => {
          const pos = posToOffset(doc, hint.position);
          const text = typeof hint.label === 'string' ? hint.label : hint.label.map((p) => p.value).join('');
          const tooltip = plainText(hint.tooltip) || (Array.isArray(hint.label) ? plainText(hint.label[0]?.tooltip) : '');
          return Decoration.widget({
            widget: new InlayWidget(text.trim(), hint.kind, Boolean(hint.paddingLeft), Boolean(hint.paddingRight), tooltip),
            side: 1,
          }).range(pos);
        })
        .sort((a, b) => a.from - b.from);
      view.dispatch({ effects: setInlayHints.of(Decoration.set(decorations, true)) });
    }

    destroy() {
      if (this.timer) {
        clearTimeout(this.timer);
      }
    }
  });
}

export function symbolPlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private attempts = 0;

    constructor(readonly view: EditorView) {
      this.schedule(300);
    }

    update(update: ViewUpdate) {
      const refresh = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(lspRefresh) && (e.value === 'symbols' || e.value === 'all')));
      if (update.docChanged) {
        this.schedule(700);
        return;
      }
      if (refresh) {
        this.schedule(100);
      }
    }

    schedule(delay: number) {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.request();
      }, delay);
    }

    async request() {
      const client = readyClient(filePath);
      if (!client?.supports('documentSymbolProvider')) {
        // The server is still starting — try again a few times.
        if (this.attempts++ < 20) {
          this.schedule(1500);
        }
        return;
      }
      this.attempts = 0;
      const symbols = await client.documentSymbols(filePath);
      symbolStore.set(filePath, symbols);
    }

    destroy() {
      if (this.timer) {
        clearTimeout(this.timer);
      }
    }
  });
}
