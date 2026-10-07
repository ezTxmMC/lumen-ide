/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TOOL_ROOT, jobs } from '../jdk/places';
import { download, extract } from '../jdk/transfer';
import type { InstallProgress, Job } from '../jdk/types';
import { platformNow, specOf } from './catalog';
import { exists } from './detect';
import { expectedChecksum } from './fetch';
import { placeFiles } from './novus/install-files';
import { isSafeVersion } from './novus/version';
import { Release, ToolInstallRequest, ToolSpec } from './types';

/** The folder inside an unpacked archive that holds the tool (`bin/go` below it), looking a couple of levels down. */
async function findHome(dir: string, spec: ToolSpec, depth = 0): Promise<string | null> {
  if (await exists(path.join(dir, spec.archiveMarker ?? spec.bin(process.platform)))) {
    return dir;
  }
  if (depth >= 2) {
    return null;
  }
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name === '__MACOSX') {
      continue;
    }
    const hit = await findHome(path.join(dir, entry.name), spec, depth + 1);
    if (hit) {
      return hit;
    }
  }
  return null;
}

type Send = (patch: Partial<InstallProgress>) => void;

/** Download, verify and unpack an archive into `staging`; the folder that holds the tool, or null. */
async function unpackArchive(job: Job, spec: ToolSpec, release: Release, places: { staging: string; archive: string; }, send: Send): Promise<string | null> {
  await fs.mkdir(path.dirname(places.archive), { recursive: true });
  const file = `${places.archive}-${path.basename(release.filename)}`;

  send({ phase: 'download', total: release.size ?? 0 });
  const expected = await expectedChecksum(release.checksum, job.controller.signal);
  const digest = await download(job, release.url, file, release.checksum?.type ?? '', (received, total, speed) => send({ received, total, speed }));

  send({ phase: 'verify', speed: 0 });
  const verified = Boolean(expected && digest);
  if (verified && digest !== expected) {
    await fs.rm(file, { force: true });
    throw new Error('Checksum does not match — the download is damaged');
  }

  send({ phase: 'extract', verified });
  await extract(job, file, places.staging);
  await fs.rm(file, { force: true });
  return findHome(places.staging, spec);
}

export async function install(request: ToolInstallRequest, window: BrowserWindow | null): Promise<string> {
  const spec = specOf(request.toolId);
  if (!isSafeVersion(request.version)) {
    throw new Error('Invalid version');
  }
  if (jobs.has(request.jobId)) {
    throw new Error('An installation is already running');
  }
  const job: Job = { controller: new AbortController(), child: null, cancelled: false };
  jobs.set(request.jobId, job);
  const safeJob = request.jobId.replace(/[^A-Za-z0-9_-]/g, '');
  const target = path.join(TOOL_ROOT, spec.id, request.version);
  const staging = path.join(TOOL_ROOT, `.extract-${safeJob}`);
  const archive = path.join(TOOL_ROOT, '.downloads', `${safeJob}-${spec.id}`);
  let state: InstallProgress = { jobId: request.jobId, phase: 'resolve', received: 0, total: 0, speed: 0 };
  const send = (patch: Partial<InstallProgress>) => {
    state = { ...state, ...patch };
    window?.webContents.send('sdk:progress', state);
  };

  try {
    send({});
    if (await exists(target)) {
      throw new Error(`Already installed: ${target}`);
    }
    const release = (await spec.releases(platformNow(), job.controller.signal)).find((entry) => entry.version === request.version);
    if (!release) {
      throw new Error(`${spec.id} ${request.version} is not offered for this system`);
    }
    await fs.rm(staging, { recursive: true, force: true });
    // Plain files (Novus) are laid out in the staging folder; an archive is unpacked there.
    let home: string | null = staging;
    if (release.files) {
      await placeFiles(job, release, staging, path.join(TOOL_ROOT, '.downloads', safeJob), send);
    }
    if (!release.files) {
      home = await unpackArchive(job, spec, release, { staging, archive }, send);
    }
    if (!home) {
      throw new Error(`No ${spec.id} found in the archive`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (spec.place) {
      await spec.place(job, home, target);
    }
    if (!spec.place) {
      await fs.rename(home, target);
    }
    await fs.writeFile(path.join(target, '.lumen-sdk.json'), JSON.stringify({ tool: spec.id, version: request.version, installedAt: new Date().toISOString() }, null, 2)).catch(() => {});
    send({ phase: 'done', home: target });
    return target;
  } catch (err) {
    const cancelled = job.cancelled;
    send({ phase: cancelled ? 'cancelled' : 'error', error: cancelled ? undefined : (err as Error).message, speed: 0 });
    if (cancelled) {
      throw new Error('Cancelled');
    }
    throw err;
  } finally {
    jobs.delete(request.jobId);
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}
