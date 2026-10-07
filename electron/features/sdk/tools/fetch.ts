/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { net } from 'electron';
import type { Checksum } from './types';
import { compareSemver } from './novus/version';

export const MAX_RELEASES = 14;

export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  if (!/^https:\/\//.test(url)) {
    throw new Error('Only HTTPS addresses are allowed');
  }
  const response = await net.fetch(url, { signal, headers: { 'User-Agent': 'Lumen-IDE', Accept: 'application/json, text/plain, */*' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

export const fetchJson = async <T>(url: string, signal?: AbortSignal) => JSON.parse(await fetchText(url, signal)) as T;

/** The newest version of each `major.minor`, newest first — a list of every patch release boiled down. */
export function latestPerMinor<T extends { version: string; }>(releases: T[], minMajor = 0): T[] {
  const best = new Map<string, T>();
  for (const release of releases) {
    const [major, minor] = release.version.split('.').map(Number);
    if (!Number.isFinite(major) || major < minMajor) {
      continue;
    }
    const key = `${major}.${minor ?? 0}`;
    const known = best.get(key);
    if (!known || compare(release.version, known.version) > 0) {
      best.set(key, release);
    }
  }
  return [...best.values()].sort((a, b) => compare(b.version, a.version)).slice(0, MAX_RELEASES);
}

export function compare(a: string, b: string): number {
  // A pre-release (`0.1.0-pre.alpha.8`) ranks below its release and its identifiers count.
  if (a.includes('-') || b.includes('-')) {
    return compareSemver(a, b);
  }
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export const pick = <T>(table: Record<string, T>, key: string): T | undefined => table[key];

/** The hash a download should have: stated in the release, or looked up in its list of checksums. */
export async function expectedChecksum(checksum: Checksum | undefined, signal: AbortSignal): Promise<string> {
  if (!checksum) {
    return '';
  }
  if (checksum.value) {
    return checksum.value.toLowerCase();
  }
  if (!checksum.url) {
    return '';
  }
  const text = await fetchText(checksum.url, signal);
  const hex = checksum.type === 'sha512' ? /\b[0-9a-f]{128}\b/i : /\b[0-9a-f]{64}\b/i;
  const line = checksum.file ? text.split('\n').find((entry) => entry.includes(checksum.file!)) ?? '' : text;
  return hex.exec(line)?.[0].toLowerCase() ?? '';
}
