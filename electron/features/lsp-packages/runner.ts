/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { net } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { download, extract } from '../sdk/jdk/transfer';
import type { Job } from '../sdk/jdk/types';
import { DOWNLOADS, EXE, ROOT } from './places';

export type Log = (text: string) => void;

export const jobs = new Map<string, Job>();

/** Runs a program and passes every line of its output to the log. */
export function run(job: Job, log: Log, command: string, args: string[], options: { env?: Record<string, string>; cwd?: string; } = {}) {
  log(`$ ${path.basename(command)} ${args.join(' ')}`);
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    job.child = child;
    let tail = '';
    const forward = (chunk: Buffer) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-2000);
      for (const line of text.split(/\r?\n/)) {
        // uv's advice to extend the PATH does not apply: Lumen finds bin/ itself.
        if (!line.trim() || /is not on your PATH|update-shell/.test(line)) {
          continue;
        }
        log(line);
      }
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    child.on('error', (err) => {
      job.child = null;
      reject(err);
    });
    child.on('close', (code) => {
      job.child = null;
      if (code === 0) {
        resolve();
        return;
      }
      if (job.cancelled) {
        reject(new Error('Cancelled'));
        return;
      }
      reject(new Error(`${path.basename(command)} exited with code ${code}`));
    });
  });
}

export async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await net.fetch(url, { signal, headers: { 'User-Agent': 'Lumen-IDE', Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return (await response.json()) as T;
}

export async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await net.fetch(url, { signal, headers: { 'User-Agent': 'Lumen-IDE' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return response.text();
}

function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Download with a checksum check (when one is known); returns the file. */
export async function fetchFile(job: Job, log: Log, url: string, name: string, sha256 = ''): Promise<string> {
  await fs.mkdir(DOWNLOADS, { recursive: true });
  const file = path.join(DOWNLOADS, `${Date.now()}-${name.replace(/[^\w.-]/g, '_')}`);
  log(`↓ ${url}`);
  let step = 0;
  const digest = await download(job, url, file, 'sha256', (received, total) => {
    if (!total) {
      return;
    }
    const percent = Math.floor((received / total) * 4);
    if (percent <= step) {
      return;
    }
    step = percent;
    log(`  ${percent * 25} % of ${megabytes(total)}`);
  });
  if (sha256 && digest !== sha256.toLowerCase()) {
    await fs.rm(file, { force: true });
    throw new Error('Checksum does not match — the download is damaged');
  }
  if (sha256) {
    log('  checksum verified');
  }
  return file;
}

/** Unpacks an archive, a gzipped program or a bare program into `target`. */
export async function unpack(job: Job, file: string, name: string, target: string, bin: string) {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  if (/\.(zip|vsix|tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2)$/i.test(name)) {
    await extract(job, file, target);
    return;
  }
  const program = path.join(target, `${path.basename(bin)}${EXE}`);
  if (/\.gz$/i.test(name)) {
    await pipeline(fsSync.createReadStream(file), zlib.createGunzip(), fsSync.createWriteStream(program));
    await fs.chmod(program, 0o755);
    return;
  }
  await fs.copyFile(file, program);
  await fs.chmod(program, 0o755);
}

/** Looks for the program in an unpacked folder — releases often nest it (`clangd_18/bin/clangd`). */
export async function findProgram(dir: string, bin: string, extensions: string[], depth = 0): Promise<string | null> {
  for (const ext of extensions) {
    const direct = path.join(dir, `${bin}${ext}`);
    const stat = await fs.stat(direct).catch(() => null);
    if (stat?.isFile()) {
      return direct;
    }
  }
  if (depth >= 4) {
    return null;
  }
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '__MACOSX') {
      continue;
    }
    const hit = await findProgram(path.join(dir, entry.name), bin, extensions, depth + 1);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/** The one program in a folder — for archives whose program name carries the platform (`lemminx-linux-x86_64`). */
export async function onlyFile(dir: string): Promise<string | null> {
  const files: string[] = [];
  const walk = async (current: string, depth: number) => {
    if (depth > 4 || files.length > 1) {
      return;
    }
    for (const entry of await fs.readdir(current, { withFileTypes: true }).catch(() => [])) {
      if (entry.name === '__MACOSX') {
        continue;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      }
      if (entry.isFile()) {
        files.push(full);
      }
    }
  };
  await walk(dir, 0);
  return files.length === 1 ? files[0] : null;
}
