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
 * A language's notion of a word, from `LanguageSpec.wordPattern`. Pure — the
 * editor extensions and the completion source share it.
 */

/** Punctuation a pattern may allow inside or at the start of a word. */
const PROBES = '$@-:#%~.?!+*/\\';

/** Does the whole text match the pattern as one word? */
export function isWord(pattern: RegExp, text: string): boolean {
  return new RegExp(`^(?:${pattern.source})$`, pattern.flags.replace(/[gy]/g, '')).test(text);
}

/**
 * The characters beyond letters, digits and `_` that can belong to a word —
 * what CodeMirror calls `wordChars`, which double-click and Ctrl+arrows use.
 */
export function wordCharsOf(pattern: RegExp): string {
  let chars = '';
  for (const ch of PROBES) {
    if (isWord(pattern, `a${ch}a`) || isWord(pattern, `${ch}a`) || isWord(pattern, `a${ch}`)) {
      chars += ch;
    }
  }
  return chars;
}

const LOOKBACK = 80;

/** Length of the word that ends at the end of `text` — 0 when none does. */
export function wordLengthBefore(pattern: RegExp, text: string): number {
  const floor = Math.max(0, text.length - LOOKBACK);
  for (let start = floor; start < text.length; start++) {
    if (isWord(pattern, text.slice(start))) {
      return text.length - start;
    }
  }
  return 0;
}
