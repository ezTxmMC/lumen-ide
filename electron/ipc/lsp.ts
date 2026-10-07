/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { app, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isInside } from '../files/paths';
import { commandExists, resolveFirst } from '../lsp/resolve';
import { sendLsp, startLsp, stopLsp } from '../lsp/server';
import { scopedId } from '../window/ids';

export function registerLspIpc() {
  ipcMain.handle('lsp:available', (_e, command: string) => commandExists(command));
  ipcMain.handle('lsp:resolve', (_e, candidates: string[]) => resolveFirst(candidates));
  ipcMain.handle('lsp:start', (
    e, id: string, cmd: string, args: string[], cwd: string, env?: Record<string, string>,
  ) => {
    startLsp(e.sender, id, cmd, args, cwd, env ?? {});
    return id;
  });
  ipcMain.handle('lsp:send', (e, id: string, message: unknown) => sendLsp(scopedId(e.sender, id), message));
  ipcMain.handle('lsp:stop', (e, id: string) => stopLsp(scopedId(e.sender, id)));
  /** Delete a server's data folder (jdtls' workspace) — only below userData/lsp. */
  ipcMain.handle('lsp:clearData', async (_e, dir: string) => {
    const base = path.join(app.getPath('userData'), 'lsp');
    const target = path.resolve(String(dir));
    if (!isInside(base, target) || target === base) {
      throw new Error('Not a language server data folder');
    }
    await fs.rm(target, { recursive: true, force: true });
  });
}
