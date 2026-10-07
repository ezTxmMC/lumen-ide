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
 * File changes in one stream: what the main process' watchers report, plus
 * changes the renderer learns about itself — an agent saying it edited a
 * file, say. Everything that reacts to the disk (tabs, language servers, the
 * explorer) listens here, so a reported edit takes the same path as a watched one.
 */

import type { FsChange } from '@/state/types';

type Listener = (changes: FsChange[]) => void;

const listeners = new Set<Listener>();
let bridged = false;

function deliver(changes: FsChange[]) {
  for (const fn of listeners) {
    fn(changes);
  }
}

export function onFsChanged(fn: Listener): () => void {
  if (!bridged) {
    bridged = true;
    window.lumen.fs.onChanged((changes) => deliver(Array.isArray(changes) ? changes : []));
  }
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Report changes from inside the renderer. An empty list is a nudge — something
 * may have changed, nobody knows what: the explorer re-reads its folders.
 */
export function emitFsChanges(changes: FsChange[]) {
  deliver(changes);
}
