/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The named syntax-context detectors, and their registration — see `core/editor/syntax-context.ts`. */

import { registerContextDetectors } from '@/core/editor/syntax-context';
import { detectNovus } from './novus-context';
import { detectNvh } from './nvh-context';
import { detectNvmd } from './nvmd-context';

export const BUILTIN_CONTEXTS = { novus: detectNovus, nvh: detectNvh, nvmd: detectNvmd };

registerContextDetectors(BUILTIN_CONTEXTS);
