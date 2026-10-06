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
 * A mini scanner for JavaScript source and JSON with comments.
 *
 * It is not a parser. It walks the text once and does two things: it finds the
 * string literals (so that command rules look at what a program *says*, never
 * at identifiers) and it blanks out the comments (so that a comment mentioning
 * `eval(` or `rm -rf /` is not a finding). Regex literals are skipped because
 * a quote inside one would otherwise derail everything after it.
 */

const MAX_LITERAL = 20000;
const MAX_LITERALS = 200000;
const MAX_TEMPLATE_DEPTH = 12;

/** After these words a `/` begins a regular expression, not a division. */
const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);
const REGEX_PRECEDERS = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

const isWordChar = (char) => /[\w$]/.test(char);

/** Resolve the escapes a literal's text can carry, so `"curl x\n"` reads as the program sees it. */
export function unescapeJs(text) {
  if (!text.includes('\\')) {
    return text;
  }
  return text.replace(/\\(?:x([0-9a-fA-F]{2})|u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|(\r?\n)|([\s\S]))/g,
    (_all, hex, braced, unicode, newline, other) => {
      if (newline) {
        return '';
      }
      const code = hex ?? braced ?? unicode;
      if (code) {
        const value = parseInt(code, 16);
        return value > 0x10ffff ? '' : String.fromCodePoint(value);
      }
      return SIMPLE_ESCAPES[other] ?? other;
    });
}

/**
 * @param {string} code
 * @returns {{ code: string, literals: { text: string, line: number, column: number }[] }}
 *   `code` is the source with every comment replaced by spaces (newlines kept,
 *   so positions and line numbers stay the same).
 */
export function lexJs(code) {
  const length = code.length;
  const literals = [];
  const comments = [];
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  const newline = (at) => {
    line += 1;
    lineStart = at + 1;
  };

  const record = (text, startLine, startColumn) => {
    if (text.length > MAX_LITERAL || literals.length >= MAX_LITERALS) {
      return;
    }
    literals.push({ text: unescapeJs(text), line: startLine, column: startColumn });
  };

  /** Is the `/` at `at` the start of a regular expression? */
  const startsRegex = (at) => {
    let back = at - 1;
    while (back >= 0 && (code[back] === ' ' || code[back] === '\t')) {
      back--;
    }
    if (back < 0 || code[back] === '\n') {
      return true;
    }
    const before = code[back];
    if (REGEX_PRECEDERS.has(before)) {
      return true;
    }
    if (!isWordChar(before)) {
      return false;
    }
    let from = back;
    while (from > 0 && isWordChar(code[from - 1])) {
      from--;
    }
    return REGEX_KEYWORDS.has(code.slice(from, back + 1));
  };

  const skipRegex = () => {
    pos += 1;
    let inClass = false;
    while (pos < length) {
      const char = code[pos];
      if (char === '\n') {
        return;
      }
      pos += 1;
      if (char === '\\') {
        pos += 1;
        continue;
      }
      if (char === '[') {
        inClass = true;
        continue;
      }
      if (char === ']') {
        inClass = false;
        continue;
      }
      if (char === '/' && !inClass) {
        return;
      }
    }
  };

  const readQuoted = (quote) => {
    const startLine = line;
    const startColumn = pos - lineStart + 2;
    const from = pos + 1;
    pos += 1;
    while (pos < length) {
      const char = code[pos];
      if (char === '\\') {
        if (code[pos + 1] === '\n') {
          newline(pos + 1);
        }
        pos += 2;
        continue;
      }
      if (char === quote) {
        record(code.slice(from, pos), startLine, startColumn);
        pos += 1;
        return;
      }
      // An unterminated string ends at the line break; the scanner picks up again there.
      if (char === '\n') {
        record(code.slice(from, pos), startLine, startColumn);
        return;
      }
      pos += 1;
    }
  };

  const readTemplate = (depth) => {
    const startLine = line;
    const startColumn = pos - lineStart + 2;
    pos += 1;
    let text = '';
    let from = pos;
    while (pos < length) {
      const char = code[pos];
      if (char === '\\') {
        pos += 2;
        continue;
      }
      if (char === '\n') {
        newline(pos);
      }
      if (char === '`') {
        record(text + code.slice(from, pos), startLine, startColumn);
        pos += 1;
        return;
      }
      if (char === '$' && code[pos + 1] === '{' && depth < MAX_TEMPLATE_DEPTH) {
        // The expression is code of its own: its literals count too, but in the
        // surrounding text it stands for one variable.
        text += `${code.slice(from, pos)}$X`;
        pos += 2;
        run(depth + 1, true);
        pos += 1;
        from = pos;
        continue;
      }
      pos += 1;
    }
    record(text + code.slice(from, pos), startLine, startColumn);
  };

  const readLineComment = () => {
    const from = pos;
    while (pos < length && code[pos] !== '\n') {
      pos += 1;
    }
    comments.push([from, pos]);
  };

  const readBlockComment = () => {
    const from = pos;
    pos += 2;
    while (pos < length && !(code[pos] === '*' && code[pos + 1] === '/')) {
      if (code[pos] === '\n') {
        newline(pos);
      }
      pos += 1;
    }
    pos = Math.min(length, pos + 2);
    comments.push([from, pos]);
  };

  /** Walk code; inside `${…}` stop at the brace that closes it. */
  function run(depth, untilBrace) {
    let braces = 0;
    while (pos < length) {
      const char = code[pos];
      if (char === '\n') {
        newline(pos);
        pos += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        readQuoted(char);
        continue;
      }
      if (char === '`') {
        readTemplate(depth);
        continue;
      }
      if (char === '/') {
        const next = code[pos + 1];
        if (next === '/') {
          readLineComment();
          continue;
        }
        if (next === '*') {
          readBlockComment();
          continue;
        }
        if (startsRegex(pos)) {
          skipRegex();
          continue;
        }
      }
      if (untilBrace && char === '{') {
        braces += 1;
      }
      if (untilBrace && char === '}') {
        if (braces === 0) {
          return;
        }
        braces -= 1;
      }
      pos += 1;
    }
  }

  run(0, false);

  if (!comments.length) {
    return { code, literals };
  }
  const parts = [];
  let last = 0;
  for (const [from, to] of comments) {
    parts.push(code.slice(last, from), code.slice(from, to).replace(/[^\n]/g, ' '));
    last = to;
  }
  parts.push(code.slice(last));
  return { code: parts.join(''), literals };
}

/** JSON with comments and trailing commas (`tasks.json`, `devcontainer.json`) → text plain JSON accepts. */
export function stripJsonc(text) {
  let out = '';
  let i = 0;
  const length = text.length;
  while (i < length) {
    const char = text[i];
    if (char === '"') {
      let end = i + 1;
      while (end < length && text[end] !== '"') {
        end += text[end] === '\\' ? 2 : 1;
      }
      out += text.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (char === '/' && text[i + 1] === '/') {
      while (i < length && text[i] !== '\n') {
        i++;
      }
      continue;
    }
    if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? length : end + 2;
      continue;
    }
    out += char;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/** Parse JSON or JSON with comments; `undefined` when it is neither. */
export function parseJsonc(text) {
  try {
    return JSON.parse(stripJsonc(text.replace(/^﻿/, '')));
  } catch {
    return undefined;
  }
}

/** 1-based line of the first occurrence of `needle`, or 1. */
export function lineOf(text, needle) {
  const index = text.indexOf(needle);
  if (index < 0) {
    return 1;
  }
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
    }
  }
  return line;
}
