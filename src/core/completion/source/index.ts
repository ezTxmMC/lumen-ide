/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { completionStatus, pickedCompletion, startCompletion, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { Transaction, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { lsp } from '@/core/lsp/manager';
import type { LspClient } from '@/core/lsp/client';
import type { CompletionList } from '@/core/lsp/protocol';
import { completionClient } from '@/components/editor/lsp/lsp-completion';
import { offsetToPos } from '@/core/completion/apply';
import { scopeAt } from '@/core/editor/syntax-context';
import type { LanguageSpec } from '@/core/types';
import { Query, matchRanges } from '../matcher';
import { RankCache, proximityBonus, rank, type Ranked } from '../ranking';
import { recencySignal, recordAccepted } from '../recent';
import { contextKind, importScope, isTypedContext, listReusable, leadInBefore, triggerBefore, type ContextKind } from '../context';
import { classAttributeCandidates, inClassAttribute, insideBlock, isMarkupLanguage, isStyleLanguage, styleCandidates, styleContextBefore } from '../css-data';
import { languageCandidates, wordRulesForSpec, type CompletionCandidate, type TextScan, type WordRules } from '../words';
import { STYLE_WINDOW, labelOf, labelOfCompletion, registerPool, snippetsFor, tabPools, documentScan, nameCandidates } from './pools';
import { type CursorWord, type WordMatcher, wordMatcherFor, cursorWord } from './words';
import { type ServerList, type AnswerSite, mergeServerList } from './merge';
export { completionOrigin } from './pools';

/**
 * No cap: the list holds everything that matches, including every class from
 * the dependencies. CodeMirror renders only a window around the selection.
 */
export const RESULT_LIMIT = Number.POSITIVE_INFINITY;

const INCOMPLETE_DEBOUNCE = 50;

/** User event of the refresh — counts as typing but changes nothing. */
const REFRESH_EVENT = 'input.type.completion-refresh';

/* ------------------------------------------------------------------ *
 * The source
 * ------------------------------------------------------------------ */

export interface CompletionSourceOptions {
  spec: LanguageSpec | null;
  filePath: string | null;
}

interface Session {
  from: number;
  key: string;
  memberAccess: boolean;
  kind: ContextKind;
  statementStart: boolean;
  /** Names that fit the type just written — a declaration's variable name. */
  names: CompletionCandidate[];
  /** Properties, values, at-rules and Tailwind utilities of a stylesheet, or the utilities of a class attribute. */
  style: CompletionCandidate[][];
  /** Right after `@` in a stylesheet: the names carry no `@` and snippets would double it. */
  atRule: boolean;
  scan: TextScan;
  tabs: CompletionCandidate[][];
  cache: RankCache;
  recency: (label: string) => number;
}

export interface MergedCompletion {
  source: CompletionSource;
  /** Recency recording and lifecycle — include it alongside the source. */
  extension: Extension;
}

/** The mutable state one completion source lives on, shared by the functions below. */
interface Controller {
  spec: LanguageSpec | null;
  filePath: string | null;
  rules: WordRules;
  before: WordMatcher;
  languageKey: string;
  view: EditorView | undefined;
  plugin: ViewPlugin<{ destroy(): void }>;
  session: Session | null;
  server: ServerList | null;
  pendingKey: string | null;
  pendingPattern: string | null;
  awaitingKey: string | null;
  /** Opened by us rather than the user — `explicit` then holds only for this word start. */
  autoOpenKey: string | null;
  seq: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** The server request in flight — a new one cancels it. */
  inflight: AbortController | null;
}

function createController(options: CompletionSourceOptions): Controller {
  const { spec, filePath } = options;
  const rules = wordRulesForSpec(spec);
  const ctl: Controller = {
    spec,
    filePath,
    rules,
    before: wordMatcherFor(rules, spec?.id, spec ?? {}),
    languageKey: spec?.id ?? 'plain',
    view: undefined,
    plugin: undefined as unknown as Controller['plugin'],
    session: null,
    server: null,
    pendingKey: null,
    pendingPattern: null,
    awaitingKey: null,
    autoOpenKey: null,
    seq: 0,
    timer: null,
    inflight: null,
  };
  ctl.plugin = ViewPlugin.define((v) => {
    ctl.view = v;
    return {
      destroy() {
        if (ctl.view === v) {
          ctl.view = undefined;
        }
        if (ctl.timer) {
          clearTimeout(ctl.timer);
        }
        ctl.timer = null;
        ctl.inflight?.abort();
        ctl.inflight = null;
        ctl.seq++;
      },
    };
  });
  return ctl;
}

function clientOf(ctl: Controller): LspClient | null {
  if (!ctl.filePath || !ctl.spec?.lsp?.length || !lsp.enabled) {
    return null;
  }
  return completionClient(ctl.filePath);
}

/** The answer of a server request, once it is in and still relevant. */
function acceptAnswer(ctl: Controller, c: LspClient, list: CompletionList | null, word: CursorWord, pattern: string) {
  const v = ctl.view;
  if (!v || !v.plugin(ctl.plugin)) {
    return;
  }
  // An error is not an answer: nothing is cached, the next keystroke asks again.
  if (!list) {
    return;
  }
  const current = cursorWord(v.state, v.state.selection.main.head, ctl.before);
  if (current.key !== word.key) {
    return;
  }
  const site: AnswerSite = { doc: v.state.doc, wordFrom: word.from, scope: importScope(v.state.doc.toString()), filePath: ctl.filePath!, before: ctl.before, languageId: ctl.spec?.id };
  ctl.server = mergeServerList(ctl.server?.key === word.key ? ctl.server : null, list, word.key, pattern, c, site);
  refresh(ctl, v, word.key);
}

function request(ctl: Controller, c: LspClient, state: EditorState, word: CursorWord, trigger: string | undefined, kind?: 1 | 2 | 3) {
  const id = ++ctl.seq;
  ctl.pendingKey = word.key;
  const pattern = state.sliceDoc(word.from, word.pos);
  ctl.pendingPattern = pattern;
  ctl.inflight?.abort();
  const controller = new AbortController();
  ctl.inflight = controller;
  void c.completion(ctl.filePath!, offsetToPos(state.doc, word.pos), trigger, controller.signal, kind).then((list) => (list.failed ? null : list), () => null)
    .then((list) => {
      if (ctl.inflight === controller) {
        ctl.inflight = null;
      }
      if (id !== ctl.seq) {
        return;
      }
      ctl.pendingKey = null;
      ctl.pendingPattern = null;
      acceptAnswer(ctl, c, list, word, pattern);
    });
}

function scheduleRequest(ctl: Controller) {
  if (ctl.timer) {
    clearTimeout(ctl.timer);
  }
  ctl.timer = setTimeout(() => {
    ctl.timer = null;
    const v = ctl.view;
    const c = clientOf(ctl);
    if (!v || !c || !v.plugin(ctl.plugin)) {
      return;
    }
    request(ctl, c, v.state, cursorWord(v.state, v.state.selection.main.head, ctl.before), undefined, 3);
  }, INCOMPLETE_DEBOUNCE);
}

/** Ask the server unless something valid is already on hand for this word start and pattern. */
function ensureServer(ctl: Controller, state: EditorState, word: CursorWord, trigger: string | undefined) {
  const c = clientOf(ctl);
  if (!c) {
    return;
  }
  const pattern = state.sliceDoc(word.from, word.pos);
  const { server } = ctl;
  if (server?.key === word.key) {
    if (listReusable(server, pattern)) {
      return;
    }
    if (server.pattern === pattern) {
      return;
    }
    if (ctl.pendingKey === word.key && ctl.pendingPattern === pattern) {
      return;
    }
    scheduleRequest(ctl);
    return;
  }
  if (ctl.pendingKey === word.key) {
    return;
  }
  if (ctl.timer) {
    clearTimeout(ctl.timer);
  }
  ctl.timer = null;
  request(ctl, c, state, word, trigger);
}

/** Answer in: refresh the open list, or open one. */
function refresh(ctl: Controller, v: EditorView, key: string) {
  const status = completionStatus(v.state);
  if (status === 'pending') {
    return;
  }
  if (status === 'active') {
    v.dispatch({ annotations: Transaction.userEvent.of(REFRESH_EVENT) });
    return;
  }
  if (ctl.awaitingKey !== key || !v.hasFocus) {
    return;
  }
  ctl.awaitingKey = null;
  ctl.autoOpenKey = key;
  startCompletion(v);
}

/** Stylesheet data (and Tailwind utilities in class attributes) at this position. */
function stylePoolsFor(languageId: string | undefined, state: EditorState, word: CursorWord): CompletionCandidate[][] {
  if (isStyleLanguage(languageId)) {
    const inside = insideBlock(state.sliceDoc(Math.max(0, word.from - STYLE_WINDOW), word.from));
    return styleCandidates(word.lineBefore, true, inside);
  }
  if (isMarkupLanguage(languageId) && inClassAttribute(word.lineBefore)) {
    return classAttributeCandidates();
  }
  return [];
}

function openSession(ctl: Controller, state: EditorState, word: CursorWord): Session {
  const { spec, rules } = ctl;
  const scan = documentScan(state, word.from, word.pos, rules);
  const kind = contextKind(word.lineBefore);
  return {
    from: word.from,
    key: word.key,
    memberAccess: kind === 'member',
    kind,
    statementStart: word.lineBefore.trim() === '',
    names: nameCandidates(word.lineBefore, spec?.id),
    style: stylePoolsFor(spec?.id, state, word),
    atRule: isStyleLanguage(spec?.id) && styleContextBefore(word.lineBefore) === 'at-rule',
    scan,
    tabs: spec ? tabPools(spec, rules) : [],
    cache: new RankCache(),
    recency: recencySignal(ctl.languageKey, kind),
  };
}

/** Where the filter text starts — the server may reach back past the word (`@`, a postfix receiver). */
function filterFrom(ctl: Controller, s: Session): number {
  return ctl.server?.key === s.key ? Math.min(ctl.server.from, s.from) : s.from;
}

/** The candidate pools that apply at this point, in ranking order. */
function poolsFor(ctl: Controller, s: Session, pattern: string, local: boolean, scope: string | null): CompletionCandidate[][] {
  const { server, spec } = ctl;
  const serverPool = server?.key === s.key ? server.entries : null;
  const pools: CompletionCandidate[][] = [];
  if (serverPool) {
    pools.push(serverPool);
  }
  const bareMember = s.memberAccess && !pattern && Boolean(clientOf(ctl));
  if (!bareMember && local) {
    if (spec && !s.memberAccess) {
      // A stylesheet's own data replaces the flat word list, which knew neither positions nor `@`.
      pools.push(...s.style);
      if (!s.atRule) {
        pools.push(snippetsFor(spec, ctl.filePath, scope));
      }
      if (!isStyleLanguage(spec.id)) {
        pools.push(languageCandidates(spec));
      }
    }
    pools.push(s.scan.pool, ...s.tabs);
  }

  if (s.names.length && !s.memberAccess && local) {
    pools.unshift(s.names);
  }
  return pools;
}

/** Typed context (member access, `new`, `import` …) with server entries: plain document and tab words are noise. */
function withoutWords(ranked: Ranked<Completion>[], typed: boolean): Ranked<Completion>[] {
  if (!typed) {
    return ranked;
  }
  if (!ranked.some((r) => r.candidate.origin === 'lsp')) {
    return ranked;
  }
  return ranked.filter((r) => r.candidate.origin !== 'document' && r.candidate.origin !== 'tab');
}

/** Highlight ranges for a label, computed once per completion. */
function matchLookup(pattern: string): (completion: Completion) => readonly number[] {
  const query = new Query(pattern);
  const ranges = new Map<Completion, readonly number[]>();
  return (completion) => {
    if (!pattern) {
      return [];
    }
    const hit = ranges.get(completion);
    if (hit) {
      return hit;
    }
    const found = matchRanges(query, labelOfCompletion(completion));
    ranges.set(completion, found);
    return found;
  };
}

function buildResult(ctl: Controller, state: EditorState, pos: number): CompletionResult | null {
  const s = ctl.session;
  if (!s) {
    return null;
  }
  const from = filterFrom(ctl, s);
  const pattern = state.sliceDoc(from, pos);
  const pools = poolsFor(ctl, s, pattern, from === s.from, scopeAt(ctl.spec, state, s.from));

  for (const pool of pools) {
    registerPool(pool);
  }

  const all = rank(pattern, pools, {
    recency: s.recency,
    proximity: (label) => proximityBonus(s.scan.nearest.get(label) ?? -1),
    memberAccess: s.memberAccess,
    statementStart: s.statementStart,
  }, RESULT_LIMIT, s.cache);
  const ranked = withoutWords(all, isTypedContext(s.kind));

  if (!ranked.length) {
    ctl.awaitingKey = ctl.pendingKey === s.key ? s.key : null;
    return null;
  }
  ctl.awaitingKey = null;

  return {
    from,
    to: pos,
    options: ranked.map((r) => r.candidate.data),
    filter: false,
    getMatch: matchLookup(pattern),
    update: (current, updateFrom, to, context) => updateResult(ctl, current, updateFrom, to, context),
  };
}

/** Typing on: re-rank synchronously for as long as the word start holds. */
function updateResult(
  ctl: Controller, _current: CompletionResult, from: number, _to: number, context: CompletionContext,
): CompletionResult | null {
  const s = ctl.session;
  if (!s || from !== filterFrom(ctl, s)) {
    return null;
  }
  const word = cursorWord(context.state, context.pos, ctl.before);
  if (word.from !== s.from || word.key !== s.key) {
    return null;
  }
  ensureServer(ctl, context.state, word, undefined);
  return buildResult(ctl, context.state, context.pos);
}

function sourceFor(ctl: Controller): CompletionSource {
  return (context) => {
    const { state, pos } = context;
    if (context.view) {
      ctl.view = context.view;
    }
    const word = cursorWord(state, pos, ctl.before);
    const text = state.sliceDoc(word.from, pos);
    const c = clientOf(ctl);
    const trigger = text ? null : triggerBefore(word.lineBefore, c?.triggerCharacters ?? []);
    // `new `, `import `, `@`, `extends `, `throws ` open the list by themselves when a server can answer.
    const leadIn = !text && c ? leadInBefore(word.lineBefore) : null;

    // CodeMirror passes `explicit` down to follow-up queries. After we opened
    // the list ourselves it should not hold at a new word start — after a space, say.
    const explicit = context.explicit && (ctl.autoOpenKey === null || ctl.autoOpenKey === word.key);
    const names = !text ? nameCandidates(word.lineBefore, ctl.spec?.id) : [];
    if (!text && !explicit && !trigger && !leadIn && !names.length) {
      return null;
    }
    // Do not complete numbers.
    if (/^\p{N}/u.test(text) && !explicit) {
      return null;
    }

    ctl.session = openSession(ctl, state, word);
    ensureServer(ctl, state, word, trigger ?? undefined);
    return buildResult(ctl, state, pos);
  };
}

/** Recency recording and lifecycle of the source. */
function lifecycleExtension(ctl: Controller): Extension {
  return [
    ctl.plugin,
    EditorView.updateListener.of((u) => {
      if (ctl.autoOpenKey !== null && completionStatus(u.state) === null) {
        ctl.autoOpenKey = null;
      }
      for (const tr of u.transactions) {
        const picked = tr.annotation(pickedCompletion);
        if (!picked) {
          continue;
        }
        recordAccepted(ctl.languageKey, labelOf.get(picked) ?? picked.label, ctl.session?.kind);
      }
    }),
  ];
}

export function createCompletionSource(options: CompletionSourceOptions): MergedCompletion {
  const ctl = createController(options);
  return { source: sourceFor(ctl), extension: lifecycleExtension(ctl) };
}
