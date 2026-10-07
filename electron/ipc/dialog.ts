/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import { grantedPaths } from '../files/access';
import { contextOf } from '../window/context';
import { showOpen, showSave } from '../window/dialogs';
import { setContextRoots } from '../window/roots';

export function registerDialogIpc() {
  ipcMain.handle('dialog:openFolder', async (e) => {
    const res = await showOpen(e.sender, { properties: ['openDirectory'] });
    const folder = res.filePaths[0];
    if (res.canceled || !folder) {
      return null;
    }
    const ctx = contextOf(e.sender);
    if (ctx) {
      setContextRoots(ctx, folder, []);
    }
    return folder;
  });

  ipcMain.handle('dialog:chooseFolder', async (e, title?: string, defaultPath?: string) => {
    const res = await showOpen(e.sender, {
      title: title ?? 'Choose folder',
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) {
      return null;
    }
    grantedPaths.add(res.filePaths[0]);
    return res.filePaths[0];
  });

  ipcMain.handle('dialog:chooseFile', async (e, title?: string, defaultPath?: string) => {
    const res = await showOpen(e.sender, { title, defaultPath, properties: ['openFile'] });
    if (res.canceled || !res.filePaths[0]) {
      return null;
    }
    return res.filePaths[0];
  });

  ipcMain.handle('dialog:openFile', async (e) => {
    const res = await showOpen(e.sender, { properties: ['openFile'] });
    if (res.canceled || !res.filePaths[0]) {
      return null;
    }
    const file = res.filePaths[0];
    grantedPaths.add(file);
    return { path: file, content: await fs.readFile(file, 'utf8') };
  });

  ipcMain.handle('dialog:saveFile', async (e, suggested: string) => {
    const res = await showSave(e.sender, { defaultPath: suggested });
    if (res.canceled || !res.filePath) {
      return null;
    }
    grantedPaths.add(res.filePath);
    return res.filePath;
  });
}
