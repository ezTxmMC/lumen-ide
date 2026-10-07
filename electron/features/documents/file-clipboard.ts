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
 * Files on the system clipboard, so copy and paste between the explorer and
 * the OS file manager works both ways. Electron has no file list in its
 * clipboard API; each platform keeps one in a format of its own, written and
 * read here as raw buffers.
 */

import { clipboard, ClipboardItem, ipcMain } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Electron's name for a raw platform clipboard format. */
const raw = (format: string) => `electron application/osclipboard;format="${format}"`;
const GNOME = 'x-special/gnome-copied-files';
const MAC_LIST = 'NSFilenamesPboardType';
const WIN_NAME = 'FileNameW';

const blob = (text: string, encoding: BufferEncoding = 'utf8') => new Blob([Buffer.from(text, encoding)], { type: 'text/plain' });
const plistEscape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plistUnescape = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function writeFiles(paths: string[], mode: 'copy' | 'cut') {
  if (!paths.length) {
    return;
  }
  const uris = paths.map((file) => pathToFileURL(file).href);
  const formats: Record<string, Blob> = { 'text/uri-list': blob(`${uris.join('\r\n')}\r\n`) };
  if (process.platform === 'linux') {
    formats[raw(GNOME)] = blob(`${mode}\n${uris.join('\n')}`);
  }
  if (process.platform === 'darwin') {
    const items = paths.map((file) => `<string>${plistEscape(file)}</string>`).join('');
    formats[raw(MAC_LIST)] = blob(`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><array>${items}</array></plist>`);
  }
  if (process.platform === 'win32') {
    // The format a file manager pastes holds one file.
    formats[raw(WIN_NAME)] = blob(`${paths[0]}\0`, 'ucs2');
  }
  await clipboard.write([new ClipboardItem(formats)]);
}

const fromUris = (text: string) => text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('file://'))
  .map((line) => fileURLToPath(line));

/** The paths a clipboard entry holds, in whichever format the platform keeps them. */
async function pathsOf(item: Electron.ClipboardItem): Promise<string[]> {
  const text = async (type: string, encoding = 'utf-8') => new TextDecoder(encoding).decode(await (await item.getType(type) as Blob).arrayBuffer());
  const has = (type: string) => item.types.includes(type);
  if (has(raw(GNOME))) {
    return fromUris(await text(raw(GNOME)));
  }
  if (has(raw(MAC_LIST))) {
    return [...(await text(raw(MAC_LIST))).matchAll(/<string>([^<]*)<\/string>/g)].map((match) => plistUnescape(match[1]));
  }
  if (has(raw(WIN_NAME))) {
    const name = (await text(raw(WIN_NAME), 'utf-16le')).replace(/\0+$/, '');
    return name ? [name] : [];
  }
  if (has('text/uri-list')) {
    return fromUris(await text('text/uri-list'));
  }
  return [];
}

async function readFiles(): Promise<string[]> {
  try {
    for (const item of await clipboard.read()) {
      const found = await pathsOf(item);
      if (found.length) {
        return found;
      }
    }
  } catch {
    // Nothing readable on the clipboard: no files.
  }
  return [];
}

export function registerFileClipboardIpc() {
  ipcMain.handle('clipboardFiles:write', async (_e, paths: string[], mode: 'copy' | 'cut') => {
    await writeFiles(paths.filter((file) => typeof file === 'string'), mode === 'cut' ? 'cut' : 'copy');
    return true;
  });
  ipcMain.handle('clipboardFiles:read', () => readFiles());
}
