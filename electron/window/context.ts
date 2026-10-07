/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { BrowserWindow, WebContents } from 'electron';
import { setWorkspaceRoots } from '../features/desktop/workspace-roots';
import type { WorkspaceWatcher } from '../files/watcher';

/**
 * Every window holds a project of its own: its folders, the watchers on them,
 * and the processes it started. Events go back to the window that owns them —
 * never to whichever window happens to have focus.
 */
export interface WindowContext {
  win: BrowserWindow;
  /** `webContents.id`, kept because the contents are gone by the time the window has closed. */
  id: number;
  workspaceRoot: string | null;
  /** Further folders of a workspace (multi-root). */
  extraRoots: string[];
  watchers: WorkspaceWatcher[];
  /** The renderer has settled unsaved changes — close without asking again. */
  forceClose: boolean;
}

export const contexts = new Map<number, WindowContext>();
/** The window focused last: dialogs, the jump list and features without an owner of their own go there. */
let lastFocused: BrowserWindow | null = null;
/** Quitting for an update or a relaunch: every window closes without asking. */
let quitting = false;

export const isQuitting = () => quitting;

export function markQuitting() {
  quitting = true;
}

export const getLastFocused = () => lastFocused;

export function setLastFocused(win: BrowserWindow | null) {
  lastFocused = win;
}

export function activeWindow(): BrowserWindow | null {
  if (lastFocused && !lastFocused.isDestroyed()) {
    return lastFocused;
  }
  for (const ctx of contexts.values()) {
    if (!ctx.win.isDestroyed()) {
      return ctx.win;
    }
  }
  return null;
}

export const contextOf = (contents: WebContents) => contexts.get(contents.id) ?? null;

/** Features outside the window code learn the folders of the window in front. */
export function syncWorkspaceRoots() {
  const win = activeWindow();
  const ctx = win ? contexts.get(win.webContents.id) : undefined;
  setWorkspaceRoots(ctx?.workspaceRoot ?? null, ctx?.extraRoots ?? []);
}
