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
 * Comparing the version strings of the Minecraft world — `1.21.11`, `26.2`,
 * `47.4.23`, `21.1.250-beta`, `0.116.17+1.21.1`, `26.2.build.128-stable`.
 *
 * Versions are split into tokens at `. - + _`; numbers compare as numbers,
 * a number beats a word, and a pre-release word (`alpha`, `beta`, `rc` …)
 * sorts below the version without it (`1.0-beta` < `1.0`). Pure.
 */

const PRERELEASE: Record<string, number> = {
  dev: 1, snapshot: 2, alpha: 3, a: 3, beta: 4, b: 4, pre: 5, rc: 6, experimental: 2,
};

type Token = number | string;

function tokens(version: string): Token[] {
  return version
    .toLowerCase()
    .split(/[.\-+_]/)
    .flatMap((part) => part.match(/\d+|[a-z]+/g) ?? [])
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

const isPrerelease = (token: Token) => typeof token === 'string' && token in PRERELEASE;

function compareTokens(a: Token, b: Token): number {
  if (typeof a === 'number' && typeof b === 'number') { return a - b; }
  if (typeof a === 'number') { return 1; }
  if (typeof b === 'number') { return -1; }
  const rank = (PRERELEASE[a] ?? 10) - (PRERELEASE[b] ?? 10);
  if (rank !== 0) { return rank; }
  return a.localeCompare(b);
}

/** Negative when `a` is older than `b`, positive when newer, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
    const x = ta[i];
    const y = tb[i];
    if (x === undefined) { return isPrerelease(y) ? 1 : -1; }
    if (y === undefined) { return isPrerelease(x) ? -1 : 1; }
    const diff = compareTokens(x, y);
    if (diff !== 0) { return diff; }
  }
  return 0;
}

/** Unique, newest first. */
export function sortVersions(versions: Iterable<string>): string[] {
  return [...new Set(versions)].sort((a, b) => compareVersions(b, a));
}

/** `1.21.11` → [1, 21, 11]; `26.2` → [26, 2, 0]; a snapshot suffix is ignored. */
export function mcParts(mc: string): [number, number, number] {
  const core = mc.split('-')[0];
  const [major = 0, minor = 0, patch = 0] = core.split('.').map((part) => Number.parseInt(part, 10) || 0);
  return [major, minor, patch];
}

/** Is `mc` this version or newer? Compares release numbers only. */
export function mcAtLeast(mc: string, minimum: string): boolean {
  const a = mcParts(mc);
  const b = mcParts(minimum);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) { return a[i] > b[i]; }
  }
  return true;
}

/** Between two versions, both included. */
export function mcBetween(mc: string, from: string, to: string): boolean {
  return mcAtLeast(mc, from) && mcAtLeast(to, mc);
}

/** A full release (`1.21.1`, `26.2`) — no snapshot, pre-release or candidate. */
export function isRelease(id: string): boolean {
  return /^\d+\.\d+(\.\d+)?$/.test(id);
}

/** The release line a version belongs to: `1.21.4` → `1.21`, `26.1.2` → `26.1`. */
export function releaseLine(mc: string): string {
  const [major, minor] = mcParts(mc);
  return `${major}.${minor}`;
}
