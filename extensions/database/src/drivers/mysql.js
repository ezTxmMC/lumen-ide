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
 * MariaDB and MySQL through `mysql2`. Every database the user may see is a
 * schema in the tree.
 */

import mysql from 'mysql2/promise';
import { sslOptions } from './tls.js';
import { mysqlColumns, mysqlIndexes, mysqlTree } from './mysql-catalog.js';

/** The mysql2 options: the connection's fields (and its URL), and print values the way the server does. */
async function connectionOptions(connection, password) {
  const ssl = await sslOptions(connection);
  return {
    ...(connection.url ? { uri: connection.url } : {}),
    ...(connection.host ? { host: connection.host } : {}),
    ...(connection.port ? { port: Number(connection.port) } : {}),
    ...(connection.user ? { user: connection.user } : {}),
    ...(password ? { password } : {}),
    ...(connection.database ? { database: connection.database } : {}),
    ...(ssl ? { ssl } : {}),
    connectTimeout: 15_000,
    rowsAsArray: true,
    // Dates, DECIMAL and BIGINT as the server prints them — no time-zone or precision surprises.
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    multipleStatements: false,
  };
}

export async function openMysql(connection, { password }) {
  const conn = await mysql.createConnection(await connectionOptions(connection, password));
  conn.on('error', () => {});

  const columnsOf = (fields) => (fields ?? []).map((field) => ({ name: field.name, type: field.columnType !== undefined ? mysqlType(field.columnType) : '' }));

  async function query(sql, params = [], options = {}) {
    const [result, fields] = await conn.query({ sql, values: params, timeout: options.timeoutMs || undefined, rowsAsArray: true });
    if (!Array.isArray(result)) {
      return { columns: [], rows: [], affected: result.affectedRows, truncated: false };
    }
    const max = options.maxRows ?? Infinity;
    return { columns: columnsOf(fields), rows: result.length > max ? result.slice(0, max) : result, truncated: result.length > max };
  }

  const rowsOf = async (sql, params) => (await conn.query({ sql, values: params, rowsAsArray: true }))[0];

  return {
    kind: 'sql',
    dialect: 'mysql',
    rowIds: false,
    query,

    async transaction(statements, options = {}) {
      await conn.beginTransaction();
      let affected = 0;
      try {
        for (const { sql, params } of statements) {
          const [result] = await conn.query({ sql, values: params, timeout: options.timeoutMs || undefined });
          affected += result.affectedRows ?? 0;
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
      }
      return { affected };
    },

    tree: () => mysqlTree(rowsOf),
    columns: (schema, table) => mysqlColumns(rowsOf, schema, table),
    indexes: (schema, table) => mysqlIndexes(rowsOf, schema, table),

    async ddl(schema, table) {
      const [rows] = await conn.query({ sql: `SHOW CREATE TABLE \`${schema.replace(/`/g, '``')}\`.\`${table.replace(/`/g, '``')}\``, rowsAsArray: true });
      return `${rows[0]?.[1] ?? ''};`;
    },

    async close() {
      await conn.end().catch(() => {});
    },
  };
}

/** mysql2's numeric column types by name (only for the result headers). */
function mysqlType(code) {
  const names = {
    0: 'decimal', 1: 'tinyint', 2: 'smallint', 3: 'int', 4: 'float', 5: 'double', 7: 'timestamp', 8: 'bigint', 9: 'mediumint',
    10: 'date', 11: 'time', 12: 'datetime', 13: 'year', 15: 'varchar', 16: 'bit', 245: 'json', 246: 'decimal', 252: 'blob',
    253: 'varchar', 254: 'char',
  };
  return names[code] ?? String(code);
}
