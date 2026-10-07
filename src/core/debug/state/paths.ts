/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Path helpers for the debugger — treating Windows and Unix paths alike. */

/** Normalise the slashes, lower-case the drive letter. */
export function normalizePath(value: string): string {
  const slashed = value.replace(/\\/g, '/').replace(/\/+$/, '');
  if (/^[A-Za-z]:\//.test(slashed)) {
    return slashed[0].toLowerCase() + slashed.slice(1);
  }
  return slashed;
}

export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  return normalizePath(a) === normalizePath(b);
}

/** The path relative to the workspace folder, using `/`; otherwise unchanged. */
export function toRelative(root: string, target: string): string {
  const base = `${normalizePath(root)}/`;
  const normalized = normalizePath(target);
  if (normalized.startsWith(base)) {
    return normalized.slice(base.length);
  }
  return target;
}

export function toAbsolute(root: string, target: string): string {
  if (/^([A-Za-z]:[\\/]|[\\/])/.test(target)) {
    return target;
  }
  return `${root.replace(/[\\/]$/, '')}/${target}`;
}

export function joinPath(root: string, relative: string): string {
  return `${root.replace(/[\\/]$/, '')}/${relative.replace(/^[\\/]/, '')}`;
}

export function baseName(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}

export function pathToUri(value: string): string {
  const slashed = value.replace(/\\/g, '/');
  const prefixed = slashed.startsWith('/') ? slashed : `/${slashed}`;
  return `file://${prefixed.split('/').map((part) => encodeURIComponent(part).replace(/%3A/g, ':')).join('/')}`;
}
