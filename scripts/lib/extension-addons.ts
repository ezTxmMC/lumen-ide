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
 * The built extensions as add-ons, for the checks.
 *
 * Most of what Lumen used to ship — the languages, the project kinds, the
 * templates — lives in `extensions/` now. The checks that used to walk
 * `ALL_ADDONS` would otherwise quietly cover a fraction of what they did, so
 * they read the built manifests as well and compile them exactly as the
 * running program does.
 *
 * `extensions/dist` comes from `npm run build:ext`; without it the caller gets
 * an empty list and says so.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
// Side effect: registers the named tokenizers (`"tokenizer": "markdown"` and
// its like). Anything that compiles or validates add-on data needs them, or a
// language would be reported as using an unknown tokenizer.
import '@/addons/lib/builtin-tokenizers';
import { compileAddon } from '@/core/user-addons/compile';
import { normalizeModel } from '@/core/user-addons/schema';
import type { Addon } from '@/core/types';

const DIST = path.join(process.cwd(), 'extensions', 'dist');

/** Is a built extension there at all? */
export function extensionsBuilt(): boolean {
  return fs.existsSync(DIST) && fs.readdirSync(DIST).some((name) => name.endsWith('.json'));
}

/** `1.10.0` beats `1.9.0`; a prerelease loses to its finished version. */
function compareVersions(a: string, b: string): number {
  const [aMain, aPre] = a.split('-', 2);
  const [bMain, bPre] = b.split('-', 2);
  const aParts = aMain.split('.').map(Number);
  const bParts = bMain.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const diff = (bParts[index] ?? 0) - (aParts[index] ?? 0);
    if (diff) {
      return diff;
    }
  }
  if (!aPre && bPre) {
    return -1;
  }
  if (aPre && !bPre) {
    return 1;
  }
  return (bPre ?? '').localeCompare(aPre ?? '');
}

/** The highest built version per id, compiled — newest first, sorted by id. */
export function extensionAddons(): Addon[] {
  if (!extensionsBuilt()) {
    return [];
  }
  const newest = new Map<string, { version: string; addon: unknown; }>();
  for (const name of fs.readdirSync(DIST).sort()) {
    if (!name.endsWith('.json')) {
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST, name), 'utf8'));
    const current = newest.get(manifest.id);
    if (current && compareVersions(current.version, manifest.version) <= 0) {
      continue;
    }
    newest.set(manifest.id, { version: manifest.version, addon: manifest.addon });
  }
  return [...newest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, entry]) => compileAddon(normalizeModel(entry.addon as never)));
}
