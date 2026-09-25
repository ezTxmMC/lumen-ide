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
 * A markup tokenizer for HTML and everything built on it.
 *
 * An embedded `<style>` or `<script>` goes to the CSS or the JavaScript
 * tokenizer. Options add `{{ … }}` (Vue, Angular), `{ … }` (Astro) and a
 * frontmatter block.
 */

import type { StringStream } from '@codemirror/language';
import type { CustomTokenizer, TokenKind } from '@/core/types';
import { createTokenizer } from '@/core/tokenizer';
import { cssTokenizer, createCssState, type CssState } from './css-tokenizer';
import { javascriptSpec } from '../builtin/javascript';
import { typescriptSpec } from '../builtin/typescript';

const jsTokenizer = createTokenizer(javascriptSpec);
const tsTokenizer = createTokenizer(typescriptSpec);

export interface MarkupOptions {
  /** Treat `{{ … }}` in text and attribute values as an expression. */
  mustache?: boolean;
  /** Treat `{ … }` in text as an embedded expression (Astro, JSX). */
  expressions?: boolean;
  /** The delimiter of a leading frontmatter block, `'---'` for instance. */
  frontmatter?: string;
}

type Mode = 'front' | 'text' | 'tag' | 'comment' | 'script' | 'style' | 'expr';

export interface MarkupState {
  mode: Mode;
  /** The name of the tag opened last (in lower case). */
  tag: string;
  closing: boolean;
  attrValue: string | null;
  /** The bracket depth within an embedded expression. */
  exprDepth: number;
  /** The mode returned to after the expression. */
  exprReturn: Mode;
  /** The frontmatter block has already been seen. */
  frontDone: boolean;
  css: CssState | null;
  js: unknown;
  front: unknown;
}

