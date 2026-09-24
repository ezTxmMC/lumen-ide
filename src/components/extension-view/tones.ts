/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ViewTone } from '../../../electron/features/extension-host/contract';

/** Theme colours for the tones an extension may use. */
export const TONE_TEXT: Record<ViewTone, string> = {
  default: 'text-fg', muted: 'text-subtle', accent: 'text-accent', success: 'text-ok', warning: 'text-warn',
  danger: 'text-bad', added: 'text-ok', modified: 'text-warn', deleted: 'text-bad', renamed: 'text-accent',
  untracked: 'text-ok', conflict: 'text-bad',
};
