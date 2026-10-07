/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { offsetToPos } from '@/core/completion/apply';
import { EditorView, showTooltip } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { applyWorkspaceEdit } from '@/lib/editor/workspace-edit';
import { t } from '@/i18n';
import { useStore } from '@/state/store';
import { rangeToOffsets, readyClient } from './lsp-support';

interface RenameSpec { pos: number; from: number; to: number; placeholder: string; }

const setRename = StateEffect.define<RenameSpec | null>();

export const renameField = StateField.define<RenameSpec | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setRename)) {
        return e.value;
      }
    }
    return value;
  },
  provide: (field) =>
    showTooltip.compute([field], (state) => {
      const spec = state.field(field);
      if (!spec) {
        return null;
      }
      return { pos: spec.pos, above: true, create: (view) => ({ dom: renderRename(view, spec) }) };
    }),
});

let renameHandler: ((view: EditorView, name: string) => Promise<void>) | null = null;

function renderRename(view: EditorView, spec: RenameSpec): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'lm-rename';
  const input = document.createElement('input');
  input.value = spec.placeholder;
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Neuer Name');
  const hint = document.createElement('span');
  hint.className = 'lm-rename-hint';
  hint.textContent = '↵ umbenennen · Esc abbrechen';
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key !== 'Escape' && e.key !== 'Enter') {
      return;
    }
    const name = input.value.trim();
    view.dispatch({ effects: setRename.of(null) });
    view.focus();
    if (e.key === 'Escape') {
      return;
    }
    if (name && name !== spec.placeholder) {
      void renameHandler?.(view, name);
    }
  });
  dom.append(input, hint);
  queueMicrotask(() => { input.focus(); input.select(); });
  return dom;
}

export async function startRename(view: EditorView, filePath: string): Promise<boolean> {
  const client = readyClient(filePath);
  if (!client?.supports('renameProvider')) {
    useStore.getState().notify(t('lsp.editor.renameUnsupported'), 'info');
    return false;
  }
  const head = view.state.selection.main.head;
  const position = offsetToPos(view.state.doc, head);
  const prepared = await client.prepareRename(filePath, position);
  if (!prepared) {
    useStore.getState().notify(t('lsp.editor.nothingToRename'), 'info');
    return false;
  }
  let { from, to } = rangeToOffsets(view.state.doc, prepared.range);
  if (from === to) {
    const word = view.state.wordAt(head);
    if (!word) {
      return false;
    }
    from = word.from;
    to = word.to;
  }
  const placeholder = prepared.placeholder ?? view.state.sliceDoc(from, to);

  renameHandler = async (v, name) => {
    try {
      const edit = await client.rename(filePath, position, name);
      if (!edit) {
        useStore.getState().notify(t('lsp.editor.noChanges'), 'warning');
        return;
      }
      const count = Object.values(edit.changes ?? {}).reduce((n, e) => n + e.length, 0)
        + (edit.documentChanges ?? []).reduce((n, c) => n + ('edits' in c ? c.edits.length : 1), 0);
      await applyWorkspaceEdit(edit, `${placeholder} → ${name} (${count} Stellen)`);
      v.focus();
    } catch (err) {
      useStore.getState().notify(t('lsp.editor.renameFailed', { error: (err as Error).message }), 'error');
    }
  };
  view.dispatch({ effects: setRename.of({ pos: from, from, to, placeholder }) });
  return true;
}
