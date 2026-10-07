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
import path from 'node:path';
import { findProjectRoot } from '../files/project-root';
import { loadSettings, saveSettings } from '../files/settings';
import { killCommand, running, runCommand } from '../run/command';
import { contextOf } from '../window/context';
import { scopedId } from '../window/ids';
import { setContextRoots } from '../window/roots';

export function registerWorkspaceIpc() {
  ipcMain.handle('workspace:set', (e, root: string, extras?: string[]) => {
    const ctx = contextOf(e.sender);
    if (!ctx) {
      return root;
    }
    setContextRoots(ctx, root, Array.isArray(extras) ? extras.filter((dir) => typeof dir === 'string' && path.isAbsolute(dir)) : []);
    return root;
  });

  ipcMain.handle('settings:load', () => loadSettings());
  ipcMain.handle('settings:save', (_e, data: Record<string, unknown>) => saveSettings(data));

  ipcMain.handle('run:start', (
    e, id: string, cmd: string, args: string[], cwd: string, env?: Record<string, string>,
  ) => {
    runCommand(e.sender, id, cmd, args, cwd, env ?? {});
    return id;
  });
  ipcMain.handle('run:kill', (e, id: string) => killCommand(scopedId(e.sender, id)));
  /** Feed a line to the stdin of a running command (programs that read input). */
  ipcMain.handle('run:write', (e, id: string, data: string) => {
    const stdin = running.get(scopedId(e.sender, id))?.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) {
      return false;
    }
    stdin.write(String(data));
    return true;
  });

  /**
   * Searches from `startDir` upwards (as far as the working folder) for project
   * markers. `nearest` returns the first folder holding one; `outermost` the
   * highest — the top of a multi-module build (the Maven reactor, the folder
   * with `settings.gradle`) rather than the module the file sits in. Version
   * control folders (`.git` …) only count when no other marker is found.
   */
  ipcMain.handle('fs:findRoot', (_e, startDir: string, markers: string[], mode: 'nearest' | 'outermost' = 'nearest') =>
    findProjectRoot(startDir, markers, mode));
}
