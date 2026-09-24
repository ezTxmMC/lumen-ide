/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const RELEASE_URL = 'https://cdn.eztxm.de/download/lumen-ide/version/latest/latest.json';
const VIRTUAL_ID = 'virtual:release-snapshot';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Bakes `latest.json` into the bundle at build time. The page still asks the
 * CDN for the current manifest when it loads — the snapshot is what it shows
 * until then, and what stays when the CDN cannot be reached (or refuses the
 * request across origins).
 */
function releaseSnapshot(): Plugin {
  let snapshot: Promise<string> | null = null;
  const load = async () => {
    try {
      const response = await fetch(`${RELEASE_URL}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return JSON.stringify(await response.json());
    } catch (err) {
      console.warn(`! latest.json could not be fetched (${(err as Error).message}) — building without a snapshot.`);
      return 'null';
    }
  };
  return {
    name: 'lumen-release-snapshot',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load: async (id) => {
      if (id !== RESOLVED_ID) {
        return null;
      }
      snapshot ??= load();
      return `export default ${await snapshot}`;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), releaseSnapshot()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    // The CDN sends no CORS headers — in development the manifest comes through this proxy.
    proxy: {
      '/__release': {
        target: 'https://cdn.eztxm.de',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__release/, '/download/lumen-ide/version/latest'),
      },
    },
  },
});
