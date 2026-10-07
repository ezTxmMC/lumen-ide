/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import os from 'node:os';
import path from 'node:path';
import { PlatformKey } from './types';

export const ROOT = path.join(os.homedir(), '.lumen', 'lsp');
export const BIN = path.join(ROOT, 'bin');
export const PACKAGES = path.join(ROOT, 'packages');
export const TOOLS = path.join(ROOT, 'tools');
export const CACHE = path.join(ROOT, 'cache');
export const DOWNLOADS = path.join(ROOT, '.downloads');
export const MANIFEST = path.join(ROOT, 'packages.json');
export const IS_WINDOWS = process.platform === 'win32';
export const EXE = IS_WINDOWS ? '.exe' : '';
export const PLATFORM: PlatformKey = `${process.platform}-${process.arch}`;
/** Python for `pypi` packages that do not say — uv downloads it where missing. */
export const DEFAULT_PYTHON = '3.13';
