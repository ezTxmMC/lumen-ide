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
 * Installing through the system — package managers and install commands,
 * with root rights where they need them.
 *
 * Two kinds of request come from the renderer:
 *
 *   packages  a manager id and package names. The command is built here
 *             (`package-managers.ts`), so nothing but a well-formed install
 *             invocation of a known manager ever runs as root.
 *   command   a command line the user saw — and possibly edited — in the
 *             install dialog and confirmed there. It runs through the shell;
 *             a leading `sudo` is taken off and replaced by Lumen's own
 *             elevation.
 *
 * Root rights come from `sudo`. When sudo works without a password it is used
 * straight away (`sudo -n`); otherwise the call answers `needsPassword` and
 * the renderer asks for the password in its own dialog. The password travels
 * once to `sudo -S` on stdin — `-k` makes sudo read it even with cached
 * credentials, so it can never spill into the stdin of the command itself. It
 * is neither logged nor stored; a wrong one answers `wrongPassword`.
 * `pkexec` (the desktop's own authentication dialog) is offered as an
 * alternative where it is installed.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PACKAGE_MANAGERS, candidateManagers, commandNeedsRoot, formatInvocation, installInvocation,
  isPackageManager, isWrongPassword, managerForDistro, parseOsRelease, stripElevation,
  type InstallInvocation, type PackageManagerId,
} from './package-managers';

export interface SystemInfo {
  platform: NodeJS.Platform;
  /** The Linux distribution, where one could be read. */
  distro?: { id: string; name: string; };
  /** Managers present on this machine, the system's own first. */
  managers: PackageManagerId[];
  /** Lumen itself runs as root — no elevation needed. */
  isRoot: boolean;
  sudo: boolean;
  pkexec: boolean;
}

export type ElevationMethod = 'sudo' | 'pkexec';

export type PrivilegedRequest =
  | { kind: 'packages'; manager: PackageManagerId; packages: string[]; password?: string; method?: ElevationMethod; }
  | { kind: 'command'; command: string; confirmed: boolean; password?: string; method?: ElevationMethod; };

export interface PrivilegedResult {
  ok: boolean;
  code: number | null;
  /** Root is needed and sudo wants a password — ask and call again with it. */
  needsPassword?: boolean;
  /** The password given was wrong. */
  wrongPassword?: boolean;
  cancelled?: boolean;
  message?: string;
}

const IS_WINDOWS = process.platform === 'win32';

/* ------------------------------------------------------------------ *
 * Detection
 * ------------------------------------------------------------------ */

/** The program on the PATH, or null. */
async function which(program: string): Promise<string | null> {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  // A desktop launcher often passes a short PATH; Homebrew and the usual sbin folders come along.
  const extra = IS_WINDOWS ? [] : ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin', '/opt/homebrew/bin', '/home/linuxbrew/.linuxbrew/bin'];
  const names = IS_WINDOWS ? [`${program}.exe`, `${program}.cmd`, `${program}.bat`] : [program];
  for (const dir of [...dirs, ...extra]) {
    for (const name of names) {
      const file = path.join(dir, name);
      const found = await fs.access(file).then(() => true, () => false);
      if (found) {
        return file;
      }
    }
  }
  return null;
}

let systemInfo: Promise<SystemInfo> | null = null;

async function detect(): Promise<SystemInfo> {
  const release = process.platform === 'linux'
    ? await fs.readFile('/etc/os-release', 'utf8').then(parseOsRelease, () => null)
    : null;
  const preferred = release ? managerForDistro(release) : null;
  const candidates = candidateManagers(process.platform, preferred);
  const present = await Promise.all(candidates.map(async (id) => ((await which(PACKAGE_MANAGERS[id].binary)) ? id : null)));
  const [sudo, pkexec] = await Promise.all([which('sudo'), which('pkexec')]);
  return {
    platform: process.platform,
    distro: release ? { id: release.id, name: release.name } : undefined,
    managers: present.filter((id): id is PackageManagerId => id !== null),
    isRoot: typeof process.getuid === 'function' && process.getuid() === 0,
    sudo: Boolean(sudo),
    pkexec: Boolean(pkexec) && process.platform === 'linux',
  };
}

function system(): Promise<SystemInfo> {
  systemInfo ??= detect();
  return systemInfo;
}

/* ------------------------------------------------------------------ *
 * Running
 * ------------------------------------------------------------------ */

interface Job {
  child: ChildProcess | null;
  cancelled: boolean;
}

const jobs = new Map<string, Job>();

