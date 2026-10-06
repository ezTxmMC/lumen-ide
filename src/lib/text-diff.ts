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
 * The smallest set of edits that turns one text into another, line by line.
 *
 * A formatter hands back a whole document. Replacing the document would throw
 * away the cursor, the folds and the undo history's granularity, so the
 * difference is applied as separate hunks instead — the lines a formatter did
 * not touch are not touched in the editor either.
 */

export interface TextHunk {
  /** Offsets into the old text. */
  from: number;
  to: number;
  insert: string;
}

/** Above this many line pairs the exact comparison is skipped in favour of one hunk. */
const MAX_CELLS = 4_000_000;

function lineStarts(lines: string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length;
  }
  return starts;
}

/** Keep the line breaks with their lines, so offsets add up. */
const splitLines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Longest common subsequence of two line lists, as matching index pairs. */
function commonLines(a: string[], b: string[]): [number, number][] {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i++, j++]);
      continue;
    }
    if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i++;
      continue;
    }
    j++;
  }
  return pairs;
}

export function diffHunks(before: string, after: string): TextHunk[] {
  if (before === after) {
    return [];
  }
  const a = splitLines(before);
  const b = splitLines(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    head++;
  }
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
    tail++;
  }
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const startsA = lineStarts(a);
  const offsetA = (index: number) => (index >= a.length ? before.length : startsA[index]);
  const textB = (from: number, to: number) => b.slice(from, to).join('');

  if (midA.length * midB.length > MAX_CELLS) {
    return [{ from: offsetA(head), to: offsetA(a.length - tail), insert: textB(head, b.length - tail) }];
  }

  const hunks: TextHunk[] = [];
  let i = 0;
  let j = 0;
  const flush = (nextI: number, nextJ: number) => {
    if (nextI === i && nextJ === j) {
      return;
    }
    hunks.push({ from: offsetA(head + i), to: offsetA(head + nextI), insert: textB(head + j, head + nextJ) });
  };
  for (const [matchA, matchB] of commonLines(midA, midB)) {
    flush(matchA, matchB);
    i = matchA + 1;
    j = matchB + 1;
  }
  flush(midA.length, midB.length);
  return hunks;
}
