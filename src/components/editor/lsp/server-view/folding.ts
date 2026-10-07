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
 * Folding ranges from the language server. Where the server has them they
 * come before the editor's own guesses (braces, indentation); until its
 * answer arrives — and while an edit has made it stale — the guesses stand.
 */

import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import { foldService } from '@codemirror/language';
import { foldFor, type Folds } from '@/core/lsp/folding';
import type { FoldingRange } from '@/core/lsp/protocol';
import { readyClient } from '../lsp-support';

const setFolds = StateEffect.define<FoldingRange[]>();

export const foldsField = StateField.define<Folds>({
  create: () => ({ ranges: [], stale: true }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFolds)) {
        return { ranges: effect.value, stale: false };
      }
    }
    return tr.docChanged && !value.stale ? { ...value, stale: true } : value;
  },
});

const service = foldService.of((state, lineStart, lineEnd) => {
  const doc = state.doc;
  const found = foldFor(state.field(foldsField), doc.lineAt(lineStart).number - 1, doc.lines);
  if (!found) {
    return null;
  }
  return { from: lineEnd, to: doc.line(found.endLine + 1).to };
});

function foldPlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private attempts = 0;

    constructor(readonly view: EditorView) {
      this.schedule(600);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.schedule(700);
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

    private async request() {
      const client = readyClient(filePath);
      if (!client?.supports('foldingRangeProvider')) {
        if (!client && this.attempts++ < 20) {
          this.schedule(1500);
        }
        return;
      }
      const doc = this.view.state.doc;
      const ranges = await client.foldingRanges(filePath);
      if (this.view.state.doc !== doc) {
        this.schedule(300);
        return;
      }
      this.view.dispatch({ effects: setFolds.of(ranges) });
    }

    destroy() {
      if (this.timer) {
        clearTimeout(this.timer);
      }
    }
  });
}

export function lspFolding(filePath: string) {
  return [foldsField, Prec.high(service), foldPlugin(filePath)];
}
