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
import path from 'node:path';
import { ShellProfile } from './types';

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

export function which(name: string): string | null {
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
