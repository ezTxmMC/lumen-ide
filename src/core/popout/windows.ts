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
 * The native windows behind pop-outs.
 *
 * They are opened with `window.open` from this renderer, and React renders
 * into their documents (`components/popout/PopoutWindow.tsx`) — the state, the
 * terminals and the language servers are simply the ones of this window. This
 * module only opens, finds, moves and notices the closing of those windows;
 * what an entry means is `state/popout.ts`'s business.
 */

import {
  boundsChanged, normalizeBounds, normalizeBoundsMap, popoutWindowName, type PopoutBounds,
} from '@/state/popout';

const open = new Map<string, Window>();
const closedListeners = new Set<(key: string) => void>();
let watcher: ReturnType<typeof setInterval> | null = null;

/** How often the windows are checked for having been closed — the `pagehide` event is the quick path. */
const WATCH_MS = 400;

export const popoutWindow = (key: string): Window | undefined => open.get(key);

/** The pop-out that has focus right now; `null` while the main window does. */
let focused: string | null = null;
export const focusedPopoutKey = () => focused;
export function setFocusedPopout(key: string | null) {
  focused = key;
}

/** Called when the user closes a window from outside (its close button, the window manager). */
export function onPopoutClosed(fn: (key: string) => void) {
  closedListeners.add(fn);
  return () => { closedListeners.delete(fn); };
}

function release(key: string) {
  if (focused === key) {
    focused = null;
  }
  if (!open.delete(key)) {
    return;
  }
  if (!open.size && watcher) {
    clearInterval(watcher);
    watcher = null;
  }
  for (const fn of closedListeners) {
    fn(key);
  }
}

function watch() {
  if (watcher) {
    return;
  }
  watcher = setInterval(() => {
    for (const [key, win] of open) {
      if (win.closed) {
        release(key);
      }
    }
  }, WATCH_MS);
}

/** The window's position and size on screen, as `window.open` wants them. */
export function boundsOf(win: Window): PopoutBounds | null {
  return normalizeBounds({ x: win.screenX, y: win.screenY, width: win.outerWidth, height: win.outerHeight });
}

/** The main window's bounds — where a new pop-out is placed relative to. */
export const hostBounds = (): PopoutBounds | null => boundsOf(window);

const featuresOf = (bounds: PopoutBounds | null) => {
  if (!bounds) {
    return 'popup=yes';
  }
  return `popup=yes,left=${bounds.x},top=${bounds.y},width=${bounds.width},height=${bounds.height}`;
};

/**
 * Open the window of an entry — or find it again by name. `null` when the
 * system refuses (a blocked popup, no display).
 */
export function openPopoutWindow(key: string, title: string, bounds: PopoutBounds | null): Window | null {
  const existing = open.get(key);
  if (existing && !existing.closed) {
    return existing;
  }
  const win = window.open('', popoutWindowName(key), featuresOf(bounds));
  if (!win) {
    return null;
  }
  win.document.title = title;
  open.set(key, win);
  win.addEventListener('pagehide', () => release(key));
  watch();
  return win;
}

/** Close a window without telling the listeners — the caller knows already. */
export function closePopoutWindow(key: string) {
  const win = open.get(key);
  if (!win) {
    return;
  }
  open.delete(key);
  if (!open.size && watcher) {
    clearInterval(watcher);
    watcher = null;
  }
  if (!win.closed) {
    win.close();
  }
}

export function closeAllPopoutWindows() {
  for (const key of [...open.keys()]) {
    closePopoutWindow(key);
  }
}

/** The native controls a frameless pop-out lacks; `close` closes it (which docks its contents back). */
export function controlPopout(key: string, action: 'minimize' | 'toggleMaximize' | 'focus' | 'close') {
  return window.lumen.window.popout(popoutWindowName(key), action).catch(() => false);
}

/* ------------------------------------------------------------------ *
 * Remembered bounds — per view, and one for editor groups
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'lumen.popout.bounds';

export const boundsKeyOf = (key: string) => (key.startsWith('group:') ? 'group' : key);

function readAll(): Record<string, PopoutBounds> {
  try {
    return normalizeBoundsMap(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return {};
  }
}

export const savedBounds = (key: string): PopoutBounds | null => readAll()[boundsKeyOf(key)] ?? null;

export function saveBounds(key: string, bounds: PopoutBounds) {
  const all = readAll();
  const slot = boundsKeyOf(key);
  if (!boundsChanged(all[slot] ?? null, bounds)) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, [slot]: bounds }));
  } catch {
    // Storage may be unavailable; the window just opens at the default place next time.
  }
}

// Closing or reloading this window ends every pop-out: what fills them runs here.
// (Not where there is no real window — the checks run the store under Node.)
if (typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', closeAllPopoutWindows);
}
