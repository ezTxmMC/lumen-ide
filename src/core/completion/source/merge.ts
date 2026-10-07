/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { type Completion } from '@codemirror/autocomplete';
import { type Text } from '@codemirror/state';
import type { LspClient } from '@/core/lsp/client';
import type { CompletionItem, CompletionList } from '@/core/lsp/protocol';
import { lspItemDeprecated, lspItemLabel, lspItemToCompletion } from '@/components/editor/lsp/lsp-completion';
import { posToOffset } from '@/core/completion/apply';
import { prepare } from '../matcher';
import { kindClass, lspBoost } from '../ranking';
import { importPriority, localityOf, type ImportScope } from '../context';
import { type CompletionCandidate } from '../words';
import { type WordMatcher, cursorWord } from './words';

/* ------------------------------------------------------------------ *
 * Server list
 * ------------------------------------------------------------------ */

export interface ServerList {
  key: string;
  entries: CompletionCandidate[];
  isIncomplete: boolean;
  /** What had been typed when the request went out. */
  pattern: string;
  /** Where the filter text starts: the earliest `textEdit` start (`@`, `list.` of a postfix item) or the word start. */
  from: number;
}

/** Imported stays on top; of what is not imported, the sensible module for the language comes first. */
function localityWithPriority(locality: number, priority: number): number {
  return locality === 1 ? 1 : locality + priority;
}

function sortKey(item: CompletionItem): string {
  return item.sortText ?? item.label;
}

/** What tells same-label entries apart: package or detail, signature, kind. */
function identityOf(item: CompletionItem, qualifier: string | undefined): string {
  return `${qualifier ?? ''}\0${item.labelDetails?.detail ?? ''}\0${item.kind ?? 0}`;
}

function editStart(item: CompletionItem, doc: Text, lineFrom: number, wordFrom: number): number | null {
  const range = item.textEdit?.range ?? item.textEdit?.replace ?? item.textEdit?.insert;
  if (!range) {
    return null;
  }
  const start = posToOffset(doc, range.start);
  if (start < lineFrom || start > wordFrom) {
    return null;
  }
  return start;
}

/** Where a server answer sits in the document. */
export interface AnswerSite {
  doc: Text;
  wordFrom: number;
  scope: ImportScope;
  filePath: string;
  /** The word rules of the language — to find the word start again when an item is accepted. */
  before: WordMatcher;
  languageId: string | undefined;
}

/**
 * An item without its own `textEdit` replaces only the typed word. The list
 * as a whole may start earlier (the dot of a `?.`/`[...]` item, `@`), and
 * CodeMirror hands that start to every option — which swallowed the `.` of
 * `xyz.|` (`xyz.map` became `xyzmap()`).
 */
function withWordRange(data: Completion, before: WordMatcher): Completion {
  const apply = data.apply;
  if (typeof apply !== 'function') {
    return data;
  }
  return {
    ...data,
    apply: (view, completion, from, to) => {
      const word = cursorWord(view.state, to, before);
      apply(view, completion, Math.max(from, word.from), to);
    },
  };
}

/**
 * Take a new answer. Only when the answer is empty (a typo, an error) the
 * last suggestions stay, demoted, and the list counts as incomplete so the
 * next keystroke asks again.
 */
export function mergeServerList(
  previous: ServerList | null, list: CompletionList, key: string, pattern: string, client: LspClient,
  site: AnswerSite,
): ServerList {
  const items = list.items;
  if (!items.length) {
    const kept = (previous?.entries ?? []).map((entry) => ({ ...entry, boost: Math.max(entry.boost - 4, -12) }));
    return { key, entries: kept, isIncomplete: true, pattern, from: previous?.from ?? site.wordFrom };
  }
  const { doc, wordFrom, scope, filePath, before } = site;
  const lineFrom = doc.lineAt(wordFrom).from;
  const starts = items.map((item) => editStart(item, doc, lineFrom, wordFrom));
  let from = wordFrom;
  for (const start of starts) {
    if (start !== null && start < from) {
      from = start;
    }
  }
  const defaults = (list as { itemDefaults?: { commitCharacters?: string[]; }; }).itemDefaults?.commitCharacters;

  const order = items.map((item, index) => ({ item, index }));
  order.sort((a, b) => {
    const ka = sortKey(a.item);
    const kb = sortKey(b.item);
    if (ka === kb) {
      return a.index - b.index;
    }
    return ka < kb ? -1 : 1;
  });
  const entries: CompletionCandidate[] = [];
  order.forEach(({ item, index: original }, index) => {
    const label = lspItemLabel(item);
    let data = lspItemToCompletion(client, item, filePath);
    if (from < wordFrom && starts[original] === null) {
      data = withWordRange(data, before);
    }
    const commit = item.commitCharacters ?? defaults;
    if (commit?.length && !data.commitCharacters) {
      data = { ...data, commitCharacters: commit };
    }
    const qualifier = item.labelDetails?.description ?? item.detail?.split('\n')[0];
    const start = starts[original] ?? wordFrom;
    const lead = from < wordFrom ? doc.sliceString(from, start) : '';
    const filter = item.filterText?.trim() || label;
    entries.push({
      label,
      filter: prepare(lead && !filter.startsWith(lead) ? lead + filter : filter),
      origin: 'lsp',
      kind: kindClass(item.kind),
      boost: lspBoost(index, order.length, Boolean(item.preselect), lspItemDeprecated(item), item.kind),
      identity: identityOf(item, qualifier),
      deprecated: lspItemDeprecated(item),
      locality: localityWithPriority(localityOf(scope, label, qualifier), importPriority(site.languageId, qualifier)),
      data,
    });
  });
  return { key, entries, isIncomplete: list.isIncomplete, pattern, from };
}
