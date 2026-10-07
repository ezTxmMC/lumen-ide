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
import { createHash, type Hash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { javaHomeIn, subdirectories } from './detect';
import { fetchText } from './environment';
import { DISCO, HASH_TYPES, IS_WINDOWS, PROGRESS_INTERVAL_MS } from './places';
import { Job } from './types';

interface PackageInfo {
  filename: string;
  direct_download_uri: string;
  checksum_uri: string;
  checksum: string;
  checksum_type: string;
}

/** The download address and the checksum of a foojay package. */
export async function resolvePackage(packageId: string, signal: AbortSignal): Promise<PackageInfo & { expected: string; }> {
  if (!/^[a-f0-9]{16,64}$/i.test(packageId)) {
    throw new Error('Invalid package id');
  }
  const response = JSON.parse(await fetchText(`${DISCO}/ids/${packageId}`, signal)) as { result?: PackageInfo[]; };
  const info = response.result?.[0];
  if (!info?.direct_download_uri) {
    throw new Error('The package has no download address');
  }
  const type = (info.checksum_type || 'sha256').toLowerCase();
  if (info.checksum) {
    return { ...info, checksum_type: type, expected: info.checksum.toLowerCase() };
  }
  if (!info.checksum_uri || !HASH_TYPES.has(type)) {
    return { ...info, checksum_type: type, expected: '' };
  }
  // Checksum files hold “<hex>  <file>” or the hex value alone.
  const text = await fetchText(info.checksum_uri, signal).catch(() => '');
  const expected = /\b([a-f0-9]{40,128})\b/i.exec(text)?.[1]?.toLowerCase() ?? '';
  return { ...info, checksum_type: type, expected };
}

function archiveKind(filename: string): 'zip' | 'tar.gz' | 'tar' {
  // A VS Code extension (.vsix) is a zip file too.
  if (/\.(zip|vsix)$/i.test(filename)) {
    return 'zip';
  }
  if (/\.(tar\.gz|tgz)$/i.test(filename)) {
    return 'tar.gz';
  }
  return 'tar';
}

/** Runs an unpacking program; remembers the process so it can be cancelled. */
export function runTool(job: Job, command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    job.child = child;
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      job.child = null;
      reject(err);
    });
    child.on('close', (code) => {
      job.child = null;
      // unzip exits with 1 for warnings (odd names, macOS metadata) although everything was unpacked.
      if (code === 0 || (command === 'unzip' && code === 1)) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim().split('\n').pop() || `${command} endete mit Code ${code}`));
    });
  });
}

export async function extract(job: Job, archive: string, target: string) {
  await fs.mkdir(target, { recursive: true });
  const kind = archiveKind(archive);
  if (kind === 'tar.gz') {
    await runTool(job, 'tar', ['-xzf', archive, '-C', target]);
    return;
  }
  if (kind === 'tar') {
    await runTool(job, 'tar', ['-xf', archive, '-C', target]);
    return;
  }
  if (!IS_WINDOWS) {
    await runTool(job, 'unzip', ['-q', '-o', archive, '-d', target]);
    return;
  }
  // Windows 10+ brings bsdtar along, which handles ZIP too; otherwise PowerShell.
  try {
    await runTool(job, 'tar', ['-xf', archive, '-C', target]);
  } catch (err) {
    if (job.cancelled) {
      throw err;
    }
    const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
    await runTool(job, 'powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(target)} -Force`,
    ]);
  }
}

/** Finds the actual root of the JDK in the unpacked folder (nested folders, macOS `Contents/Home`). */
export async function findExtractedHome(dir: string, depth = 0): Promise<string | null> {
  const direct = await javaHomeIn(dir);
  if (direct) {
    return direct;
  }
  if (depth >= 3) {
    return null;
  }
  for (const child of await subdirectories(dir)) {
    if (path.basename(child) === '__MACOSX') {
      continue;
    }
    const hit = await findExtractedHome(child, depth + 1);
    if (hit) {
      return hit;
    }
  }
  return null;
}

export async function download(
  job: Job, url: string, file: string, hashType: string,
  report: (received: number, total: number, speed: number) => void,
): Promise<string> {
  if (!/^https:\/\//.test(url)) {
    throw new Error('Only HTTPS downloads are allowed');
  }
  const response = await net.fetch(url, { signal: job.controller.signal, headers: { 'User-Agent': 'Lumen-IDE' } });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} while downloading`);
  }
  const total = Number(response.headers.get('content-length') ?? 0);
  const hash: Hash | null = HASH_TYPES.has(hashType) ? createHash(hashType) : null;
  const out = fsSync.createWriteStream(file);
  const reader = response.body.getReader();
  let received = 0;
  let lastReport = 0;
  let lastBytes = 0;
  let speed = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      hash?.update(value);
      if (!out.write(value)) {
        await once(out, 'drain');
      }
      const now = Date.now();
      if (now - lastReport < PROGRESS_INTERVAL_MS) {
        continue;
      }
      const current = ((received - lastBytes) * 1000) / Math.max(1, now - lastReport);
      speed = speed ? speed * 0.7 + current * 0.3 : current;
      lastReport = now;
      lastBytes = received;
      report(received, total, speed);
    }
    out.end();
    await once(out, 'finish');
  } catch (err) {
    out.destroy();
    throw err;
  }
  report(received, total || received, speed);
  return hash ? hash.digest('hex') : '';
}
