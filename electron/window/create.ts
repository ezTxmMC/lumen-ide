/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { PRELOAD_FILE, RENDERER_DIST, VITE_DEV_SERVER_URL } from '../app-paths';
import { popoutOpenResult, trackPopouts } from '../features/desktop/popout';
import { applyWindowState, loadWindowState, trackWindowState, type WindowState } from '../features/desktop/window-state';
import { killTerminalsOf } from '../terminal';
import { activeWindow, contexts, isQuitting, setLastFocused, syncWorkspaceRoots, type WindowContext } from './context';
import { releaseWindow } from './release';

/** The small project-screen window, while it is open. */
let projectsWindow: BrowserWindow | null = null;

export const getProjectsWindow = () => projectsWindow;

/** Where a further window goes: a little below and to the right of the one in front. */
function nextBounds(): { x?: number; y?: number; width: number; height: number; } {
  const front = activeWindow();
  if (!front || front.isDestroyed() || front === projectsWindow) {
    return { width: 1440, height: 900 };
  }
  const bounds = front.getNormalBounds();
  return { x: bounds.x + 28, y: bounds.y + 28, width: bounds.width, height: bounds.height };
}

/** What a window starts with — the renderer reads it from the query string. */
export interface Launch {
  /** Opens this folder straight away. */
  project?: string;
  /** Opens this saved workspace (several folders), by id. */
  workspace?: string;
  /** Starts at the project screen even when “open last project on start” is on — that setting is about starting the app. */
  fresh?: boolean;
  /** Starts in the editor without a project. */
  empty?: boolean;
  /** The small window that shows nothing but the project screen. */
  view?: 'projects';
  /** The main window: it comes up where it was last and remembers where it goes. */
  primary?: boolean;
}

const PROJECTS_SIZE = { width: 980, height: 640, minWidth: 720, minHeight: 480 };

function windowGeometry(launch: Launch, saved: WindowState | null) {
  if (launch.view === 'projects') {
    return PROJECTS_SIZE;
  }
  const bounds = saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : nextBounds();
  return { ...bounds, minWidth: 820, minHeight: 520 };
}

export function createWindow(launch: Launch = {}) {
  const projects = launch.view === 'projects';
  const saved = launch.primary ? loadWindowState() : null;
  const win = new BrowserWindow({
    ...windowGeometry(launch, saved),
    show: false,
    frame: false,
    maximizable: !projects,
    fullscreenable: !projects,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#0b0d10',
    webPreferences: {
      preload: PRELOAD_FILE,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  if (saved) {
    trackWindowState(win);
  }
  if (projects) {
    projectsWindow = win;
    win.once('closed', () => { projectsWindow = null; });
  }

  const contents = win.webContents;
  // Nothing to save in the project screen: it closes without asking.
  const ctx: WindowContext = { win, id: contents.id, workspaceRoot: null, extraRoots: [], watchers: [], forceClose: projects };
  contexts.set(ctx.id, ctx);
  setLastFocused(win);

  // Under Wayland `ready-to-show` does not always arrive for hidden windows —
  // show it anyway once loading is through, or after a short wait.
  const reveal = () => {
    if (win.isDestroyed() || win.isVisible()) {
      return;
    }
    // Maximizing a hidden window shows it at once (Linux), so it waits until the page is ready.
    if (saved) {
      applyWindowState(win, saved);
    }
    win.show();
  };
  win.once('ready-to-show', reveal);
  contents.once('did-finish-load', () => setTimeout(reveal, 400));
  setTimeout(reveal, 4000);
  // Reloading the renderer (hot reload) orphans this window's shells — end them then.
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      killTerminalsOf(ctx.id);
    }
  });
  win.on('focus', () => {
    setLastFocused(win);
    syncWorkspaceRoots();
  });
  win.on('closed', () => releaseWindow(ctx));

  // Close only after asking in the renderer (unsaved changes).
  win.on('close', (event) => {
    if (isQuitting() || ctx.forceClose) {
      return;
    }
    event.preventDefault();
    contents.send('app:close-request');
  });

  const emit = (channel: string, payload?: unknown) => {
    if (!contents.isDestroyed()) {
      contents.send(channel, payload);
    }
  };

  win.on('maximize', () => emit('window:state', { maximized: true }));
  win.on('unmaximize', () => emit('window:state', { maximized: false }));
  win.on('enter-full-screen', () => emit('window:state', { fullscreen: true }));
  win.on('leave-full-screen', () => emit('window:state', { fullscreen: false }));

  // Never open external links in the app window.
  // Except the windows the renderer opens itself for pop-out views and editor groups.
  win.webContents.setWindowOpenHandler((details) => {
    const popout = popoutOpenResult(details);
    if (popout) {
      return popout;
    }
    if (/^https?:\/\//.test(details.url)) {
      shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });
  trackPopouts(win);

  const query = launchQuery(launch);
  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    void win.loadURL(url.toString());
    return win;
  }
  void win.loadFile(path.join(RENDERER_DIST, 'index.html'), { query });
  return win;
}

function launchQuery(launch: Launch): Record<string, string> {
  const query: Record<string, string> = {};
  if (launch.project) {
    query.project = launch.project;
  }
  if (launch.workspace) {
    query.workspace = launch.workspace;
  }
  if (launch.view) {
    query.view = launch.view;
  }
  if (launch.empty) {
    query.empty = '1';
  }
  if (launch.fresh && !launch.project) {
    query.fresh = '1';
  }
  return query;
}
