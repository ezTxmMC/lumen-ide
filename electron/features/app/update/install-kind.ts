/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { app } from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

type InstallKind = 'appimage' | 'nsis' | 'mac-zip' | 'manual';

export function updatesDir() {
  return path.join(app.getPath('userData'), 'updates');
}

async function writable(dir: string) {
  try {
    await fs.access(dir, fsSync.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** The Lumen.app the running process sits in. */
export function macBundle() {
  return path.resolve(process.execPath, '..', '..', '..');
}

export async function installKind(): Promise<InstallKind> {
  if (!app.isPackaged) {
    return 'manual';
  }
  if (process.platform === 'linux') {
    return linuxKind();
  }
  if (process.platform === 'win32') {
    return windowsKind();
  }
  if (process.platform === 'darwin') {
    return macKind();
  }
  return 'manual';
}

async function linuxKind(): Promise<InstallKind> {
  const appImage = process.env.APPIMAGE;
  if (!appImage) {
    return 'manual';
  }
  if (!(await writable(path.dirname(appImage)))) {
    return 'manual';
  }
  return 'appimage';
}

async function windowsKind(): Promise<InstallKind> {
  const entries = await fs.readdir(path.dirname(process.execPath)).catch(() => [] as string[]);
  if (!entries.some((name) => /^Uninstall .+\.exe$/i.test(name))) {
    return 'manual';
  }
  return 'nsis';
}

async function macKind(): Promise<InstallKind> {
  const bundle = macBundle();
  if (!bundle.endsWith('.app') || bundle.includes('/AppTranslocation/')) {
    return 'manual';
  }
  if (!(await writable(path.dirname(bundle)))) {
    return 'manual';
  }
  return 'mac-zip';
}
