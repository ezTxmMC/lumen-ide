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
 * PostgreSQL through `pg`. Queries of the console go through a cursor, so a
 * `SELECT` over a huge table reads only as many rows as are shown.
 */

import pg from 'pg';
import Cursor from 'pg-cursor';
import { sslOptions } from './tls.js';
import { groupTree, pgColumns, pgIndexes, pgTree } from './postgres-catalog.js';

export { groupTree };

// Hand timestamps, numerics and big integers over as the server prints them:
// JavaScript's Date and Number would change them (time zones, precision).
const AS_TEXT = [20, 1700, 1082, 1083, 1114, 1184, 1266];
const types = {
  getTypeParser(oid, format) {
    if (AS_TEXT.includes(oid)) {
      return (value) => value;
    }
    return pg.types.getTypeParser(oid, format);
  },
};

/** A few type oids by name, for the column headers of results. */
const TYPE_NAMES = {
  16: 'bool', 17: 'bytea', 20: 'int8', 21: 'int2', 23: 'int4', 25: 'text', 114: 'json', 700: 'float4', 701: 'float8',
  1042: 'bpchar', 1043: 'varchar', 1082: 'date', 1083: 'time', 1114: 'timestamp', 1184: 'timestamptz', 1700: 'numeric',
  2950: 'uuid', 3802: 'jsonb',
};

export async function openPostgres(connection, { password }) {
  const client = new pg.Client({
    ...(connection.url ? { connectionString: connection.url } : {}),
    ...(connection.host ? { host: connection.host } : {}),
    ...(connection.port ? { port: Number(connection.port) } : {}),
    ...(connection.user ? { user: connection.user } : {}),
    ...(password ? { password } : {}),
    ...(connection.database ? { database: connection.database } : {}),
    ssl: await sslOptions(connection),
    connectionTimeoutMillis: 15_000,
    application_name: 'Lumen',
    types,
  });
  await client.connect();
  // A broken connection must not take the process down; the next call reports it.
  client.on('error', () => {});

  const columnsOf = (fields) => fields.map((field) => ({ name: field.name, type: TYPE_NAMES[field.dataTypeID] ?? String(field.dataTypeID) }));

  /** Run one statement; with `maxRows` through a cursor that stops early. */
  async function query(sql, params = [], options = {}) {
    const timeout = options.timeoutMs ?? 0;
    await client.query(`SET statement_timeout = ${Math.max(0, Math.round(timeout))}`);
    if (!options.maxRows) {
      const result = await client.query({ text: sql, values: params, rowMode: 'array' });
      return { columns: columnsOf(result.fields ?? []), rows: result.rows ?? [], affected: result.rowCount ?? undefined, truncated: false };
    }
    const cursor = client.query(new Cursor(sql, params, { rowMode: 'array', types }));
    try {
      const { rows, result } = await new Promise((resolve, reject) => {
        cursor.read(options.maxRows + 1, (err, list, info) => (err ? reject(err) : resolve({ rows: list, result: info })));
      });
      const fields = result?.fields ?? [];
      const truncated = rows.length > options.maxRows;
      const affected = fields.length ? undefined : result?.rowCount ?? undefined;
      return { columns: columnsOf(fields), rows: truncated ? rows.slice(0, options.maxRows) : rows, affected, truncated };
    } finally {
      await cursor.close().catch(() => {});
    }
  }

  return {
    kind: 'sql',
    dialect: 'postgres',
    rowIds: true,
    query,

    async transaction(statements, options = {}) {
      await client.query(`SET statement_timeout = ${Math.max(0, Math.round(options.timeoutMs ?? 0))}`);
      await client.query('BEGIN');
      let affected = 0;
      try {
        for (const { sql, params } of statements) {
          affected += (await client.query(sql, params)).rowCount ?? 0;
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      }
      return { affected };
    },

    tree: () => pgTree(client),
    columns: (schema, table) => pgColumns(client, schema, table),
    indexes: (schema, table) => pgIndexes(client, schema, table),

    async close() {
      await client.end().catch(() => {});
    },
  };
}
