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
 * A cheap scanner for Novus code: which block is the cursor in? One pass over
 * the text up to the cursor, tracking braces while skipping what only looks
 * like braces — strings (with `${ … }` interpolation, which is code again),
 * `//` and block comments, and the C code of a `c { … }` block.
 *
 * It does not parse. A `{` is classified from the line it stands on:
 * `define class …` opens a class body, `method`/`if`/`while` open statements,
 * a `{` after `=`, `(`, `,`, `[` or `:` or glued to a name is a literal.
 */

export type CodeScope = 'toplevel' | 'class' | 'statement' | 'expression' | 'c';

/** What ends the scan before the text does. */
export interface CodeStop {
  /** A closing mark outside strings and comments: `?>`, or `"` for an event handler. */
  token?: string;
  /** A `}` that no `{` of the scan opened — the end of a `{expr}`. */
  unmatchedBrace?: boolean;
}

export interface CodeScan {
  /** Where the stop was found, or the length of the text. */
  end: number;
  /** Stopped at `stop` rather than at the end of the text. */
  closed: boolean;
  /** The innermost scope at `end`. */
  scope: CodeScope;
}

const DEFINE_BODY = /\bdefine\s+(?:class|abstract|interface|enum|annotation)\b/;
const DECLARATION = /(?:^|[\s}])(?:method|construct)\b/;
const BLOCK_KEYWORD = /(?:^|[\s}])(?:if|else|while|for|sync)\b/;
const VALUE_BEFORE = /(?:[=(,[:]|\breturn|\bin)\s*$/;
const GLUED_NAME = /[\w\]]$/;
const C_BLOCK_OWNER = /(?:method|class|construct|async)\s+$/;
const NAME_CHAR = /[\w.$@]/;
const LOOKBACK_LINES = 3;

/** A line's code only: strings emptied, comments gone. */
function cleaned(line: string): string {
  return line
    .replace(/"(?:[^"\\]|\\.)*"?/g, '""')
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\/\/.*$/, '');
}

/** The code before a `{`: its own line, or the nearest non-blank line above when it stands alone. */
function headBefore(text: string, at: number): string {
  let end = at;
  for (let tries = 0; tries <= LOOKBACK_LINES; tries++) {
    const start = text.lastIndexOf('\n', end - 1) + 1;
    const head = cleaned(text.slice(start, end));
    if (head.trim() || start === 0) {
      return head;
    }
    end = start - 1;
  }
  return '';
}

/** The scope the `{` after `head` opens. */
export function classifyBrace(head: string, parent: CodeScope): CodeScope {
  const text = head.trimEnd();
  if (DEFINE_BODY.test(text)) {
    return 'class';
  }
  if (VALUE_BEFORE.test(text)) {
    return 'expression';
  }
  if (DECLARATION.test(text) || BLOCK_KEYWORD.test(text)) {
    return 'statement';
  }
  if (head.length === text.length && GLUED_NAME.test(text) && text.length > 0) {
    return 'expression';
  }
  if (parent === 'statement' || text.includes(')')) {
    return 'statement';
  }
  return 'expression';
}

/** Index after the `}` that closes the C block opened at `open`, or -1 when the text ends first. */
function skipCBlock(text: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"' || c === "'") {
      i = skipCString(text, i);
      continue;
    }
    if (c === '/' && next === '/') {
      const eol = text.indexOf('\n', i);
      i = eol < 0 ? text.length : eol;
      continue;
    }
    if (c === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 2;
      continue;
    }
    if (c === '{') {
      depth++;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
    i++;
  }
  return -1;
}

function skipCString(text: string, open: number): number {
  const quote = text[open];
  let i = open + 1;
  while (i < text.length && text[i] !== quote && text[i] !== '\n') {
    i += text[i] === '\\' ? 2 : 1;
  }
  return i + 1;
}

/** Where a string that continues at `from` ends: after its quote, at an interpolation `${` (flagged), or at the end of the text. */
function readString(text: string, from: number): { next: number; interpolation: boolean } {
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '"') {
      return { next: i + 1, interpolation: false };
    }
    if (c === '$' && text[i + 1] === '{') {
      return { next: i + 2, interpolation: true };
    }
    i++;
  }
  return { next: text.length, interpolation: false };
}

function isStandaloneC(text: string, at: number): boolean {
  if (at > 0 && NAME_CHAR.test(text[at - 1])) {
    return false;
  }
  if (NAME_CHAR.test(text[at + 1] ?? ' ')) {
    return false;
  }
  if (!/^\s*\{/.test(text.slice(at + 1, at + 40))) {
    return false;
  }
  const lineStart = text.lastIndexOf('\n', at - 1) + 1;
  return !C_BLOCK_OWNER.test(text.slice(lineStart, at));
}

/**
 * Scan `text` from `from` as Novus code, down to a stop mark or the end.
 * `base` is the scope outside any brace.
 */
export function scanCode(text: string, from: number, stop: CodeStop, base: CodeScope): CodeScan {
  const stack: ('interp' | CodeScope)[] = [];
  const mark = stop.token?.[0] ?? '';
  const current = (): CodeScope => {
    const top = stack[stack.length - 1];
    if (top === 'interp') {
      return 'expression';
    }
    return top ?? base;
  };
  const result = (end: number, closed: boolean): CodeScan => ({ end, closed, scope: current() });

  /** Continue a string from `i`; an interpolation opens a code frame. Returns where scanning goes on. */
  const inString = (i: number): number => {
    const read = readString(text, i);
    if (read.interpolation) {
      stack.push('interp');
    }
    return read.next;
  };

  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (mark && c === mark && stop.token && text.startsWith(stop.token, i)) {
      return result(i, true);
    }
    if (c === '"') {
      i = inString(i + 1);
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      const eol = text.indexOf('\n', i);
      i = eol < 0 ? text.length : eol;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 2;
      continue;
    }
    if (c === 'c' && isStandaloneC(text, i)) {
      const open = text.indexOf('{', i);
      const after = skipCBlock(text, open);
      if (after < 0) {
        stack.push('c');
        return result(text.length, false);
      }
      i = after;
      continue;
    }
    if (c === '{') {
      stack.push(classifyBrace(headBefore(text, i), current()));
      i++;
      continue;
    }
    if (c === '}') {
      if (stack[stack.length - 1] === 'interp') {
        stack.pop();
        i = inString(i + 1);
        continue;
      }
      if (stack.length === 0 && stop.unmatchedBrace) {
        return result(i, true);
      }
      stack.pop();
    }
    i++;
  }
  return result(text.length, false);
}
