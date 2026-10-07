/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { app, BrowserWindow, nativeTheme } from 'electron';
import { APP_ROOT } from './app-paths';
import { registerSdkIpc } from './features/sdk/jdk/sdk';
import { registerSdkToolIpc } from './features/sdk/tools/sdk-tools';
import { registerDapIpc } from './features/debug/dap';
import { registerUserAddonIpc } from './features/extensions/user-addons';
import { registerNetIpc } from './features/app/net';
import { registerUpdaterIpc } from './features/app/updater';
import { registerExtensionHostIpc } from './features/extension-host';
import { applyWindowSystem } from './features/desktop/window-system';
import { folderFromArgv, registerRecentProjectsIpc } from './features/desktop/recent-projects';
import { registerLocalRepoIpc } from './features/extensions/local-repos';
import { registerCaptureIpc } from './features/documents/capture';
import { registerExtensionIpc } from './features/extensions/extensions';
import { registerSecurityIpc } from './features/security/security';
import { registerMediaIpc } from './features/documents/media';
import { registerFileClipboardIpc } from './features/documents/file-clipboard';
import { applyManagedPath } from './features/lsp-packages/tools/managed-path';
import { registerLspPackageIpc } from './features/lsp-packages/lsp-packages';
import { registerPrivilegedIpc } from './features/security/privileged';
import { registerProjectDataIpc } from './features/documents/project-data';
import { registerJdtlsIpc } from './features/jdtls/jdtls-support';
import { registerOpenFileWatchIpc } from './features/documents/open-file-watch';
import { registerPopoutIpc } from './features/desktop/popout';
import { fixPathForGuiLaunch } from './features/desktop/shell-env';
import { registerNativeMenuIpc } from './features/desktop/native-menu';
import { registerIpc } from './ipc';
import { activeWindow, contextOf, markQuitting } from './window/context';
import { handleSecondInstance, setPendingFolder, startWindow } from './window/launch';
import { registerQuitCleanup } from './window/release';

process.env.APP_ROOT = APP_ROOT;

// Own profile in development: sharing the installed app's userData would lose the single-instance lock to it.
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`);
}

const relaunching = applyWindowSystem();

/**
 * One instance is enough.
 *
 * The entries of the jump list under Windows and the actions of the desktop
 * entry under Linux start the program afresh, only with `--open-folder=…`.
 * Without the lock a second window would then stand beside the first; with it
 * the second instance passes the folder through to the running window and
 * quits.
 */
const singleInstance = relaunching || app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
}

setPendingFolder(folderFromArgv(process.argv));

app.on('second-instance', (_event, argv) => handleSecondInstance(folderFromArgv(argv)));
registerQuitCleanup();

app.whenReady().then(async () => {
  if (relaunching || !singleInstance) {
    return;
  }
  await fixPathForGuiLaunch();
  applyManagedPath();
  nativeTheme.themeSource = 'dark';
  registerIpc();
  registerNativeMenuIpc(activeWindow);
  registerNetIpc();
  registerSdkIpc(activeWindow);
  registerSdkToolIpc(activeWindow);
  registerLspPackageIpc(activeWindow);
  registerPrivilegedIpc(activeWindow);
  registerDapIpc();
  registerUserAddonIpc(activeWindow);
  registerUpdaterIpc(markQuitting);
  registerRecentProjectsIpc(activeWindow);
  registerLocalRepoIpc();
  registerCaptureIpc();
  registerProjectDataIpc();
  registerJdtlsIpc();
  registerExtensionHostIpc(activeWindow);
  registerExtensionIpc();
  registerSecurityIpc();
  registerMediaIpc();
  registerFileClipboardIpc();
  registerPopoutIpc();
  registerOpenFileWatchIpc((owner, file) => contextOf(owner)?.watchers.some((watcher) => watcher.covers(file)) ?? false);
  startWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
