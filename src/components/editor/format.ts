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
 * Format Document: ask the formatters of the add-ons, fall back on the
 * language server, polish the result, apply it as small edits.
 *
 * Used by the `editor.format` command and, when the setting is on, before a
 * save. The decisions about *how* code is formatted are not made here — the
 * formatter add-ons make them, from the project's own files.
 */

import type { EditorView } from '@codemirror/view';
import { formatFor, formatOptionsOf } from '@/core/format-settings';
import { runAfterFormatters, runFormatters } from '@/core/format/providers';
import { diffHunks } from '@/lib/text-diff';
import { t } from '@/i18n';
import { useStore } from '@/state/store';
import type { FormatRequest } from '../../../electron/features/extension-host/contract';
import { formatWithLanguageServer } from './lsp-extension';

/** Replace the document's text with `text` as the smallest set of edits. */
function applyText(view: EditorView, text: string): boolean {
  const hunks = diffHunks(view.state.doc.toString(), text);
  if (!hunks.length) {
    return false;
  }
  view.dispatch({ changes: hunks, userEvent: 'format' });
  return true;
}

function tell(messages: string[]) {
  for (const message of messages) {
    useStore.getState().notify(message, 'warning');
  }
}

interface FormatOptions {
  /** The user asked for it (the command) — say so when nothing can format the file. */
  explicit?: boolean;
}

export async function formatDocument(view: EditorView, filePath: string, options: FormatOptions = {}): Promise<boolean> {
  const state = useStore.getState();
  const spec = state.languageFor(state.activeTab());
  const format = formatFor(state.formatSettings, spec);
  const selection = view.state.selection.main;
  const request: FormatRequest = {
    path: filePath,
    languageId: spec?.id ?? null,
    text: view.state.doc.toString(),
    ...(selection.empty ? {} : { range: { from: selection.from, to: selection.to } }),
    options: formatOptionsOf(format),
    workspace: state.workspace,
  };

  const run = await runFormatters(request);
  // Typing went on while the formatter worked: its result no longer fits.
  if (view.state.doc.toString() !== request.text) {
    return false;
  }

  let changed = false;
  if (run.status === 'formatted') {
    changed = applyText(view, run.text);
    tell(run.notes);
  }
  if (run.status === 'unchanged') {
    tell(run.notes);
  }
  if (run.status === 'failed') {
    state.notify(t('format.failed', { message: run.message }), 'warning');
  }
  if (run.status === 'none' || run.status === 'failed') {
    const viaServer = await formatWithLanguageServer(view, filePath, format);
    changed = viaServer === true;
    if (viaServer === null && options.explicit && run.status === 'none') {
      state.notify(t('format.none'), 'info');
    }
  }

  const polished = await runAfterFormatters({ ...request, text: view.state.doc.toString() });
  return applyText(view, polished) || changed;
}
