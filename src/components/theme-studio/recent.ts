/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Recently used colours, shared across every swatch and across sessions. */

import { useSyncExternalStore } from 'react';
import { readStorage, STORAGE, writeStorage } from './keys';

const MAX = 16;
let colors: string[] = readStorage<string[]>(STORAGE.recent, []).filter((c) => typeof c === 'string');
const listeners = new Set<() => void>();

export function pushRecentColor(color: string) {
  const normalized = color.toLowerCase();
  if (colors[0] === normalized) {
    return;
  }
  colors = [normalized, ...colors.filter((c) => c !== normalized)].slice(0, MAX);
  writeStorage(STORAGE.recent, colors);
  for (const fn of listeners) {
    fn();
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

export function useRecentColors(): string[] {
  return useSyncExternalStore(subscribe, () => colors);
}
