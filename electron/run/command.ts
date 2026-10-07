/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { WebContents } from 'electron';
import { withManagedPath } from '../features/lsp-packages/tools/managed-path';
import { scopedId } from '../window/ids';

/** Keyed by `scopedId`; the output goes to `owner` under the renderer's own id. */
export const running = new Map<string, ChildProcess>();

/** Replace `${env:NAME}` with the environment variable. */
function expandEnv(value: string, env: Record<string, string | undefined>) {
  return value.replace(/\$\{env:(\w+)\}/g, (_m, name: string) => env[name] ?? '');
}

export function runCommand(
  owner: WebContents, id: string, command: string, rawArgs: string[], cwd: string,
  env: Record<string, string> = {},
) {
  const key = scopedId(owner, id);
  killCommand(key);
  const merged = withManagedPath({ ...process.env, ...env });
  const args = rawArgs.map((a) => expandEnv(a, merged));
  const child = spawn(expandEnv(command, merged), args, {
    cwd,
    env: withManagedPath({ ...process.env, FORCE_COLOR: '0', ...env }),
    shell: process.platform === 'win32',
  });
  running.set(key, child);

  const post = (channel: string, payload: unknown) => {
    if (!owner.isDestroyed()) {
      owner.send(channel, payload);
    }
  };
  const send = (stream: 'stdout' | 'stderr', data: Buffer) =>
    post('run:data', { id, stream, data: data.toString() });

  child.stdout?.on('data', (d: Buffer) => send('stdout', d));
  child.stderr?.on('data', (d: Buffer) => send('stderr', d));
  // A rerun under the same id replaced this child — its late end must not remove the new one.
  const release = () => { if (running.get(key) === child) {
    running.delete(key);
  } };
  child.stdin?.on('error', () => {});
  child.on('error', (err) => {
    post('run:data', { id, stream: 'stderr', data: `${err.message}\n` });
    release();
    post('run:exit', { id, code: -1 });
  });
  child.on('close', (code) => {
    release();
    post('run:exit', { id, code });
  });
}

export function killCommand(key: string) {
  const child = running.get(key);
  if (!child) {
    return;
  }
  child.kill('SIGTERM');
  running.delete(key);
}
