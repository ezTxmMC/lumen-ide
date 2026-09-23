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

import { spawn } from 'node:child_process'
import { quoteIdent } from '../sql.js'
import { DriverError } from './errors.js'

/** The helper's code — plain CommonJS, started with `-e`, so the bundle needs no second file. */
const WORKER = String.raw`
const { DatabaseSync } = require('node:sqlite')
const workerData = JSON.parse(process.env.LUMEN_SQLITE)

let db = null
const small = (value) => (typeof value === 'bigint' && value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value)

function open() {
  const options = { readOnly: Boolean(workerData.readOnly) }
  db = new DatabaseSync(workerData.path, options)
  db.exec('PRAGMA busy_timeout = 5000')
}

function query(sql, params, maxRows) {
  const statement = db.prepare(sql)
  const columns = statement.columns().map((column) => ({ name: column.name, type: column.type ?? '' }))
  if (!columns.length) {
    const result = statement.run(...params)
    return { columns, rows: [], affected: Number(result.changes), truncated: false }
  }
  statement.setReturnArrays(true)
  statement.setReadBigInts(true)
  const rows = []
  let truncated = false
  for (const row of statement.iterate(...params)) {
    if (rows.length >= maxRows) {
      truncated = true
      break
    }
    rows.push(row.map(small))
  }
  return { columns, rows, truncated }
}

function transaction(statements) {
  db.exec('BEGIN')
  let affected = 0
  try {
    for (const { sql, params } of statements) affected += Number(db.prepare(sql).run(...params).changes)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return { affected }
}

process.on('disconnect', () => process.exit(0))
process.on('message', ({ id, op, sql, params, maxRows, statements }) => {
  try {
    if (!db) open()
    let result = null
    if (op === 'query') result = query(sql, params ?? [], maxRows ?? 1000)
    if (op === 'transaction') result = transaction(statements)
    if (op === 'close') {
      db.close()
      db = null
    }
    process.send({ id, ok: true, result })
  } catch (err) {
    process.send({ id, ok: false, error: err.message, code: err.code })
  }
})
`

/** Values node:sqlite can bind: no booleans. */
const bindable = (value) => (typeof value === 'boolean' ? Number(value) : value ?? null)

export async function openSqlite(connection) {
  const file = connection.file
  if (!file) throw new DriverError('noFile')
  const fs = await import('node:fs/promises')
  await fs.access(file).catch(() => { throw new DriverError('fileMissing', { file }) })
  try {
    await import('node:sqlite')
  } catch {
    throw new DriverError('noSqlite', { version: process.versions.node })
  }

  let worker = null
  let counter = 0
  const waiting = new Map()

  function start() {
    const child = spawn(process.execPath, ['-e', WORKER], {
      // Lumen's binary runs as plain Node; under Node itself the variable does nothing.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', LUMEN_SQLITE: JSON.stringify({ path: file, readOnly: Boolean(connection.readOnly) }) },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      serialization: 'advanced',
      windowsHide: true,
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000) })
    worker = child
    child.on('message', ({ id, ok, result, error }) => {
      const entry = waiting.get(id)
      if (!entry) return
      waiting.delete(id)
      clearTimeout(entry.timer)
      idle()
      if (ok) entry.resolve(result)
      if (!ok) entry.reject(new Error(error))
    })
    child.on('error', (err) => failAll(child, err))
    child.on('exit', () => {
      if (worker === child) worker = null
      failAll(child, stderr.trim() ? new Error(stderr.trim().split('\n').pop()) : new DriverError('workerGone'))
    })
    idle()
  }

  // An idle helper must not keep Node alive (the tests); a busy one must.
  function idle() {
    if (waiting.size) return
    worker?.unref()
    worker?.channel?.unref?.()
  }

  /** A helper ended: what it was still working on fails — not what a newer one is doing. */
  function failAll(child, err) {
    for (const [id, entry] of waiting) {
      if (entry.child !== child) continue
      waiting.delete(id)
      clearTimeout(entry.timer)
      entry.reject(err)
    }
  }

  function call(message, timeoutMs) {
    if (!worker) start()
    const child = worker
    const id = ++counter
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
          waiting.delete(id)
          idle()
          reject(new DriverError('timeout', { seconds: Math.round(timeoutMs / 1000) }))
          // The only way to stop a synchronous query: end the helper.
          child.kill('SIGKILL')
          if (worker === child) worker = null
        }, timeoutMs)
        : null
      waiting.set(id, { resolve, reject, timer, child })
      child.ref()
      child.channel?.ref?.()
      child.send({ id, ...message })
    })
  }

  const run = (sql, params = [], options = {}) =>
    call({ op: 'query', sql, params: params.map(bindable), maxRows: options.maxRows ?? 100_000 }, options.timeoutMs ?? 0)

  const pragma = async (schema, name, arg) => {
    const target = `${quoteIdent('sqlite', schema)}.${name}(${quoteIdent('sqlite', arg)})`
    return (await run(`PRAGMA ${target}`)).rows
  }

  // Opening fails early for a file that is not a database.
  await run('SELECT count(*) FROM sqlite_schema')

  return {
    kind: 'sql',
    dialect: 'sqlite',
    /** SQLite needs a row id for tables without a primary key — it has one: `rowid`. */
    rowIds: true,

    query: run,

    async transaction(statements, options = {}) {
      return call({ op: 'transaction', statements: statements.map((s) => ({ sql: s.sql, params: (s.params ?? []).map(bindable) })) }, options.timeoutMs ?? 0)
    },

    async tree() {
      const databases = (await run('PRAGMA database_list')).rows.map((row) => String(row[1])).filter((name) => name !== 'temp')
      const schemas = []
      for (const name of databases) {
        const master = name === 'main' ? 'sqlite_schema' : `${quoteIdent('sqlite', name)}.sqlite_schema`
        const { rows } = await run(`SELECT name, type FROM ${master} WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name`)
        schemas.push({ name, tables: rows.map(([table, type]) => ({ name: String(table), kind: type === 'view' ? 'view' : 'table' })) })
      }
      return schemas
    },

    async columns(schema, table) {
      const rows = await pragma(schema || 'main', 'table_xinfo', table)
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
        }))
    },

    async indexes(schema, table) {
      const list = await pragma(schema || 'main', 'index_list', table)
      const indexes = []
      for (const row of list) {
        const name = String(row[1])
        const columns = (await pragma(schema || 'main', 'index_info', name)).map((info) => String(info[2] ?? '(expression)'))
        indexes.push({ name, columns, unique: Number(row[2]) === 1, primary: String(row[3]) === 'pk' })
      }
      return indexes
    },

    async ddl(schema, table) {
      const master = !schema || schema === 'main' ? 'sqlite_schema' : `${quoteIdent('sqlite', schema)}.sqlite_schema`
      const { rows } = await run(`SELECT sql FROM ${master} WHERE tbl_name = ? AND sql IS NOT NULL ORDER BY type DESC, name`, [table])
      return rows.map((row) => `${row[0]};`).join('\n\n')
    },

    async close() {
      if (!worker) return
      const child = worker
      await call({ op: 'close' }, 2000).catch(() => {})
      child.disconnect?.()
      child.kill()
      worker = null
    },
  }
}
