/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ConsoleKind } from './manager-types';

export const MAX_CONSOLE = 4000;

export const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

export const INLINE_KEY = 'lumen.debug.inlineValues';

export const KIND_BY_CATEGORY: Record<string, ConsoleKind> = {
  stdout: 'stdout',
  stderr: 'stderr',
  console: 'console',
  important: 'important',
};

export function readInlinePreference() {
  try {
    return localStorage.getItem(INLINE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Put environment variables in front of the command (PowerShell, or `env`). */
export function envPrefix(env: [string, string][], platform: string) {
  if (!env.length) {
    return '';
  }
  if (platform === 'win32') {
    return env.map(([key, value]) => `$env:${key}=${quoteArg(value, platform)}; `).join('');
  }
  return `env ${env.map(([key, value]) => `${key}=${quoteArg(value, platform)}`).join(' ')} `;
}

export function quoteArg(arg: string, platform: string) {
  if (/^[\w@%+=:,./-]+$/.test(arg)) {
    return arg;
  }
  if (platform === 'win32') {
    // Backslashes only matter before a quote (or the closing one): double those, then escape the quotes.
    return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
  }
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
