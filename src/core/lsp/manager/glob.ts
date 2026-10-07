/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** A very small glob translation: `**`, `*`, `?`, `{a,b}`. */
export function globToRegExp(glob: string): RegExp {
  const simple: Record<string, string> = { '?': '[^/]', '{': '(', '}': ')', ',': '|' };
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') {
        i++;
      }
      continue;
    }
    if (c === '*') {
      re += '[^/]*';
      continue;
    }
    if (c in simple) {
      re += simple[c];
      continue;
    }
    re += '.+^$()|[]\\'.includes(c) ? `\\${c}` : c;
  }
  return new RegExp(`(^|/)${re}$`);
}
