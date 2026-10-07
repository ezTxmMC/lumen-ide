/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { ipcMain, shell } from 'electron';
import fsSync from 'node:fs';
import os from 'node:os';
import {
  createTerminal, detectExternalTerminals, detectShells, killTerminal, openExternalTerminal,
  resizeTerminal, terminalKey, writeTerminal, type TerminalOptions,
} from '../terminal';
import { contextOf } from '../window/context';

export function registerShellIpc() {
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) {
      return shell.openExternal(url);
    }
  });
  ipcMain.handle('terminal:shells', () => detectShells());
  ipcMain.handle('terminal:external', () => detectExternalTerminals());
  ipcMain.handle('terminal:create', (e, id: string, options: TerminalOptions) =>
    createTerminal(id, options, e.sender));
  ipcMain.handle('terminal:write', (e, id: string, data: string) => writeTerminal(terminalKey(e.sender, id), data));
  ipcMain.handle('terminal:resize', (e, id: string, cols: number, rows: number) => resizeTerminal(terminalKey(e.sender, id), cols, rows));
  ipcMain.handle('terminal:kill', (e, id: string) => killTerminal(terminalKey(e.sender, id)));
  ipcMain.handle('terminal:openExternal', (e, cwd: string, terminalId?: string) => {
    const target = cwd && fsSync.existsSync(cwd) ? cwd : (contextOf(e.sender)?.workspaceRoot ?? os.homedir());
    return openExternalTerminal(target, terminalId);
  });

  ipcMain.handle('shell:showItemInFolder', (_e, target: string) => shell.showItemInFolder(target));
}
