/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import fs from 'node:fs/promises';
import { readDirectory, type DirEntry } from './entries';

/** Every file below `root`, depth-first, up to `limit` entries. */
export async function listFilesUnder(root: string, limit: number): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string) {
    if (files.length >= limit) {
      return;
    }
    let entries: DirEntry[];
    try { entries = await readDirectory(dir); } catch { return; }
    for (const e of entries) {
      if (files.length >= limit) {
        return;
      }
      if (!e.isDirectory) {
        files.push(e.path);
        continue;
      }
      await walk(e.path);
    }
  }
  await walk(root);
  return files;
}

/** Case-insensitive line search over text files below `root`. */
export async function searchInFiles(root: string, query: string, limit: number) {
  const needle = query.toLowerCase();
  const hits: { path: string; line: number; text: string; }[] = [];

  async function walk(dir: string) {
    if (hits.length >= limit) {
      return;
    }
    let entries: DirEntry[];
    try { entries = await readDirectory(dir); } catch { return; }
    for (const e of entries) {
      if (hits.length >= limit) {
        return;
      }
      if (e.isDirectory) { await walk(e.path); continue; }
      try {
        const stat = await fs.stat(e.path);
        if (stat.size > 1024 * 512) {
          continue;
        }
        const buf = await fs.readFile(e.path);
        if (buf.subarray(0, 2048).includes(0)) {
          continue;
        }
        const lines = buf.toString('utf8').split('\n');
        for (let i = 0; i < lines.length && hits.length < limit; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            hits.push({ path: e.path, line: i + 1, text: lines[i].trim().slice(0, 200) });
          }
        }
      } catch { /* unreadable — skip */ }
    }
  }

  if (needle) {
    await walk(root);
  }
  return hits;
}
