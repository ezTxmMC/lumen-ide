/**
 * MariaDB and MySQL through `mysql2`. Every database the user may see is a
 * schema in the tree.
 */

import mysql from 'mysql2/promise'
import { sslOptions } from './tls.js'
import { groupTree } from './postgres.js'

const SYSTEM = ['information_schema', 'mysql', 'performance_schema', 'sys']

export async function openMysql(connection, { password }) {
  const ssl = await sslOptions(connection)
  const options = {
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
  }
  const conn = await mysql.createConnection(options)
  conn.on('error', () => {})

  const columnsOf = (fields) => (fields ?? []).map((field) => ({ name: field.name, type: field.columnType !== undefined ? mysqlType(field.columnType) : '' }))

  async function query(sql, params = [], options = {}) {
    const [result, fields] = await conn.query({ sql, values: params, timeout: options.timeoutMs || undefined, rowsAsArray: true })
    if (!Array.isArray(result)) return { columns: [], rows: [], affected: result.affectedRows, truncated: false }
    const max = options.maxRows ?? Infinity
    return { columns: columnsOf(fields), rows: result.length > max ? result.slice(0, max) : result, truncated: result.length > max }
  }

  const rowsOf = async (sql, params) => (await conn.query({ sql, values: params, rowsAsArray: true }))[0]

  return {
    kind: 'sql',
    dialect: 'mysql',
    rowIds: false,
    query,

    async transaction(statements, options = {}) {
      await conn.beginTransaction()
      let affected = 0
      try {
        for (const { sql, params } of statements) {
          const [result] = await conn.query({ sql, values: params, timeout: options.timeoutMs || undefined })
          affected += result.affectedRows ?? 0
        }
        await conn.commit()
      } catch (err) {
        await conn.rollback().catch(() => {})
        throw err
      }
      return { affected }
    },

    async tree() {
      const schemas = (await rowsOf('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME'))
        .map((row) => String(row[0]))
        .filter((name) => !SYSTEM.includes(name.toLowerCase()))
      const tables = await rowsOf(
        `SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES
         WHERE TABLE_SCHEMA NOT IN (${SYSTEM.map(() => '?').join(', ')}) ORDER BY TABLE_SCHEMA, TABLE_NAME`,
        SYSTEM,
      )
      return groupTree(schemas, tables.map(([schema, name, type]) => ({ schema: String(schema), name: String(name), kind: /VIEW/i.test(type) ? 'view' : 'table' })))
    },

    async columns(schema, table) {
      const rows = await rowsOf(
        `SELECT c.COLUMN_NAME, c.COLUMN_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT, k.ORDINAL_POSITION, c.EXTRA
         FROM information_schema.COLUMNS c
         LEFT JOIN information_schema.KEY_COLUMN_USAGE k
           ON k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME AND k.COLUMN_NAME = c.COLUMN_NAME AND k.CONSTRAINT_NAME = 'PRIMARY'
         WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ? ORDER BY c.ORDINAL_POSITION`,
        [schema, table],
      )
      return rows.map(([name, type, nullable, defaultValue, pkOrder, extra]) => ({
        name: String(name), type: String(type), nullable: nullable === 'YES', defaultValue: defaultValue ?? null,
        pk: pkOrder !== null, pkOrder: Number(pkOrder ?? 0), generated: /GENERATED/i.test(String(extra ?? '')),
        autoIncrement: /auto_increment/i.test(String(extra ?? '')),
      }))
    },

    async indexes(schema, table) {
      const rows = await rowsOf(
        `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        [schema, table],
      )
      const indexes = new Map()
      for (const [name, nonUnique, column] of rows) {
        const entry = indexes.get(name) ?? { name: String(name), unique: Number(nonUnique) === 0, primary: name === 'PRIMARY', columns: [] }
        entry.columns.push(String(column ?? '(expression)'))
        indexes.set(name, entry)
      }
      return [...indexes.values()]
    },

    async ddl(schema, table) {
      const [rows] = await conn.query({ sql: `SHOW CREATE TABLE \`${schema.replace(/`/g, '``')}\`.\`${table.replace(/`/g, '``')}\``, rowsAsArray: true })
      return `${rows[0]?.[1] ?? ''};`
    },

    async close() {
      await conn.end().catch(() => {})
    },
  }
}

/** mysql2's numeric column types by name (only for the result headers). */
function mysqlType(code) {
  const names = {
    0: 'decimal', 1: 'tinyint', 2: 'smallint', 3: 'int', 4: 'float', 5: 'double', 7: 'timestamp', 8: 'bigint', 9: 'mediumint',
    10: 'date', 11: 'time', 12: 'datetime', 13: 'year', 15: 'varchar', 16: 'bit', 245: 'json', 246: 'decimal', 252: 'blob',
    253: 'varchar', 254: 'char',
  }
  return names[code] ?? String(code)
}
