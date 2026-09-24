/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** What the project page remembers between uses, in `localStorage`. */

export const PARENT_KEY = 'lumen.newProject.parent';
export const OPTIONS_KEY = 'lumen.newProject.options';
export const RECENT_KEY = 'lumen.newProject.recent';
export const LAYOUT_KEY = 'lumen.newProject.layout';

export interface CreateOptions {
  setup?: boolean;
  git?: boolean;
  window?: 'this' | 'new';
}

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable — then without remembering.
  }
}
