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
 * The entry point of the extension server.
 *
 *   lumen-extension-server --port 8730 --data ./data --token secret
 *
 * Everything can be set through environment variables as well, so that the
 * server fits into a container or under systemd without a start script:
 *
 *   LUMEN_EXT_PORT     the port (8730 by default)
 *   LUMEN_EXT_HOST     the address listened on (0.0.0.0 by default)
 *   LUMEN_EXT_DATA     the data folder (./data by default)
 *   LUMEN_EXT_NAME     the name shown on the project pages
 *   LUMEN_EXT_URL      the public address at which Lumen reaches it
 *   LUMEN_EXT_TOKENS   the tokens for publishing, several separated by commas
 *
 * Without a token the server runs read-only. That is deliberate: a server
 * somebody starts quickly to try things out should never be open to strangers.
 */

import path from 'node:path';
import process from 'node:process';
import { Store } from './store.js';
import { createServer } from './server.js';

const HELP = `Lumen extension server

  lumen-extension-server [options]

  --port <n>           Port (default 8730)
  --host <address>     Address to listen on (default 0.0.0.0)
  --data <folder>      Data folder (default ./data)
  --name <text>        Display name on the project pages
  --url <address>      Public address at which Lumen reaches the server
  --token <secret>     Token for publishing (may be repeated)
  --allow-overwrite    Published versions may be replaced
  --quiet              Print no access lines
  -h, --help           Show this help
`;

function parseArgs(argv) {
  const options = {
    port: Number(process.env.LUMEN_EXT_PORT ?? 8730),
    host: process.env.LUMEN_EXT_HOST ?? '0.0.0.0',
    data: process.env.LUMEN_EXT_DATA ?? './data',
    name: process.env.LUMEN_EXT_NAME ?? 'Lumen Extensions',
    url: process.env.LUMEN_EXT_URL ?? '',
    tokens: (process.env.LUMEN_EXT_TOKENS ?? '').split(',').map((token) => token.trim()).filter(Boolean),
    allowOverwrite: process.env.LUMEN_EXT_ALLOW_OVERWRITE === '1',
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    }
    if (arg === '--port') {
      options.port = Number(argv[++i]);
    }
    if (arg === '--host') {
      options.host = argv[++i];
    }
    if (arg === '--data') {
      options.data = argv[++i];
    }
    if (arg === '--name') {
      options.name = argv[++i];
    }
    if (arg === '--url') {
      options.url = argv[++i];
    }
    if (arg === '--token') {
      options.tokens.push(argv[++i]);
    }
    if (arg === '--allow-overwrite') {
      options.allowOverwrite = true;
    }
    if (arg === '--quiet') {
      options.quiet = true;
    }
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  return options;
}

/** One line saying whether publishing is possible and how. */
function writeStatus(options) {
  if (!options.tokens.length) {
    return '  Writing     disabled — no token set up (--token)';
  }
  const overwrite = options.allowOverwrite ? ' (overwriting allowed)' : '';
  return `  Writing     ${options.tokens.length} token(s) set up${overwrite}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const log = options.quiet ? () => {} : (line) => process.stdout.write(`${line}\n`);

  const root = path.resolve(process.cwd(), options.data);
  const store = new Store(root);
  const count = await store.load();

  const config = {
    name: options.name,
    publicUrl: (options.url || `http://localhost:${options.port}`).replace(/\/+$/, ''),
    tokens: options.tokens,
    allowOverwrite: options.allowOverwrite,
    log,
  };

  const server = createServer({ store, config });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });

  log(`Lumen extension server — ${config.name}`);
  log(`  Data        ${root}`);
  log(`  Reachable   ${config.publicUrl}`);
  log(`  Listening   ${options.host}:${options.port}`);
  log(`  Stock       ${count} ${count === 1 ? 'extension' : 'extensions'}`);
  log(writeStatus(options));

  const shutdown = () => {
    log('\nShutting down…');
    server.close(() => process.exit(0));
    // Do not wait for ever on hanging connections.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`✗ ${err.message}\n`);
  process.exit(1);
});
