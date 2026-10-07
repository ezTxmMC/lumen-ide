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
 * The built-in terminals (node-pty) and the opening of external terminal
 * programs.
 *
 * node-pty is loaded only with the first terminal: where the native module is
 * missing (not built for Electron), the rest of the IDE stays usable and the
 * renderer gets an error message it can make sense of.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { PtyModule } from './types';

const require = createRequire(import.meta.url);
let ptyModule: PtyModule | null = null;
let ptyError: string | null = null;

/**
 * npm and electron-builder can drop the execute bit of node-pty's spawn-helper
 * on macOS — every terminal then fails with "posix_spawnp failed".
 */
function ensureSpawnHelperExecutable() {
  if (process.platform !== 'darwin') {
    return;
  }
  try {
    const root = path.dirname(require.resolve('node-pty/package.json')).replace('app.asar', 'app.asar.unpacked');
    const dirs = [path.join(root, 'build', 'Release'), path.join(root, 'build', 'Debug')];
    const prebuilds = path.join(root, 'prebuilds');
    if (fs.existsSync(prebuilds)) {
      dirs.push(...fs.readdirSync(prebuilds).map((d) => path.join(prebuilds, d)));
    }
    for (const dir of dirs) {
      const helper = path.join(dir, 'spawn-helper');
      if (fs.existsSync(helper)) {
        fs.chmodSync(helper, 0o755);
      }
    }
  } catch {
    // Not resolvable: loading node-pty reports the real problem.
  }
}

export function loadPty(): PtyModule {
  if (ptyModule) {
    return ptyModule;
  }
  if (ptyError) {
    throw new Error(ptyError);
  }
  try {
    ensureSpawnHelperExecutable();
    ptyModule = require('node-pty') as PtyModule;
    return ptyModule;
  } catch (err) {
    ptyError = `node-pty could not be loaded (${(err as Error).message.split('\n')[0]}). ` +
      'Rebuild it for Electron with "npm run rebuild:native".';
    throw new Error(ptyError);
  }
}
