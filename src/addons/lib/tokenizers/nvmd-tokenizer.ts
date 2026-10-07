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
 * The `.nvmd` tokenizer — Markdown with Novus in it (nvh-markdown):
 *
 *   `---` frontmatter     `key: value` lines at the very start of the file
 *   `<?nv … ?>`           the header, coloured as Novus (`prop` / `ref` too)
 *   `{expr}`              inline Novus; `{#if}` `{:else}` `{/if}` `{#for}`
 *                         `{/for}` `{@html}` as template blocks
 *   `<Component …>`       upper-case tags with nvh attributes
 *   `:::note Title`       containers (`note`, `tip`, `warning`, `danger`)
 *   fenced code           coloured per language where Lumen has a tokenizer
 *
 * Everything else is Markdown and goes to the Markdown tokenizer. Braces in
 * fenced code and in code spans are literal, as the generator treats them.
 */

import type { StringStream } from '@codemirror/language';
import type { CustomTokenizer, TokenKind } from '@/core/types';
import { createTokenizer } from '@/core/editor/tokenizer';
import { novusSpec } from '../../builtin/novus';
import { typescriptSpec } from '../../builtin/typescript';
import { cssTokenizer } from './css-tokenizer';
import { createMarkupTokenizer } from './html-tokenizer';
import { markdownTokenizer } from './markdown-tokenizer';
import { createNovusTokenizer, createNvhTokenizer } from './novus-tokenizer';

type Mode = 'md' | 'front' | 'header' | 'expr' | 'tag' | 'fence';
type Back = 'md' | 'tag';

interface Fence {
  mark: string;
  size: number;
  /** Key into `DELEGATES`; empty when the language only gets the string colour. */
  language: string;
}

interface NvmdState {
  mode: Mode;
  /** The first line was not seen yet. */
  start: boolean;
  md: unknown;
  /** Novus inside the header and inside `{ … }`. */
  nv: unknown;
  depth: number;
  head: boolean;
  back: Back;
  fence: Fence | null;
  delegate: unknown;
  /** The part of a `:::` line that comes next. */
  container: 'none' | 'kind' | 'title';
}

interface OpenState {
  block?: boolean;
  string?: unknown;
  c?: number;
  frames?: unknown[];
}

const novus = createNovusTokenizer(novusSpec);
const nvh = createNvhTokenizer(novusSpec);
const markup = createMarkupTokenizer();
const typescript = createTokenizer(typescriptSpec);

/** Tokenizers for fenced code by the first word of the info string. */
const DELEGATES: Record<string, CustomTokenizer<never>> = {
  nv: novus as never,
  novus: novus as never,
  nvh: nvh as never,
  html: markup as never,
  js: typescript as never,
  jsx: typescript as never,
  javascript: typescript as never,
  ts: typescript as never,
  tsx: typescript as never,
  typescript: typescript as never,
  json: typescript as never,
  css: cssTokenizer as never,
};

