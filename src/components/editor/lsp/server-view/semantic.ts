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
 * Semantic highlighting from the language server, laid over the tokenizer's.
 *
 * The server classifies identifiers the tokenizer cannot tell apart (a class
 * from a variable, a parameter from a property). The result becomes marks with
 * the class `lm-sem-<kind>`, which take the colour of the theme's token kind
 * (`--s-<kind>`). Marks of higher precedence sit inside the tokenizer's
 * spans, so they win; lexical types (keywords, strings, numbers …) are left to
 * the tokenizer — see `styleOf`.
 *
 * Full requests where the server offers them (a `delta` once it has answered),
 * a request for the viewport where it only offers ranges or the file is huge.
 * Off through the setting `semanticTokens`, for one server with
 * `LspConfig.semanticTokens: false`, and wherever the server has no provider.
 */

import { EditorView, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, StateEffect, StateField, type Text } from '@codemirror/state';
import { offsetToPos } from '@/core/completion/apply';
import type { LspClient } from '@/core/lsp/client';
import {
  applyDelta, classOf, decodeTokens, spanRange, styleOf, type SemanticSpan, type SemanticSupport, type SemanticTokens, type SemanticTokensDelta,
} from '@/core/lsp/semantic-tokens';
import { TOKEN_KINDS } from '@/core/types';
import { useStore } from '@/state/store';
import { lspRefresh } from '../lsp-decorations';
import { readyClient } from '../lsp-support';

/** Above this the whole file is not asked for when the server can answer for a range. */
const FULL_LIMIT = 400_000;
/** Lines around the viewport a range request covers. */
const RANGE_MARGIN = 80;
const setSemantic = StateEffect.define<{ set: DecorationSet; }>();

export const semanticField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSemantic)) {
        return effect.value.set;
      }
    }
    return tr.docChanged ? value.map(tr.changes) : value;
  },
  provide: (field) => Prec.high(EditorView.decorations.from(field)),
});

/** `lm-sem-<kind>` take the colour of the token kind — and fall back to what the tokenizer painted. */
export const semanticTheme = EditorView.baseTheme({
  ...Object.fromEntries(TOKEN_KINDS.map((kind) => [`.lm-sem-${kind}`, { color: `var(--s-${kind}, inherit)` }])),
  '.lm-sem-deprecated': { textDecoration: 'line-through' },
});

/** The marks of decoded spans. Spans outside the document or without a style are skipped. */
export function marksOf(doc: Text, spans: SemanticSpan[]) {
  const marks = [];
  for (const span of spans) {
    const style = styleOf(span);
    const found = style ? spanRange(doc, span) : null;
    if (!style || !found) {
      continue;
    }
    marks.push(Decoration.mark({ class: classOf(style) }).range(found.from, found.to));
  }
  return marks;
}

interface Cache {
  client: LspClient;
  resultId: string | null;
  data: number[];
}

function isDelta(answer: SemanticTokens | SemanticTokensDelta): answer is SemanticTokensDelta {
  return 'edits' in answer;
}

export function semanticPlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private generation = 0;
    private attempts = 0;
    private cache: Cache | null = null;
    private shown = false;
    private readonly unsubscribe: () => void;

    constructor(readonly view: EditorView) {
      this.unsubscribe = useStore.subscribe((state, previous) => {
        if (state.effects.semanticTokens !== previous.effects.semanticTokens || state.effects.lsp !== previous.effects.lsp) {
          this.schedule(0);
        }
      });
      this.schedule(500);
    }

    update(update: ViewUpdate) {
      const refresh = update.transactions.some((tr) => tr.effects.some((e) => e.is(lspRefresh)));
      if (refresh) {
        this.cache = null;
        this.schedule(100);
        return;
      }
      if (update.docChanged) {
        this.schedule(300);
        return;
      }
      if (update.viewportChanged && this.cache === null) {
        this.schedule(150);
      }
    }

    private schedule(delay: number) {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.request();
      }, delay);
    }

    private clear() {
      this.cache = null;
      if (!this.shown) {
        return;
      }
      this.shown = false;
      this.view.dispatch({ effects: setSemantic.of({ set: Decoration.none }) });
    }

    private async fetch(client: LspClient, support: SemanticSupport, range: boolean, doc: Text): Promise<SemanticTokens | null> {
      if (range) {
        const first = Math.max(1, doc.lineAt(this.view.viewport.from).number - RANGE_MARGIN);
        const last = Math.min(doc.lines, doc.lineAt(this.view.viewport.to).number + RANGE_MARGIN);
        return client.semanticTokensRange(filePath, {
          start: offsetToPos(doc, doc.line(first).from),
          end: offsetToPos(doc, doc.line(last).to),
        });
      }
      const cache = this.cache;
      if (support.delta && cache?.client === client && cache.resultId) {
        const answer = await client.semanticTokensDelta(filePath, cache.resultId);
        if (answer && isDelta(answer)) {
          return { resultId: answer.resultId, data: applyDelta(cache.data, answer.edits) };
        }
        if (answer) {
          return answer;
        }
      }
      return client.semanticTokensFull(filePath);
    }

    async request() {
      const state = useStore.getState();
      const client = readyClient(filePath);
      const support = client?.semanticTokens ?? null;
      if (!state.effects.lsp || !state.effects.semanticTokens || !support || !client) {
        this.clear();
        // The server may still be starting — look again a few times.
        if (!client && this.attempts++ < 20) {
          this.schedule(1500);
        }
        return;
      }
      this.attempts = 0;
      const view = this.view;
      const doc = view.state.doc;
      const range = support.range && (!support.full || doc.length > FULL_LIMIT);
      const generation = ++this.generation;
      const answer = await this.fetch(client, support, range, doc);
      if (generation !== this.generation) {
        return;
      }
      if (view.state.doc !== doc) {
        this.schedule(150);
        return;
      }
      if (!answer) {
        return;
      }
      this.cache = range ? null : { client, resultId: answer.resultId ?? null, data: answer.data };
      const marks = marksOf(doc, decodeTokens(answer.data, support.legend));
      this.shown = true;
      if (!range) {
        view.dispatch({ effects: setSemantic.of({ set: Decoration.set(marks, true) }) });
        return;
      }
      const from = doc.line(Math.max(1, doc.lineAt(view.viewport.from).number - RANGE_MARGIN)).from;
      const to = doc.line(Math.min(doc.lines, doc.lineAt(view.viewport.to).number + RANGE_MARGIN)).to;
      const kept = view.state.field(semanticField).update({ filter: (start, end) => end <= from || start >= to });
      view.dispatch({ effects: setSemantic.of({ set: kept.update({ add: marks, sort: true }) }) });
    }

    destroy() {
      this.unsubscribe();
      if (this.timer) {
        clearTimeout(this.timer);
      }
    }
  });
}
