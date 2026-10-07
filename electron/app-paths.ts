/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bundleDir = path.dirname(fileURLToPath(import.meta.url));

export const APP_ROOT = path.join(bundleDir, '..');
export const PRELOAD_FILE = path.join(bundleDir, 'preload.mjs');
export const RENDERER_DIST = path.join(APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
