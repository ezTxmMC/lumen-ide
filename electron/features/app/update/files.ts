/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { updatesDir } from './install-kind';
import { ManifestFile } from './manifest';

async function sha512Of(file: string) {
  const hash = crypto.createHash('sha512');
  for await (const chunk of fsSync.createReadStream(file)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('base64');
}

export async function alreadyDownloaded(target: string, expected: ManifestFile) {
  const stat = await fs.stat(target).catch(() => null);
  if (!stat || stat.size !== expected.size) {
    return false;
  }
  return (await sha512Of(target)) === expected.sha512;
}

/** Remove everything under `updates/` apart from `keep`. */
export async function cleanUpdates(keep: string[]) {
  const entries = await fs.readdir(updatesDir()).catch(() => [] as string[]);
  for (const name of entries) {
    if (keep.includes(name)) {
      continue;
    }
    await fs.rm(path.join(updatesDir(), name), { recursive: true, force: true });
  }
}
