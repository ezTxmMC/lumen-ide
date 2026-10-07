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
 * Automatic updates from the CDN.
 *
 * `<FEED>/latest.json` describes, per platform, the current version and its
 * files, which lie under `<FEED>/<platform>/<file>`. Both are produced and
 * uploaded by `scripts/publish-cdn.mjs`.
 *
 * The packages are unsigned — Squirrel (electron-updater) refuses ad-hoc signed
 * bundles under macOS. Lumen therefore installs updates itself:
 *   - Linux:   write the new AppImage as `Lumen.AppImage` beside the running one
 *   - Windows: run the NSIS installer quietly (`--updated /S`)
 *   - macOS:   unpack the ZIP, swap Lumen.app once the program has quit
 * Other installations (development, an unpacked ZIP, translocation) get nothing
 * but a download link.
 */

import { app, BrowserWindow, ipcMain, net, shell } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import { alreadyDownloaded, cleanUpdates } from './update/files';
import { installKind, updatesDir } from './update/install-kind';
import { installAppImage, installMac, installNsis, prepare, setBeforeQuit } from './update/installers';
import { Manifest, ManifestFile, PlatformRelease, compareVersions, platformKey } from './update/manifest';

const FEED = (process.env.LUMEN_UPDATE_URL ?? 'https://cdn.eztxm.de/download/lumen-ide/version/latest').replace(/\/+$/, '');
const FIRST_CHECK_MS = 20_000;
const TICK_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MANIFEST_TIMEOUT_MS = 15_000;

/** The platform folders on the CDN, keyed by `<process.platform>-<process.arch>`. */

export interface UpdateState {
  status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'unsupported' | 'error';
  current: string;
  version?: string;
  notes?: string;
  releaseDate?: string;
  received?: number;
  total?: number;
  /** Can this installation install the update itself? */
  installable: boolean;
  /** The file to download by hand. */
  downloadUrl?: string;
  error?: string;
  checkedAt?: number;
}

let state: UpdateState = { status: 'idle', current: app.getVersion(), installable: false };
let release: PlatformRelease | null = null;
/** The file downloaded and checked (under macOS: the unpacked Lumen.app). */
let prepared: { version: string; file: string; } | null = null;
let busy: Promise<unknown> | null = null;
let installing = false;

function setState(next: Partial<UpdateState>) {
  state = { ...state, ...next };
  // Every window shows the update status.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:state', state);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Checking
 * ------------------------------------------------------------------ */

async function fetchManifest(): Promise<Manifest> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const response = await net.fetch(`${FEED}/latest.json?t=${Date.now()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': `Lumen-IDE/${app.getVersion()}`, 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for latest.json`);
    }
    return (await response.json()) as Manifest;
  } finally {
    clearTimeout(timer);
  }
}

function fileUrl(platform: string, file: ManifestFile) {
  return `${FEED}/${platform}/${encodeURIComponent(file.name)}`;
}

async function check(): Promise<UpdateState> {
  const platform = platformKey();
  if (!platform) {
    setState({ status: 'unsupported', installable: false });
    return state;
  }
  if (state.status === 'downloading' || state.status === 'ready') {
    return state;
  }
  setState({ status: 'checking', error: undefined });
  try {
    const manifest = await fetchManifest();
    const entry = manifest.platforms?.[platform];
    const newer = entry && compareVersions(entry.version, app.getVersion()) > 0;
    if (!entry || !newer) {
      release = null;
      setState({ status: 'current', version: undefined, checkedAt: Date.now() });
      return state;
    }
    release = entry;
    const kind = await installKind();
    const main = entry.update ?? entry.files[0];
    setState({
      status: 'available',
      version: entry.version,
      releaseDate: entry.releaseDate,
      notes: manifest.version === entry.version ? manifest.notes : undefined,
      total: entry.update?.size,
      installable: kind !== 'manual' && Boolean(entry.update),
      downloadUrl: main ? fileUrl(platform, main) : undefined,
      checkedAt: Date.now(),
    });
    return state;
  } catch (err) {
    setState({ status: 'error', error: errorText(err), checkedAt: Date.now() });
    return state;
  }
}

