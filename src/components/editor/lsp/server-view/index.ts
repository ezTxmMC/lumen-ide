/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** What the server adds to how a file looks: semantic colours, its folding ranges and document links. */

import type { Extension } from '@codemirror/state';
import { lspFolding } from './folding';
import { lspLinks } from './links';
import { semanticField, semanticPlugin, semanticTheme } from './semantic';

export function serverView(filePath: string): Extension {
  return [semanticField, semanticTheme, semanticPlugin(filePath), lspFolding(filePath), lspLinks(filePath)];
}
