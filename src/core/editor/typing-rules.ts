/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Text that completes itself while typing (`LanguageSpec.autoClose`). Pure. */

import type { AutoCloseRule } from '../types';

export interface AutoCloseEdit {
  /** Replaces the typed character. */
  insert: string;
  /** Where the cursor goes inside `insert`. */
  cursor: number;
}

/** The edit for typing `typed` at this place, or null when no rule completes. */
export function autoCloseFor(
  rules: readonly AutoCloseRule[] | undefined, lineBefore: string, typed: string, lineAfter: string,
): AutoCloseEdit | null {
  if (!rules?.length || typed.length !== 1) {
    return null;
  }
  const text = lineBefore + typed;
  for (const rule of rules) {
    if (!rule.open.endsWith(typed) || !text.endsWith(rule.open)) {
      continue;
    }
    // Already closed: `<?nv| ?>` stays as it is.
    if (lineAfter.trimStart().startsWith(rule.after.trim())) {
      continue;
    }
    const before = rule.before ?? '';
    return { insert: typed + before + rule.after, cursor: typed.length + before.length };
  }
  return null;
}
