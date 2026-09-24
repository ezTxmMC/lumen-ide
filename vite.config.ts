/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron/simple';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        // Unter Wayland nativ starten (die Plattform muss vor dem Start feststehen).
        onstart({ startup }) {
          const wayland = process.platform === 'linux' && (Boolean(process.env.WAYLAND_DISPLAY) || process.env.XDG_SESSION_TYPE === 'wayland');
          const flags = wayland && process.env.LUMEN_X11 !== '1'
            ? ['--ozone-platform=wayland', '--use-angle=vulkan', '--enable-features=WaylandWindowDecorations,WaylandPerSurfaceScale,WaylandUiScale', '--enable-wayland-ime', '--wayland-text-input-version=3']
            : [];
          return startup(['.', '--no-sandbox', ...flags]);
        },
        // Natives Modul: nicht bündeln, zur Laufzeit aus node_modules laden.
        vite: { build: { rollupOptions: { external: ['node-pty'] } } },
      },
      preload: {
        input: 'electron/preload.ts',
        // Electron lädt `.mjs`-Preloads als ES-Module (sandbox: false).
        // Ohne diese Angabe baut das Plugin CommonJS unter .mjs-Namen.
        vite: {
          build: {
            rollupOptions: {
              output: { format: 'es', entryFileNames: 'preload.mjs' },
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
