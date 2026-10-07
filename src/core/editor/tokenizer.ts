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
 * The generic, spec-driven tokenizer.
 *
 * Turns a declarative `LanguageSpec` — keyword lists and a few regexes — into
 * a CodeMirror `StreamParser`. That is what lets a language add-on get by with
 * no parser code of its own.
 */

import type { StreamParser, StringStream } from '@codemirror/language';
import { Tag } from '@lezer/highlight';
import { wordCharsOf } from './word-pattern';
import { TOKEN_KINDS, type LanguageSpec, type StringRule, type TokenKind } from '../types';

/** One Lezer tag per token kind — which keeps themes independent of CodeMirror. */
export const tokenTags = Object.fromEntries(
  TOKEN_KINDS.map((kind) => [kind, Tag.define()]),
) as Record<TokenKind, Tag>;

/**
 * CodeMirror carries a built-in legacy table that maps `tag`, `type`,
 * `variable`, `property`, `attribute` and `builtin` onto its own Lezer tags,
 * ignoring a parser's `tokenTable`. Outwardly the names from `TokenKind`
 * stand, so they go to CodeMirror with a prefix.
 */
const TOKEN_NAME = Object.fromEntries(
  TOKEN_KINDS.map((kind) => [kind, `lm_${kind}`]),
) as Record<TokenKind, string>;

const tokenTable = Object.fromEntries(
  TOKEN_KINDS.map((kind) => [TOKEN_NAME[kind], tokenTags[kind]]),
) as Record<string, Tag>;

const DEFAULT_STRINGS: StringRule[] = [
  { start: '"', escapes: true },
  { start: "'", escapes: true },
];

