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
 * SDK management in the main process: detecting JDKs, downloading them from the
 * foojay Disco API (streamed with progress, a checksum and cancelling),
 * unpacking them into `~/.lumen/jdks/<distribution>-<version>` and removing
 * them again.
 *
 * When installing, the renderer hands over nothing but foojay's package id —
 * the download address and the checksum the main process fetches itself, so
 * that no arbitrary address can be loaded or path written through IPC.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectJava } from './detect';
import { environment } from './environment';
import { JDK_ROOT, assertJdkPath, exists, folderName, jobs } from './places';
import { loadSettings, saveSettings } from './settings';
import { download, extract, findExtractedHome, resolvePackage } from './transfer';
import { InstallProgress, InstallRequest, Job } from './types';

async function install(request: InstallRequest, getWindow: () => BrowserWindow | null): Promise<string> {
  if (request.kind !== 'java') {
    throw new Error(`Unbekannte SDK-Art: ${request.kind}`);
  }
  if (jobs.has(request.jobId)) {
    throw new Error('An installation is already running');
  }

  const job: Job = { controller: new AbortController(), child: null, cancelled: false };
  jobs.set(request.jobId, job);
  const target = path.join(JDK_ROOT, folderName(request.distribution, request.version));
  const downloads = path.join(JDK_ROOT, '.downloads');
  const staging = path.join(JDK_ROOT, `.extract-${request.jobId.replace(/[^A-Za-z0-9_-]/g, '')}`);
  let archive = '';
  let state: InstallProgress = { jobId: request.jobId, phase: 'resolve', received: 0, total: 0, speed: 0 };
  const send = (patch: Partial<InstallProgress>) => {
    state = { ...state, ...patch };
    getWindow()?.webContents.send('sdk:progress', state);
  };

  try {
    send({});
    if (await exists(target)) {
      throw new Error(`Already installed: ${target}`);
    }
    const info = await resolvePackage(request.packageId, job.controller.signal);
    await fs.mkdir(downloads, { recursive: true });
    archive = path.join(downloads, `${request.jobId.replace(/[^A-Za-z0-9_-]/g, '')}-${path.basename(info.filename)}`);
    assertJdkPath(archive);

    send({ phase: 'download' });
    const digest = await download(job, info.direct_download_uri, archive, info.checksum_type, (received, total, speed) =>
      send({ received, total, speed }));

    send({ phase: 'verify', speed: 0 });
    const verified = Boolean(info.expected && digest);
    if (verified && digest !== info.expected) {
      throw new Error('Checksum does not match — the download is damaged');
    }

    send({ phase: 'extract', verified });
    await fs.rm(staging, { recursive: true, force: true });
    await extract(job, archive, staging);
    const home = await findExtractedHome(staging);
    if (!home) {
      throw new Error('No JDK found in the archive (bin/java is missing)');
    }
    await fs.rename(home, target);
    await fs.writeFile(path.join(target, '.lumen-sdk.json'), JSON.stringify({
      distribution: request.distribution,
      version: request.version,
      packageId: request.packageId,
      installedAt: new Date().toISOString(),
    }, null, 2)).catch(() => {});

    send({ phase: 'done', home: target });
    return target;
  } catch (err) {
    const cancelled = job.cancelled;
    send({ phase: cancelled ? 'cancelled' : 'error', error: cancelled ? undefined : (err as Error).message, speed: 0 });
    if (cancelled) {
      throw new Error('Abgebrochen');
    }
    throw err;
  } finally {
    jobs.delete(request.jobId);
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    if (archive) {
      await fs.rm(archive, { force: true }).catch(() => {});
    }
  }
}

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

/** Removes a Lumen installation — to the wastebasket first, otherwise for good. */
async function remove(home: string) {
  const real = await fs.realpath(home);
  assertJdkPath(real);
  try {
    await shell.trashItem(real);
  } catch {
    await fs.rm(real, { recursive: true, force: true });
  }
  return true;
}

export function registerSdkIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('sdk:environment', () => environment());
  ipcMain.handle('sdk:settings:load', () => loadSettings());
  ipcMain.handle('sdk:settings:save', (_e, data: Record<string, unknown>) => saveSettings(data));
  ipcMain.handle('sdk:detect', (_e, kind: string) => {
    if (kind !== 'java') {
      return [];
    }
    return detectJava();
  });
  // Progress goes to the window that asked.
  ipcMain.handle('sdk:install', (e, request: InstallRequest) => install(request, () => BrowserWindow.fromWebContents(e.sender) ?? getWindow()));
  ipcMain.handle('sdk:cancel', (_e, jobId: string) => cancel(jobId));
  ipcMain.handle('sdk:remove', (_e, home: string) => remove(home));

  app.on('before-quit', () => {
    for (const jobId of [...jobs.keys()]) {
      cancel(jobId);
    }
  });
}
