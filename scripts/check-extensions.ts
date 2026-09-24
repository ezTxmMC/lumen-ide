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
 * Tests the extensions under `extensions/` against both:
 *
 *   1. the server's manifest check — whatever passes here every extension
 *      server accepts,
 *   2. Lumen's own add-on check (`validateAddon`) — whatever passes here can
 *      also be installed.
 *
 * Checking both sides is the point: a manifest the server accepts but Lumen
 * rejects on installing would have surfaced only at the user.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
// Side effect: registers the named tokenizers (`"tokenizer": "markdown"` and
// its like). Anything that compiles or validates add-on data needs them, or a
// language would be reported as using an unknown tokenizer.
import '@/addons/lib/builtin-tokenizers';
import { normalizeModel } from '@/core/user-addons/schema';
import { blockingIssues, validateAddon } from '@/core/user-addons/validate';

// Bundled, this file lands under node_modules/.cache — the root of the project
// is therefore npm's working directory, not where the module sits.
const DIST = path.join(process.cwd(), 'extensions', 'dist');

let failed = 0;
let checked = 0;

function report(ok: boolean, message: string) {
  if (!ok) {
    failed++;
  }
  process.stdout.write(`${ok ? '✓' : '✗'} ${message}\n`);
}

function main() {
  if (!fs.existsSync(DIST)) {
    process.stdout.write('extensions/dist is missing — run `npm run build:ext` first.\n');
    return;
  }
  const files = fs.readdirSync(DIST).filter((name) => name.endsWith('.json')).sort();
  if (!files.length) {
    process.stdout.write('No built extensions — nothing to check.\n');
    return;
  }

  for (const name of files) {
    checked++;
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST, name), 'utf8'));
    const model = normalizeModel(manifest.addon);
    const issues = blockingIssues(validateAddon(model));
    if (issues.length) {
      report(false, `${manifest.id}: ${issues.map((issue) => `${issue.field ?? issue.section}: ${issue.message}`).join('; ')}`);
      continue;
    }
    const settings = manifest.settings?.length ?? 0;
    const pages = manifest.pages?.length ?? 0;
    const languages = model.languages.length;
    const agents = manifest.agents?.length ?? 0;
    const code = manifest.code?.main ? `, Programmcode ${(manifest.code.main.length / 1024).toFixed(0)} kB` : '';
    report(true, `${manifest.id} ${manifest.version} — ${languages} Sprachen, ${settings} Einstellungen, ${pages} Seiten${agents ? `, ${agents} Agenten` : ''}${code}`);
  }

  runExtensionTests();

  process.stdout.write(`\n${checked} checked, ${failed} error(s)\n`);
  if (failed) {
    process.exit(1);
  }
}

/**
 * The tests an extension brings along (`extensions/<name>/test.mjs`) — offline
 * ones; network tests run on request with the file's own flag.
 */
function runExtensionTests() {
  const root = path.join(process.cwd(), 'extensions');
  const folders = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const name of folders) {
    const file = path.join(root, name, 'test.mjs');
    if (!fs.existsSync(file)) {
      continue;
    }
    checked++;
    const result = spawnSync(process.execPath, [file], { cwd: process.cwd(), encoding: 'utf8' });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const summary = output.trim().split('\n').filter(Boolean).at(-1) ?? '';
    report(result.status === 0, `extensions/${name}/test.mjs — ${summary}`);
    if (result.status !== 0) {
      process.stdout.write(output.split('\n').filter((line) => line.startsWith('✗') || /Error/.test(line)).slice(0, 20).join('\n') + '\n');
    }
  }
}

main();
