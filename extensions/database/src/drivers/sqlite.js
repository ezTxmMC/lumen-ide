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
 * SQLite through Node's own `node:sqlite` — on the real file, no copy in
 * memory, nothing to write back.
 *
 * `node:sqlite` is synchronous, and the extension runs in Lumen's main
 * process: a slow query would freeze the window. So the database lives in a
 * small helper process (Lumen's own binary run as Node) and the driver talks
 * to it by messages. A worker thread would not do: a thread stuck inside
 * SQLite cannot be stopped, a process can — a query past its timeout ends
 * the helper, and the next call starts a fresh one.
 */

import { quoteIdent } from '../sql.js';
import { DriverError } from './errors.js';
import { createWorkerClient } from './sqlite-client.js';

/** Values node:sqlite can bind: no booleans. */
const bindable = (value) => (typeof value === 'boolean' ? Number(value) : value ?? null);

export async function openSqlite(connection) {
  const file = connection.file;
  if (!file) {
    throw new DriverError('noFile');
  }
  const fs = await import('node:fs/promises');
  await fs.access(file).catch(() => { throw new DriverError('fileMissing', { file }); });
  try {
    await import('node:sqlite');
  } catch {
    throw new DriverError('noSqlite', { version: process.versions.node });
  }

  const { call, close } = createWorkerClient(file, connection.readOnly);

  const run = (sql, params = [], options = {}) =>
    call({ op: 'query', sql, params: params.map(bindable), maxRows: options.maxRows ?? 100_000 }, options.timeoutMs ?? 0);

  const pragma = async (schema, name, arg) => {
    const target = `${quoteIdent('sqlite', schema)}.${name}(${quoteIdent('sqlite', arg)})`;
    return (await run(`PRAGMA ${target}`)).rows;
  };

  // Opening fails early for a file that is not a database.
  await run('SELECT count(*) FROM sqlite_schema');

  return {
    kind: 'sql',
    dialect: 'sqlite',
    /** SQLite needs a row id for tables without a primary key — it has one: `rowid`. */
    rowIds: true,

    query: run,

    async transaction(statements, options = {}) {
      return call({ op: 'transaction', statements: statements.map((s) => ({ sql: s.sql, params: (s.params ?? []).map(bindable) })) }, options.timeoutMs ?? 0);
    },

    async tree() {
      const databases = (await run('PRAGMA database_list')).rows.map((row) => String(row[1])).filter((name) => name !== 'temp');
      const schemas = [];
      for (const name of databases) {
        const master = name === 'main' ? 'sqlite_schema' : `${quoteIdent('sqlite', name)}.sqlite_schema`;
        const { rows } = await run(`SELECT name, type FROM ${master} WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name`);
        schemas.push({ name, tables: rows.map(([table, type]) => ({ name: String(table), kind: type === 'view' ? 'view' : 'table' })) });
      }
      return schemas;
    },

    async columns(schema, table) {
      const rows = await pragma(schema || 'main', 'table_xinfo', table);
      return rows
        .filter((row) => Number(row[6] ?? 0) === 0 || Number(row[6]) >= 2)
        .map((row) => ({
          name: String(row[1]),
          type: String(row[2] ?? ''),
          nullable: Number(row[3]) === 0,
          defaultValue: row[4] === null ? null : String(row[4]),
          pk: Number(row[5]) > 0,
          pkOrder: Number(row[5]),
          generated: Number(row[6] ?? 0) >= 2,
        }));
    },

    async indexes(schema, table) {
      const list = await pragma(schema || 'main', 'index_list', table);
      const indexes = [];
      for (const row of list) {
        const name = String(row[1]);
        const columns = (await pragma(schema || 'main', 'index_info', name)).map((info) => String(info[2] ?? '(expression)'));
        indexes.push({ name, columns, unique: Number(row[2]) === 1, primary: String(row[3]) === 'pk' });
      }
      return indexes;
    },

    async ddl(schema, table) {
      const master = !schema || schema === 'main' ? 'sqlite_schema' : `${quoteIdent('sqlite', schema)}.sqlite_schema`;
      const { rows } = await run(`SELECT sql FROM ${master} WHERE tbl_name = ? AND sql IS NOT NULL ORDER BY type DESC, name`, [table]);
      return rows.map((row) => `${row[0]};`).join('\n\n');
    },

    close,
  };
}
