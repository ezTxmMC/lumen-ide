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
 * The syntax context of a `.nvh` file: plain template text, a tag's attribute
 * list, an `{expr}` / `{#if …}` head, or a `<?nv ?>` / `<?= ?>` block —
 * `nvh_template`, `nvh_tag`, `nvh_expr`, `nvh_block`. Comments and `<style>` /
 * `<script>` bodies are `nvh_comment` and `nvh_raw`; their braces are literal.
 */

import type { ContextDetector, SyntaxContext } from '@/core/types';
import { TEMPLATE, readAttributes, readBlock, readExpression, readOutput, type Reading } from './markup-scan';

const COMMENT: SyntaxContext = { scope: 'nvh_comment', code: false };
const RAW: SyntaxContext = { scope: 'nvh_raw', code: false };

const MARKS = /<!--|<\?nv\b|<\?=|<\/?[A-Za-z]|\\[{}]|\{/g;
const TAG_NAME = /<(\/?)([A-Za-z][\w:.-]*)/y;
const RAW_ELEMENTS = new Set(['style', 'script']);

/** One tag at `at`: its attributes, and the raw body of `<style>` and `<script>`. */
function readTag(text: string, at: number): Reading | null {
  TAG_NAME.lastIndex = at;
  const name = TAG_NAME.exec(text);
  if (!name) {
    return null;
  }
  const nameEnd = at + name[0].length;
  if (nameEnd >= text.length) {
    // The cursor is in the name being typed: still template text.
    return { next: text.length, inside: TEMPLATE };
  }
  const attributes = readAttributes(text, nameEnd);
  if (attributes.inside) {
    return attributes;
  }
  const element = name[2].toLowerCase();
  const opens = name[1] === '' && RAW_ELEMENTS.has(element) && text[attributes.next - 2] !== '/';
  if (!opens) {
    return attributes;
  }
  const close = text.toLowerCase().indexOf(`</${element}`, attributes.next);
  if (close < 0) {
    return { next: text.length, inside: RAW };
  }
  return { next: close };
}

function readMark(text: string, mark: string, at: number): Reading | null {
  if (mark === '<!--') {
    const close = text.indexOf('-->', at + 4);
    if (close < 0) {
      return { next: text.length, inside: COMMENT };
    }
    return { next: close + 3 };
  }
  if (mark === '<?=') {
    return readOutput(text, at + 3);
  }
  if (mark.startsWith('<?nv')) {
    return readBlock(text, at + 4);
  }
  if (mark === '{') {
    return readExpression(text, at + 1);
  }
  if (mark.startsWith('\\')) {
    return { next: at + 2 };
  }
  return readTag(text, at);
}

/** The context at the end of `before`, the document up to the cursor. */
export const detectNvh: ContextDetector = (before) => {
  let i = 0;
  while (i < before.length) {
    MARKS.lastIndex = i;
    const found = MARKS.exec(before);
    if (!found) {
      break;
    }
    const read = readMark(before, found[0], found.index);
    if (read?.inside) {
      return read.inside;
    }
    i = read?.next ?? found.index + found[0].length;
  }
  return TEMPLATE;
};
