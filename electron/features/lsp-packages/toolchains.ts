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
import os from 'node:os';
import path from 'node:path';
import { extract } from '../sdk/jdk/transfer';
import type { Job } from '../sdk/jdk/types';
import { exists } from './manifest';
import { BIN, CACHE, DEFAULT_PYTHON, EXE, IS_WINDOWS, PACKAGES, PLATFORM, TOOLS } from './places';
import { Log, fetchFile, fetchJson, fetchText, findProgram, run } from './runner';

/** Moves the single top folder of an unpacked archive (or the folder itself) to `target`. */
async function settle(staging: string, target: string) {
  const entries = (await fs.readdir(staging, { withFileTypes: true })).filter((entry) => entry.name !== '__MACOSX');
  const inner = entries.length === 1 && entries[0].isDirectory() ? path.join(staging, entries[0].name) : staging;
  await fs.rm(target, { recursive: true, force: true });
  await fs.rename(inner, target);
  await fs.rm(staging, { recursive: true, force: true });
}

const NODE_DIR = path.join(TOOLS, 'node');
const nodeBinary = () => (IS_WINDOWS ? path.join(NODE_DIR, 'node.exe') : path.join(NODE_DIR, 'bin', 'node'));
export const npmCli = () => (IS_WINDOWS
  ? path.join(NODE_DIR, 'node_modules', 'npm', 'bin', 'npm-cli.js')
  : path.join(NODE_DIR, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));

/** Node.js (current LTS) from nodejs.org. */
export async function ensureNode(job: Job, log: Log): Promise<string> {
  if (await exists(nodeBinary())) {
    return nodeBinary();
  }
  log('Node.js is not installed yet — fetching the current LTS');
  const index = await fetchJson<{ version: string; lts: string | false; }[]>('https://nodejs.org/dist/index.json', job.controller.signal);
  const release = index.find((entry) => entry.lts);
  if (!release) {
    throw new Error('No Node.js LTS release found');
  }
  const os = { win32: 'win', darwin: 'darwin', linux: 'linux' }[process.platform as string];
  if (!os) {
    throw new Error(`Node.js is not available for ${process.platform}`);
  }
  const name = `node-${release.version}-${os}-${process.arch}.${IS_WINDOWS ? 'zip' : 'tar.gz'}`;
  const base = `https://nodejs.org/dist/${release.version}`;
  const sums = await fetchText(`${base}/SHASUMS256.txt`, job.controller.signal);
  const sha256 = sums.split('\n').find((line) => line.endsWith(`  ${name}`))?.split(/\s+/)[0] ?? '';
  const file = await fetchFile(job, log, `${base}/${name}`, name, sha256);
  const staging = path.join(TOOLS, '.node-staging');
  await fs.rm(staging, { recursive: true, force: true });
  await extract(job, file, staging);
  await settle(staging, NODE_DIR);
  await fs.rm(file, { force: true });
  log(`Node.js ${release.version} ready`);
  return nodeBinary();
}

const UV_DIR = path.join(TOOLS, 'uv');
const UV_TARGETS: Record<string, string> = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
};

/** uv from its GitHub releases — it installs Python itself where needed. */
export async function ensureUv(job: Job, log: Log): Promise<string> {
  const binary = path.join(UV_DIR, `uv${EXE}`);
  if (await exists(binary)) {
    return binary;
  }
  const target = UV_TARGETS[PLATFORM];
  if (!target) {
    throw new Error(`uv is not available for ${PLATFORM}`);
  }
  log('uv is not installed yet — fetching it');
  const name = `uv-${target}.${IS_WINDOWS ? 'zip' : 'tar.gz'}`;
  const base = 'https://github.com/astral-sh/uv/releases/latest/download';
  const sha256 = (await fetchText(`${base}/${name}.sha256`, job.controller.signal).catch(() => '')).split(/\s+/)[0] ?? '';
  const file = await fetchFile(job, log, `${base}/${name}`, name, sha256);
  const staging = path.join(TOOLS, '.uv-staging');
  await fs.rm(staging, { recursive: true, force: true });
  await extract(job, file, staging);
  const found = await findProgram(staging, 'uv', [EXE]);
  if (!found) {
    throw new Error('uv was not found in the download');
  }
  await fs.rm(UV_DIR, { recursive: true, force: true });
  await fs.mkdir(UV_DIR, { recursive: true });
  for (const program of ['uv', 'uvx']) {
    const source = path.join(path.dirname(found), `${program}${EXE}`);
    if (await exists(source)) {
      await fs.rename(source, path.join(UV_DIR, `${program}${EXE}`));
    }
  }
  await fs.rm(staging, { recursive: true, force: true });
  await fs.rm(file, { force: true });
  log('uv ready');
  return binary;
}

