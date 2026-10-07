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
 * Installs a release that is a handful of plain files (Novus): download each
 * one, check its checksum, put it under `<home>/bin` and make it executable.
 * No archive, so there is nothing to unpack — the files only move.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { download } from '../../jdk/transfer';
import type { InstallProgress, Job } from '../../jdk/types';
import { expectedChecksum } from '../fetch';
import type { Release } from '../types';
import { planFiles } from './model';

/**
 * Downloads `release.files` and lays them out below `staging`. Returns whether
 * every file had a checksum to compare against, and matched.
 */
export async function placeFiles(
  job: Job, release: Release, staging: string, downloads: string,
  send: (patch: Partial<InstallProgress>) => void,
): Promise<boolean> {
  const files = release.files ?? [];
  const plan = planFiles(files, staging, downloads, process.platform);
  const total = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
  await fs.mkdir(downloads, { recursive: true });
  const digests: string[] = [];
  try {
    send({ phase: 'download', received: 0, total });
    let done = 0;
    for (const step of plan) {
      const size = step.file.size ?? 0;
      digests.push(await download(job, step.file.url, step.download, step.file.checksum?.type ?? '', (received, _length, speed) => {
        send({ received: done + received, total: total || done + received, speed });
      }));
      done += size;
    }

    send({ phase: 'verify', speed: 0 });
    let verified = plan.length > 0;
    for (const [index, step] of plan.entries()) {
      const expected = await expectedChecksum(step.file.checksum, job.controller.signal);
      const digest = digests[index];
      if (expected && digest && digest !== expected) {
        throw new Error(`Checksum of ${step.file.filename} does not match — the download is damaged`);
      }
      verified = verified && Boolean(expected && digest);
    }

    send({ phase: 'extract', verified });
    for (const step of plan) {
      await fs.mkdir(path.dirname(step.target), { recursive: true });
      await fs.rename(step.download, step.target);
      if (step.mode !== null) {
        await fs.chmod(step.target, step.mode);
      }
    }
    return verified;
  } finally {
    await Promise.all(plan.map((step) => fs.rm(step.download, { force: true })));
  }
}
