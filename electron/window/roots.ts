/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { WorkspaceWatcher } from '../files/watcher';
import { contexts, syncWorkspaceRoots, type WindowContext } from './context';

export function setContextRoots(ctx: WindowContext, root: string, extras: string[]) {
  ctx.workspaceRoot = root;
  ctx.extraRoots = extras;
  for (const existing of ctx.watchers) {
    existing.close();
  }
  ctx.watchers = [root, ...extras.filter((extra) => extra !== root)].map((dir) => new WorkspaceWatcher(dir, ctx.win.webContents));
  syncWorkspaceRoots();
}

/** The folders open in any window. */
export function openRoots(): string[] {
  return [...contexts.values()].flatMap((ctx) => (ctx.workspaceRoot ? [ctx.workspaceRoot, ...ctx.extraRoots] : ctx.extraRoots));
}
