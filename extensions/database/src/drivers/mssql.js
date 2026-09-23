/**
 * Microsoft SQL Server through `tedious` — one connection, requests one after
 * another (tedious runs one at a time), parameters as `@p1 …`.
 */

import tedious from 'tedious'
import { groupTree } from './postgres.js'
import { DriverError } from './errors.js'

const { Connection, Request, TYPES } = tedious

/**
 * `Server=host,1433;Database=db;User Id=sa;Password=…;Encrypt=true` — the
 * ADO.NET connection string — into the fields of a connection.
 */
export function parseMssqlConnectionString(text) {
  const out = {}
  for (const part of String(text).split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim().toLowerCase().replace(/\s+/g, ' ')
    const value = part.slice(index + 1).trim()
    if (['server', 'data source', 'address', 'addr'].includes(key)) {
      const [host, port] = value.replace(/^tcp:/i, '').split(',')
      const [name, instance] = host.split('\\')
      out.host = name
      if (instance) out.instance = instance
      if (port) out.port = Number(port)
    }
    if (['database', 'initial catalog'].includes(key)) out.database = value
    if (['user id', 'uid', 'user'].includes(key)) out.user = value
    if (['password', 'pwd'].includes(key)) out.password = value
    if (key === 'encrypt') out.encrypt = /^(true|yes|mandatory|strict)$/i.test(value)
    if (key === 'trustservercertificate') out.trustServerCertificate = /^(true|yes)$/i.test(value)
  }
  return out
}

function paramType(value) {
  if (value === null || value === undefined) return TYPES.NVarChar
  if (typeof value === 'number') return Number.isInteger(value) ? TYPES.BigInt : TYPES.Float
  if (typeof value === 'boolean') return TYPES.Bit
  if (value instanceof Uint8Array) return TYPES.VarBinary
  return TYPES.NVarChar
}

export async function openMssql(connection, { password }) {
  const fromUrl = connection.url ? parseMssqlConnectionString(connection.url) : {}
  const ssl = connection.ssl ?? 'off'
  const encrypt = fromUrl.encrypt ?? ssl !== 'off'
  const config = {
    server: connection.host || fromUrl.host || 'localhost',
    authentication: {
      type: 'default',
      options: { userName: connection.user || fromUrl.user || '', password: password || fromUrl.password || '' },
    },
    options: {
      ...(fromUrl.instance ? { instanceName: fromUrl.instance } : { port: Number(connection.port || fromUrl.port || 1433) }),
      database: connection.database || fromUrl.database || undefined,
      encrypt,
      trustServerCertificate: fromUrl.trustServerCertificate ?? ssl !== 'verify',
      connectTimeout: 15_000,
      requestTimeout: 0,
      rowCollectionOnRequestCompletion: false,
      useColumnNames: false,
      appName: 'Lumen',
    },
  }
  const conn = new Connection(config)
  await new Promise((resolve, reject) => {
    conn.on('connect', (err) => (err ? reject(err) : resolve()))
    conn.connect()
  })
  conn.on('error', () => {})

  /** Requests queue up: tedious refuses a second one while the first runs. */
  let queue = Promise.resolve()
  const serial = (fn) => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => {})
    return next
  }

  function request(sql, params = [], options = {}) {
    return serial(() => new Promise((resolve, reject) => {
      const max = options.maxRows ?? Infinity
      let columns = []
      let rows = []
      let truncated = false
      let affected
      let timer = null
      let cancelled = false
      const req = new Request(sql, (err, rowCount) => {
        clearTimeout(timer)
        if (err && cancelled && !truncated) {
          reject(new DriverError('timeout', { seconds: Math.round((options.timeoutMs ?? 0) / 1000) }))
          return
        }
        if (err && !(cancelled && truncated)) {
          reject(err)
          return
        }
        if (!columns.length) affected = rowCount
        resolve({ columns, rows, affected, truncated })
      })
      params.forEach((value, index) => req.addParameter(`p${index + 1}`, paramType(value), value ?? null))
      req.on('columnMetadata', (meta) => {
        // A batch with several result sets shows the last one.
        columns = meta.map((column) => ({ name: column.colName, type: column.type?.name?.toLowerCase() ?? '' }))
        rows = []
      })
      req.on('row', (row) => {
        if (rows.length >= max) {
          if (!truncated) {
            truncated = true
            cancelled = true
            conn.cancel()
          }
          return
        }
        rows.push(row.map((cell) => cell.value))
      })
      if (options.timeoutMs) {
        timer = setTimeout(() => {
          cancelled = true
          conn.cancel()
        }, options.timeoutMs)
      }
      conn.execSql(req)
    }))
  }

  const rowsOf = async (sql, params) => (await request(sql, params)).rows

  return {
    kind: 'sql',
    dialect: 'mssql',
    rowIds: false,
    query: request,

    // tedious's own transaction calls: a BEGIN sent as a statement would run
    // inside sp_executesql, which refuses to end with a transaction open.
    async transaction(statements, options = {}) {
      const call = (method) => serial(() => new Promise((resolve, reject) => conn[method]((err) => (err ? reject(err) : resolve()))))
      await call('beginTransaction')
      let affected = 0
      try {
        for (const { sql, params } of statements) affected += (await request(sql, params, options)).affected ?? 0
        await call('commitTransaction')
      } catch (err) {
        await call('rollbackTransaction').catch(() => {})
        throw err
      }
      return { affected }
    },

    async tree() {
      const schemas = (await rowsOf(`SELECT s.name FROM sys.schemas s
        WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest') AND s.name NOT LIKE 'db[_]%' ORDER BY s.name`)).map((row) => String(row[0]))
      const tables = await rowsOf(`SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_SCHEMA, TABLE_NAME`)
      return groupTree(schemas, tables.map(([schema, name, type]) => ({ schema: String(schema), name: String(name), kind: /VIEW/i.test(type) ? 'view' : 'table' })))
    },

    async columns(schema, table) {
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
      )
      return rows.map(([name, type, nullable, defaultValue, pkOrder, computed, identity]) => ({
        name: String(name), type: String(type), nullable: Boolean(nullable), defaultValue: defaultValue ?? null,
        pk: Number(pkOrder) > 0, pkOrder: Number(pkOrder), generated: Boolean(computed) || Boolean(identity), autoIncrement: Boolean(identity),
      }))
    },

    async indexes(schema, table) {
      const rows = await rowsOf(
        `SELECT i.name, i.is_unique, i.is_primary_key, c.name
         FROM sys.indexes i
         JOIN sys.objects o ON o.object_id = i.object_id
         JOIN sys.schemas s ON s.schema_id = o.schema_id
         JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
         WHERE s.name = @p1 AND o.name = @p2 AND i.name IS NOT NULL ORDER BY i.name, ic.key_ordinal`,
        [schema, table],
      )
      const indexes = new Map()
      for (const [name, unique, primary, column] of rows) {
        const entry = indexes.get(name) ?? { name: String(name), unique: Boolean(unique), primary: Boolean(primary), columns: [] }
        entry.columns.push(String(column))
        indexes.set(name, entry)
      }
      return [...indexes.values()]
    },

    async close() {
      conn.close()
    },
  }
}
