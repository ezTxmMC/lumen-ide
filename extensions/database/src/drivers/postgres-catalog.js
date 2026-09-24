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
 * The catalog queries of PostgreSQL (pg_catalog): schemas with their tables,
 * the columns of a table and its indexes. Each takes the connected client.
 */

/** Tables by schema, schemas without tables included. */
export function groupTree(schemaNames, tables) {
  const bySchema = new Map(schemaNames.map((name) => [name, []]));
  for (const table of tables) {
    if (!bySchema.has(table.schema)) {
      bySchema.set(table.schema, []);
    }
    bySchema.get(table.schema).push({ name: table.name, kind: table.kind });
  }
  return [...bySchema].map(([name, list]) => ({ name, tables: list }));
}

export async function pgTree(client) {
  const { rows } = await client.query({
    rowMode: 'array',
    text: `SELECT n.nspname, c.relname, c.relkind
           FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
             AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_toast%'
           ORDER BY n.nspname, c.relname`,
  });
  const { rows: schemas } = await client.query({
    rowMode: 'array',
    text: `SELECT nspname FROM pg_catalog.pg_namespace
           WHERE nspname NOT IN ('pg_catalog', 'information_schema') AND nspname NOT LIKE 'pg\\_%' ORDER BY nspname`,
  });
  return groupTree(schemas.map((row) => row[0]), rows.map(([schema, name, kind]) => ({ schema, name, kind: kind === 'v' || kind === 'm' ? 'view' : 'table' })));
}

export async function pgColumns(client, schema, table) {
  const { rows } = await client.query({
    rowMode: 'array',
    text: `SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod), NOT a.attnotnull,
                  pg_catalog.pg_get_expr(d.adbin, d.adrelid),
                  COALESCE((SELECT k.n FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, n) WHERE k.attnum = a.attnum), 0),
                  a.attgenerated <> ''
           FROM pg_catalog.pg_attribute a
           JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
           LEFT JOIN pg_catalog.pg_index i ON i.indrelid = c.oid AND i.indisprimary
           WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
           ORDER BY a.attnum`,
    values: [schema, table],
  });
  return rows.map(([name, type, nullable, defaultValue, pkOrder, generated]) => ({
    name, type, nullable, defaultValue, pk: Number(pkOrder) > 0, pkOrder: Number(pkOrder), generated: Boolean(generated),
  }));
}

export async function pgIndexes(client, schema, table) {
  const { rows } = await client.query({
    rowMode: 'array',
    text: `SELECT ic.relname, i.indisunique, i.indisprimary,
                  ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid, k + 1, true) FROM generate_subscripts(i.indkey, 1) AS k ORDER BY k)
           FROM pg_catalog.pg_index i
           JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
           JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = $2 ORDER BY ic.relname`,
    values: [schema, table],
  });
  return rows.map(([name, unique, primary, columns]) => ({ name, unique, primary, columns }));
}
