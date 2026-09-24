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
 * The window system under Linux: native Wayland rather than XWayland.
 *
 * Chromium picks the Ozone platform before any JavaScript runs — switches set
 * through `app.commandLine` come too late for that. So:
 *   1. The start scripts (`vite.config.ts`, electron-builder's desktop entry)
 *      pass the switches directly.
 *   2. Where they are missing (an AppImage started from a terminal, say), Lumen
 *      restarts itself once with the right switches.
 * The choice sits in the settings under `effects.windowSystem`
 * (`auto` · `wayland` · `x11`).
 */

import { app } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type WindowSystem = 'auto' | 'wayland' | 'x11';

/** The switches for native Wayland (window decoration, scaling, input methods). */
export const WAYLAND_SWITCHES = [
  '--ozone-platform=wayland',
  // ANGLE over Vulkan: the default path (GL/EGL with dmabuf) crashes the GPU
  // process repeatedly under Mesa, after which Chromium renders in software only.
  '--use-angle=vulkan',
  '--enable-features=WaylandWindowDecorations,WaylandPerSurfaceScale,WaylandUiScale,WaylandFractionalScaleV1',
  '--enable-wayland-ime',
  '--wayland-text-input-version=3',
];

const X11_SWITCHES = ['--ozone-platform=x11'];

const RELAUNCH_MARKER = '--lumen-window-system-applied';

function readChoice(): WindowSystem {
  try {
    const file = path.join(app.getPath('userData'), 'settings.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { effects?: { windowSystem?: string; }; };
    const value = parsed.effects?.windowSystem;
    if (value === 'wayland' || value === 'x11') {
      return value;
    }
    return 'auto';
  } catch {
    return 'auto';
  }
}

export function isWaylandSession() {
  return Boolean(process.env.WAYLAND_DISPLAY) || process.env.XDG_SESSION_TYPE === 'wayland';
}

function ozoneArgument(): string | null {
  const hit = process.argv.find((arg) => arg.startsWith('--ozone-platform=') || arg.startsWith('--ozone-platform-hint='));
  return hit ?? null;
}

/** Which system is actually running (for the display in the settings)? */
export function currentWindowSystem(): 'wayland' | 'x11' | 'other' {
  if (process.platform !== 'linux') {
    return 'other';
  }
  const arg = ozoneArgument();
  if (arg?.endsWith('=wayland')) {
    return 'wayland';
  }
  if (arg?.endsWith('=auto') && isWaylandSession()) {
    return 'wayland';
  }
  return 'x11';
}

/**
 * Call before `app.whenReady()`. Returns `true` when a restart with the right
 * switches has been triggered — start nothing further then.
 */
export function applyWindowSystem(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  const choice = readChoice();
  const wantWayland = choice === 'wayland' || (choice === 'auto' && isWaylandSession());
  const switches = wantWayland ? WAYLAND_SWITCHES : X11_SWITCHES;

  // Always set the switches that still take effect at runtime.
  if (wantWayland) {
    app.commandLine.appendSwitch('use-angle', 'vulkan');
    app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations,WaylandPerSurfaceScale,WaylandUiScale');
    app.commandLine.appendSwitch('enable-wayland-ime');
    app.commandLine.appendSwitch('wayland-text-input-version', '3');
  }

  const current = currentWindowSystem();
  const satisfied = wantWayland ? current === 'wayland' : current !== 'wayland';
  if (satisfied) {
    return false;
  }
  // In development vite.config.ts steers the start; a restart would cut the connection to Vite.
  if (!app.isPackaged || process.argv.includes(RELAUNCH_MARKER)) {
    return false;
  }
  // Under X11 with no Wayland session, Wayland cannot be forced.
  if (wantWayland && !isWaylandSession()) {
    return false;
  }

  const args = process.argv
    .slice(1)
    .filter((arg) => !arg.startsWith('--ozone-platform') && !arg.startsWith('--enable-wayland-ime') && !arg.startsWith('--wayland-text-input-version') && !arg.startsWith('--use-angle'));
  relaunchApp([...args, ...switches, RELAUNCH_MARKER]);
  return true;
}

/**
 * Starts Lumen afresh. In an AppImage `process.execPath` (and Electron's
 * relauncher helper process) lies in the temporary mount, which vanishes when
 * the program quits — then start the AppImage itself as a process of its own
 * (after an update `appImage`, where it has a new name).
 */
export function relaunchApp(args: string[] = process.argv.slice(1), appImage = process.env.APPIMAGE) {
  if (!appImage) {
    app.relaunch({ args });
    app.exit(0);
    return;
  }
  const env = { ...process.env };
  delete env.APPDIR;
  spawn(appImage, args, { detached: true, stdio: 'ignore', env }).unref();
  app.exit(0);
}
