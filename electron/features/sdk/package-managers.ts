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
 * System package managers — which one a machine has, and how an install
 * command for it looks.
 *
 * Pure functions, no Electron and no Node: the main process builds the
 * commands it runs from these, the renderer shows the same commands as a
 * preview, and `npm run check:lsp` tests them. A command is always built from
 * a manager id and package names — never taken as a string from outside —
 * so the process that runs with root rights only ever sees an install
 * invocation it put together itself.
 */

export type PackageManagerId =
  | 'pacman' | 'apt' | 'dnf' | 'zypper' | 'apk' | 'xbps' | 'emerge'
  | 'brew' | 'winget' | 'scoop' | 'choco';

interface ManagerSpec {
  label: string;
  /** The program probed on the PATH. */
  binary: string;
  platform: 'linux' | 'darwin' | 'win32';
  /** Installing needs administrator rights. */
  root: boolean;
  /** The arguments after the program, for the given packages. */
  args(packages: string[]): string[];
  /** Environment that keeps the manager from asking questions. */
  env?: Record<string, string>;
  /** Only one package per invocation. */
  single?: boolean;
}

export const PACKAGE_MANAGERS: Record<PackageManagerId, ManagerSpec> = {
  pacman: { label: 'pacman', binary: 'pacman', platform: 'linux', root: true, args: (p) => ['-S', '--noconfirm', '--needed', ...p] },
  apt: {
    label: 'APT', binary: 'apt-get', platform: 'linux', root: true,
    args: (p) => ['install', '-y', ...p],
    env: { DEBIAN_FRONTEND: 'noninteractive' },
  },
  dnf: { label: 'DNF', binary: 'dnf', platform: 'linux', root: true, args: (p) => ['install', '-y', ...p] },
  zypper: { label: 'zypper', binary: 'zypper', platform: 'linux', root: true, args: (p) => ['--non-interactive', 'install', ...p] },
  apk: { label: 'apk', binary: 'apk', platform: 'linux', root: true, args: (p) => ['add', '--no-cache', ...p] },
  xbps: { label: 'XBPS', binary: 'xbps-install', platform: 'linux', root: true, args: (p) => ['-Sy', ...p] },
  emerge: { label: 'Portage', binary: 'emerge', platform: 'linux', root: true, args: (p) => ['--ask=n', '--noreplace', ...p] },
  brew: { label: 'Homebrew', binary: 'brew', platform: 'darwin', root: false, args: (p) => ['install', ...p], env: { HOMEBREW_NO_AUTO_UPDATE: '1' } },
  winget: {
    label: 'winget', binary: 'winget', platform: 'win32', root: false, single: true,
    args: (p) => ['install', '--id', p[0], '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements'],
  },
  scoop: { label: 'Scoop', binary: 'scoop', platform: 'win32', root: false, args: (p) => ['install', ...p] },
  choco: { label: 'Chocolatey', binary: 'choco', platform: 'win32', root: false, args: (p) => ['install', '-y', ...p] },
};

export const PACKAGE_MANAGER_IDS = Object.keys(PACKAGE_MANAGERS) as PackageManagerId[];

export function isPackageManager(value: unknown): value is PackageManagerId {
  return typeof value === 'string' && Object.hasOwn(PACKAGE_MANAGERS, value);
}

/** Package names as package managers write them: `clang`, `python3-pylsp`, `LLVM.LLVM`, `homebrew/core/llvm`. */
const PACKAGE_NAME = /^[A-Za-z0-9][\w.+@:/-]{0,127}$/;

export function isValidPackageName(name: string): boolean {
  return PACKAGE_NAME.test(name) && !name.includes('..');
}

/** `"clang  llvm"` → `['clang', 'llvm']`; throws on a name no manager would accept. */
export function splitPackages(text: string): string[] {
  const names = text.trim().split(/\s+/).filter(Boolean);
  if (!names.length) {
    throw new Error('No package given');
  }
  for (const name of names) {
    if (!isValidPackageName(name)) {
      throw new Error(`Invalid package name: ${name}`);
    }
  }
  return names;
}

export interface InstallInvocation {
  /** Program and arguments, without any elevation in front. */
  argv: string[];
  env: Record<string, string>;
  /** Must run as root. */
  root: boolean;
}

