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
 * Extensions from the network — the main process.
 *
 * Two jobs:
 *   • Fetching from an extension server. Because of its CSP the renderer may
 *     not reach the network itself; this is the one place that does.
 *   • Storing the installed manifests under `userData/extensions/<id>.json`.
 *     The add-on itself moves into the folder of the user's own add-ons and is
 *     managed by `user-addons.ts` — what stands here is only what goes beyond
 *     that: origin, settings and pages.
 *
 * Addresses are pinned to `https:`; `http:` holds for `localhost` and
 * `127.0.0.1` alone, so that a server of your own can be tried out without a
 * certificate. The answer is capped in size before it is parsed: a foreign
 * server should not tie up the renderer with an endless response.
 */

import { app, ipcMain, net } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const EXTENSION_ID = /^(?:addon|ext|user)\.[a-z0-9][a-z0-9._-]{0,63}$/;

const extensionsDir = () => path.join(app.getPath('userData'), 'extensions');

/** Check the address of a server and normalise it to its root. */
function serverBase(raw: string): string {
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new Error(`Not a valid address: ${raw}`);
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('Extension servers have to be reachable over https');
  }
  // Trimmed as text, not through `url.pathname`: an https address may not have
  // an empty path, so `pathname = ''` puts the `/` straight back — and the
  // route appended afterwards would then begin with a doubled slash.
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

/** Fetch JSON from an extension server. */
async function fetchJson(base: string, route: string): Promise<unknown> {
  const target = `${serverBase(base)}${route}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(target, {
      signal: controller.signal,
      headers: { 'User-Agent': `Lumen-IDE/${app.getVersion()}`, accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${target}`);
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error(`Response larger than ${Math.round(MAX_RESPONSE_BYTES / 1024 / 1024)} MB`);
    }
    return JSON.parse(Buffer.from(body).toString('utf8'));
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

function manifestFile(id: string): string {
  if (typeof id !== 'string' || !EXTENSION_ID.test(id)) {
    throw new Error(`Invalid extension id: ${id}`);
  }
  const dir = extensionsDir();
  const file = path.join(dir, `${id}.json`);
  // Checked twice: the id allows no slashes, but the path should stay inside
  // the folder even if the pattern is ever relaxed.
  if (path.dirname(file) !== dir) {
    throw new Error(`Invalid extension id: ${id}`);
  }
  return file;
}

export interface StoredExtension {
  file: string;
  data: unknown;
  error?: string;
}

async function listExtensions(): Promise<StoredExtension[]> {
  const dir = extensionsDir();
  await fs.mkdir(dir, { recursive: true });
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'));
  const out: StoredExtension[] = [];
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      out.push({ file, data: JSON.parse(await fs.readFile(file, 'utf8')) });
    } catch (err) {
      out.push({ file, data: null, error: (err as Error).message });
    }
  }
  return out;
}

async function saveExtension(id: string, content: string) {
  const file = manifestFile(id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
}

async function removeExtension(id: string) {
  await fs.rm(manifestFile(id), { force: true });
}

export function registerExtensionIpc() {
  ipcMain.handle('extensions:info', (_e, server: string) => fetchJson(server, '/api/v1/info'));
  ipcMain.handle('extensions:index', (_e, server: string, query?: string) =>
    fetchJson(server, `/api/v1/index${query ? `?q=${encodeURIComponent(query)}` : ''}`));
  ipcMain.handle('extensions:detail', (_e, server: string, id: string) => {
    if (!EXTENSION_ID.test(id)) {
      throw new Error(`Invalid extension id: ${id}`);
    }
    return fetchJson(server, `/api/v1/extensions/${encodeURIComponent(id)}`);
  });
  ipcMain.handle('extensions:manifest', (_e, server: string, id: string, version: string) => {
    if (!EXTENSION_ID.test(id)) {
      throw new Error(`Invalid extension id: ${id}`);
    }
    return fetchJson(server, `/api/v1/extensions/${encodeURIComponent(id)}/${encodeURIComponent(version)}`);
  });

  ipcMain.handle('extensions:list', () => listExtensions());
  ipcMain.handle('extensions:save', (_e, id: string, content: string) => saveExtension(id, content));
  ipcMain.handle('extensions:remove', (_e, id: string) => removeExtension(id));
}
