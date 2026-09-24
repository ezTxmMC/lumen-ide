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
 * Redis through `ioredis`: the keys of a database (found with SCAN, never
 * KEYS), their types and time to live, and type-aware reading and writing.
 */

import Redis from 'ioredis';
import { sslOptions } from './tls.js';
import { DriverError } from './errors.js';
import { MAX_MEMBERS, readValue, scanKeys } from './redis-read.js';
import { createWriters } from './redis-write.js';

export { MAX_MEMBERS };

export async function openRedis(connection, { password }) {
  const tls = await sslOptions(connection);
  const options = {
    ...(connection.host ? { host: connection.host } : {}),
    ...(connection.port ? { port: Number(connection.port) } : {}),
    ...(connection.user ? { username: connection.user } : {}),
    ...(password ? { password } : {}),
    ...(tls ? { tls } : {}),
    db: Number(connection.database || 0),
    lazyConnect: true,
    connectTimeout: 15_000,
    maxRetriesPerRequest: 1,
    // Reconnect a few times quietly, then give up rather than retry forever.
    retryStrategy: (times) => (times > 3 ? null : times * 500),
  };
  const client = connection.url ? new Redis(connection.url, { ...options, lazyConnect: true }) : new Redis(options);
  client.on('error', () => {});
  await client.connect();

  // One connection serves every tab, each on its own database: an operation
  // selects its database and runs before the next one may switch away.
  let current = Number(connection.database || 0);
  let queue = Promise.resolve();
  const inDb = (db, fn) => {
    const next = queue.then(async () => {
      if (db !== undefined && Number(db) !== current) {
        await client.select(Number(db));
        current = Number(db);
      }
      return fn();
    });
    queue = next.catch(() => {});
    return next;
  };

  return {
    kind: 'redis',

    /** Databases with keys (from INFO keyspace), plus the connection's own. */
    async databases() {
      const info = await inDb(undefined, () => client.info('keyspace'));
      const found = new Map();
      for (const match of info.matchAll(/^db(\d+):keys=(\d+)/gm)) {
        found.set(Number(match[1]), Number(match[2]));
      }
      const own = Number(connection.database || 0);
      if (!found.has(own)) {
        found.set(own, 0);
      }
      return [...found].sort((a, b) => a[0] - b[0]).map(([index, keys]) => ({ index, keys }));
    },

    /** Keys matching a pattern, with type and TTL — at most `limit`. */
    scan(db, pattern, limit) {
      return inDb(db, () => scanKeys(client, pattern, limit));
    },

    /** A key's value in a shape per type. */
    read(db, key) {
      return inDb(db, () => readValue(client, key));
    },

    ...createWriters(client, inDb),

    /** A raw command, split like a shell line would (quotes group words). */
    async command(db, args) {
      // The tab stays on its database; switching belongs to the tree.
      if (/^select$/i.test(args[0] ?? '')) {
        throw new DriverError('redisSelect');
      }
      return inDb(db, () => client.call(args[0], ...args.slice(1)));
    },

    async close() {
      await client.quit().catch(() => client.disconnect());
    },
  };
}

/** `SET "a b" 'c'` → ['SET', 'a b', 'c'] — for the command line of the key browser. */
export function splitCommand(line) {
  const args = [];
  const pattern = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  for (const match of String(line).matchAll(pattern)) {
    if (match[1] !== undefined) {
      args.push(match[1].replace(/\\(.)/g, (_, char) => ({ n: '\n', t: '\t', r: '\r' })[char] ?? char));
      continue;
    }
    args.push(match[2] ?? match[3]);
  }
  return args;
}
