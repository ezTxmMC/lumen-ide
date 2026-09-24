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
 * H2 through a small JDBC bridge: there is no JavaScript driver, so the
 * extension downloads the H2 jar from Maven Central on first use, writes its
 * own compiled bridge class next to it and runs both with the user's Java.
 * Requests and answers are lines on stdin/stdout (see Bridge.java).
 *
 * H2 locks the database file while it is open — for as long as the
 * connection lasts, which is what an open connection means anyway.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { startBridge, encodeParam } from './bridge.js';
import { h2Columns, h2Indexes, h2Tree } from './catalog.js';
import { DEFAULT_VERSION, ensureBridge, ensureJar, findJava, h2Url } from './setup.js';

export { h2Url };

/** Starts the bridge process and opens the database on it. */
async function openBridge(connection, password, ctx) {
  const url = h2Url(connection);
  const java = await findJava(ctx);
  const dir = path.join(await ctx.storage.dir(), 'h2');
  await fs.mkdir(dir, { recursive: true });
  const jar = await ensureJar(dir, ctx.settings.get('h2Version') || DEFAULT_VERSION);
  await ensureBridge(dir);

  const bridge = startBridge(java, [dir, jar].join(path.delimiter));
  try {
    await bridge.send('open', [url, connection.user || 'sa', password ?? '']);
  } catch (err) {
    bridge.child.kill();
    throw err;
  }
  return bridge;
}

export async function openH2(connection, { password, ctx }) {
  const { child, send, isExited } = await openBridge(connection, password, ctx);

  /** Transactions must not interleave with other calls on the one connection. */
  let queue = Promise.resolve();
  const serial = (fn) => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  async function run(sql, params = [], options = {}) {
    const seconds = options.timeoutMs > 0 ? Math.max(1, Math.ceil(options.timeoutMs / 1000)) : 0;
    const maxRows = options.maxRows ?? 100_000;
    const answer = await send('query', [sql, String(maxRows), String(seconds), ...params.map(encodeParam)], { seconds });
    return {
      columns: answer.columns ?? [],
      rows: answer.rows ?? [],
      ...(answer.columns?.length ? {} : { affected: answer.affected }),
      truncated: Boolean(answer.truncated),
    };
  }

  const query = (sql, params, options) => serial(() => run(sql, params, options));

  return {
    kind: 'sql',
    dialect: 'h2',
    rowIds: false,
    query,

    transaction(statements, options = {}) {
      return serial(async () => {
        await send('begin');
        let affected = 0;
        try {
          for (const { sql, params } of statements) {
            affected += (await run(sql, params ?? [], options)).affected ?? 0;
          }
          await send('commit');
        } catch (err) {
          await send('rollback').catch(() => {});
          throw err;
        }
        return { affected };
      });
    },

    tree: () => h2Tree(query),
    columns: (schema, table) => h2Columns(query, schema, table),
    indexes: (schema, table) => h2Indexes(query, schema, table),

    async close() {
      if (isExited()) {
        return;
      }
      const ended = new Promise((resolve) => child.once('exit', resolve));
      await Promise.race([send('close').catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))]);
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 2000);
      await ended;
      clearTimeout(timer);
    },
  };
}
