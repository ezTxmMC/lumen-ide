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
 * Blank lines between the blocks of a Maven POM.
 *
 * The XML language server formats indentation and attributes but never adds
 * blank lines, and a POM reads best with one around every multi-line block
 * directly under `<project>` (parent, dependencies, build …). Runs after the
 * server's formatting; existing blank lines stay as they are.
 */

const POM_NAMESPACE = 'http://maven.apache.org/POM/4.0.0';
const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<[^>]+>/g;

interface Block {
  /** Offset of the first line of the block (comments above it belong to it). */
  start: number;
  firstLine: number;
  lastLine: number;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineOf(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) {
      low = mid;
      continue;
    }
    high = mid - 1;
  }
  return low;
}

/** The children of the root element as blocks; `null` when the text is not a POM. */
function rootBlocks(text: string): Block[] | null {
  const starts = lineStarts(text);
  const blocks: Block[] = [];
  let depth = 0;
  let rootSeen = false;
  let childStart = -1;
  let commentStart = -1;

  for (const match of text.matchAll(TOKEN)) {
    const tag = match[0];
    const at = match.index;
    if (tag.startsWith('<?') || tag.startsWith('<!DOCTYPE')) {
      continue;
    }
    if (tag.startsWith('<!--')) {
      if (depth === 1 && commentStart < 0) {
        commentStart = at;
      }
      continue;
    }
    if (tag.startsWith('</')) {
      depth--;
      if (depth === 1 && childStart >= 0) {
        blocks.push({ start: childStart, firstLine: lineOf(starts, childStart), lastLine: lineOf(starts, at + tag.length - 1) });
        childStart = -1;
        commentStart = -1;
      }
      continue;
    }
    if (!rootSeen) {
      if (!/^<project[\s>]/.test(tag) || !tag.includes(POM_NAMESPACE)) {
        return null;
      }
      rootSeen = true;
      depth = 1;
      continue;
    }
    const selfClosing = tag.endsWith('/>');
    if (depth === 1) {
      childStart = commentStart >= 0 ? commentStart : at;
      if (selfClosing) {
        blocks.push({ start: childStart, firstLine: lineOf(starts, childStart), lastLine: lineOf(starts, at + tag.length - 1) });
        childStart = -1;
        commentStart = -1;
      }
    }
    if (!selfClosing) {
      depth++;
    }
  }
  return rootSeen ? blocks : null;
}

/**
 * Offsets at which a line break has to be inserted so that every block of the
 * POM with more than one line is set off by blank lines. Empty when the text
 * is not a POM or already has them.
 */
export function pomBlockGaps(text: string): number[] {
  const blocks = rootBlocks(text);
  if (!blocks) {
    return [];
  }
  const lines = text.split('\n');
  const starts = lineStarts(text);
  const gaps: number[] = [];
  for (let i = 1; i < blocks.length; i++) {
    const before = blocks[i - 1];
    const block = blocks[i];
    const multiline = before.lastLine > before.firstLine || block.lastLine > block.firstLine;
    const separated = lines[block.firstLine - 1]?.trim() === '';
    if (multiline && !separated) {
      gaps.push(starts[block.firstLine]);
    }
  }
  return gaps;
}
