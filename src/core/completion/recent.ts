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
 * Suggestions accepted recently, per language — how often and when, capped
 * and kept in localStorage.
 */

import { recencyBonus } from './ranking';

const STORAGE_PREFIX = 'lumen.completion.recent.';
const LIMIT = 600;
/** A choice in another context of the same label still counts a little. */
const GLOBAL_WEIGHT = 0.3;

/** `context\0label` (or plain `label`) → [count, timestamp] */
type Table = Map<string, [number, number]>;

const tables = new Map<string, Table>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function load(language: string): Table {
  const hit = tables.get(language);
  if (hit) {
    return hit;
  }
  const table: Table = new Map();
  tables.set(language, table);
  try {
    const raw = storage()?.getItem(STORAGE_PREFIX + language);
    if (!raw) {
      return table;
    }
    const parsed = JSON.parse(raw) as Record<string, [number, number]>;
    for (const [label, entry] of Object.entries(parsed)) {
      if (Array.isArray(entry) && entry.length === 2) {
        table.set(label, entry);
      }
    }
  } catch {
    // A broken entry — start over.
  }
  return table;
}

function persist(language: string) {
  const pending = timers.get(language);
  if (pending) {
    clearTimeout(pending);
  }
  timers.set(language, setTimeout(() => {
    timers.delete(language);
    const table = load(language);
    try {
      storage()?.setItem(STORAGE_PREFIX + language, JSON.stringify(Object.fromEntries(table)));
    } catch {
      // Storage full or locked — recency is only a convenience.
    }
  }, 500));
}

function bump(table: Table, key: string, now: number) {
  const entry = table.get(key);
  table.delete(key);
  table.set(key, [(entry?.[0] ?? 0) + 1, now]);
}

/** `context` is the kind of place it was chosen at (member access, `new`, …), see `contextKind`. */
export function recordAccepted(language: string, label: string, context = '', now = Date.now()) {
  if (!label) {
    return;
  }
  const table = load(language);
  bump(table, label, now);
  if (context) {
    bump(table, contextKey(context, label), now);
  }
  // Discard the oldest entries first, in insertion order.
  while (table.size > LIMIT) {
    const oldest = table.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    table.delete(oldest);
  }
  persist(language);
}

function contextKey(context: string, label: string): string {
  return `${context}\0${label}`;
}

/**
 * The bonus function for `rank`, bound to a language, a context and a point
 * in time. A choice made in the same context counts in full, one made
 * elsewhere only a little.
 */
export function recencySignal(language: string, context = '', now = Date.now()): (label: string) => number {
  const table = load(language);
  if (!table.size) {
    return () => 0;
  }
  return (label) => {
    const local = context ? table.get(contextKey(context, label)) : undefined;
    const global = table.get(label);
    const here = local ? recencyBonus(local[0], now - local[1]) : 0;
    const elsewhere = global ? recencyBonus(global[0], now - global[1]) * GLOBAL_WEIGHT : 0;
    return Math.max(here, elsewhere);
  };
}
