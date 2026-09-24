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
 * The catalog queries of SQL Server: schemas with their tables, the columns
 * of a table and its indexes. Each takes `rowsOf(sql, params)`.
 */

import { groupTree } from './postgres.js';

export async function mssqlTree(rowsOf) {
  const schemas = (await rowsOf(`SELECT s.name FROM sys.schemas s
    WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest') AND s.name NOT LIKE 'db[_]%' ORDER BY s.name`)).map((row) => String(row[0]));
  const tables = await rowsOf(`SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_SCHEMA, TABLE_NAME`);
  return groupTree(schemas, tables.map(([schema, name, type]) => ({ schema: String(schema), name: String(name), kind: /VIEW/i.test(type) ? 'view' : 'table' })));
}

export async function mssqlColumns(rowsOf, schema, table) {
  const rows = await rowsOf(
    `SELECT c.name, TYPE_NAME(c.user_type_id)
            + CASE WHEN TYPE_NAME(c.user_type_id) IN ('varchar', 'char', 'varbinary', 'binary') THEN '(' + CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length AS varchar) END + ')'
                   WHEN TYPE_NAME(c.user_type_id) IN ('nvarchar', 'nchar') THEN '(' + CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length / 2 AS varchar) END + ')'
                   ELSE '' END,
            c.is_nullable, OBJECT_DEFINITION(c.default_object_id), ISNULL(ic.key_ordinal, 0), c.is_computed, c.is_identity
     FROM sys.columns c
     JOIN sys.objects o ON o.object_id = c.object_id
     JOIN sys.schemas s ON s.schema_id = o.schema_id
     LEFT JOIN sys.indexes i ON i.object_id = o.object_id AND i.is_primary_key = 1
     LEFT JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.column_id = c.column_id
     WHERE s.name = @p1 AND o.name = @p2 ORDER BY c.column_id`,
    [schema, table],
  );
  return rows.map(([name, type, nullable, defaultValue, pkOrder, computed, identity]) => ({
    name: String(name), type: String(type), nullable: Boolean(nullable), defaultValue: defaultValue ?? null,
    pk: Number(pkOrder) > 0, pkOrder: Number(pkOrder), generated: Boolean(computed) || Boolean(identity), autoIncrement: Boolean(identity),
  }));
}

export async function mssqlIndexes(rowsOf, schema, table) {
  const rows = await rowsOf(
    `SELECT i.name, i.is_unique, i.is_primary_key, c.name
     FROM sys.indexes i
     JOIN sys.objects o ON o.object_id = i.object_id
     JOIN sys.schemas s ON s.schema_id = o.schema_id
     JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
     JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
     WHERE s.name = @p1 AND o.name = @p2 AND i.name IS NOT NULL ORDER BY i.name, ic.key_ordinal`,
    [schema, table],
  );
  const indexes = new Map();
  for (const [name, unique, primary, column] of rows) {
    const entry = indexes.get(name) ?? { name: String(name), unique: Boolean(unique), primary: Boolean(primary), columns: [] };
    entry.columns.push(String(column));
    indexes.set(name, entry);
  }
  return [...indexes.values()];
}
