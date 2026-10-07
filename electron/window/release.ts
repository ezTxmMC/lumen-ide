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
import { stopAllDebugAdapters, stopDebugAdaptersOf } from '../features/debug/dap';
import { killCommand, running } from '../run/command';
import { servers, stopLsp } from '../lsp/server';
import { killAllTerminals, killTerminalsOf } from '../terminal';
import { contexts, getLastFocused, setLastFocused, syncWorkspaceRoots, type WindowContext } from './context';

/** A window has gone: end everything it started. */
export function releaseWindow(ctx: WindowContext) {
  const prefix = `${ctx.id}:`;
  for (const key of [...running.keys()]) {
    if (key.startsWith(prefix)) {
      killCommand(key);
    }
  }
  for (const key of [...servers.keys()]) {
    if (key.startsWith(prefix)) {
      stopLsp(key);
    }
  }
  for (const existing of ctx.watchers) {
    existing.close();
  }
  ctx.watchers = [];
  killTerminalsOf(ctx.id);
  stopDebugAdaptersOf(ctx.id);
  contexts.delete(ctx.id);
  if (getLastFocused() === ctx.win) {
    setLastFocused(null);
  }
  syncWorkspaceRoots();
}

/** Ends every process the app started when it quits. */
export function registerQuitCleanup() {
  app.on('before-quit', () => {
    for (const id of [...running.keys()]) {
      killCommand(id);
    }
    for (const id of [...servers.keys()]) {
      stopLsp(id);
    }
    killAllTerminals();
    stopAllDebugAdapters();
    for (const ctx of contexts.values()) {
      for (const existing of ctx.watchers) {
        existing.close();
      }
    }
  });
}
