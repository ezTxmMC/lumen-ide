/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import path from 'node:path';
import { contextOf } from '../window/context';
import { createWindow, getProjectsWindow } from '../window/create';
import { handOver, openProjectWindow } from '../window/launch';

/** Window controls act on the window that asked. */
const senderWindow = (contents: WebContents) => BrowserWindow.fromWebContents(contents);

export function registerWindowIpc() {
  ipcMain.handle('window:minimize', (e) => senderWindow(e.sender)?.minimize());
  ipcMain.handle('window:toggleMaximize', (e) => {
    const win = senderWindow(e.sender);
    if (!win) {
      return false;
    }
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });
  ipcMain.handle('window:close', (e) => e.sender.send('app:close-request'));
  ipcMain.handle('window:forceClose', (e) => {
    const ctx = contextOf(e.sender);
    if (ctx) {
      ctx.forceClose = true;
    }
    const win = senderWindow(e.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });
  ipcMain.handle('window:isMaximized', (e) => senderWindow(e.sender)?.isMaximized() ?? false);
  /** A project in a window of its own; without one, an empty window at the project screen. */
  ipcMain.handle('window:openProject', (e, folder?: string) => {
    const project = typeof folder === 'string' && path.isAbsolute(folder) ? folder : undefined;
    if (project && senderWindow(e.sender) === getProjectsWindow()) {
      handOver({ project });
      return 'opened';
    }
    return openProjectWindow(project);
  });
  /** The project screen's choice: a saved workspace, or the editor without a project. */
  ipcMain.handle('window:handOver', (e, request: { workspace?: string; empty?: boolean; }) => {
    if (senderWindow(e.sender) !== getProjectsWindow()) {
      return false;
    }
    handOver({ workspace: typeof request?.workspace === 'string' ? request.workspace : undefined, empty: request?.empty === true });
    return true;
  });
  /** A project was closed: the project screen's window opens (or comes forward) and this window goes. */
  ipcMain.handle('window:closeToProjects', (e) => {
    const win = senderWindow(e.sender);
    if (!win || win === getProjectsWindow()) {
      return;
    }
    const ctx = contextOf(e.sender);
    if (ctx) {
      ctx.forceClose = true;
    }
    const projects = getProjectsWindow();
    const projectsOpen = projects !== null && !projects.isDestroyed();
    if (projectsOpen) {
      projects.focus();
    }
    if (!projectsOpen) {
      createWindow({ view: 'projects' });
    }
    if (!win.isDestroyed()) {
      win.close();
    }
  });
  /** Clipboard and selection commands for the menu bar — they act on whatever has focus. */
  ipcMain.handle('window:edit', (e, action: string) => {
    const actions: Record<string, () => void> = {
      cut: () => e.sender.cut(),
      copy: () => e.sender.copy(),
      paste: () => e.sender.paste(),
      selectAll: () => e.sender.selectAll(),
    };
    actions[String(action)]?.();
  });
  ipcMain.handle('window:toggleDevTools', (e) => e.sender.toggleDevTools());
}
