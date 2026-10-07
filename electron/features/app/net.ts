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
 * Network access for the renderer (whose CSP allows `self` alone): loading JSON
 * and text from HTTPS addresses — version lists for templates, for instance.
 */

import { ipcMain, net } from 'electron';

const TIMEOUT_MS = 15_000;

async function fetchText(url: string): Promise<string> {
  if (!/^https:\/\//.test(url)) {
    throw new Error('Only HTTPS addresses are allowed');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Lumen-IDE' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export function registerNetIpc() {
  ipcMain.handle('net:fetchText', (_e, url: string) => fetchText(url));
  ipcMain.handle('net:fetchJson', async (_e, url: string) => JSON.parse(await fetchText(url)));
}
