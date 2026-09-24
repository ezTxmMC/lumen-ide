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
 * The catalog queries of H2 (INFORMATION_SCHEMA): schemas with their tables,
 * the columns of a table and its indexes. Each takes the driver's `query`.
 */

export async function h2Tree(query) {
  const schemas = (await query(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA
    WHERE SCHEMA_NAME <> 'INFORMATION_SCHEMA' ORDER BY SCHEMA_NAME`)).rows.map((row) => String(row[0]));
  const tables = (await query(`SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA <> 'INFORMATION_SCHEMA' ORDER BY TABLE_SCHEMA, TABLE_NAME`)).rows;
  const bySchema = new Map(schemas.map((name) => [name, []]));
  for (const [schema, name, type] of tables) {
    if (!bySchema.has(schema)) {
      bySchema.set(schema, []);
    }
    bySchema.get(schema).push({ name: String(name), kind: /VIEW/i.test(String(type)) ? 'view' : 'table' });
  }
  return [...bySchema].map(([name, list]) => ({ name, tables: list }));
}

export async function h2Columns(query, schema, table) {
  const { rows } = await query(
    `SELECT c.COLUMN_NAME,
            c.DATA_TYPE || CASE WHEN c.CHARACTER_MAXIMUM_LENGTH IS NOT NULL AND c.DATA_TYPE LIKE '%CHAR%'
                                THEN '(' || c.CHARACTER_MAXIMUM_LENGTH || ')' ELSE '' END,
            c.IS_NULLABLE, c.COLUMN_DEFAULT, COALESCE(k.ORDINAL_POSITION, 0), c.IS_GENERATED, c.IS_IDENTITY
     FROM INFORMATION_SCHEMA.COLUMNS c
     LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS t
       ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME AND t.CONSTRAINT_TYPE = 'PRIMARY KEY'
     LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
       ON k.CONSTRAINT_SCHEMA = t.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME = t.CONSTRAINT_NAME AND k.COLUMN_NAME = c.COLUMN_NAME
     WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ? ORDER BY c.ORDINAL_POSITION`,
    [schema, table],
  );
  return rows.map(([name, type, nullable, defaultValue, pkOrder, generated, identity]) => ({
    name: String(name),
    type: String(type),
    nullable: nullable === 'YES',
    defaultValue: defaultValue ?? null,
    pk: Number(pkOrder) > 0,
    pkOrder: Number(pkOrder),
    generated: generated === 'ALWAYS' || identity === 'YES',
    autoIncrement: identity === 'YES',
  }));
}

export async function h2Indexes(query, schema, table) {
  const { rows } = await query(
    `SELECT i.INDEX_NAME, i.INDEX_TYPE_NAME, c.COLUMN_NAME
     FROM INFORMATION_SCHEMA.INDEXES i
     JOIN INFORMATION_SCHEMA.INDEX_COLUMNS c
       ON c.INDEX_SCHEMA = i.INDEX_SCHEMA AND c.INDEX_NAME = i.INDEX_NAME
     WHERE i.TABLE_SCHEMA = ? AND i.TABLE_NAME = ? ORDER BY i.INDEX_NAME, c.ORDINAL_POSITION`,
    [schema, table],
  );
  const indexes = new Map();
  for (const [name, type, column] of rows) {
    const kind = String(type);
    const entry = indexes.get(name) ?? { name: String(name), unique: /UNIQUE|PRIMARY/i.test(kind), primary: /PRIMARY/i.test(kind), columns: [] };
    entry.columns.push(String(column));
    indexes.set(name, entry);
  }
  return [...indexes.values()];
}
