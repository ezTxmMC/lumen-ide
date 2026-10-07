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
 * The syntax context of a `.nvmd` file (Markdown with Novus in it):
 *
 *   `nvmd_front`      the `---` frontmatter
 *   `nvh_block`       the `<?nv ?>` header, at the start of a line
 *   `nvh_expr`        `{expr}` and the template blocks `{#if …}` `{/for}` …
 *   `nvh_tag`         the attribute list of a `<Component …>`
 *   `nvmd_fence`      fenced code and code spans — braces are literal there
 *   `nvmd_container`  a `:::note Title` line
 *   `nvmd_text`       everything else: Markdown
 *
 * The scope names of nvh are reused so that one snippet scope reads the same
 * in both languages.
 */

import type { ContextDetector, SyntaxContext } from '@/core/types';
import { readAttributes, readBlock, readExpression, type Reading } from './markup-scan';

const FRONT: SyntaxContext = { scope: 'nvmd_front', code: false };
const FENCE: SyntaxContext = { scope: 'nvmd_fence', code: false };
const CONTAINER: SyntaxContext = { scope: 'nvmd_container', code: false };
const TEXT: SyntaxContext = { scope: 'nvmd_text', code: false };

/** In order: the header, a fence line (group 1: its mark), a container line, an escaped brace, a component tag, a brace, a backtick run. */
const MARKS = /^[ \t]*<\?nv\b|^ {0,3}(`{3,}|~{3,})[^\n]*|^ {0,3}:::[^\n]*|\\[{}]|<\/?[A-Z][\w.]*|\{|`+/gm;
const FRONT_FENCE = /^---[ \t]*(?:\r?\n|$)/;
const FRONT_CLOSE = /^---[ \t]*$/gm;
const CODE_SPAN = /^`+[^`]*`+/;

function lineEnd(text: string, from: number): number {
  const eol = text.indexOf('\n', from);
  return eol < 0 ? text.length : eol;
}

/** The frontmatter at the very start: where it ends, or null when the file does not start with one. */
function readFront(text: string): Reading | null {
  const first = FRONT_FENCE.exec(text);
  if (!first) {
    return null;
  }
  FRONT_CLOSE.lastIndex = first[0].length;
  const close = FRONT_CLOSE.exec(text);
  if (!close) {
    return { next: text.length, inside: FRONT };
  }
  const end = close.index + close[0].length;
  if (end >= text.length) {
    return { next: text.length, inside: FRONT };
  }
  return { next: end };
}

/** A fenced block opened by `mark` on the line ending at `openEnd`. */
function readFence(text: string, mark: string, openEnd: number): Reading {
  if (openEnd >= text.length) {
    return { next: text.length, inside: FENCE };
  }
  const closing = new RegExp(`^ {0,3}\\${mark[0]}{${mark.length},}[ \\t]*$`, 'm');
  const rest = text.slice(openEnd + 1);
  const close = closing.exec(rest);
  if (!close) {
    return { next: text.length, inside: FENCE };
  }
  const end = openEnd + 1 + close.index + close[0].length;
  if (end >= text.length) {
    return { next: text.length, inside: FENCE };
  }
  return { next: end };
}

function readMark(text: string, found: RegExpExecArray): Reading {
  const mark = found[0];
  const at = found.index;
  if (found[1]) {
    return readFence(text, found[1], at + mark.length);
  }
  if (mark.trimStart().startsWith(':::')) {
    const end = at + mark.length;
    if (end >= text.length) {
      return { next: text.length, inside: CONTAINER };
    }
    return { next: end };
  }
  if (mark.endsWith('{') && !mark.startsWith('\\')) {
    return readExpression(text, at + 1);
  }
  if (mark.startsWith('\\')) {
    return { next: at + 2 };
  }
  if (mark.startsWith('`')) {
    const line = text.slice(at, lineEnd(text, at));
    const span = CODE_SPAN.exec(line);
    return { next: at + (span ? span[0].length : mark.length) };
  }
  if (mark.trimStart().startsWith('<?nv')) {
    return readBlock(text, at + mark.length);
  }
  const nameEnd = at + mark.length;
  if (nameEnd >= text.length) {
    return { next: text.length, inside: TEXT };
  }
  return readAttributes(text, nameEnd);
}

export const detectNvmd: ContextDetector = (before) => {
  const front = readFront(before);
  if (front?.inside) {
    return front.inside;
  }
  let i = front?.next ?? 0;
  while (i < before.length) {
    MARKS.lastIndex = i;
    const found = MARKS.exec(before);
    if (!found) {
      break;
    }
    const read = readMark(before, found);
    if (read.inside) {
      return read.inside;
    }
    i = Math.max(read.next, found.index + 1);
  }
  return TEXT;
};
