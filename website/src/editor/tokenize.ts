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
 * A small TypeScript highlighter for the shots. It sorts tokens into the same
 * kinds Lumen's themes colour (see `TokenKind`), close enough to the editor's
 * Lezer grammar that the shot and the app read alike.
 */

import type { TokenKind } from './themes';

export interface Token {
  text: string;
  kind: TokenKind | null;
}

export type Line = Token[];

const KEYWORDS = new Set([
  'import', 'export', 'from', 'const', 'let', 'var', 'function', 'type', 'interface', 'as', 'new',
  'typeof', 'keyof', 'class', 'extends', 'implements', 'in', 'of', 'async', 'await', 'void', 'enum',
  'declare', 'readonly', 'private', 'public', 'protected', 'static', 'is', 'satisfies', 'default',
]);
const CONTROL = new Set([
  'if', 'else', 'return', 'for', 'while', 'do', 'break', 'continue', 'switch', 'case', 'throw',
  'try', 'catch', 'finally', 'yield',
]);
const CONSTANTS = new Set(['true', 'false', 'null', 'undefined', 'this']);
const PRIMITIVES = new Set(['string', 'number', 'boolean', 'unknown', 'never', 'any', 'object', 'bigint', 'symbol']);

const PATTERN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(=>|\?\?|\?\.|\.\.\.|[=!<>]=?=?|&&|\|\||[+\-*/%|&?!])|([()[\]{},;.:])|(\s+)|(\S)/g;

/** The kind of an identifier from its neighbours. */
function identifierKind(word: string, before: string, after: string, brackets: string[]): TokenKind {
  if (KEYWORDS.has(word)) {
    return 'keyword';
  }
  if (CONTROL.has(word)) {
    return 'control';
  }
  if (CONSTANTS.has(word)) {
    return 'constant';
  }
  if (PRIMITIVES.has(word)) {
    return 'type';
  }
  if (after.startsWith('(')) {
    return 'function';
  }
  if (before === '.' || before === '?.') {
    return 'property';
  }
  if (/^[A-Z]/.test(word) && /^[A-Z0-9_]+$/.test(word)) {
    return 'constant';
  }
  if (/^[A-Z]/.test(word)) {
    return 'type';
  }
  if (after.startsWith(':') && brackets.at(-1) === '{') {
    return 'property';
  }
  return 'variable';
}

/** Splits `text` into lines of tokens; multi-line tokens (block comments) are cut at each newline. */
export function tokenize(text: string): Line[] {
  const flat: Token[] = [];
  const brackets: string[] = [];
  let previous = '';
  let match: RegExpExecArray | null;
  PATTERN.lastIndex = 0;
  while ((match = PATTERN.exec(text))) {
    const [whole, comment, string, number, word, operator, punctuation, , other] = match;
    const rest = text.slice(PATTERN.lastIndex, PATTERN.lastIndex + 16).replace(/^[ \t]+/, '');
    if (comment) {
      flat.push({ text: whole, kind: 'comment' });
    }
    if (string) {
      flat.push({ text: whole, kind: 'string' });
    }
    if (number) {
      flat.push({ text: whole, kind: 'number' });
    }
    if (word) {
      flat.push({ text: whole, kind: identifierKind(word, previous, rest, brackets) });
    }
    if (operator) {
      flat.push({ text: whole, kind: 'operator' });
    }
    if (punctuation) {
      flat.push({ text: whole, kind: 'punctuation' });
      if ('([{'.includes(whole)) {
        brackets.push(whole);
      }
      if (')]}'.includes(whole)) {
        brackets.pop();
      }
    }
    if (other) {
      flat.push({ text: whole, kind: null });
    }
    if (!whole.trim()) {
      flat.push({ text: whole, kind: null });
      continue;
    }
    previous = whole;
  }

  const lines: Line[] = [[]];
  for (const token of flat) {
    const parts = token.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) {
        lines.push([]);
      }
      if (part) {
        lines[lines.length - 1].push({ text: part, kind: token.kind });
      }
    });
  }
  return lines;
}

/** Leading spaces of a line — for the indent guides. */
export function indentOf(line: Line): number {
  const first = line[0];
  if (!first || first.kind !== null) {
    return 0;
  }
  return first.text.replace(/\t/g, '  ').length;
}
