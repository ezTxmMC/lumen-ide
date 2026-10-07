/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { managedCommand } from '../features/lsp-packages/manifest';

/** Checks whether a program lies in the PATH. */
export function commandExists(command: string): Promise<boolean> {
  return resolveCommand(command).then((hit) => hit !== null);
}

/**
 * Resolves a program: absolute paths (with `~` as well) through the file
 * permissions, bare names through `which`/`where`. Returns the path to use.
 */
function resolveCommand(command: string): Promise<string | null> {
  const expanded = command.replace(/^~(?=\/|$)/, os.homedir());
  return new Promise((resolve) => {
    if (path.isAbsolute(expanded) || expanded.includes('/') || expanded.includes('\\')) {
      fs.access(expanded, fsSync.constants.X_OK).then(
        () => resolve(expanded),
        () => resolve(null),
      );
      return;
    }
    const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [expanded], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    probe.on('error', () => resolve(null));
    probe.on('close', (code) => resolve(code === 0 ? expanded : null));
  });
}

/**
 * The first candidate that exists, in the order given. A bare command name
 * ("novusc") is looked up among the programs Lumen installed itself
 * (`~/.lumen/lsp/bin`) before the PATH; a path ahead of it (the Novus chosen in
 * the SDK dialog) wins over both.
 */
export async function resolveFirst(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const managed = await managedCommand(candidate);
    if (managed) {
      return managed;
    }
    const hit = await resolveCommand(candidate);
    if (hit) {
      return hit;
    }
  }
  return null;
}