/** Everything that keeps uv inside `~/.lumen/lsp`. */
export function uvEnvironment(): Record<string, string> {
  return {
    UV_TOOL_DIR: path.join(PACKAGES, 'uv-tools'),
    UV_TOOL_BIN_DIR: BIN,
    UV_PYTHON_INSTALL_DIR: path.join(TOOLS, 'python'),
    // Otherwise `uv python install` puts a python3.x into ~/.local/bin.
    UV_PYTHON_BIN_DIR: path.join(TOOLS, 'python', 'bin'),
    UV_PYTHON_PREFERENCE: 'only-managed',
    UV_CACHE_DIR: path.join(CACHE, 'uv'),
    UV_NO_MODIFY_PATH: '1',
  };
}

const GO_DIR = path.join(TOOLS, 'go');

/** Go from go.dev — only needed for servers published as Go modules. */
export async function ensureGo(job: Job, log: Log): Promise<string> {
  const binary = path.join(GO_DIR, 'bin', `go${EXE}`);
  if (await exists(binary)) {
    return binary;
  }
  log('Go is not installed yet — fetching the current release');
  const releases = await fetchJson<{ version: string; stable: boolean; files: { filename: string; os: string; arch: string; sha256: string; kind: string; }[]; }[]>(
    'https://go.dev/dl/?mode=json', job.controller.signal);
  const release = releases.find((entry) => entry.stable);
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch as string];
  const os = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform as string];
  const file = release?.files.find((entry) => entry.kind === 'archive' && entry.os === os && entry.arch === arch);
  if (!release || !file) {
    throw new Error(`Go is not available for ${PLATFORM}`);
  }
  const archive = await fetchFile(job, log, `https://go.dev/dl/${file.filename}`, file.filename, file.sha256);
  const staging = path.join(TOOLS, '.go-staging');
  await fs.rm(staging, { recursive: true, force: true });
  await extract(job, archive, staging);
  await settle(staging, GO_DIR);
  await fs.rm(archive, { force: true });
  log(`${release.version} ready`);
  return binary;
}

/** The .NET SDK is not downloaded — a C# setup brings it anyway, and the servers need it to run. */
export async function findDotnet(): Promise<string> {
  const candidates = [process.env.DOTNET_ROOT, path.join(os.homedir(), '.dotnet'), '/usr/share/dotnet', '/usr/lib/dotnet', '/usr/local/share/dotnet', 'C:\\Program Files\\dotnet'];
  for (const dir of candidates) {
    if (!dir) {
      continue;
    }
    const file = path.join(dir, `dotnet${EXE}`);
    if (await exists(file)) {
      return file;
    }
  }
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const file = path.join(dir, `dotnet${EXE}`);
    if (await exists(file)) {
      return file;
    }
  }
  throw new Error('The .NET SDK is required for this server (https://dotnet.microsoft.com/download)');
}

/** The launcher prefix for a program that needs a runtime of its own. */
export async function runtimeFor(job: Job, log: Log, runtime: 'python' | 'node' | undefined): Promise<{ command: string[]; env: Record<string, string>; }> {
  if (runtime === 'node') {
    return { command: [await ensureNode(job, log)], env: {} };
  }
  if (runtime === 'python') {
    const uv = await ensureUv(job, log);
    const env = uvEnvironment();
    await run(job, log, uv, ['python', 'install', DEFAULT_PYTHON], { env });
    return { command: [uv, 'run', '--no-project', '--python', DEFAULT_PYTHON, '--', 'python'], env };
  }
  return { command: [], env: {} };
}
