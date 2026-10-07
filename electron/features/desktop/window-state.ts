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
 * What the main window remembers between starts: position, size, and whether
 * it was maximized or full screen. The file lives in the user data folder;
 * a missing or damaged file just means default bounds.
 */

import { app, screen, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
}

const DEFAULT_STATE: WindowState = { width: 1440, height: 900, maximized: false, fullscreen: false };
const SAVE_DELAY = 400;

function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A remembered position only counts while it still lands on a connected display. */
function isOnScreen(state: WindowState): boolean {
  if (!isNumber(state.x) || !isNumber(state.y)) {
    return false;
  }
  const { x, y } = state;
  return screen.getAllDisplays().some(({ workArea }) => (
    x < workArea.x + workArea.width - 40 && x + state.width > workArea.x + 40
    && y < workArea.y + workArea.height - 40 && y + state.height > workArea.y
  ));
}

export function loadWindowState(): WindowState {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as Partial<WindowState>;
    const state: WindowState = {
      width: isNumber(parsed.width) ? Math.max(820, parsed.width) : DEFAULT_STATE.width,
      height: isNumber(parsed.height) ? Math.max(520, parsed.height) : DEFAULT_STATE.height,
      x: parsed.x,
      y: parsed.y,
      maximized: parsed.maximized === true,
      fullscreen: parsed.fullscreen === true,
    };
    if (isOnScreen(state)) {
      return state;
    }
    return { ...state, x: undefined, y: undefined };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function snapshot(win: BrowserWindow): WindowState {
  // `getNormalBounds` is the restored size — while maximized, `getBounds` would be the screen.
  const { x, y, width, height } = win.getNormalBounds();
  return { x, y, width, height, maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
}

/** Puts the window back the way it was; the bounds themselves went in at construction. */
export function applyWindowState(win: BrowserWindow, state: WindowState) {
  if (state.maximized) {
    win.maximize();
  }
  if (state.fullscreen) {
    win.setFullScreen(true);
  }
}

/** Saves the window's state as it changes, and once more when it closes. */
export function trackWindowState(win: BrowserWindow) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    if (win.isDestroyed() || win.isMinimized()) {
      return;
    }
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(snapshot(win)));
    } catch {
      // Not being able to remember the window is no reason to bother anyone.
    }
  };
  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(save, SAVE_DELAY);
  };
  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('maximize', schedule);
  win.on('unmaximize', schedule);
  win.on('enter-full-screen', schedule);
  win.on('leave-full-screen', schedule);
  win.on('close', () => {
    if (timer) {
      clearTimeout(timer);
    }
    save();
  });
}
