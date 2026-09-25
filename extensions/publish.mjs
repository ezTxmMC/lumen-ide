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
 * Pushes built extensions to an extension server.
 *
 *   node extensions/publish.mjs --server https://lumen-extensions.eztxm.de --token "$LUMEN_EXT_TOKEN"
 *   node extensions/publish.mjs --only go,rust --dry-run
 *
 * Building happens beforehand with `extensions/build.mjs`; this script only
 * reads what lies in `extensions/dist/`. Per id the highest version goes out —
 * older files in the folder stay put and do no harm.
 *
 * The token is better kept in the environment than on the command line:
 * whatever stands on the command line ends up in the shell's history file and
 * is visible to other users in the process list on many systems.
 *
 *   LUMEN_EXT_SERVER   the address of the server
 *   LUMEN_EXT_TOKEN    the token for publishing
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { compareVersions } from '../extension-server/src/manifest.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, 'dist');

function parseArgs(argv) {
  const options = {
    server: process.env.LUMEN_EXT_SERVER ?? '',
    token: process.env.LUMEN_EXT_TOKEN ?? '',
    only: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--server') {
      options.server = argv[++i];
    }
    if (arg === '--token') {
      options.token = argv[++i];
    }
    if (arg === '--only') {
      options.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write('node extensions/publish.mjs --server <url> --token <secret> [--only a,b] [--dry-run]\n');
      process.exit(0);
    }
  }
  if (!options.server) {
    throw new Error('No server given (--server or LUMEN_EXT_SERVER)');
  }
  if (!options.dryRun && !options.token) {
    throw new Error('No token given (--token or LUMEN_EXT_TOKEN)');
  }
  options.server = options.server.replace(/\/+$/, '');
  return options;
}

/** The highest built version per id. */
async function newestPackages() {
  let files = [];
  try {
    files = (await fs.readdir(DIST)).filter((name) => name.endsWith('.json'));
  } catch {
    throw new Error('extensions/dist is missing — run `npm run build:ext` first');
  }
  const best = new Map();
  for (const name of files) {
    const manifest = JSON.parse(await fs.readFile(path.join(DIST, name), 'utf8'));
    const known = best.get(manifest.id);
    if (known && compareVersions(known.version, manifest.version) <= 0) {
      continue;
    }
    best.set(manifest.id, manifest);
  }
  return [...best.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

async function publish(server, token, manifest) {
  const response = await fetch(`${server}/api/v1/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(manifest),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

/**
 * Did the server keep what was sent?
 *
 * A server older than the manifest fields (`agents`, `code`) accepts the
 * manifest and quietly drops them — the extension then installs without its
 * chat. Reading the stored version back is the only way to notice.
 */
async function storedFully(server, manifest) {
  const wantsCode = Boolean(manifest.code);
  const wantsAgents = Boolean(manifest.agents?.length);
  if (!wantsCode && !wantsAgents) {
    return true;
  }
  const response = await fetch(`${server}/api/v1/extensions/${encodeURIComponent(manifest.id)}/${encodeURIComponent(manifest.version)}`);
  const stored = await response.json().catch(() => ({}));
  if (wantsCode && !stored.code) {
    return false;
  }
  if (wantsAgents && !stored.agents?.length) {
    return false;
  }
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // Ask first whether an extension server runs there at all — an error message
  // naming the address helps more than a 404 per package.
  const info = await fetch(`${options.server}/api/v1/info`).then((r) => r.json()).catch(() => null);
  if (!info || info.product !== 'lumen-extension-server') {
    throw new Error(`No Lumen extension server answers at ${options.server}`);
  }

  const all = await newestPackages();
  const packages = options.only ? all.filter((manifest) => options.only.some((want) => manifest.id === want || manifest.id === `addon.${want}` || manifest.id === `ext.${want}`)) : all;
  if (!packages.length) {
    throw new Error('No matching packages in extensions/dist');
  }

  process.stdout.write(`Server: ${info.name} — ${options.server}\n\n`);
  if (options.dryRun) {
    for (const manifest of packages) {
      process.stdout.write(`· ${manifest.id} ${manifest.version} (${manifest.name})\n`);
    }
    process.stdout.write(`\n--dry-run: ${packages.length} package(s) would be published.\n`);
    return;
  }

  let failed = 0;
  for (const manifest of packages) {
    const { status, data } = await publish(options.server, options.token, manifest);
    if (status === 200 || status === 201) {
      if (!(await storedFully(options.server, manifest))) {
        failed++;
        process.stdout.write(`✗ ${manifest.id} ${manifest.version}: the server dropped agents/code — it is too old, update the extension server first\n`);
        continue;
      }
      process.stdout.write(`✓ ${manifest.id} ${manifest.version}${data.replaced ? ' (replaced)' : ''}\n`);
      continue;
    }
    if (status === 409) {
      process.stdout.write(`· ${manifest.id} ${manifest.version} already present — skipped\n`);
      continue;
    }
    failed++;
    const field = data.field ? ` [${data.field}]` : '';
    process.stdout.write(`✗ ${manifest.id} ${manifest.version}: ${status}${field} ${data.message ?? ''}\n`);
  }
  if (failed) {
    process.stderr.write(`\n${failed} failed.\n`);
    process.exit(1);
  }
  process.stdout.write(`\n✓ Done — ${options.server}/\n`);
}

main().catch((err) => {
  process.stderr.write(`✗ ${err.message}\n`);
  process.exit(1);
});
