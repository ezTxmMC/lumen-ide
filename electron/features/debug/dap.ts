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
 * The Debug Adapter Protocol — adapter processes in the main process.
 *
 * Adapters run either over stdio (framed as in the LSP:
 * `Content-Length: <n>\r\n\r\n<JSON>`) or over TCP: Lumen starts the adapter
 * with a free port and connects with retries — or only connects (a port from
 * the language server, java-debug for instance).
 *
 * The channels to the renderer: `dap:message`, `dap:output` (the adapter's
 * stderr and stdout), `dap:closed`.
 */

import { ipcMain, type WebContents } from 'electron';
import { freePort } from './adapter/connections';
import { adapters, sendAdapter, startAdapter, stopAdapter } from './adapter/lifecycle';
import { globPaths, resolveProgram } from './adapter/programs';
import { DapEvents, DapProgram, DapStartOptions } from './adapter/types';

/** The window each adapter was started from — its events go there and only there. */
const owners = new Map<string, number>();

export function registerDapIpc() {
  const eventsFor = (contents: WebContents): DapEvents => {
    const send = (channel: string, payload: unknown) => {
      if (contents.isDestroyed()) {
        return;
      }
      contents.send(channel, payload);
    };
    return {
      message: (id, message) => send('dap:message', { id, message }),
      output: (id, stream, text) => send('dap:output', { id, stream, text }),
      closed: (id, reason) => {
        owners.delete(id);
        send('dap:closed', { id, reason });
      },
    };
  };

  ipcMain.handle('dap:resolve', (_e, programs: DapProgram[]) => resolveProgram(Array.isArray(programs) ? programs : []));
  ipcMain.handle('dap:glob', (_e, pattern: string) => globPaths(String(pattern)));
  ipcMain.handle('dap:freePort', () => freePort());
  ipcMain.handle('dap:start', (e, id: string, options: DapStartOptions) => {
    owners.set(id, e.sender.id);
    return startAdapter(id, options, eventsFor(e.sender));
  });
  ipcMain.handle('dap:send', (_e, id: string, message: unknown) => sendAdapter(id, message));
  ipcMain.handle('dap:stop', (_e, id: string) => stopAdapter(id));
}

/** A window closed: end the adapters it started. */
export function stopDebugAdaptersOf(contentsId: number) {
  for (const [id, owner] of [...owners]) {
    if (owner !== contentsId) {
      continue;
    }
    owners.delete(id);
    stopAdapter(id);
  }
}

export function stopAllDebugAdapters() {
  for (const id of [...adapters.keys()]) {
    stopAdapter(id);
  }
}