/** The install command of a manager for these packages. */
export function installInvocation(manager: PackageManagerId, packages: string[]): InstallInvocation {
  const spec = PACKAGE_MANAGERS[manager];
  if (!spec) {
    throw new Error(`Unknown package manager: ${manager}`);
  }
  if (!packages.length) {
    throw new Error('No package given');
  }
  for (const name of packages) {
    if (!isValidPackageName(name)) {
      throw new Error(`Invalid package name: ${name}`);
    }
  }
  if (spec.single && packages.length > 1) {
    throw new Error(`${spec.label} installs one package at a time`);
  }
  return { argv: [spec.binary, ...spec.args(packages)], env: { ...(spec.env ?? {}) }, root: spec.root };
}

/** Quote one argument for display — never for execution. */
function displayArg(arg: string): string {
  if (/^[\w@%+=:,./-]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** The command as a line to show, with `sudo` in front where root is needed. */
export function formatInvocation(invocation: InstallInvocation, elevate = invocation.root): string {
  const parts = invocation.argv.map(displayArg);
  if (!elevate) {
    return parts.join(' ');
  }
  return ['sudo', ...parts].join(' ');
}

/* ------------------------------------------------------------------ *
 * Which manager a system has
 * ------------------------------------------------------------------ */

export interface OsRelease {
  id: string;
  idLike: string[];
  name: string;
}

/** Read `/etc/os-release`. */
export function parseOsRelease(text: string): OsRelease {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (!match) {
      continue;
    }
    values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return {
    id: (values.ID ?? '').toLowerCase(),
    idLike: (values.ID_LIKE ?? '').toLowerCase().split(/\s+/).filter(Boolean),
    name: values.PRETTY_NAME ?? values.NAME ?? values.ID ?? '',
  };
}

/** Distribution ids (and the families they name in ID_LIKE) → their manager. */
const DISTRO_MANAGERS: [RegExp, PackageManagerId][] = [
  [/^(arch|manjaro|endeavouros|garuda|cachyos|artix|arcolinux)$/, 'pacman'],
  [/^(debian|ubuntu|linuxmint|pop|elementary|zorin|kali|raspbian|neon)$/, 'apt'],
  [/^(fedora|rhel|centos|rocky|almalinux|ol|nobara|amzn)$/, 'dnf'],
  [/^(opensuse|opensuse-leap|opensuse-tumbleweed|sles|suse)$/, 'zypper'],
  [/^alpine$/, 'apk'],
  [/^void$/, 'xbps'],
  [/^gentoo$/, 'emerge'],
];

/** The manager a Linux distribution uses, judged by `ID` first, then `ID_LIKE`. */
export function managerForDistro(release: OsRelease): PackageManagerId | null {
  for (const id of [release.id, ...release.idLike]) {
    const hit = DISTRO_MANAGERS.find(([pattern]) => pattern.test(id));
    if (hit) {
      return hit[1];
    }
  }
  return null;
}

/** The managers to probe on a platform, the distribution's own first. */
export function candidateManagers(platform: string, preferred: PackageManagerId | null): PackageManagerId[] {
  const own = PACKAGE_MANAGER_IDS.filter((id) => PACKAGE_MANAGERS[id].platform === platform);
  if (!preferred || !own.includes(preferred)) {
    return own;
  }
  return [preferred, ...own.filter((id) => id !== preferred)];
}

/* ------------------------------------------------------------------ *
 * Free-form commands
 * ------------------------------------------------------------------ */

/** Programs that install into the system and therefore need root. */
const ROOT_PROGRAMS = new Set(['pacman', 'apt', 'apt-get', 'aptitude', 'dnf', 'yum', 'zypper', 'apk', 'xbps-install', 'emerge', 'rpm', 'dpkg', 'snap']);

/** Programs that put an elevation in front of a command. */
const ELEVATORS = /^(?:sudo|doas|pkexec)(?:\s+-[A-Za-z]+)*\s+/;

/** Drop a leading `sudo`/`doas`/`pkexec` — Lumen elevates itself where needed. */
export function stripElevation(command: string): string {
  return command.trim().replace(ELEVATORS, '');
}

/** Whether a typed command needs root: an explicit `sudo`, or a system package manager. */
export function commandNeedsRoot(command: string): boolean {
  const text = command.trim();
  if (ELEVATORS.test(text)) {
    return true;
  }
  const program = text.split(/\s+/)[0]?.split('/').pop() ?? '';
  return ROOT_PROGRAMS.has(program);
}

/** sudo's messages for a wrong or missing password. */
const WRONG_PASSWORD = /incorrect password|Sorry, try again|no password was provided|Authentication failure|a password is required/i;

export function isWrongPassword(output: string): boolean {
  return WRONG_PASSWORD.test(output);
}
