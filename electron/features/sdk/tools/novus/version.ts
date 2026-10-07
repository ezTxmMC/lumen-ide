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
 * Versions with pre-release parts (`0.1.0-pre.alpha.8`): ordering after
 * semver, and the check that decides whether a version may name a folder.
 * Pure — `npm run check:languages` tests it without a network.
 */

/** `1.2`, `1.2.3` and `1.2.3-pre.alpha.8` — nothing that can leave the SDK folder. */
const SAFE_VERSION = /^\d+\.\d+(?:\.\d+)?$|^\d+\.\d+\.\d+-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*$/;

export const isSafeVersion = (version: string) => SAFE_VERSION.test(version);

/** Version of a tool that prints it (`novusc 0.1.0-pre.alpha.8`): the numbers plus an optional pre-release suffix. */
export const PRERELEASE_VERSION_PATTERN = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)/;

interface Parsed {
  core: number[];
  pre: string[];
}

function parse(version: string): Parsed | null {
  const match = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(version.trim());
  if (!match) {
    return null;
  }
  return { core: match[1].split('.').map(Number), pre: match[2] ? match[2].split('.') : [] };
}

const isNumeric = (part: string) => /^\d+$/.test(part);

function comparePre(a: string[], b: string[]): number {
  // A release is newer than any pre-release of the same numbers.
  if (!a.length || !b.length) {
    return Math.sign(b.length - a.length);
  }
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const [left, right] = [a[i], b[i]];
    if (left === right) {
      continue;
    }
    if (isNumeric(left) && isNumeric(right)) {
      return Math.sign(Number(left) - Number(right));
    }
    // Numbers rank below words, words are compared as text.
    if (isNumeric(left) || isNumeric(right)) {
      return isNumeric(left) ? -1 : 1;
    }
    return left < right ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
}

/** Negative, zero or positive, like a sort callback; pre-release identifiers count (`alpha.9` < `alpha.10` < release). */
export function compareSemver(a: string, b: string): number {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) {
    return a.localeCompare(b, 'en', { numeric: true });
  }
  for (let i = 0; i < Math.max(left.core.length, right.core.length); i++) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff !== 0) {
      return Math.sign(diff);
    }
  }
  return comparePre(left.pre, right.pre);
}
