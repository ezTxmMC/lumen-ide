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
 * Git's conflict blocks in a text — found, resolved and projected.
 *
 *   <<<<<<< HEAD          the current side (ours)
 *   ||||||| base          the common ancestor (only with `merge.conflictStyle=diff3`)
 *   =======
 *   >>>>>>> feature       the incoming side (theirs)
 *
 * Pure functions on plain strings and offsets: the editor, the merge editor,
 * the status bar and `scripts/check-merge.ts` share them.
 */

export interface Span {
  from: number;
  to: number;
}

export interface Conflict {
  /** The whole block: from the start of `<<<<<<<` to past the line break of `>>>>>>>`. */
  from: number;
  to: number;
  /** The marker lines, without their line breaks. */
  startMarker: Span;
  baseMarker: Span | null;
  separator: Span;
  endMarker: Span;
  /** The contents of each side, line breaks included — `slice` gives whole lines. */
  current: Span;
  base: Span | null;
  incoming: Span;
  /** What follows the marker: `HEAD`, a branch name, a commit. */
  currentLabel: string;
  baseLabel: string | null;
  incomingLabel: string;
}

export type Resolution = 'current' | 'incoming' | 'both' | 'base' | 'none';

type Marker = 'start' | 'base' | 'separator' | 'end';

const MARKERS: [string, Marker][] = [
  ['<<<<<<<', 'start'],
  ['|||||||', 'base'],
  ['=======', 'separator'],
  ['>>>>>>>', 'end'],
];

/** Which marker a line is, if any — exactly seven characters, then a space or nothing. */
function markerOf(line: string): { kind: Marker; label: string; } | null {
  for (const [prefix, kind] of MARKERS) {
    if (!line.startsWith(prefix)) {
      continue;
    }
    const rest = line.slice(prefix.length);
    if (kind === 'separator') {
      return rest.trim() === '' ? { kind, label: '' } : null;
    }
    if (rest !== '' && rest[0] !== ' ') {
      return null;
    }
    return { kind, label: rest.trim() };
  }
  return null;
}

interface Line {
  from: number;
  to: number;
  /** Past the line break, or `to` on the last line. */
  next: number;
  text: string;
}

function* linesOf(text: string): Generator<Line> {
  let from = 0;
  while (from <= text.length) {
    const nl = text.indexOf('\n', from);
    const end = nl === -1 ? text.length : nl;
    const to = end > from && text.charCodeAt(end - 1) === 13 ? end - 1 : end;
    yield { from, to, next: nl === -1 ? end : nl + 1, text: text.slice(from, to) };
    if (nl === -1) {
      return;
    }
    from = nl + 1;
  }
}

interface Open {
  start: Line;
  label: string;
  base: { line: Line; label: string; } | null;
  separator: Line | null;
}

/** Every well-formed conflict block, in document order. Unclosed or garbled blocks are skipped. */
export function parseConflicts(text: string): Conflict[] {
  if (!text.includes('<<<<<<<')) {
    return [];
  }
  const out: Conflict[] = [];
  let open: Open | null = null;
  for (const line of linesOf(text)) {
    const marker = line.text.length >= 7 ? markerOf(line.text) : null;
    if (!marker) {
      continue;
    }
    if (marker.kind === 'start') {
      // A second opening marker: the first block was never closed, start over here.
      open = { start: line, label: marker.label, base: null, separator: null };
      continue;
    }
    if (!open) {
      continue;
    }
    if (marker.kind === 'base') {
      if (open.base || open.separator) {
        continue;
      }
      open.base = { line, label: marker.label };
      continue;
    }
    if (marker.kind === 'separator') {
      if (open.separator) {
        continue;
      }
      open.separator = line;
      continue;
    }
    if (!open.separator) {
      open = null;
      continue;
    }
    out.push(close(open, line, marker.label));
    open = null;
  }
  return out;
}