function errorText(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/* ------------------------------------------------------------------ *
 * Downloading
 * ------------------------------------------------------------------ */

async function downloadTo(url: string, target: string, expected: ManifestFile) {
  const partial = `${target}.part`;
  const response = await net.fetch(url, { headers: { 'User-Agent': `Lumen-IDE/${app.getVersion()}` } });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} for ${expected.name}`);
  }

  const out = fsSync.createWriteStream(partial);
  const hash = crypto.createHash('sha512');
  const reader = response.body.getReader();
  let received = 0;
  let lastEmit = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      hash.update(value);
      received += value.byteLength;
      if (!out.write(value)) {
        await once(out, 'drain');
      }
      if (Date.now() - lastEmit < 200) {
        continue;
      }
      lastEmit = Date.now();
      setState({ received });
    }
    out.end();
    await once(out, 'close');
  } catch (err) {
    out.destroy();
    await fs.rm(partial, { force: true });
    throw err;
  }

  if (received !== expected.size || hash.digest('base64') !== expected.sha512) {
    await fs.rm(partial, { force: true });
    throw new Error(`Checksum of ${expected.name} does not match`);
  }
  await fs.rename(partial, target);
}

async function download(): Promise<UpdateState> {
  const platform = platformKey();
  const entry = release;
  if (!platform || !entry?.update || !state.installable) {
    return state;
  }
  if (prepared?.version === entry.version) {
    return state;
  }

  const file = entry.update;
  const target = path.join(updatesDir(), file.name);
  setState({ status: 'downloading', received: 0, total: file.size, error: undefined });
  try {
    await fs.mkdir(updatesDir(), { recursive: true });
    const extracted = `mac-${entry.version}`;
    await cleanUpdates([file.name, extracted]);
    if (!(await alreadyDownloaded(target, file))) {
      await downloadTo(fileUrl(platform, file), target, file);
    }
    prepared = { version: entry.version, file: await prepare(target, extracted) };
    setState({ status: 'ready', received: file.size });
    return state;
  } catch (err) {
    setState({ status: 'error', error: errorText(err) });
    return state;
  }
}

/**
 * Install the update. `relaunch`: start Lumen afresh afterwards (otherwise
 * quietly in the background on quit).
 */
async function install(relaunch: boolean) {
  if (!prepared || installing) {
    return false;
  }
  installing = true;
  const kind = await installKind();
  try {
    if (kind === 'appimage') {
      return await installAppImage(prepared.file, relaunch);
    }
    if (kind === 'nsis') {
      return installNsis(prepared.file, relaunch);
    }
    if (kind === 'mac-zip') {
      return installMac(prepared.file, relaunch);
    }
    installing = false;
    return false;
  } catch (err) {
    installing = false;
    setState({ status: 'error', error: errorText(err) });
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Automatic
 * ------------------------------------------------------------------ */

function autoUpdateEnabled() {
  try {
    const file = path.join(app.getPath('userData'), 'settings.json');
    const parsed = JSON.parse(fsSync.readFileSync(file, 'utf8')) as { effects?: { autoUpdate?: boolean; }; };
    return parsed.effects?.autoUpdate !== false;
  } catch {
    return true;
  }
}

/** One after another rather than in parallel: checking and loading share `release` and `state`. */
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const next = (busy ?? Promise.resolve()).catch(() => {}).then(task);
  busy = next;
  return next;
}

async function tick() {
  if (!app.isPackaged || !autoUpdateEnabled()) {
    return;
  }
  if (state.checkedAt && Date.now() - state.checkedAt < CHECK_INTERVAL_MS && state.status !== 'error') {
    return;
  }
  const result = await exclusive(check);
  if (result.status !== 'available' || !result.installable) {
    return;
  }
  await exclusive(download);
}

export function registerUpdaterIpc(onBeforeQuit: () => void) {
  setBeforeQuit(onBeforeQuit);

  ipcMain.handle('updater:state', () => state);
  ipcMain.handle('updater:check', () => exclusive(check));
  ipcMain.handle('updater:download', () => exclusive(download));
  ipcMain.handle('updater:install', () => install(true));
  ipcMain.handle('updater:openDownload', () => {
    if (!state.downloadUrl) {
      return;
    }
    void shell.openExternal(state.downloadUrl);
  });

  setTimeout(() => void tick(), FIRST_CHECK_MS);
  setInterval(() => void tick(), TICK_MS).unref();

  // Quietly install an update already downloaded when quitting normally.
  app.on('will-quit', (event) => {
    if (state.status !== 'ready' || installing || !autoUpdateEnabled()) {
      return;
    }
    event.preventDefault();
    void install(false).finally(() => app.quit());
  });
}
