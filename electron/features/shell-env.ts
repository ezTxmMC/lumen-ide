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
 * Apps started from the Dock or Finder get launchd's bare PATH
 * (/usr/bin:/bin:/usr/sbin:/sbin) — no Homebrew, no nvm, nothing from
 * .zprofile. git, node, python, uv … would all be "not found". So on macOS the
 * PATH of the user's login shell is read once at start and merged in.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MARK = '__LUMEN_PATH__';

/** Where the usual tools live, in case the shell cannot be asked. */
function fallbackDirs() {
  return ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/local/sbin', path.join(os.homedir(), '.local', 'bin')];
}

function merge(...lists: string[][]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of lists.flat()) {
    if (dir && !seen.has(dir)) {
      seen.add(dir);
      out.push(dir);
    }
  }
  return out.join(path.delimiter);
}

/** The PATH a login shell would have, or null (timeout, unknown shell). */
function loginShellPath(): Promise<string[] | null> {
  const shell = process.env.SHELL && fs.existsSync(process.env.SHELL) ? process.env.SHELL : '/bin/zsh';
  // `printenv` instead of `echo $PATH`: fish prints PATH as a list with spaces.
  const script = `printf '%s' '${MARK}'; printenv PATH; printf '%s' '${MARK}'`;
  return new Promise((resolve) => {
    execFile(shell, ['-l', '-i', '-c', script], {
      timeout: 5000,
      env: { ...process.env, TERM: 'dumb', DISABLE_AUTO_UPDATE: 'true' },
      windowsHide: true,
    }, (err, stdout) => {
      const match = new RegExp(`${MARK}([^\\n]*?)\\n?${MARK}`).exec(String(stdout ?? ''));
      if (!match || (err && !match[1])) {
        resolve(null);
        return;
      }
      resolve(match[1].trim().split(path.delimiter));
    });
  });
}

/** Called once before the first window; a no-op outside macOS. */
export async function fixPathForGuiLaunch() {
  if (process.platform !== 'darwin') {
    return;
  }
  const current = (process.env.PATH ?? '').split(path.delimiter);
  const fromShell = await loginShellPath().catch(() => null);
  process.env.PATH = merge(fromShell ?? [], current, fallbackDirs());
}
