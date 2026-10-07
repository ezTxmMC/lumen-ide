/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { openRoots } from '../window/roots';
import { isInside } from './paths';

/** Marker folders that only say “a repository starts here” — the last resort for a root. */
const VCS_MARKERS = new Set(['.git', '.hg', '.svn']);

async function hasAny(dir: string, markers: string[]): Promise<boolean> {
  for (const marker of markers) {
    if (await fs.access(path.join(dir, marker)).then(() => true, () => false)) {
      return true;
    }
  }
  return false;
}

/** The folders from `startDir` up to the working folder containing it (or the file system root). */
function ancestors(startDir: string): string[] {
  const containing = openRoots().find((dir) => isInside(dir, startDir));
  const limit = containing ?? path.parse(startDir).root;
  const out: string[] = [];
  let dir = startDir;
  for (;;) {
    out.push(dir);
    const parent = path.dirname(dir);
    if (dir === limit || parent === dir) {
      return out;
    }
    dir = parent;
  }
}

export async function findProjectRoot(startDir: string, markers: string[], mode: 'nearest' | 'outermost'): Promise<string | null> {
  const dirs = ancestors(startDir);
  const build = markers.filter((marker) => !VCS_MARKERS.has(marker));
  const vcs = markers.filter((marker) => VCS_MARKERS.has(marker));
  if (mode === 'nearest') {
    for (const dir of dirs) {
      if (await hasAny(dir, markers)) {
        return dir;
      }
    }
    return null;
  }
  let outermost: string | null = null;
  for (const dir of dirs) {
    if (await hasAny(dir, build)) {
      outermost = dir;
    }
  }
  if (outermost) {
    return outermost;
  }
  for (const dir of dirs) {
    if (await hasAny(dir, vcs)) {
      return dir;
    }
  }
  return null;
}
