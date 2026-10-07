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
 * What Enter does inside a doc comment (`/** … *\/`): close it, continue it
 * with ` * `, and step back out after the closing line. Pure text in, text
 * out — the editor extension only applies the result.
 */

import type { LanguageSpec } from '../types';

export interface EnterContext {
  lineBefore: string;
  lineAfter: string;
  /** The line `n` lines above the cursor's (1 = the previous one), or null past the start. */
  above(n: number): string | null;
  /** The document after the cursor's line. */
  below: string;
  /** Add the closing line to a freshly opened comment? */
  close: boolean;
}

export interface EnterEdit {
  /** Replaces the line break the user asked for. */
  insert: string;
  /** Where the cursor goes inside `insert`. */
  cursor: number;
  /** Whitespace behind the cursor that the edit swallows. */
  deleteAfter: number;
}

/** Whether Enter continues doc comments in this language. */
export function continuesDocBlock(spec: Pick<LanguageSpec, 'comments'> | null): boolean {
  const comments = spec?.comments;
  if (!comments || comments.docBlock === false) {
    return false;
  }
  return comments.docBlock === true || (comments.block?.[0] === '/*' && comments.block[1] === '*/');
}

const OPEN = /^([ \t]*)\/\*\*(?!\/)(?:[^*]|\*(?!\/))*$/;
const STAR = /^([ \t]*)\*(?!\/)/;
const CLOSER = /^([ \t]*) \*\/\s*$/;

/** Is the comment that opens above still open — does a line of stars lead up to its `/*`? */
function insideComment(context: EnterContext): boolean {
  for (let n = 1; n < 400; n++) {
    const line = context.above(n);
    if (line === null || /^\s*\*\//.test(line)) {
      return false;
    }
    if (/^\s*\*/.test(line)) {
      continue;
    }
    return /^\s*\/\*/.test(line) && !line.includes('*/');
  }
  return false;
}

/** The comment is already closed further down: a `*\/` comes before any new `/*`. */
function closedBelow(below: string): boolean {
  const end = below.indexOf('*/');
  if (end < 0) {
    return false;
  }
  const start = below.indexOf('/*');
  return start < 0 || end < start;
}

function edit(insert: string, cursor: number, deleteAfter = 0): EnterEdit {
  return { insert, cursor, deleteAfter };
}

function afterOpening(context: EnterContext, indent: string): EnterEdit {
  const { lineAfter } = context;
  const trimmed = lineAfter.trimStart();
  const lead = lineAfter.length - trimmed.length;
  const star = `\n${indent} * `;
  if (trimmed.startsWith('*/')) {
    return edit(`${star}\n${indent} `, star.length, lead);
  }
  if (lineAfter.includes('*/') || trimmed !== '' || !context.close || closedBelow(context.below)) {
    return edit(star, star.length);
  }
  return edit(`${star}\n${indent} */`, star.length);
}

/** The edit for Enter at this place, or null when the line is none of a doc comment's business. */
export function docBlockEnter(context: EnterContext): EnterEdit | null {
  const opening = OPEN.exec(context.lineBefore);
  if (opening) {
    return afterOpening(context, opening[1]);
  }
  const closer = CLOSER.exec(context.lineBefore);
  if (closer && context.lineAfter.trim() === '') {
    return edit(`\n${closer[1]}`, closer[1].length + 1);
  }
  const star = STAR.exec(context.lineBefore);
  if (star && insideComment(context)) {
    const insert = `\n${star[1]}* `;
    return edit(insert, insert.length);
  }
  return null;
}
