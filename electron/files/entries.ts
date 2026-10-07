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
import path from 'node:path';

export const IGNORED = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  '.next', '.nuxt', '.cache', '__pycache__', '.venv', 'venv',
  'target', 'vendor', '.idea', '.gradle', 'bin', 'obj',
]);

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Entries the file tree never shows — dotfiles such as .gitignore stay visible. */
const HIDDEN_ENTRIES = new Set(['.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db', '.idea', '.cache']);

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** Build output the explorer can show (a setting) while search and the file index keep skipping it. */
const GENERATED_FOLDERS = new Set(['dist', 'build', 'out', 'target', 'bin', 'obj']);

function compareEntries(a: DirEntry, b: DirEntry) {
  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1;
  }
  return a.name.localeCompare(b.name, 'de', { numeric: true });
}

/**
 * `showGenerated` is for the explorer: build output folders are listed there,
 * only the heavy dependency and cache folders stay hidden. Search and the file
 * index leave it off and skip everything in IGNORED.
 */
export async function readDirectory(dir: string, showGenerated = false): Promise<DirEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: DirEntry[] = [];
  for (const e of entries) {
    if (HIDDEN_ENTRIES.has(e.name)) {
      continue;
    }
    if (IGNORED.has(e.name) && !(showGenerated && GENERATED_FOLDERS.has(e.name))) {
      continue;
    }
    result.push({
      name: e.name,
      path: path.join(dir, e.name),
      isDirectory: e.isDirectory(),
    });
  }
  result.sort(compareEntries);
  return result;
}
