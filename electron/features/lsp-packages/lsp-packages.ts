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
 * Language servers in a closed environment.
 *
 * Every server Lumen installs lives under `~/.lumen/lsp`, and so does every
 * tool needed to install it — nothing goes to a global npm, pip or the system:
 *
 *   ~/.lumen/lsp/
 *     bin/                one launcher per server; checked before the PATH
 *     packages/<id>/      the servers themselves (npm prefix, GitHub release …)
 *     tools/node          Node.js, downloaded from nodejs.org
 *     tools/uv            uv, downloaded from GitHub — brings its own Python
 *     tools/python        the Pythons uv installs
 *     tools/go            Go, downloaded from go.dev
 *     cache/              npm, uv and Go caches
 *     packages.json       what is installed, and which launchers belong to it
 *
 * The renderer hands over the package description from the add-on; the paths
 * and the package id are derived here, and every name is checked before it
 * reaches a command line. Processes run without a shell.
 */

import { BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { install } from './install';
import { readManifest, writeManifest } from './manifest';
import { BIN, PACKAGES, PLATFORM } from './places';
import { jobs } from './runner';
import { probeTool } from './tools/tool-probe';
import { LspPackage } from './types';

function cancel(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) {
    return false;
  }
  job.cancelled = true;
  job.controller.abort();
  job.child?.kill();
  return true;
}

/** Removes a server: its launchers, its folder and its entry. */
async function remove(command: string): Promise<boolean> {
  const data = await readManifest();
  const entry = Object.values(data).find((candidate) => candidate.bins.includes(command));
  if (!entry) {
    return false;
  }
  for (const bin of entry.bins) {
    for (const name of [bin, `${bin}.cmd`, `${bin}.exe`]) {
      await fs.rm(path.join(BIN, name), { force: true });
    }
  }
  // uv keeps its environments in one shared folder, named after the package.
  const folder = entry.type === 'pypi'
    ? path.join(PACKAGES, 'uv-tools', entry.id.slice('pypi-'.length))
    : path.join(PACKAGES, entry.id);
  if (folder.startsWith(PACKAGES + path.sep)) {
    await fs.rm(folder, { recursive: true, force: true });
  }
  delete data[entry.id];
  await writeManifest(data);
  return true;
}

export function registerLspPackageIpc(getWindow: () => BrowserWindow | null) {
  // The log goes to the window that asked.
  ipcMain.handle('lspPackages:install', (e, jobId: string, spec: LspPackage, command: string) =>
    install(String(jobId), spec, command, () => BrowserWindow.fromWebContents(e.sender) ?? getWindow()));
  ipcMain.handle('lspPackages:cancel', (_e, jobId: string) => cancel(String(jobId)));
  ipcMain.handle('lspPackages:remove', (_e, command: string) => remove(String(command)));
  ipcMain.handle('lspPackages:list', async () => Object.values(await readManifest()));
  ipcMain.handle('lspPackages:platform', () => PLATFORM);
  ipcMain.handle('lspPackages:probe', (_e, candidates: string[], args?: string[]) =>
    probeTool(candidates.map(String), Array.isArray(args) ? args.map(String) : undefined));
}
