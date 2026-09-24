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
 * The built-in terminals (node-pty) and the opening of external terminal
 * programs.
 *
 * node-pty is loaded only with the first terminal: where the native module is
 * missing (not built for Electron), the rest of the IDE stays usable and the
 * renderer gets an error message it can make sense of.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WebContents } from 'electron';

type IPty = {
  pid: number;
  onData(cb: (data: string) => void): { dispose(): void; };
  onExit(cb: (e: { exitCode: number; signal?: number; }) => void): { dispose(): void; };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
};

type PtyModule = {
  spawn(file: string, args: string[], options: {
    name: string; cols: number; rows: number; cwd: string; env: Record<string, string>;
  }): IPty;
};

export interface ShellProfile {
  id: string;
  label: string;
  path: string;
  args: string[];
  /** The user's default shell ($SHELL, or PowerShell under Windows). */
  isDefault?: boolean;
}

export interface ExternalTerminal {
  id: string;
  label: string;
  command: string;
}

export interface TerminalOptions {
  shell?: string;
  args?: string[];
  cwd?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

const require = createRequire(import.meta.url);
let ptyModule: PtyModule | null = null;
let ptyError: string | null = null;

function loadPty(): PtyModule {
  if (ptyModule) {
    return ptyModule;
  }
  if (ptyError) {
    throw new Error(ptyError);
  }
  try {
    ptyModule = require('node-pty') as PtyModule;
    return ptyModule;
  } catch (err) {
    ptyError = `node-pty could not be loaded (${(err as Error).message.split('\n')[0]}). ` +
      'Rebuild it for Electron with "npm run rebuild:native".';
    throw new Error(ptyError);
  }
}

/* ------------------------------------------------------------------ *
 * Shells
 * ------------------------------------------------------------------ */

const SHELL_LABELS: Record<string, string> = {
  bash: 'Bash', zsh: 'Zsh', fish: 'Fish', sh: 'sh', dash: 'Dash', ksh: 'KornShell', tcsh: 'tcsh',
  nu: 'Nushell', pwsh: 'PowerShell', 'pwsh.exe': 'PowerShell', 'powershell.exe': 'Windows PowerShell',
  'cmd.exe': 'Eingabeaufforderung', elvish: 'Elvish', xonsh: 'xonsh',
};

/** Shells that are no good as interactive terminals. */
const NOT_INTERACTIVE = new Set(['git-shell', 'nologin', 'false', 'rbash', 'systemd-home-fallback-shell']);

function executable(file: string) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function which(name: string): string | null {
  const dirs = (process.env.PATH ?? '').split(path.delimiter);
  const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, name + ext);
      if (executable(full)) {
        return full;
      }
    }
  }
  return null;
}

export function detectShells(): ShellProfile[] {
  if (process.platform === 'win32') {
    return windowsShells();
  }

  const candidates: string[] = [];
  try {
    candidates.push(...fs.readFileSync('/etc/shells', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('/')));
  } catch {
    // /etc/shells is missing (some containers) — then the PATH alone.
  }
  for (const name of ['bash', 'zsh', 'fish', 'nu', 'pwsh', 'sh']) {
    const hit = which(name);
    if (hit) {
      candidates.push(hit);
    }
  }

  const userShell = process.env.SHELL;
  const byName = new Map<string, ShellProfile>();
  // The user's shell first, so that its path wins.
  for (const file of [userShell, ...candidates]) {
    if (!file || !executable(file)) {
      continue;
    }
    const name = path.basename(file);
    if (NOT_INTERACTIVE.has(name) || byName.has(name)) {
      continue;
    }
    byName.set(name, {
      id: name,
      label: SHELL_LABELS[name] ?? name,
      path: file,
      args: loginArgs(name),
      isDefault: file === userShell,
    });
  }
  const shells = [...byName.values()];
  if (!shells.some((s) => s.isDefault) && shells[0]) {
    shells[0].isDefault = true;
  }
  return shells;
}

/** A login shell, so that PATH additions from .profile/.zprofile take effect (as in macOS Terminal and IntelliJ). */
function loginArgs(name: string): string[] {
  if (['bash', 'zsh', 'sh', 'ksh', 'dash'].includes(name)) {
    return ['-l'];
  }
  if (name === 'fish') {
    return ['--login'];
  }
  if (name === 'pwsh') {
    return ['-NoLogo'];
  }
  return [];
}

function windowsShells(): ShellProfile[] {
  const shells: ShellProfile[] = [];
  const add = (id: string, label: string, file: string | null, args: string[] = []) => {
    if (!file) {
      return;
    }
    shells.push({ id, label, path: file, args });
  };
  add('pwsh', 'PowerShell', which('pwsh'), ['-NoLogo']);
  add('powershell', 'Windows PowerShell', which('powershell'), ['-NoLogo']);
  add('cmd', 'Eingabeaufforderung', process.env.ComSpec ?? which('cmd'));
  const gitBash = ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe'].find(executable);
  add('gitbash', 'Git Bash', gitBash ?? null, ['--login', '-i']);
  add('wsl', 'WSL', which('wsl'));
  if (shells[0]) {
    shells[0].isDefault = true;
  }
  return shells;
}

/* ------------------------------------------------------------------ *
 * External terminal programs
 * ------------------------------------------------------------------ */

