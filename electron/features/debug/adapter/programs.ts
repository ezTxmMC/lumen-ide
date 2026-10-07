/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DapProgram } from './types';

const expandHome = (value: string) => value.replace(/^~(?=[\\/]|$)/, os.homedir());

const isPathLike = (value: string) => path.isAbsolute(value) || value.includes('/') || value.includes('\\');

/** Resolve segments with `*`, the newest version (lexically the greatest) first. */
export async function globPaths(pattern: string): Promise<string[]> {
  const expanded = expandHome(pattern).replace(/\\/g, '/');
  if (!expanded.includes('*')) {
    return fs.access(expanded).then(() => [expanded], () => []);
  }
  const parts = expanded.split('/');
  let bases = [parts[0] === '' ? '/' : parts[0]];
  for (const part of parts.slice(1)) {
    if (!part) {
      continue;
    }
    const next: string[] = [];
    for (const base of bases) {
      if (!part.includes('*')) {
        next.push(path.posix.join(base, part));
        continue;
      }
      const regex = new RegExp(`^${part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      const entries = await fs.readdir(base).catch(() => [] as string[]);
      const hits = entries.filter((name) => regex.test(name));
      hits.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
      for (const name of hits) {
        next.push(path.posix.join(base, name));
      }
    }
    bases = next;
    if (!bases.length) {
      return [];
    }
  }
  const existing: string[] = [];
  for (const candidate of bases) {
    if (await fs.access(candidate).then(() => true, () => false)) {
      existing.push(candidate);
    }
  }
  return existing;
}

function which(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [command], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    probe.on('error', () => resolve(false));
    probe.on('close', (code) => resolve(code === 0));
  });
}

function probeRuns(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', shell: process.platform === 'win32' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, 8000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/** The runtime for script files. */
const RUNTIMES: Record<string, (file: string) => DapProgram> = {
  '.js': (file) => ({ command: 'node', args: [file] }),
  '.mjs': (file) => ({ command: 'node', args: [file] }),
  '.cjs': (file) => ({ command: 'node', args: [file] }),
  '.py': (file) => ({ command: process.platform === 'win32' ? 'python' : 'python3', args: [file] }),
  '.jar': (file) => ({ command: 'java', args: ['-jar', file] }),
};

async function resolveOne(program: DapProgram): Promise<DapProgram | null> {
  const args = program.args ?? [];
  const command = expandHome(program.command);
  if (isPathLike(command)) {
    const [hit] = await globPaths(command);
    if (!hit) {
      return null;
    }
    const runtime = RUNTIMES[path.extname(hit).toLowerCase()];
    const stat = await fs.stat(hit).catch(() => null);
    // Start a folder with a __main__.py (debugpy/adapter, say) through Python.
    if (stat?.isDirectory() && fsSync.existsSync(path.join(hit, '__main__.py'))) {
      const python = process.platform === 'win32' ? 'python' : 'python3';
      if (!(await which(python))) {
        return null;
      }
      return { command: python, args: [hit, ...args] };
    }
    if (!stat || stat.isDirectory()) {
      return null;
    }
    if (runtime) {
      const base = runtime(hit);
      if (!(await which(base.command))) {
        return null;
      }
      return { command: base.command, args: [...(base.args ?? []), ...args] };
    }
    const executable = process.platform === 'win32'
      || await fs.access(hit, fsSync.constants.X_OK).then(() => true, () => false);
    if (!executable) {
      return null;
    }
    if (program.probe && !(await probeRuns(hit, program.probe))) {
      return null;
    }
    return { command: hit, args };
  }
  if (!(await which(command))) {
    return null;
  }
  if (program.probe && !(await probeRuns(command, program.probe))) {
    return null;
  }
  return { command, args };
}

/** The first call that works. */
export async function resolveProgram(programs: DapProgram[]): Promise<DapProgram | null> {
  for (const program of programs) {
    const hit = await resolveOne(program).catch(() => null);
    if (hit) {
      return hit;
    }
  }
  return null;
}