function close(open: Open, end: Line, incomingLabel: string): Conflict {
  const { start, base, separator } = open;
  const sep = separator as Line;
  const currentEnd = base ? base.line.from : sep.from;
  return {
    from: start.from,
    to: end.next,
    startMarker: { from: start.from, to: start.to },
    baseMarker: base ? { from: base.line.from, to: base.line.to } : null,
    separator: { from: sep.from, to: sep.to },
    endMarker: { from: end.from, to: end.to },
    current: { from: start.next, to: currentEnd },
    base: base ? { from: base.line.next, to: sep.from } : null,
    incoming: { from: sep.next, to: end.from },
    currentLabel: open.label,
    baseLabel: base ? base.label : null,
    incomingLabel,
  };
}

const slice = (text: string, span: Span | null) => (span ? text.slice(span.from, span.to) : '');

/**
 * The text a resolution puts in place of the block.
 *
 * `both` is current followed by incoming. `base` without a base section (no
 * diff3) and `none` give nothing. A block that ends the file without a final
 * line break keeps it that way.
 */
export function resolutionText(text: string, conflict: Conflict, resolution: Resolution): string {
  const parts: Record<Resolution, () => string> = {
    current: () => slice(text, conflict.current),
    incoming: () => slice(text, conflict.incoming),
    both: () => slice(text, conflict.current) + slice(text, conflict.incoming),
    base: () => slice(text, conflict.base),
    none: () => '',
  };
  const value = parts[resolution]();
  if (conflict.to !== conflict.endMarker.to) {
    return value;
  }
  return value.replace(/\r?\n$/, '');
}

/** The raw block, markers included. */
export const blockText = (text: string, conflict: Conflict) => text.slice(conflict.from, conflict.to);

/**
 * Rebuild the text with each block replaced by `pick(conflict, index)` — or
 * left as it is where `pick` returns `null`. `ranges` are where each block's
 * replacement ended up in the new text.
 */
export function project(
  text: string,
  conflicts: Conflict[],
  pick: (conflict: Conflict, index: number) => string | null,
): { text: string; ranges: Span[]; } {
  let out = '';
  let cursor = 0;
  const ranges: Span[] = [];
  conflicts.forEach((conflict, index) => {
    out += text.slice(cursor, conflict.from);
    const replacement = pick(conflict, index) ?? blockText(text, conflict);
    ranges.push({ from: out.length, to: out.length + replacement.length });
    out += replacement;
    cursor = conflict.to;
  });
  out += text.slice(cursor);
  return { text: out, ranges };
}

/** Resolve every block the same way. */
export function resolveAll(text: string, resolution: Resolution): string {
  const conflicts = parseConflicts(text);
  return project(text, conflicts, (conflict) => resolutionText(text, conflict, resolution)).text;
}

/** The block around `pos`, if any. */
export function conflictAt(conflicts: Conflict[], pos: number): Conflict | null {
  return conflicts.find((conflict) => pos >= conflict.from && pos < conflict.to) ?? null;
}

/**
 * The next block after `pos` (or the previous one before it), wrapping around
 * the ends of the file. `null` without any block.
 */
export function neighbourConflict(conflicts: Conflict[], pos: number, direction: 1 | -1): Conflict | null {
  if (!conflicts.length) {
    return null;
  }
  if (direction === 1) {
    return conflicts.find((conflict) => conflict.from > pos) ?? conflicts[0];
  }
  const inside = conflictAt(conflicts, pos);
  const before = conflicts.filter((conflict) => conflict.to <= pos && conflict !== inside);
  return before[before.length - 1] ?? conflicts[conflicts.length - 1];
}

/**
 * A choice in the merge editor: which sides are taken. Neither side, once
 * touched, falls back to the base (or nothing); untouched keeps the raw block.
 */
export interface Choice {
  current: boolean;
  incoming: boolean;
  touched: boolean;
}

export const UNTOUCHED: Choice = { current: false, incoming: false, touched: false };

export function choiceResolution(choice: Choice): Resolution | null {
  if (!choice.touched) {
    return null;
  }
  if (choice.current && choice.incoming) {
    return 'both';
  }
  if (choice.current) {
    return 'current';
  }
  if (choice.incoming) {
    return 'incoming';
  }
  return 'base';
}

/** The text a choice puts in the result: the resolution, or the raw block while untouched. */
export function choiceText(text: string, conflict: Conflict, choice: Choice): string {
  const resolution = choiceResolution(choice);
  if (!resolution) {
    return blockText(text, conflict);
  }
  return resolutionText(text, conflict, resolution);
}
