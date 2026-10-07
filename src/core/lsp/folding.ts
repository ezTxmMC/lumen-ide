/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Folding ranges of the language server (`textDocument/foldingRange`), as the editor uses them. */

import type { FoldingRange } from './protocol';

export interface Folds {
  ranges: FoldingRange[];
  /** An edit came after the answer: the line numbers may not fit any more. */
  stale: boolean;
}

/** The widest range that starts on this line and ends inside the document, as a fold from the end of the first line. */
export function foldFor(folds: Folds, lineIndex: number, lineCount: number): FoldingRange | null {
  if (folds.stale) {
    return null;
  }
  let best: FoldingRange | null = null;
  for (const range of folds.ranges) {
    if (range.startLine !== lineIndex || range.endLine <= lineIndex || range.endLine >= lineCount) {
      continue;
    }
    if (!best || range.endLine > best.endLine) {
      best = range;
    }
  }
  return best;
}
