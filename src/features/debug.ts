/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Starting the “debug” feature: registering the debugger, the editor extension and the commands. */

import { registerEditorExtension } from '@/lib/editor-extensions';
import { registerCommandProvider } from '@/core/commands';
import { debug } from '@/core/debug/manager';
import { debugEditorExtension } from '@/core/debug/editor';
import { debugCommands } from '@/core/debug/commands';

export function init() {
  debug.init();
  registerEditorExtension(debugEditorExtension);
  registerCommandProvider(debugCommands);
}
