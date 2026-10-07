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
import fsSync from 'node:fs';
import os from 'node:os';
import { withManagedPath } from '../../lsp-packages/tools/managed-path';
import { connectWithRetry, freePort } from './connections';
import { drainFrames, frame } from './framing';
import { AdapterHandle, DapEvents, DapStartOptions } from './types';

export const adapters = new Map<string, AdapterHandle>();

function spawnAdapter(command: string, args: string[], cwd: string | undefined, env: Record<string, string>) {
  const workdir = cwd && fsSync.existsSync(cwd) ? cwd : os.homedir();
  return spawn(command, args, {
    cwd: workdir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: withManagedPath({ ...process.env, ...env }),
    shell: process.platform === 'win32',
    windowsHide: true,
  });
}

/** TCP adapters get the given port, a free one when Lumen starts the adapter itself, or none yet. */
async function adapterPort(options: DapStartOptions, host: string): Promise<number | undefined> {
  if (options.transport !== 'tcp') {
    return undefined;
  }
  if (options.port !== undefined && options.port !== null) {
    return options.port;
  }
  if (options.command) {
    return freePort(host);
  }
  return 0;
}

/** Starts or connects an adapter. Returns the port used (TCP). */
export async function startAdapter(id: string, options: DapStartOptions, events: DapEvents): Promise<{ port?: number; }> {
  stopAdapter(id);
  const handle: AdapterHandle = { child: null, socket: null, buffer: Buffer.alloc(0), closed: false };
  adapters.set(id, handle);

  const close = (reason: string) => {
    if (handle.closed) {
      return;
    }
    handle.closed = true;
    if (adapters.get(id) === handle) {
      adapters.delete(id);
    }
    handle.socket?.destroy();
    if (handle.child && handle.child.exitCode === null) {
      killChild(handle.child);
    }
    events.closed(id, reason);
  };

  const onData = (chunk: Buffer) => {
    handle.buffer = drainFrames(Buffer.concat([handle.buffer, chunk]), (message) => events.message(id, message));
  };

  const host = options.host ?? '127.0.0.1';
  const port = await adapterPort(options, host);
  const substitute = (value: string) => value.replace(/\$\{port\}/g, String(port ?? '')).replace(/\$\{host\}/g, host);

  let exitReason: string | null = null;
  if (options.command) {
    const child = spawnAdapter(options.command, (options.args ?? []).map(substitute), options.cwd, options.env ?? {});
    handle.child = child;
    child.stderr?.on('data', (chunk: Buffer) => events.output(id, 'stderr', chunk.toString()));
    child.on('error', (err) => {
      exitReason = err.message;
      close(err.message);
    });
    child.on('close', (code, signal) => {
      // A clean end with no reason — the renderer then reports no crash.
      exitReason = code === 0 ? '' : `beendet (Code ${code ?? signal})`;
      close(exitReason);
    });
    if (options.transport === 'stdio') {
      child.stdout?.on('data', onData);
      return {};
    }
    // TCP adapters write nothing but log lines to stdout.
    child.stdout?.on('data', (chunk: Buffer) => events.output(id, 'stdout', chunk.toString()));
  }

  if (!port) {
    close('No port given');
    throw new Error('No port given');
  }

  try {
    const socket = await connectWithRetry(host, port, options.connectTimeout ?? 15_000, () => {
      if (handle.closed) {
        return exitReason || 'Adapter beendet';
      }
      return null;
    });
    if (handle.closed) {
      socket.destroy();
      throw new Error(exitReason || 'Adapter beendet');
    }
    handle.socket = socket;
    socket.on('data', onData);
    socket.on('error', (err) => close(err.message));
    socket.on('close', (hadError) => close(hadError ? 'Verbindung getrennt' : ''));
    return { port };
  } catch (err) {
    close((err as Error).message);
    throw err;
  }
}

export function sendAdapter(id: string, message: unknown): boolean {
  const handle = adapters.get(id);
  if (!handle || handle.closed) {
    return false;
  }
  const data = frame(message);
  if (handle.socket) {
    handle.socket.write(data);
    return true;
  }
  if (!handle.child?.stdin?.writable) {
    return false;
  }
  handle.child.stdin.write(data);
  return true;
}

function killChild(child: ChildProcess) {
  child.stdin?.end();
  child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }, 2000);
  timer.unref();
}

export function stopAdapter(id: string) {
  const handle = adapters.get(id);
  if (!handle) {
    return;
  }
  adapters.delete(id);
  handle.closed = true;
  handle.socket?.end();
  handle.socket?.destroy();
  if (handle.child && handle.child.exitCode === null) {
    killChild(handle.child);
  }
}
