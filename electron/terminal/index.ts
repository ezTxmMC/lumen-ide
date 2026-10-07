/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export type { ExternalTerminal, ShellProfile, TerminalOptions } from './types';
export { detectShells } from './shells';
export { detectExternalTerminals, openExternalTerminal } from './external';
export { createTerminal, killAllTerminals, killTerminal, killTerminalsOf, resizeTerminal, terminalKey, writeTerminal } from './session';
