/**
 * PostgreSQL through `pg`. Queries of the console go through a cursor, so a
 * `SELECT` over a huge table reads only as many rows as are shown.
 */

import pg from 'pg'
import Cursor from 'pg-cursor'
import { sslOptions } from './tls.js'

// Hand timestamps, numerics and big integers over as the server prints them:
// JavaScript's Date and Number would change them (time zones, precision).
const AS_TEXT = [20, 1700, 1082, 1083, 1114, 1184, 1266]
const types = {
  getTypeParser(oid, format) {
    if (AS_TEXT.includes(oid)) return (value) => value
    return pg.types.getTypeParser(oid, format)
  },
}

/** A few type oids by name, for the column headers of results. */
const TYPE_NAMES = {
  16: 'bool', 17: 'bytea', 20: 'int8', 21: 'int2', 23: 'int4', 25: 'text', 114: 'json', 700: 'float4', 701: 'float8',
  1042: 'bpchar', 1043: 'varchar', 1082: 'date', 1083: 'time', 1114: 'timestamp', 1184: 'timestamptz', 1700: 'numeric',
  2950: 'uuid', 3802: 'jsonb',
}

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
  })
  await client.connect()
  // A broken connection must not take the process down; the next call reports it.
  client.on('error', () => {})

  const columnsOf = (fields) => fields.map((field) => ({ name: field.name, type: TYPE_NAMES[field.dataTypeID] ?? String(field.dataTypeID) }))

  /** Run one statement; with `maxRows` through a cursor that stops early. */
  async function query(sql, params = [], options = {}) {
    const timeout = options.timeoutMs ?? 0
    await client.query(`SET statement_timeout = ${Math.max(0, Math.round(timeout))}`)
    if (!options.maxRows) {
      const result = await client.query({ text: sql, values: params, rowMode: 'array' })
      return { columns: columnsOf(result.fields ?? []), rows: result.rows ?? [], affected: result.rowCount ?? undefined, truncated: false }
    }
    const cursor = client.query(new Cursor(sql, params, { rowMode: 'array', types }))
    try {
      const { rows, result } = await new Promise((resolve, reject) => {
        cursor.read(options.maxRows + 1, (err, list, info) => (err ? reject(err) : resolve({ rows: list, result: info })))
      })
      const fields = result?.fields ?? []
      const truncated = rows.length > options.maxRows
      const affected = fields.length ? undefined : result?.rowCount ?? undefined
      return { columns: columnsOf(fields), rows: truncated ? rows.slice(0, options.maxRows) : rows, affected, truncated }
    } finally {
      await cursor.close().catch(() => {})
    }
  }

  return {
    kind: 'sql',
    dialect: 'postgres',
    rowIds: true,
    query,

    async transaction(statements, options = {}) {
      await client.query(`SET statement_timeout = ${Math.max(0, Math.round(options.timeoutMs ?? 0))}`)
      await client.query('BEGIN')
      let affected = 0
      try {
        for (const { sql, params } of statements) affected += (await client.query(sql, params)).rowCount ?? 0
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      }
      return { affected }
    },

    async tree() {
      const { rows } = await client.query({
        rowMode: 'array',
        text: `SELECT n.nspname, c.relname, c.relkind
               FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
                 AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_toast%'
               ORDER BY n.nspname, c.relname`,
      })
      const { rows: schemas } = await client.query({
        rowMode: 'array',
        text: `SELECT nspname FROM pg_catalog.pg_namespace
               WHERE nspname NOT IN ('pg_catalog', 'information_schema') AND nspname NOT LIKE 'pg\\_%' ORDER BY nspname`,
      })
      return groupTree(schemas.map((row) => row[0]), rows.map(([schema, name, kind]) => ({ schema, name, kind: kind === 'v' || kind === 'm' ? 'view' : 'table' })))
    },

    async columns(schema, table) {
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
      })
      return rows.map(([name, type, nullable, defaultValue, pkOrder, generated]) => ({
        name, type, nullable, defaultValue, pk: Number(pkOrder) > 0, pkOrder: Number(pkOrder), generated: Boolean(generated),
      }))
    },

    async indexes(schema, table) {
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
      })
      return rows.map(([name, unique, primary, columns]) => ({ name, unique, primary, columns }))
    },

    async close() {
      await client.end().catch(() => {})
    },
  }
}

/** Tables by schema, schemas without tables included. */
export function groupTree(schemaNames, tables) {
  const bySchema = new Map(schemaNames.map((name) => [name, []]))
  for (const table of tables) {
    if (!bySchema.has(table.schema)) bySchema.set(table.schema, [])
    bySchema.get(table.schema).push({ name: table.name, kind: table.kind })
  }
  return [...bySchema].map(([name, list]) => ({ name, tables: list }))
}