const DEFAULT_NUMBER =
  /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*)?\.\d[\d_]*(?:[eE][+-]?\d+)?|\d[\d_]*(?:[eE][+-]?\d+)?)[a-zA-Z_']*/;
const DEFAULT_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const DEFAULT_OPERATOR = /^[+\-*/%=<>!&|^~?:@#\\]+/;
const PUNCTUATION = /^[{}()[\];,.]/;
export const DEFAULT_INDENT_OPEN = /[{[(]\s*$/;
export const DEFAULT_INDENT_CLOSE = /^\s*[}\])]/;

/** An interpolation that is open: the string it sits in, and the depth of its braces. */
interface InterpolationFrame {
  rule: StringRule;
  depth: number;
}

interface GenericState {
  /** An open block comment. */
  block: boolean;
  /** An open multi-line string. */
  string: StringRule | null;
  /**
   * Open `${ … }` interpolations, outermost first. While the list is not empty
   * and no string is open, the tokenizer reads code of the language itself.
   */
  frames: InterpolationFrame[];
}

function toSet(words: string[] | undefined, lower: boolean): Set<string> {
  if (!words?.length) {
    return new Set();
  }
  return new Set(lower ? words.map((w) => w.toLowerCase()) : words);
}

type StringOutcome =
  | 'closed'        // closing delimiter found
  | 'stopped'       // an escape or an interpolation begins at the current position
  | 'eol';          // Zeilenende erreicht

const SIMPLE_ESCAPE = /^\\[^]/;

/** Does this rule colour its escapes (strings do, a rule of another kind does not)? */
function hasEscapes(rule: StringRule): boolean {
  return rule.escapes !== false && (rule.kind === undefined || rule.kind === 'string');
}

/** Eats a string's contents up to its end, an escape, an interpolation, or the end of the line. */
function consumeString(stream: StringStream, rule: StringRule): StringOutcome {
  const end = rule.end ?? rule.start;
  const escapes = rule.escapes !== false;
  while (!stream.eol()) {
    if (escapes && stream.peek() === '\\') {
      if (hasEscapes(rule)) {
        return 'stopped';
      }
      stream.next();
      stream.next();
      continue;
    }
    if (rule.interpolate && stream.match(rule.interpolate, false)) {
      return 'stopped';
    }
    if (stream.match(end)) {
      return 'closed';
    }
    stream.next();
  }
  return 'eol';
}

type AnyTokenizer = {
  startState(): unknown;
  copyState?(state: unknown): unknown;
  token(stream: StringStream, state: unknown): TokenKind | null;
};

interface WordSets {
  keywords: Set<string>;
  controls: Set<string>;
  types: Set<string>;
  builtins: Set<string>;
  constants: Set<string>;
}

function wordSetsFor(spec: LanguageSpec): WordSets {
  const ci = spec.caseInsensitive === true;
  return {
    keywords: toSet(spec.keywords, ci),
    controls: toSet(spec.controls, ci),
    types: toSet(spec.types, ci),
    builtins: toSet(spec.builtins, ci),
    constants: toSet(spec.constants, ci),
  };
}

function classifyWord(spec: LanguageSpec, sets: WordSets, word: string, afterDot: boolean, stream: StringStream): TokenKind {
  const key = spec.caseInsensitive === true ? word.toLowerCase() : word;
  if (sets.controls.has(key)) {
    return 'control';
  }
  if (sets.keywords.has(key)) {
    return 'keyword';
  }
  if (sets.types.has(key)) {
    return 'type';
  }
  if (sets.constants.has(key)) {
    return 'constant';
  }
  if (sets.builtins.has(key)) {
    return 'builtin';
  }
  if (afterDot) {
    // A method call, as opposed to a plain field access.
    return /^\s*\(/.test(stream.string.slice(stream.pos)) ? 'function' : 'property';
  }
  if (/^\s*\(/.test(stream.string.slice(stream.pos))) {
    return 'function';
  }
  if (spec.capitalizedAsType && /^[A-Z]/.test(word)) {
    return 'type';
  }
  if (/^[A-Z][A-Z0-9_]*$/.test(word) && word.length > 1) {
    return 'constant';
  }
  return 'variable';
}

/** Eats a string from its contents on and closes it unless it goes on over the line break. */
function tokenizeStringBody(stream: StringStream, st: GenericState, rule: StringRule): TokenKind {
  const start = stream.pos;
  const outcome = consumeString(stream, rule);
  if (outcome === 'closed' || (outcome === 'eol' && !rule.multiline)) {
    st.string = null;
  }
  if (outcome === 'stopped' && stream.pos === start) {
    return escapeOrInterpolation(stream, st, rule);
  }
  return rule.kind ?? 'string';
}

/** At an escape (`\n`, `\"`) or at the start of an interpolation inside a string. */
function escapeOrInterpolation(stream: StringStream, st: GenericState, rule: StringRule): TokenKind {
  if (rule.interpolate && stream.match(rule.interpolate)) {
    st.frames.push({ rule, depth: 1 });
    st.string = null;
    return 'meta';
  }
  stream.match(rule.escapePattern ?? SIMPLE_ESCAPE);
  return 'escape';
}

/** Braces inside an interpolation: the closing one returns to the string. */
function trackInterpolation(st: GenericState, ch: string): TokenKind | null {
  const frame = st.frames[st.frames.length - 1];
  if (ch === '{') {
    frame.depth++;
    return null;
  }
  if (ch !== '}') {
    return null;
  }
  frame.depth--;
  if (frame.depth > 0) {
    return null;
  }
  st.frames.pop();
  st.string = frame.rule;
  return 'meta';
}

/**
 * Continuation of an open string (multi-line, or interrupted by an
 * interpolation) or of an open block comment; `undefined` when nothing is open.
 */
function continueOpen(stream: StringStream, st: GenericState, blockComment: [string, string] | undefined): TokenKind | undefined {
  if (st.string) {
    return tokenizeStringBody(stream, st, st.string);
  }
  if (st.block && blockComment) {
    while (!stream.eol()) {
      if (stream.match(blockComment[1])) { st.block = false; break; }
      stream.next();
    }
    if (st.block) {
      stream.skipToEnd();
    }
    return 'comment';
  }
  return undefined;
}

/** A comment that starts here — a line comment, or a block comment that may stay open. */
function startComment(
  stream: StringStream, st: GenericState, lineComment: string | undefined, blockComment: [string, string] | undefined,
): TokenKind | undefined {
  if (lineComment && stream.match(lineComment)) {
    stream.skipToEnd();
    return 'comment';
  }

  if (blockComment && stream.match(blockComment[0])) {
    while (!stream.eol()) {
      if (stream.match(blockComment[1])) {
        return 'comment';
      }
      stream.next();
    }
    st.block = true;
    return 'comment';
  }
  return undefined;
}

/**
 * The tokenizer of a language proper — it yields `TokenKind` names. Useful
 * when one language embeds another (HTML → CSS/JS).
 */
export function createTokenizer(spec: LanguageSpec): AnyTokenizer {
  if (spec.tokenizer) {
    return spec.tokenizer as unknown as AnyTokenizer;
  }

  const sets = wordSetsFor(spec);
  const strings = spec.strings ?? DEFAULT_STRINGS;
  const numbers = spec.numbers ?? DEFAULT_NUMBER;
  const identifier = spec.identifier ?? DEFAULT_IDENT;
  const operators = spec.operators ?? DEFAULT_OPERATOR;
  const lineComment = spec.comments?.line;
  const blockComment = spec.comments?.block;

  return {
    startState: (): GenericState => ({ block: false, string: null, frames: [] }),
    copyState: (s) => {
      const state = s as GenericState;
      return { ...state, frames: state.frames.map((frame) => ({ ...frame })) };
    },

    token(stream, state) {
      const st = state as GenericState;

      // An interpolation does not outlive the line of a single-line string.
      if (stream.sol() && st.frames.length > 0 && !st.frames[0].rule.multiline) {
        st.frames = [];
        st.string = null;
      }

      const open = continueOpen(stream, st, blockComment);
      if (open !== undefined) {
        return open;
      }

      if (stream.eatSpace()) {
        return null;
      }

      // Directives (#include, @media …)
      if (spec.meta) {
        const at = stream.pos;
        if (stream.match(spec.meta)) {
          if (stream.pos > at) {
            return 'meta';
          }
        }
      }

      const comment = startComment(stream, st, lineComment, blockComment);
      if (comment !== undefined) {
        return comment;
      }

      for (const rule of strings) {
        if (stream.match(rule.start)) {
          st.string = rule;
          return tokenizeStringBody(stream, st, rule);
        }
      }

      if (stream.match(numbers)) {
        return 'number';
      }

      const afterDot = stream.pos > 0 && stream.string[stream.pos - 1] === '.';
      const word = stream.match(identifier) as RegExpMatchArray | null;
      if (word) {
        return classifyWord(spec, sets, word[0], afterDot, stream);
      }

      if (st.frames.length > 0 && !st.string) {
        const closing = trackInterpolation(st, stream.peek() ?? '');
        if (closing) {
          stream.next();
          return closing;
        }
      }
      if (stream.match(PUNCTUATION)) {
        return 'punctuation';
      }
      if (stream.match(operators)) {
        return 'operator';
      }

      stream.next();
      return null;
    },
  };
}

/** Wraps the tokenizer for CodeMirror: name prefix and metadata. */
export function buildStreamParser(spec: LanguageSpec): StreamParser<unknown> {
  const tokenizer = createTokenizer(spec);
  return {
    name: spec.id,
    tokenTable,
    startState: () => tokenizer.startState(),
    copyState: tokenizer.copyState
      ? (state) => tokenizer.copyState!(state)
      : undefined,
    languageData: languageDataFor(spec),
    token: (stream, state) => {
      const kind = tokenizer.token(stream, state);
      return kind ? TOKEN_NAME[kind] : null;
    },
  };
}

function languageDataFor(spec: LanguageSpec) {
  const data: Record<string, unknown> = {};
  const line = spec.comments?.line;
  const block = spec.comments?.block;
  if (line || block) {
    data.commentTokens = {
      ...(line ? { line } : {}),
      ...(block ? { block: { open: block[0], close: block[1] } } : {}),
    };
  }
  data.closeBrackets = { brackets: spec.closeBrackets ?? ['(', '[', '{', "'", '"', '`'] };
  data.indentOnInput = spec.indentClose ?? DEFAULT_INDENT_CLOSE;
  // A language with a pattern for code as well picks its word characters per position (`contextWordChars`).
  if (!spec.codeWordPattern || !spec.syntaxContext) {
    data.wordChars = `$_${spec.wordPattern ? wordCharsOf(spec.wordPattern) : ''}`;
  }
  return data;
}