/** What a request asks to run, before elevation. */
function plan(request: PrivilegedRequest): InstallInvocation {
  if (request.kind === 'packages') {
    if (!isPackageManager(request.manager)) {
      throw new Error(`Unknown package manager: ${request.manager}`);
    }
    if (!Array.isArray(request.packages)) {
      throw new Error('No package given');
    }
    return installInvocation(request.manager, request.packages.map(String));
  }
  if (request.kind !== 'command') {
    throw new Error('Unknown request');
  }
  if (request.confirmed !== true) {
    throw new Error('The command has not been confirmed');
  }
  const command = stripElevation(String(request.command ?? ''));
  if (!command) {
    throw new Error('No command given');
  }
  const argv = IS_WINDOWS ? ['cmd.exe', '/d', '/s', '/c', command] : ['/bin/sh', '-c', command];
  return { argv, env: {}, root: !IS_WINDOWS && commandNeedsRoot(String(request.command)) };
}

/** `env NAME=value` in front, since sudo and pkexec reset the environment. */
function withEnv(invocation: InstallInvocation): string[] {
  const pairs = Object.entries(invocation.env).map(([key, value]) => `${key}=${value}`);
  if (!pairs.length) {
    return invocation.argv;
  }
  return ['env', ...pairs, ...invocation.argv];
}

/** Exit code 0 of `sudo -n true`: sudo works without a password right now. */
function sudoWithoutPassword(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('sudo', ['-n', 'true'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

interface Launch {
  argv: string[];
  /** Written to stdin, then stdin is closed. */
  stdin?: string;
  /** Shown in the log instead of `argv`. */
  display: string;
}

async function launchFor(invocation: InstallInvocation, request: PrivilegedRequest, info: SystemInfo): Promise<Launch | 'needsPassword'> {
  const display = formatInvocation(invocation, false);
  if (!invocation.root || info.isRoot || IS_WINDOWS) {
    return { argv: [...invocation.argv], display };
  }
  const elevated = formatInvocation(invocation, true);
  if (request.method === 'pkexec' && info.pkexec) {
    return { argv: ['pkexec', ...withEnv(invocation)], display: `pkexec ${display}` };
  }
  if (!info.sudo) {
    throw new Error('Root rights are needed, but neither sudo nor pkexec is installed');
  }
  if (typeof request.password === 'string' && request.password) {
    return { argv: ['sudo', '-S', '-k', '-p', '', ...withEnv(invocation)], stdin: `${request.password}\n`, display: elevated };
  }
  if (await sudoWithoutPassword()) {
    return { argv: ['sudo', '-n', ...withEnv(invocation)], display: elevated };
  }
  return 'needsPassword';
}

async function run(jobId: string, request: PrivilegedRequest, getWindow: () => BrowserWindow | null): Promise<PrivilegedResult> {
  const info = await system();
  const invocation = plan(request);
  const launch = await launchFor(invocation, request, info);
  if (launch === 'needsPassword') {
    return { ok: false, code: null, needsPassword: true };
  }

  const log = (text: string) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    win.webContents.send('privileged:log', { jobId, text });
  };
  log(`$ ${launch.display}`);

  const job: Job = { child: null, cancelled: false };
  jobs.set(jobId, job);
  return new Promise<PrivilegedResult>((resolve) => {
    const child = spawn(launch.argv[0], launch.argv.slice(1), {
      env: { ...process.env, ...invocation.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    job.child = child;
    // The password goes in once and stdin closes: the command itself reads EOF.
    child.stdin?.end(launch.stdin ?? '');
    let head = '';
    const forward = (chunk: Buffer) => {
      const text = chunk.toString();
      head = head.length < 4000 ? head + text : head;
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) {
          continue;
        }
        log(line);
      }
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    child.on('error', (err) => {
      jobs.delete(jobId);
      resolve({ ok: false, code: null, message: err.message });
    });
    child.on('close', (code) => {
      jobs.delete(jobId);
      if (job.cancelled) {
        resolve({ ok: false, code, cancelled: true });
        return;
      }
      if (code === 0) {
        resolve({ ok: true, code });
        return;
      }
      const wrongPassword = Boolean(launch.stdin) && isWrongPassword(head);
      resolve({ ok: false, code, wrongPassword, message: `${path.basename(launch.argv[0])} exited with code ${code}` });
    });
  });
}

function cancel(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) {
    return false;
  }
  job.cancelled = true;
  job.child?.kill('SIGTERM');
  return true;
}

export function registerPrivilegedIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('privileged:system', () => system());
  // The log goes to the window that asked.
  ipcMain.handle('privileged:run', (e, jobId: string, request: PrivilegedRequest) =>
    run(String(jobId), request, () => BrowserWindow.fromWebContents(e.sender) ?? getWindow()));
  ipcMain.handle('privileged:cancel', (_e, jobId: string) => cancel(String(jobId)));
}