const TAG_NAME = /^[A-Za-z][-\w:.]*/;
const ATTR_NAME = /^[^\s/>="'<]+/;
const ENTITY = /^&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/;
const CLOSING_EMBED = /^<\/\s*(?:script|style)/i;

/** Eats the content of an expression and reports when the brackets balance. */
function tokenizeExpression(options: MarkupOptions, stream: StringStream, state: MarkupState): TokenKind | null {
  const { mustache } = options;
  if (mustache && stream.match('}}')) {
    state.mode = state.exprReturn;
    state.exprDepth = 0;
    return 'meta';
  }
  if (!mustache && stream.peek() === '}') {
    stream.next();
    state.exprDepth--;
    if (state.exprDepth <= 0) {
      state.mode = state.exprReturn;
      state.exprDepth = 0;
      return 'meta';
    }
    return 'punctuation';
  }
  if (!mustache && stream.peek() === '{') {
    state.exprDepth++;
  }

  state.js ??= jsTokenizer.startState();
  return jsTokenizer.token(stream, state.js);
}

function enterExpression(state: MarkupState, from: Mode) {
  state.mode = 'expr';
  state.exprReturn = from;
  state.exprDepth = 1;
  state.js = null;
}

/** The optional frontmatter block at the top of the file. */
function tokenizeFront(options: MarkupOptions, stream: StringStream, state: MarkupState): TokenKind | null {
  if (stream.sol() && stream.match(options.frontmatter!)) {
    // A second delimiter ends the block.
    if (state.frontDone) { state.mode = 'text'; return 'meta'; }
    state.frontDone = true;
    state.front = tsTokenizer.startState();
    return 'meta';
  }
  if (!state.frontDone) {
    // No frontmatter at the start of the file — markup straight away.
    state.mode = 'text';
    return markupToken(options, stream, state);
  }
  state.front ??= tsTokenizer.startState();
  return tsTokenizer.token(stream, state.front);
}

function tokenizeComment(stream: StringStream, state: MarkupState): TokenKind {
  while (!stream.eol()) {
    // `--!>` ends a comment as well (HTML spec: incorrectly closed comment).
    if (stream.match('-->') || stream.match('--!>')) { state.mode = 'text'; break; }
    stream.next();
  }
  if (state.mode === 'comment') {
    stream.skipToEnd();
  }
  return 'comment';
}

/** The content of a `<script>` or `<style>`, handed to the embedded language. */
function tokenizeEmbedded(stream: StringStream, state: MarkupState): TokenKind | null {
  if (stream.match(CLOSING_EMBED, false)) {
    stream.match(/^<\//);
    state.mode = 'tag';
    state.closing = true;
    return 'punctuation';
  }
  // Cut the line for the embedded language at the closing tag,
  // otherwise a JS line comment, say, swallows the `</script>`.
  const rest = stream.string.slice(stream.pos);
  const cut = rest.search(CLOSING_EMBED);
  const full = stream.string;
  if (cut > 0) {
    stream.string = full.slice(0, stream.pos + cut);
  }

  try {
    if (state.mode === 'style') {
      state.css ??= createCssState();
      return cssTokenizer.token(stream, state.css);
    }
    state.js ??= jsTokenizer.startState();
    return jsTokenizer.token(stream, state.js);
  } finally {
    stream.string = full;
  }
}

/** Inside a quoted attribute value. */
function tokenizeAttrValue(options: MarkupOptions, stream: StringStream, state: MarkupState, quote: string): TokenKind {
  if (options.mustache && stream.match('{{')) { enterExpression(state, 'tag'); return 'meta'; }
  while (!stream.eol()) {
    if (options.mustache && stream.match('{{', false)) {
      return 'string';
    }
    if (stream.match(quote)) { state.attrValue = null; break; }
    stream.next();
  }
  if (state.attrValue) {
    stream.skipToEnd();
  }
  return 'string';
}

/** The end of a tag: on to the text, or into an embedded script or style. */
function closeTag(state: MarkupState): TokenKind {
  const tag = state.tag;
  const embedded = !state.closing && (tag === 'script' || tag === 'style');
  state.mode = embedded ? (tag as 'script' | 'style') : 'text';
  if (state.mode === 'script') {
    state.js = null;
  }
  if (state.mode === 'style') {
    state.css = null;
  }
  state.closing = false;
  return 'punctuation';
}

function tokenizeTag(options: MarkupOptions, stream: StringStream, state: MarkupState): TokenKind | null {
  if (stream.eatSpace()) {
    return null;
  }

  if (state.attrValue) {
    return tokenizeAttrValue(options, stream, state, state.attrValue);
  }

  if (stream.match('/>') || stream.match('>')) {
    return closeTag(state);
  }

  if (!state.tag) {
    const name = stream.match(TAG_NAME) as RegExpMatchArray | null;
    if (name) {
      state.tag = name[0].toLowerCase();
      // Names in capitals are components, not HTML elements.
      return /^[A-Z]/.test(name[0]) ? 'type' : 'tag';
    }
  }

  if (stream.eat('=')) {
    return 'operator';
  }

  // A value without quotes as an expression: `:count={n}`, `foo={bar}`
  if (options.expressions && stream.peek() === '{') {
    stream.next();
    enterExpression(state, 'tag');
    return 'meta';
  }

  const quote = stream.peek();
  if (quote === '"' || quote === "'") {
    stream.next();
    state.attrValue = quote;
    return 'string';
  }

  if (stream.match(ATTR_NAME)) {
    return 'attribute';
  }

  stream.next();
  return null;
}

/** Plain markup between the tags. */
function tokenizeText(options: MarkupOptions, stream: StringStream, state: MarkupState): TokenKind | null {
  if (stream.match('<!--')) {
    state.mode = 'comment';
    return markupToken(options, stream, state);
  }
  if (stream.match(/^<!\[?[A-Za-z]/, false)) {
    stream.match(/^<![^>]*>?/);
    return 'meta';
  }
  if (stream.match('</')) {
    state.mode = 'tag';
    state.tag = '';
    state.closing = true;
    return 'punctuation';
  }
  if (stream.match(/^<[A-Za-z/]/, false)) {
    stream.eat('<');
    state.mode = 'tag';
    state.tag = '';
    state.closing = false;
    return 'punctuation';
  }
  if (options.mustache && stream.match('{{')) { enterExpression(state, 'text'); return 'meta'; }
  if (options.expressions && stream.peek() === '{') {
    stream.next();
    enterExpression(state, 'text');
    return 'meta';
  }
  if (stream.match(ENTITY)) {
    return 'escape';
  }

  stream.next();
  stream.eatWhile(/[^<&{]/);
  return null;
}

function markupToken(options: MarkupOptions, stream: StringStream, state: MarkupState): TokenKind | null {
  switch (state.mode) {
    case 'front':
      return tokenizeFront(options, stream, state);
    case 'expr':
      return tokenizeExpression(options, stream, state);
    case 'comment':
      return tokenizeComment(stream, state);
    case 'script':
    case 'style':
      return tokenizeEmbedded(stream, state);
    case 'tag':
      return tokenizeTag(options, stream, state);
    default:
      return tokenizeText(options, stream, state);
  }
}

export function createMarkupTokenizer(
  options: MarkupOptions = {},
): CustomTokenizer<MarkupState> {
  return {
    startState: (): MarkupState => ({
      mode: options.frontmatter ? 'front' : 'text',
      tag: '',
      closing: false,
      attrValue: null,
      exprDepth: 0,
      exprReturn: 'text',
      frontDone: false,
      css: null,
      js: null,
      front: null,
    }),

    copyState: (s) => ({
      ...s,
      css: s.css ? { ...s.css } : null,
      js: s.js ? (jsTokenizer.copyState?.(s.js) ?? { ...(s.js as object) }) : null,
      front: s.front ? (tsTokenizer.copyState?.(s.front) ?? { ...(s.front as object) }) : null,
    }),

    token: (stream: StringStream, state: MarkupState) => markupToken(options, stream, state),
  };
}

export const htmlTokenizer = createMarkupTokenizer();
