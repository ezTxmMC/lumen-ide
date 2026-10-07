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
import os from 'node:os';
import { currentWindowSystem, isWaylandSession, relaunchApp } from '../features/desktop/window-system';
import { contexts, markQuitting } from '../window/context';
import { takePendingFolder } from '../window/launch';

export function registerAppIpc() {
  // Once only: the renderer collects the start folder, after which it is spent.
  ipcMain.handle('app:startupFolder', () => {
    return takePendingFolder();
  });

  ipcMain.handle('app:info', () => ({
    platform: process.platform,
    version: app.getVersion(),
    home: os.homedir(),
    userData: app.getPath('userData'),
    tmp: app.getPath('temp'),
    windowSystem: currentWindowSystem(),
    waylandSession: isWaylandSession(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }));
  /** “Exit”: every window asks about its unsaved changes and closes; the last one ends the app. */
  ipcMain.handle('app:quit', () => {
    for (const ctx of contexts.values()) {
      if (!ctx.win.isDestroyed()) {
        ctx.win.webContents.send('app:close-request');
      }
    }
  });
  ipcMain.handle('app:relaunch', () => {
    markQuitting();
    relaunchApp();
  });
}
