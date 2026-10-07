/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { app } from 'electron';
import fsSync from 'node:fs';
import path from 'node:path';
import { createWindow, getProjectsWindow, type Launch } from './create';
import { activeWindow, contexts } from './context';

/** The folder the command line names at start — the renderer collects it. */
let pendingFolder: string | null = null;

export function setPendingFolder(folder: string | null) {
  pendingFolder = folder;
}

/** Once only: the renderer collects the start folder, after which it is spent. */
export function takePendingFolder() {
  const folder = pendingFolder;
  pendingFolder = null;
  return folder;
}

/** “Open last project on start” is read straight from the settings file — no renderer runs yet. */
function reopensLastProject(): boolean {
  try {
    const file = path.join(app.getPath('userData'), 'settings.json');
    const parsed = JSON.parse(fsSync.readFileSync(file, 'utf8')) as { effects?: { reopenLastProject?: boolean; }; };
    return parsed.effects?.reopenLastProject === true;
  } catch {
    return false;
  }
}

/**
 * Starting the app: the project screen in a small window of its own, and the
 * main window only once a project is chosen. With “open last project on
 * start” or a folder on the command line the main window opens directly.
 */
export function startWindow() {
  if (pendingFolder || reopensLastProject()) {
    createWindow({ primary: true });
    return;
  }
  createWindow({ view: 'projects' });
}

/** The project screen is done: the main window opens with the choice, and the small one goes once it shows. */
export function handOver(launch: Launch) {
  const from = getProjectsWindow();
  const main = createWindow({ ...launch, fresh: true, primary: true });
  const closeFrom = () => {
    if (from && !from.isDestroyed()) {
      from.close();
    }
  };
  main.once('show', closeFrom);
  return main;
}

/** Open a project in a window of its own — or bring forward the window that has it open already. */
export function openProjectWindow(project?: string) {
  const existing = project ? [...contexts.values()].find((ctx) => ctx.workspaceRoot === project) : undefined;
  if (existing && !existing.win.isDestroyed()) {
    if (existing.win.isMinimized()) {
      existing.win.restore();
    }
    existing.win.focus();
    return 'focused';
  }
  createWindow({ project, fresh: true });
  return 'opened';
}

/** A second start passes its folder to the running app: the window in front comes forward and opens it. */
export function handleSecondInstance(folder: string | null) {
  const win = activeWindow();
  if (!win || win.isDestroyed()) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.focus();
  if (!folder) {
    return;
  }
  if (win === getProjectsWindow()) {
    handOver({ project: folder });
    return;
  }
  win.webContents.send('app:open-folder', folder);
}