const FRONT_KEY = /^[A-Za-z0-9_]+(?=\s*:)/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}#{1,6}(?=\s)/;
const CONTAINER = /^ {0,3}:::/;
const CONTAINER_KIND = /^(?:note|tip|warning|danger)\b/;
const COMPONENT = /^<\/?[A-Z][\w.]*/;
const TEMPLATE_HEAD = /^(?:[#:]\s*(?:else\s+if|if|else|for)|\/\s*(?:if|for)|@html)\b/;
const DIRECTIVE = /^(?:@[A-Za-z]+(?:\.[A-Za-z]+)*|bind(?::[A-Za-z]+)?|class:[A-Za-z0-9_-]+)(?=\s*=|\s|\/?>)/;
const CODE_SPAN = /^`+[^`]*`+/;

function copy(tokenizer: CustomTokenizer<never>, state: unknown): unknown {
  if (!state) {
    return null;
  }
  return tokenizer.copyState?.(state as never) ?? { ...(state as object) };
}

/** True while a tokenizer sits inside a string or block comment — closing marks there are not code. */
function isOpen(state: unknown): boolean {
  const open = state as OpenState;
  return Boolean(open.block || open.string || open.frames?.length);
}

function frontToken(stream: StringStream, state: NvmdState): TokenKind | null {
  if (stream.sol() && stream.match(/^---\s*$/)) {
    state.mode = 'md';
    return 'meta';
  }
  if (stream.sol() && stream.match(FRONT_KEY)) {
    return 'attribute';
  }
  if (stream.eat(':')) {
    return 'punctuation';
  }
  if (stream.eatSpace()) {
    return null;
  }
  stream.skipToEnd();
  return 'string';
}

function enterCode(state: NvmdState, mode: 'header' | 'expr', back: Back): void {
  state.mode = mode;
  state.back = back;
  state.nv = novus.startState();
  state.depth = 1;
  state.head = false;
}

/** One token of Novus; the line is cut at `stop` so that nothing swallows the closing mark. */
function codeUntil(stream: StringStream, state: NvmdState, stop: string | null): TokenKind | null {
  const full = stream.string;
  if (stop && !isOpen(state.nv)) {
    const at = full.indexOf(stop, stream.pos);
    if (at > stream.pos) {
      stream.string = full.slice(0, at);
    }
  }
  try {
    return novus.token(stream, state.nv as never);
  } finally {
    stream.string = full;
  }
}

function headerToken(stream: StringStream, state: NvmdState): TokenKind | null {
  if (!isOpen(state.nv) && stream.match('?>')) {
    state.mode = 'md';
    return 'meta';
  }
  if (stream.sol() && stream.match(/^\s*(?:prop|ref)\b/)) {
    return 'keyword';
  }
  return codeUntil(stream, state, '?>');
}

function expressionToken(stream: StringStream, state: NvmdState): TokenKind | null {
  if (!state.head) {
    state.head = true;
    stream.eatSpace();
    if (stream.match(TEMPLATE_HEAD)) {
      return 'control';
    }
  }
  const nv = state.nv as { c: number; };
  if (!isOpen(state.nv) && nv.c === 0) {
    if (stream.peek() === '{') {
      state.depth++;
    }
    if (stream.peek() === '}') {
      stream.next();
      state.depth--;
      if (state.depth > 0) {
        return 'punctuation';
      }
      state.mode = state.back;
      return 'meta';
    }
  }
  return codeUntil(stream, state, null);
}

function tagToken(stream: StringStream, state: NvmdState): TokenKind | null {
  if (stream.eatSpace()) {
    return null;
  }
  if (stream.match('/>') || stream.match('>')) {
    state.mode = 'md';
    return 'punctuation';
  }
  if (stream.peek() === '{') {
    stream.next();
    enterCode(state, 'expr', 'tag');
    return 'meta';
  }
  const quote = stream.peek();
  if (quote === '"' || quote === "'") {
    stream.next();
    while (!stream.eol() && !stream.match(quote)) {
      stream.next();
    }
    return 'string';
  }
  if (stream.eat('=')) {
    return 'operator';
  }
  if (stream.match(DIRECTIVE) || stream.match(/^[^\s/>="'{<]+/)) {
    return 'attribute';
  }
  stream.next();
  return null;
}

function fenceToken(stream: StringStream, state: NvmdState): TokenKind | null {
  const fence = state.fence;
  if (!fence) {
    state.mode = 'md';
    return null;
  }
  if (stream.sol()) {
    const close = new RegExp(`^ {0,3}\\${fence.mark}{${fence.size},}\\s*$`);
    if (stream.match(close)) {
      state.mode = 'md';
      state.fence = null;
      state.delegate = null;
      return 'meta';
    }
  }
  const delegate = DELEGATES[fence.language];
  if (!delegate) {
    stream.skipToEnd();
    return 'string';
  }
  state.delegate ??= delegate.startState();
  return delegate.token(stream, state.delegate as never);
}

function openFence(stream: StringStream, state: NvmdState, match: RegExpMatchArray): TokenKind {
  state.mode = 'fence';
  state.fence = { mark: match[1][0], size: match[1].length, language: match[2].toLowerCase() };
  state.delegate = null;
  stream.skipToEnd();
  return 'meta';
}

function containerToken(stream: StringStream, state: NvmdState): TokenKind | null {
  stream.eatSpace();
  if (state.container === 'kind') {
    state.container = 'title';
    if (stream.match(CONTAINER_KIND)) {
      return 'keyword';
    }
  }
  if (stream.eol()) {
    return null;
  }
  stream.skipToEnd();
  return 'type';
}

/** The start of a line outside every block: what only a line start can open. */
function lineStartToken(stream: StringStream, state: NvmdState): TokenKind | null | undefined {
  if (state.start) {
    state.start = false;
    if (stream.match(/^---\s*$/)) {
      state.mode = 'front';
      return 'meta';
    }
  }
  if (stream.match(/^\s*<\?nv\b/)) {
    enterCode(state, 'header', 'md');
    return 'meta';
  }
  const fence = stream.match(FENCE_OPEN) as RegExpMatchArray | null;
  if (fence) {
    return openFence(stream, state, fence);
  }
  if (stream.match(HEADING)) {
    return 'keyword';
  }
  if (stream.match(CONTAINER)) {
    state.container = 'kind';
    return 'meta';
  }
  return undefined;
}

function markdownToken(stream: StringStream, state: NvmdState): TokenKind | null {
  if (state.container !== 'none') {
    return containerToken(stream, state);
  }
  if (stream.sol()) {
    const line = lineStartToken(stream, state);
    if (line !== undefined) {
      return line;
    }
  }
  if (stream.match(/^\\[{}]/)) {
    return 'escape';
  }
  if (stream.match(COMPONENT)) {
    state.mode = 'tag';
    return 'type';
  }
  if (stream.peek() === '{') {
    stream.next();
    enterCode(state, 'expr', 'md');
    return 'meta';
  }
  if (stream.match(CODE_SPAN)) {
    return 'string';
  }
  return markdownTokenizer.token(stream, state.md as never);
}

export function createNvmdTokenizer(): CustomTokenizer<NvmdState> {
  return {
    startState: (): NvmdState => {
      const md = markdownTokenizer.startState();
      // Frontmatter and fences are this tokenizer's business, not Markdown's.
      (md as { start: boolean; }).start = false;
      return {
        mode: 'md', start: true, md, nv: novus.startState(), depth: 0, head: false, back: 'md',
        fence: null, delegate: null, container: 'none',
      };
    },

    copyState: (s) => ({
      ...s,
      md: copy(markdownTokenizer as never, s.md),
      nv: copy(novus as never, s.nv),
      fence: s.fence ? { ...s.fence } : null,
      delegate: s.fence ? copy(DELEGATES[s.fence.language] ?? (novus as never), s.delegate) : null,
    }),

    token(stream: StringStream, state: NvmdState): TokenKind | null {
      // A container line ends with its line.
      if (stream.sol()) {
        state.container = 'none';
      }
      if (state.mode === 'front') {
        return frontToken(stream, state);
      }
      if (state.mode === 'header') {
        return headerToken(stream, state);
      }
      if (state.mode === 'expr') {
        return expressionToken(stream, state);
      }
      if (state.mode === 'tag') {
        return tagToken(stream, state);
      }
      if (state.mode === 'fence') {
        return fenceToken(stream, state);
      }
      return markdownToken(stream, state);
    },
  };
}

export const nvmdTokenizer = createNvmdTokenizer();
