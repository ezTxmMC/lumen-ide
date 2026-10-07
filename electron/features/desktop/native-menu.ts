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
 * The native macOS menu bar. The menus themselves are described in the
 * renderer (one source with the in-window menu bar of Windows and Linux);
 * the renderer sends them here as plain data and gets a click back by id.
 *
 * Clipboard entries carry a `role` so that ⌘C/⌘V/⌘X/⌘A keep working in text
 * fields. Nothing else gets an accelerator: the shortcuts are the renderer's,
 * and a menu key equivalent would swallow them before the page sees them.
 */

import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron';

export interface NativeMenuItem {
  label?: string;
  id?: string;
  role?: 'cut' | 'copy' | 'paste' | 'selectAll';
  checked?: boolean;
  enabled?: boolean;
  separator?: boolean;
  submenu?: NativeMenuItem[];
}

export interface NativeMenu {
  label: string;
  items: NativeMenuItem[];
}

function convert(items: NativeMenuItem[], window: () => BrowserWindow | null): MenuItemConstructorOptions[] {
  return items.map((item): MenuItemConstructorOptions => {
    if (item.separator) {
      return { type: 'separator' };
    }
    if (item.submenu) {
      return { label: item.label, submenu: convert(item.submenu, window) };
    }
    if (item.role) {
      return { label: item.label, role: item.role };
    }
    return {
      label: item.label,
      enabled: item.enabled !== false,
      ...(item.checked === undefined ? {} : { type: 'checkbox' as const, checked: item.checked }),
      click: () => {
        const win = window();
        if (win && !win.isDestroyed()) {
          win.webContents.send('menu:click', item.id);
        }
      },
    };
  });
}

function requestQuit() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('app:close-request');
  }
}

function build(menus: NativeMenu[], window: () => BrowserWindow | null) {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        // Not `role: 'quit'`: every window has to ask about unsaved changes first.
        { label: `Quit ${app.name}`, accelerator: 'Command+Q', click: requestQuit },
      ],
    },
    ...menus.map((menu): MenuItemConstructorOptions => ({ label: menu.label, submenu: convert(menu.items, window) })),
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function registerNativeMenuIpc(window: () => BrowserWindow | null) {
  if (process.platform !== 'darwin') {
    return;
  }
  // Until the first window has sent its menus: the app menu and a working Edit menu.
  build([{ label: 'Edit', items: [
    { label: 'Cut', role: 'cut' }, { label: 'Copy', role: 'copy' },
    { label: 'Paste', role: 'paste' }, { label: 'Select All', role: 'selectAll' },
  ] }], window);
  ipcMain.handle('menu:set', (event, menus: NativeMenu[]) => {
    // Only the window that has focus decides what the shared menu bar shows.
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (Array.isArray(menus) && sender && (sender.isFocused() || !BrowserWindow.getFocusedWindow())) {
      build(menus, window);
    }
  });
}
