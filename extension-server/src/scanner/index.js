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
 * Lumen's malware and bad-command scanner.
 *
 * One module, plain ESM, no dependencies and nothing from Node: it runs in the
 * extension server on publish, in Electron's main process when an extension is
 * installed or a project is opened, and in the renderer. Types are in
 * `index.d.ts`; the rules are in `rules/`.
 */

export { RULES } from './rules/index.js';
export { scanCommand, scanText } from './scan.js';
export { scanManifest } from './extension-scan.js';
export { PROJECT_SCAN, isProjectFile, scanProjectFiles } from './project.js';
export { toRule } from './custom.js';
export { summarize, verdictOf } from './report.js';

/** Bumped whenever the rules change in a way that should re-check what is already stored. */
export const SCANNER_VERSION = 1;
