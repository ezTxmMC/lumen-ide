/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Shared helpers for the preload bridges. */

import { ipcRenderer, type IpcRendererEvent } from 'electron';

/**
 * `ipcRenderer.invoke` with readable errors: Electron puts
 * “Error invoking remote method '…': Error:” in front of every message — that
 * does not belong in a toast.
 */
export function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args).catch((err: Error) => {
    throw new Error(String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''));
  });
}

/** A typed subscriber; returns a function that unsubscribes. */
export function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.off(channel, handler);
  };
}
