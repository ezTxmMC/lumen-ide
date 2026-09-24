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
 * The catalog queries of MariaDB and MySQL (information_schema): schemas with
 * their tables, the columns of a table and its indexes. Each takes
 * `rowsOf(sql, params)`.
 */

import { groupTree } from './postgres.js';

const SYSTEM = ['information_schema', 'mysql', 'performance_schema', 'sys'];

export async function mysqlTree(rowsOf) {
  const schemas = (await rowsOf('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME'))
    .map((row) => String(row[0]))
    .filter((name) => !SYSTEM.includes(name.toLowerCase()));
  const tables = await rowsOf(
    `SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES
     WHERE TABLE_SCHEMA NOT IN (${SYSTEM.map(() => '?').join(', ')}) ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    SYSTEM,
  );
  return groupTree(schemas, tables.map(([schema, name, type]) => ({ schema: String(schema), name: String(name), kind: /VIEW/i.test(type) ? 'view' : 'table' })));
}

export async function mysqlColumns(rowsOf, schema, table) {
  const rows = await rowsOf(
    `SELECT c.COLUMN_NAME, c.COLUMN_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT, k.ORDINAL_POSITION, c.EXTRA
     FROM information_schema.COLUMNS c
     LEFT JOIN information_schema.KEY_COLUMN_USAGE k
       ON k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME AND k.COLUMN_NAME = c.COLUMN_NAME AND k.CONSTRAINT_NAME = 'PRIMARY'
     WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ? ORDER BY c.ORDINAL_POSITION`,
    [schema, table],
  );
  return rows.map(([name, type, nullable, defaultValue, pkOrder, extra]) => ({
    name: String(name), type: String(type), nullable: nullable === 'YES', defaultValue: defaultValue ?? null,
    pk: pkOrder !== null, pkOrder: Number(pkOrder ?? 0), generated: /GENERATED/i.test(String(extra ?? '')),
    autoIncrement: /auto_increment/i.test(String(extra ?? '')),
  }));
}

export async function mysqlIndexes(rowsOf, schema, table) {
  const rows = await rowsOf(
    `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [schema, table],
  );
  const indexes = new Map();
  for (const [name, nonUnique, column] of rows) {
    const entry = indexes.get(name) ?? { name: String(name), unique: Number(nonUnique) === 0, primary: name === 'PRIMARY', columns: [] };
    entry.columns.push(String(column ?? '(expression)'));
    indexes.set(name, entry);
  }
  return [...indexes.values()];
}
