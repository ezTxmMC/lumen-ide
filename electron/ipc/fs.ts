/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertWritable } from '../files/access';
import { MAX_FILE_BYTES, readDirectory } from '../files/entries';
import { isInside } from '../files/paths';
import { listFilesUnder, searchInFiles } from '../files/search';

export function registerFsIpc() {
  ipcMain.handle('fs:readDir', (_e, dir: string, showGenerated?: boolean) => readDirectory(dir, showGenerated === true));

  ipcMain.handle('fs:exists', (_e, target: string) =>
    fs.access(target).then(() => true, () => false));

  ipcMain.handle('fs:stat', async (_e, target: string) => {
    try {
      const st = await fs.stat(target);
      return { isDirectory: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
    } catch {
      return null;
    }
  });

  /** The contents of a folder including dot entries — for project detection. */
  ipcMain.handle('fs:list', async (_e, dir: string) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
    } catch {
      return [];
    }
  });

  ipcMain.handle('fs:readFile', async (_e, file: string) => {
    const stat = await fs.stat(file);
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`File is too large (${(stat.size / 1048576).toFixed(1)} MB)`);
    }
    const buf = await fs.readFile(file);
    // A rough check for binary content: a NUL byte in the head of the file.
    if (buf.subarray(0, 4096).includes(0)) {
      throw new Error('Binary file');
    }
    return buf.toString('utf8');
  });

  /** Like `fs:readFile`, but a file that is not there is `null` — no error, and none in the console. */
  ipcMain.handle('fs:readFileIfExists', async (_e, file: string) => {
    const stat = await fs.stat(file).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    });
    if (!stat) {
      return null;
    }
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`File is too large (${(stat.size / 1048576).toFixed(1)} MB)`);
    }
    return (await fs.readFile(file)).toString('utf8');
  });

  ipcMain.handle('fs:writeFile', async (_e, file: string, content: string) => {
    assertWritable(file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
    return true;
  });

  ipcMain.handle('fs:create', async (_e, target: string, isDir: boolean) => {
    assertWritable(target);
    const existing = await fs.stat(target).catch(() => null);
    if (existing && !isDir) {
      throw new Error(`“${path.basename(target)}” already exists`);
    }
    if (existing && isDir && !existing.isDirectory()) {
      throw new Error(`“${path.basename(target)}” is already a file`);
    }
    if (isDir) {
      await fs.mkdir(target, { recursive: true });
      return true;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, '', { flag: 'wx' });
    return true;
  });

  ipcMain.handle('fs:rename', async (_e, from: string, to: string) => {
    assertWritable(from);
    assertWritable(to);
    if (from !== to && await fs.access(to).then(() => true, () => false)) {
      throw new Error(`“${path.basename(to)}” already exists`);
    }
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.rename(from, to);
    return true;
  });

  ipcMain.handle('fs:copy', async (_e, from: string, to: string) => {
    assertWritable(to);
    if (isInside(from, to)) {
      throw new Error(`“${path.basename(from)}” cannot be copied into itself`);
    }
    if (await fs.access(to).then(() => true, () => false)) {
      throw new Error(`“${path.basename(to)}” already exists`);
    }
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    return true;
  });

  ipcMain.handle('fs:delete', async (_e, target: string) => {
    assertWritable(target);
    await shell.trashItem(target);
    return true;
  });

  ipcMain.handle('fs:listFiles', (_e, root: string, limit = 5000) => listFilesUnder(root, limit));

  ipcMain.handle('fs:search', (_e, root: string, query: string, limit = 200) => searchInFiles(root, query, limit));
}
