#!/usr/bin/env node
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
 * Runs one of the extension's TypeScript files under Node: bundles it with
 * esbuild (from the app's node_modules) into a temporary module and imports it.
 *
 *   node extensions/minecraft/tools/run.mjs tools/update-defaults.ts
 *   node extensions/minecraft/tools/run.mjs test/unit.ts
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

export async function runTs(file, argv = []) {
  const entry = path.resolve(ROOT, file);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-mc-'));
  const out = path.join(dir, `${path.basename(file, '.ts')}.mjs`);
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      outfile: out,
      logLevel: 'error',
      // `import type` from the app vanishes; anything else from it would be a mistake.
      external: ['node:*'],
    });
    process.argv = [process.argv[0], out, ...argv];
    await import(pathToFileURL(out).href);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, ...argv] = process.argv.slice(2);
  if (!file) {
    process.stderr.write('usage: node tools/run.mjs <file.ts> [args…]\n');
    process.exit(2);
  }
  runTs(file, argv).catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  });
}
