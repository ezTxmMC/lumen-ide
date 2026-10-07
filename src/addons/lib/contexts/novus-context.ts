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
 * The syntax context of a `.nv` file: the innermost of `toplevel`, `class`
 * (a `define class|interface|enum|…` body), `statement` (a method or control
 * block) and `expression` (a map or object literal, a `${ }` interpolation).
 * Inside a `c { }` block the scope is `c`, which is not Novus code.
 */

import type { ContextDetector } from '@/core/types';
import { scanCode } from './novus-scan';

export const detectNovus: ContextDetector = (before) => {
  const scan = scanCode(before, 0, {}, 'toplevel');
  return { scope: scan.scope, code: scan.scope !== 'c' };
};
