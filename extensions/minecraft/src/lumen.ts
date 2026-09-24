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
 * The one door to Lumen: the API `addon(lumen)` received, the translation
 * over the extension's own messages, and the version catalogue. Set once when
 * the window loads the code; tests set a fake.
 */

import type { RendererApi } from '../../../src/core/extensions/renderer-api';
import { Catalog, type Net, type Store } from './catalog';
import { MESSAGES } from './messages';

let api: RendererApi | null = null;
let translate: (key: string, params?: Record<string, string | number>) => string = (key) => key;

/** Until the add-on is active its storage is not known — a memory store bridges the gap. */
const memory = new Map<string, unknown>();
const memoryStore: Store = {
  get: <T>(key: string, fallback: T) => (memory.has(key) ? memory.get(key) as T : fallback),
  set: (key, value) => void memory.set(key, value),
};

let store: Store = memoryStore;
let catalog: Catalog | null = null;

const DEFAULT_TTL_HOURS = 12;

export function setLumen(next: RendererApi) {
  api = next;
  translate = next.i18n(MESSAGES);
  catalog = null;
}

export function lumen(): RendererApi {
  if (!api) { throw new Error('The Minecraft extension is not loaded'); }
  return api;
}

/** A message of the extension in the interface language. */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(key, params);
}

/** Use the add-on's persistent storage from now on (on activation). */
export function useStore(next: Store | null) {
  store = next ?? memoryStore;
  catalog = null;
}

function ttlHours(): number {
  const raw = Number(api?.settings.get('cacheHours'));
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_TTL_HOURS;
}

export function versions(): Catalog {
  if (catalog) { return catalog; }
  const net: Net = {
    fetchJson: <T>(url: string) => lumen().net.fetchJson<T>(url),
    fetchText: (url: string) => lumen().net.fetchText(url),
  };
  catalog = new Catalog(net, store, { ttlHours });
  return catalog;
}

/** A setting as a switch (`'true'`/`'false'`). */
export function settingOn(key: string, fallback: boolean): boolean {
  const value = api?.settings.get(key);
  if (value === undefined || value === '') { return fallback; }
  return value === 'true';
}
