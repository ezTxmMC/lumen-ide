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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withManagedPath } from '../features/lsp-packages/tools/managed-path';
import { cleanEnv } from './session';
import { which } from './shells';
import { ExternalTerminal } from './types';

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
    env: withManagedPath(cleanEnv(process.env)),
  });
  child.unref();
  return spec.label;
}
