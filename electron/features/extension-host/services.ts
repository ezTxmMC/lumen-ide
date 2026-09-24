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
 * The services behind an extension's `ctx`: settings, secrets, stored state,
 * questions to the user, messages to the interface, and events from it.
 *
 * Secrets (tokens, API keys) never go to the settings file. They are encrypted
 * with the operating system's key store (`safeStorage`) and kept under
 * `userData/extensions/secrets/<id>.json`; the interface only ever learns
 * whether one is set.
 */

import { app, safeStorage, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { HostEvent, UiMessage, UiRequest } from './contract';

const SECRET_KEY = /^[a-z][a-zA-Z0-9]{0,63}$/;
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

type EventListener = (event: HostEvent) => void;

const settings = new Map<string, Record<string, string>>();
const settingListeners = new Map<string, Set<(values: Record<string, string>) => void>>();
const eventListeners = new Map<string, Set<EventListener>>();
const pending = new Map<string, { extensionId: string; resolve: (answer: unknown) => void; timer: NodeJS.Timeout; }>();
const stateCache = new Map<string, Record<string, unknown>>();
const lastEvents = new Map<HostEvent['kind'], HostEvent>();
let getWindow: () => BrowserWindow | null = () => null;
let requestCounter = 0;
let locale = 'en';

const dataDir = (kind: 'secrets' | 'state') => path.join(app.getPath('userData'), 'extensions', kind);
const fileOf = (kind: 'secrets' | 'state', extensionId: string) => path.join(dataDir(kind), `${extensionId}.json`);

function send(channel: string, payload: unknown) {
  const win = getWindow();
  if (!win || win.isDestroyed()) {
    return false;
  }
  win.webContents.send(channel, payload);
  return true;
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeJson(file: string, data: Record<string, unknown>) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

function listenersOf<T>(map: Map<string, Set<T>>, extensionId: string): Set<T> {
  const known = map.get(extensionId);
  if (known) {
    return known;
  }
  const fresh = new Set<T>();
  map.set(extensionId, fresh);
  return fresh;
}

/** Encrypt when the system offers a key store; otherwise refuse rather than store in the clear. */
function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('No system key store available to keep secrets safely');
  }
  return safeStorage.encryptString(value).toString('base64');
}

function decrypt(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch {
    return undefined;
  }
}

export const services = {
  attach(windowGetter: () => BrowserWindow | null) {
    getWindow = windowGetter;
  },

  /* ---------------------------------------------------------------- *
   * Settings — pushed by the interface whenever they change
   * ---------------------------------------------------------------- */

  setSettings(extensionId: string, values: Record<string, string>) {
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(values ?? {})) {
      if (typeof value === 'string') {
        clean[key] = value;
      }
    }
    settings.set(extensionId, clean);
    for (const fn of listenersOf(settingListeners, extensionId)) {
      fn(clean);
    }
  },

  settingsOf: (extensionId: string) => settings.get(extensionId) ?? {},

  onSettings(extensionId: string, fn: (values: Record<string, string>) => void) {
    const set = listenersOf(settingListeners, extensionId);
    set.add(fn);
    return () => { set.delete(fn); };
  },

  /* ---------------------------------------------------------------- *
   * Secrets
   * ---------------------------------------------------------------- */

  async getSecret(extensionId: string, key: string): Promise<string | undefined> {
    if (!SECRET_KEY.test(key)) {
      throw new Error(`Invalid secret key: ${key}`);
    }
    const data = await readJson(fileOf('secrets', extensionId));
    return decrypt(data[key]);
  },

  async setSecret(extensionId: string, key: string, value: string) {
    if (!SECRET_KEY.test(key)) {
      throw new Error(`Invalid secret key: ${key}`);
    }
    const file = fileOf('secrets', extensionId);
    const data = await readJson(file);
    delete data[key];
    if (typeof value === 'string' && value) {
      data[key] = encrypt(value);
    }
    await writeJson(file, data);
    for (const fn of listenersOf(settingListeners, extensionId)) {
      fn(settings.get(extensionId) ?? {});
    }
  },

  async hasSecret(extensionId: string, key: string) {
    return Boolean(await services.getSecret(extensionId, key).catch(() => undefined));
  },

  /* ---------------------------------------------------------------- *
   * Stored state (a small JSON document per extension)
   * ---------------------------------------------------------------- */

  async loadState(extensionId: string) {
    const known = stateCache.get(extensionId);
    if (known) {
      return known;
    }
    const data = await readJson(fileOf('state', extensionId));
    stateCache.set(extensionId, data);
    return data;
  },

  stateOf: (extensionId: string) => stateCache.get(extensionId) ?? {},

  /** A folder of the extension's own, for files too large for the state document. */
  storageDir: (extensionId: string) => path.join(app.getPath('userData'), 'extensions', 'storage', extensionId),

  async saveState(extensionId: string, key: string, value: unknown) {
    const data = { ...(await services.loadState(extensionId)) };
    delete data[key];
    if (value !== undefined) {
      data[key] = value;
    }
    stateCache.set(extensionId, data);
    await writeJson(fileOf('state', extensionId), data);
  },

  /* ---------------------------------------------------------------- *
   * The interface
   * ---------------------------------------------------------------- */

  message(extensionId: string, message: UiMessage) {
    send('extensions:ui', { extensionId, ...message });
  },

  /** Ask the user; resolves with the answer, or `null` when the window is gone or nobody answers. */
  request<T>(extensionId: string, request: UiRequest): Promise<T | null> {
    const requestId = `req-${++requestCounter}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => services.answer(requestId, null), REQUEST_TIMEOUT_MS);
      pending.set(requestId, { extensionId, resolve: (answer) => resolve(answer as T | null), timer });
      if (!send('extensions:ui:request', { requestId, extensionId, ...request })) {
        services.answer(requestId, null);
      }
    });
  },

  answer(requestId: string, answer: unknown) {
    const entry = pending.get(requestId);
    if (!entry) {
      return false;
    }
    pending.delete(requestId);
    clearTimeout(entry.timer);
    entry.resolve(answer ?? null);
    return true;
  },

  onEvent(extensionId: string, fn: EventListener) {
    const set = listenersOf(eventListeners, extensionId);
    set.add(fn);
    return () => { set.delete(fn); };
  },

  locale: () => locale,

  /** The latest event of a kind — so code started later still knows the active file or project. */
  last: <K extends HostEvent['kind']>(kind: K) => lastEvents.get(kind) as Extract<HostEvent, { kind: K; }> | undefined,

  dispatch(event: HostEvent) {
    if (!event || typeof event !== 'object') {
      return;
    }
    if (event.kind === 'locale' && typeof event.language === 'string') {
      locale = event.language;
    }
    lastEvents.set(event.kind, event);
    for (const set of eventListeners.values()) {
      for (const fn of set) {
        try {
          fn(event);
        } catch (err) {
          console.error('[lumen] extension event handler failed:', err);
        }
      }
    }
  },

  /** An extension stopped: its open questions end unanswered, its listeners go. */
  removeExtension(extensionId: string) {
    for (const [requestId, entry] of pending) {
      if (entry.extensionId === extensionId) {
        services.answer(requestId, null);
      }
    }
    settingListeners.delete(extensionId);
    eventListeners.delete(extensionId);
  },

  /** An extension was uninstalled: its secrets and state go too. */
  async forget(extensionId: string) {
    stateCache.delete(extensionId);
    await fs.rm(fileOf('secrets', extensionId), { force: true });
    await fs.rm(fileOf('state', extensionId), { force: true });
    await fs.rm(services.storageDir(extensionId), { recursive: true, force: true });
  },
};
