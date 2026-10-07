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
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { relaunchApp } from '../../desktop/window-system';
import { repointDesktopEntries } from '../../desktop/recent-projects';
import { macBundle, updatesDir } from './install-kind';

let beforeQuit: () => void = () => {};

/** Under macOS unpack the ZIP; otherwise the file is ready as it is. */
export async function prepare(file: string, extractedName: string) {
  if (process.platform !== 'darwin') {
    return file;
  }
  const dir = path.join(updatesDir(), extractedName);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  await run('/usr/bin/ditto', ['-x', '-k', file, dir]);
  const bundle = (await fs.readdir(dir)).find((name) => name.endsWith('.app'));
  if (!bundle) {
    throw new Error('The ZIP holds no .app bundle');
  }
  return path.join(dir, bundle);
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(command)} endete mit Code ${code}`));
    });
  });
}

/**
 * The AppImage always lands as `Lumen.AppImage` beside the running one.
 *
 * A versioned name (`Lumen-0.3.3-linux-x86_64.AppImage`, or AppImageLauncher's
 * `…_<hash>.AppImage`) would change with every update — and with it the path
 * that desktop entries, AppImageLauncher's identifier and taskbar or start-menu
 * pins refer to. One fixed name keeps all of them valid across updates; a
 * versioned install moves to it once, with its desktop entries repointed.
 */
const APPIMAGE_NAME = 'Lumen.AppImage';

export async function installAppImage(file: string, relaunch: boolean) {
  const current = process.env.APPIMAGE!;
  const dir = path.dirname(current);
  const target = path.join(dir, APPIMAGE_NAME);
  const staging = path.join(dir, `.${APPIMAGE_NAME}.part`);
  await fs.copyFile(file, staging);
  await fs.chmod(staging, 0o755);
  // The running AppImage stays reachable through its mount even when the file is replaced.
  await fs.rename(staging, target);
  if (target !== current) {
    await fs.rm(current, { force: true });
    repointDesktopEntries(current, target);
  }
  await fs.rm(file, { force: true });
  if (!relaunch) {
    return true;
  }
  beforeQuit();
  relaunchApp(process.argv.slice(1), target);
  return true;
}

export function installNsis(file: string, relaunch: boolean) {
  const args = ['--updated', '/S'];
  if (relaunch) {
    args.push('--force-run');
  }
  spawn(file, args, { detached: true, stdio: 'ignore' }).unref();
  if (!relaunch) {
    return true;
  }
  beforeQuit();
  app.quit();
  return true;
}

/** Waits until Lumen has quit, swaps the bundle and starts it afresh on request. */
const MAC_SWAP_SCRIPT = `
while kill -0 "$1" 2>/dev/null; do sleep 0.3; done
rm -rf "$2.old"
mv "$2" "$2.old" || exit 1
if ! mv "$3" "$2"; then mv "$2.old" "$2"; exit 1; fi
rm -rf "$2.old"
xattr -dr com.apple.quarantine "$2" 2>/dev/null
if [ "$4" = 1 ]; then open "$2"; fi
`;

/** An absolute path the swap script may take as an argument: no NUL or line breaks, nothing relative. */
function safeBundlePath(value: string): string {
  if (!path.isAbsolute(value) || /[\0\r\n]/.test(value)) {
    throw new Error(`Unsafe bundle path: ${JSON.stringify(value)}`);
  }
  return value;
}

export function installMac(bundle: string, relaunch: boolean) {
  const args = ['-c', MAC_SWAP_SCRIPT, 'lumen-update', String(process.pid), safeBundlePath(macBundle()), safeBundlePath(bundle), relaunch ? '1' : '0'];
  spawn('/bin/sh', args, { detached: true, stdio: 'ignore' }).unref();
  if (!relaunch) {
    return true;
  }
  beforeQuit();
  app.quit();
  return true;
}

export function setBeforeQuit(hook: () => void) {
  beforeQuit = hook;
}
