/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WebContents } from 'electron';
import { withManagedPath } from '../features/lsp-packages/tools/managed-path';
import { loadPty } from './pty';
import { detectShells } from './shells';
import { IPty, TerminalOptions } from './types';

interface Session {
  pty: IPty;
  buffer: string;
  timer: NodeJS.Timeout | null;
}

/** Keyed by `terminalKey` — each window numbers its terminals from 1, so the ids alone collide. */
const sessions = new Map<string, Session>();

/** The session key of a window's terminal. */
export function terminalKey(contents: WebContents, id: string) {
  return `${contents.id}:${id}`;
}

/** Remove Electron's own variables — otherwise Node programs in the terminal inherit Electron's mode. */
export function cleanEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      continue;
    }
    if (key.startsWith('ELECTRON_') || key === 'VITE_DEV_SERVER_URL' || key === 'APP_ROOT') {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function fallbackShell() {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }
  if (process.platform === 'darwin') {
    return '/bin/zsh';
  }
  return '/bin/sh';
}

export function createTerminal(id: string, options: TerminalOptions, contents: WebContents) {
  const key = terminalKey(contents, id);
  killTerminal(key);
  const pty = loadPty();
  const shells = detectShells();
  const shell = shells.find((s) => s.path === options.shell || s.id === options.shell)
    ?? shells.find((s) => s.isDefault)
    ?? shells[0];
  const file = shell?.path ?? options.shell ?? fallbackShell();
  const args = options.args ?? shell?.args ?? [];
  const cwd = options.cwd && fs.existsSync(options.cwd) ? options.cwd : os.homedir();

  const env = withManagedPath({
    ...cleanEnv(process.env),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'Lumen',
    // Started from the Dock there is no locale: without one, shells garble non-ASCII text.
    ...(process.platform === 'darwin' && !process.env.LANG ? { LANG: 'en_US.UTF-8' } : {}),
    ...(options.env ?? {}),
  });

  const instance = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: Math.max(2, Math.floor(options.cols)),
    rows: Math.max(1, Math.floor(options.rows)),
    cwd,
    env,
  });
  const session: Session = { pty: instance, buffer: '', timer: null };
  sessions.set(key, session);

  // Batch the output: many small IPC messages slow things down with `cat` on a large file, say.
  instance.onData((data) => {
    session.buffer += data;
    if (session.timer) {
      return;
    }
    session.timer = setTimeout(() => {
      session.timer = null;
      const chunk = session.buffer;
      session.buffer = '';
      if (!contents.isDestroyed()) {
        contents.send('terminal:data', { id, data: chunk });
      }
    }, 6);
  });
  instance.onExit(({ exitCode, signal }) => {
    if (session.timer) {
      clearTimeout(session.timer);
    }
    if (session.buffer && !contents.isDestroyed()) {
      contents.send('terminal:data', { id, data: session.buffer });
    }
    if (sessions.get(key) === session) {
      sessions.delete(key);
    }
    if (!contents.isDestroyed()) {
      contents.send('terminal:exit', { id, code: exitCode, signal: signal ?? null });
    }
  });

  return { pid: instance.pid, shell: shell?.label ?? path.basename(file), cwd };
}

export function writeTerminal(key: string, data: string) {
  sessions.get(key)?.pty.write(data);
}

export function resizeTerminal(key: string, cols: number, rows: number) {
  const session = sessions.get(key);
  if (!session) {
    return;
  }
  try {
    session.pty.resize(Math.max(2, Math.floor(cols)), Math.max(1, Math.floor(rows)));
  } catch {
    // The process has just ended.
  }
}

export function killTerminal(key: string) {
  const session = sessions.get(key);
  if (!session) {
    return;
  }
  sessions.delete(key);
  if (session.timer) {
    clearTimeout(session.timer);
  }
  try {
    session.pty.kill();
  } catch {
    // Already ended.
  }
}

export function killAllTerminals() {
  for (const key of [...sessions.keys()]) {
    killTerminal(key);
  }
}

/** The terminals of one window — when it closes or reloads. */
export function killTerminalsOf(contentsId: number) {
  const prefix = `${contentsId}:`;
  for (const key of [...sessions.keys()]) {
    if (key.startsWith(prefix)) {
      killTerminal(key);
    }
  }
}