interface TerminalSpec {
  id: string;
  label: string;
  command: string;
  /** The arguments for starting in the folder `cwd`. */
  args: (cwd: string) => string[];
}

const LINUX_TERMINALS: TerminalSpec[] = [
  { id: 'ghostty', label: 'Ghostty', command: 'ghostty', args: (cwd) => [`--working-directory=${cwd}`] },
  { id: 'kitty', label: 'kitty', command: 'kitty', args: (cwd) => ['--directory', cwd] },
  { id: 'wezterm', label: 'WezTerm', command: 'wezterm', args: (cwd) => ['start', '--cwd', cwd] },
  { id: 'alacritty', label: 'Alacritty', command: 'alacritty', args: (cwd) => ['--working-directory', cwd] },
  { id: 'foot', label: 'foot', command: 'foot', args: (cwd) => [`--working-directory=${cwd}`] },
  { id: 'konsole', label: 'Konsole', command: 'konsole', args: (cwd) => ['--workdir', cwd] },
  { id: 'gnome-terminal', label: 'GNOME Terminal', command: 'gnome-terminal', args: (cwd) => [`--working-directory=${cwd}`] },
  { id: 'ptyxis', label: 'Ptyxis', command: 'ptyxis', args: (cwd) => ['--new-window', '--working-directory', cwd] },
  { id: 'kgx', label: 'GNOME Console', command: 'kgx', args: (cwd) => [`--working-directory=${cwd}`] },
  { id: 'xfce4-terminal', label: 'Xfce Terminal', command: 'xfce4-terminal', args: (cwd) => [`--working-directory=${cwd}`] },
  { id: 'tilix', label: 'Tilix', command: 'tilix', args: (cwd) => [`--working-directory=${cwd}`] },
  { id: 'terminator', label: 'Terminator', command: 'terminator', args: (cwd) => [`--working-directory=${cwd}`] },
  { id: 'xterm', label: 'XTerm', command: 'xterm', args: () => [] },
];

function terminalSpecs(): TerminalSpec[] {
  if (process.platform === 'darwin') {
    return [
      { id: 'terminal', label: 'Terminal', command: 'open', args: (cwd) => ['-a', 'Terminal', cwd] },
      { id: 'iterm', label: 'iTerm', command: 'open', args: (cwd) => ['-a', 'iTerm', cwd] },
      { id: 'ghostty', label: 'Ghostty', command: 'open', args: (cwd) => ['-a', 'Ghostty', cwd] },
    ];
  }
  if (process.platform === 'win32') {
    return [
      { id: 'wt', label: 'Windows Terminal', command: 'wt', args: (cwd) => ['-d', cwd] },
      { id: 'cmd', label: 'Eingabeaufforderung', command: 'cmd', args: () => ['/c', 'start', 'cmd'] },
    ];
  }
  return LINUX_TERMINALS;
}

export function detectExternalTerminals(): ExternalTerminal[] {
  const found = terminalSpecs().filter((t) => {
    if (process.platform === 'darwin') {
      return darwinAppExists(t.label);
    }
    if (process.platform === 'win32') {
      return t.id === 'cmd' || Boolean(which(t.command));
    }
    return Boolean(which(t.command));
  });
  // The terminal set in the desktop environment goes to the front.
  const preferred = process.env.TERMINAL;
  found.sort((a, b) => Number(b.command === preferred) - Number(a.command === preferred));
  return found.map(({ id, label, command }) => ({ id, label, command }));
}

function darwinAppExists(label: string) {
  if (label === 'Terminal') {
    return true;
  }
  return [`/Applications/${label}.app`, path.join(os.homedir(), 'Applications', `${label}.app`)].some((p) => fs.existsSync(p));
}

export function openExternalTerminal(cwd: string, terminalId?: string): string {
  const specs = terminalSpecs();
  const available = detectExternalTerminals().map((t) => t.id);
  const spec = specs.find((t) => t.id === terminalId && available.includes(t.id))
    ?? specs.find((t) => available.includes(t.id));
  if (!spec) {
    throw new Error('No terminal program found');
  }
  const child = spawn(spec.command, spec.args(cwd), {
    cwd,
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
    env: cleanEnv(process.env),
  });
  child.unref();
  return spec.label;
}

/* ------------------------------------------------------------------ *
 * The built-in terminals
 * ------------------------------------------------------------------ */

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
function cleanEnv(env: NodeJS.ProcessEnv): Record<string, string> {
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

export function createTerminal(id: string, options: TerminalOptions, contents: WebContents) {
  const key = terminalKey(contents, id);
  killTerminal(key);
  const pty = loadPty();
  const shells = detectShells();
  const shell = shells.find((s) => s.path === options.shell || s.id === options.shell)
    ?? shells.find((s) => s.isDefault)
    ?? shells[0];
  const file = shell?.path ?? options.shell ?? (process.platform === 'win32' ? 'powershell.exe' : '/bin/sh');
  const args = options.args ?? shell?.args ?? [];
  const cwd = options.cwd && fs.existsSync(options.cwd) ? options.cwd : os.homedir();

  const env = {
    ...cleanEnv(process.env),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'Lumen',
    ...(options.env ?? {}),
  };

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
