/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { type EditorState, type Text } from '@codemirror/state';
import { registry } from '@/core/registry';
import { useStore } from '@/state/store';
import { t } from '@/i18n';
import type { LanguageSpec } from '@/core/types';
import { prepare, type Prepared } from '../matcher';
import { type Origin } from '../ranking';
import { declaredTypeBefore, nameSuggestions } from '../naming';
import { scanWords, snippetCandidates, type CompletionCandidate, type TextScan, type WordRules } from '../words';

const MAX_TABS = 12;

/** How far back the check for "inside a rule block" looks. */
export const STYLE_WINDOW = 20_000;

/** Origin and raw label per option — for the badge and for recency. */
const originOf = new WeakMap<Completion, Origin>();

export const labelOf = new WeakMap<Completion, string>();

/**
 * Prepared label per option, for highlighting the match.
 *
 * `getMatch` runs for every rendered row on every keystroke, and `prepare`
 * allocates four typed arrays each time — summed over the visible rows that
 * was pure throwaway work. The option objects themselves live on in the
 * cached candidate lists, so the entry outlasts the keystroke.
 */
const preparedLabel = new WeakMap<Completion, Prepared>();

export function labelOfCompletion(completion: Completion): Prepared {
  const known = preparedLabel.get(completion);
  if (known) {
    return known;
  }
  const fresh = prepare(completion.displayLabel ?? completion.label);
  preparedLabel.set(completion, fresh);
  return fresh;
}

export function completionOrigin(completion: Completion): Origin | undefined {
  return originOf.get(completion);
}

/**
 * Record origin and raw label of a candidate list — once per list.
 *
 * The mapping is fixed when the candidate is created and never changes.
 * Previously it ran over the result of every keystroke; in a language with a
 * large server index that meant tens of thousands of map writes per key. The
 * lists themselves are cached, stable objects, so a `WeakSet` is enough to
 * skip them the second time round.
 */
const registeredPools = new WeakSet<readonly CompletionCandidate[]>();

export function registerPool(pool: readonly CompletionCandidate[]) {
  if (registeredPools.has(pool)) {
    return;
  }
  registeredPools.add(pool);
  for (const candidate of pool) {
    originOf.set(candidate.data, candidate.origin);
    labelOf.set(candidate.data, candidate.label);
  }
}

/* ------------------------------------------------------------------ *
 * Cached pools
 * ------------------------------------------------------------------ */

interface SnippetPools { version: number; byFile: Map<string, CompletionCandidate[]>; }

const snippetCache = new WeakMap<LanguageSpec, SnippetPools>();

/**
 * The language's snippets plus those other add-ons contribute, for one file —
 * scoped snippets (`Snippet.files`, `Snippet.scope`) only where they belong.
 * Cached per registry version, file name and syntax context.
 */
export function snippetsFor(spec: LanguageSpec, filePath: string | null = null, scope: string | null = null): CompletionCandidate[] {
  const version = registry.getVersion();
  const name = `${(filePath ?? '').split(/[\\/]/).pop() ?? ''}\u0000${scope ?? ''}`;
  let pools = snippetCache.get(spec);
  if (!pools || pools.version !== version) {
    pools = { version, byFile: new Map() };
    snippetCache.set(spec, pools);
  }
  const hit = pools.byFile.get(name);
  if (hit) {
    return hit;
  }
  const merged = { ...spec, snippets: [...(spec.snippets ?? []), ...registry.snippetsFor(spec.id)] };
  const pool = snippetCandidates(merged, (s) =>
    snippetCompletion(s.body.replaceAll('$0', '${}'), {
      label: s.label,
      detail: s.detail ?? t('completion.snippet'),
      type: 'snippet',
    }), filePath, scope);
  pools.byFile.set(name, pool);
  return pool;
}

interface TabWords { content: string; languageId: string | null; pool: CompletionCandidate[]; }

const tabCache = new Map<string, TabWords>();

/** Words from other open tabs of the same language, cached per content. */
export function tabPools(spec: LanguageSpec, rules: WordRules): CompletionCandidate[][] {
  const state = useStore.getState();
  const live = new Set<string>();
  const out: CompletionCandidate[][] = [];
  for (const tab of state.tabs) {
    live.add(tab.id);
    if (tab.id === state.activeTabId || out.length >= MAX_TABS) {
      continue;
    }
    let entry = tabCache.get(tab.id);
    if (!entry || entry.content !== tab.content) {
      const languageId = state.languageFor(tab)?.id ?? null;
      const pool = languageId === spec.id
        ? scanWords(tab.content, { origin: 'tab', rules }).pool
        : [];
      entry = { content: tab.content, languageId, pool };
      tabCache.set(tab.id, entry);
    }
    if (entry.languageId !== spec.id || !entry.pool.length) {
      continue;
    }
    out.push(entry.pool);
  }
  for (const id of tabCache.keys()) {
    if (!live.has(id)) {
      tabCache.delete(id);
    }
  }
  return out;
}

const docCache = new WeakMap<Text, { from: number; scan: TextScan; }>();

export function documentScan(state: EditorState, from: number, pos: number, rules: WordRules): TextScan {
  const hit = docCache.get(state.doc);
  if (hit && hit.from === from) {
    return hit.scan;
  }
  const scan = scanWords(state.doc.toString(), { origin: 'document', rules, cursor: pos, exclude: from });
  docCache.set(state.doc, { from, scan });
  return scan;
}

/** Name suggestions for the type in front of the cursor — cached per line start, they only depend on it. */
const nameCache = new Map<string, CompletionCandidate[]>();

export function nameCandidates(lineBefore: string, languageId: string | undefined): CompletionCandidate[] {
  const type = declaredTypeBefore(lineBefore, languageId);
  if (!type) {
    return [];
  }
  const hit = nameCache.get(type);
  if (hit) {
    return hit;
  }
  const names = nameSuggestions(type);
  const pool = names.map((name, index): CompletionCandidate => ({
    label: name,
    filter: prepare(name),
    origin: 'name',
    // The first name is the best fit — the later ones follow in order.
    boost: 8 - index * 1.5,
    data: { label: name, type: 'variable', detail: t('completion.nameSuggestion') },
  }));
  if (nameCache.size > 200) {
    nameCache.clear();
  }
  nameCache.set(type, pool);
  return pool;
}
