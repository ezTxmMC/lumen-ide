/**
 * H2 through a small JDBC bridge: there is no JavaScript driver, so the
 * extension downloads the H2 jar from Maven Central on first use, writes its
 * own compiled bridge class next to it and runs both with the user's Java.
 * Requests and answers are lines on stdin/stdout (see Bridge.java).
 *
 * H2 locks the database file while it is open — for as long as the
 * connection lasts, which is what an open connection means anyway.
 */

import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { DriverError } from '../errors.js'
import { BRIDGE_CLASS } from './bridge-class.js'

const DEFAULT_VERSION = '2.3.232'
const MAVEN = 'https://repo1.maven.org/maven2/com/h2database/h2'
/** Extra time the bridge gets past its own query timeout before the process is ended. */
const SAFETY_MS = 5000
/** What is kept of the bridge's error output, for the message when it dies. */
const STDERR_TAIL = 4000

/** A Java that runs: the setting, then JAVA_HOME, then the PATH. */
async function findJava(ctx) {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java'
  const candidates = [
    ctx.settings.get('javaPath'),
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', exe) : null,
    'java',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (await runs(candidate)) return candidate
  }
  throw new DriverError('noJava')
}

function runs(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['-version'], { stdio: 'ignore', windowsHide: true })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

async function download(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/** The H2 jar in the extension's folder, fetched and checked against Maven's SHA-1 when missing. */
async function ensureJar(dir, version) {
  if (!/^[0-9][0-9A-Za-z.-]*$/.test(version)) throw new DriverError('h2Download', { error: `invalid version ${version}` })
  const jar = path.join(dir, `h2-${version}.jar`)
  const present = await fs.stat(jar).then((stat) => stat.size > 0, () => false)
  if (present) return jar
  try {
    const url = `${MAVEN}/${version}/h2-${version}.jar`
    const [bytes, sha1] = await Promise.all([download(url), download(`${url}.sha1`)])
    const expected = sha1.toString('utf8').trim().split(/\s+/)[0].toLowerCase()
    const actual = crypto.createHash('sha1').update(bytes).digest('hex')
    if (expected !== actual) throw new Error(`checksum mismatch (${actual} ≠ ${expected})`)
    const temp = `${jar}.${process.pid}.tmp`
    await fs.writeFile(temp, bytes)
    await fs.rename(temp, jar)
    return jar
  } catch (err) {
    if (err instanceof DriverError) throw err
    throw new DriverError('h2Download', { error: err.message })
  }
}

/** Bridge.class next to the jar — rewritten only when the embedded one changed. */
async function ensureBridge(dir) {
  const file = path.join(dir, 'Bridge.class')
  const bytes = Buffer.from(BRIDGE_CLASS, 'base64')
  const current = await fs.readFile(file).catch(() => null)
  if (current && current.equals(bytes)) return
  const temp = `${file}.${process.pid}.tmp`
  await fs.writeFile(temp, bytes)
  await fs.rename(temp, file)
}

/** The JDBC URL: a full `jdbc:h2:` URL as given, or the file without `.mv.db`. */
export function h2Url(connection) {
  if (connection.url) return connection.url
  if (!connection.file) throw new DriverError('noFile')
  const base = connection.file.replace(/\.mv\.db$/i, '').replace(/\.h2\.db$/i, '')
  return `jdbc:h2:file:${base};IFEXISTS=TRUE`
}

/** A parameter as the bridge reads it: a type letter and the value as text. */
function encodeParam(value) {
  if (value === null || value === undefined) return 'n'
  if (typeof value === 'number' || typeof value === 'bigint') return `d:${value}`
  if (typeof value === 'boolean') return `b:${value}`
  if (value instanceof Uint8Array) return `x:${Buffer.from(value).toString('hex')}`
  return `s:${value}`
}

const b64 = (text) => Buffer.from(String(text), 'utf8').toString('base64')

export async function openH2(connection, { password, ctx }) {
  const url = h2Url(connection)
  const java = await findJava(ctx)
  const dir = path.join(await ctx.storage.dir(), 'h2')
  await fs.mkdir(dir, { recursive: true })
  const jar = await ensureJar(dir, ctx.settings.get('h2Version') || DEFAULT_VERSION)
  await ensureBridge(dir)

  const child = spawn(java, ['-cp', [dir, jar].join(path.delimiter), 'Bridge'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  let stderr = ''
  let exited = false
  let counter = 0
  const waiting = new Map()

  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL) })
  child.stdin.on('error', () => {})
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let answer
    try {
      answer = JSON.parse(line)
    } catch {
      return
    }
    const entry = waiting.get(answer.id)
    if (!entry) return
    waiting.delete(answer.id)
    clearTimeout(entry.timer)
    if (answer.ok) {
      entry.resolve(answer)
      return
    }
    // H2's "statement was canceled or the session timed out".
    if (/\[57014-/.test(answer.error ?? '') && entry.seconds) {
      entry.reject(new DriverError('timeout', { seconds: entry.seconds }))
      return
    }
    entry.reject(new Error(answer.error))
  })
  const died = (err) => {
    exited = true
    const reason = err ?? new Error(stderr.trim() || 'The H2 bridge ended')
    for (const entry of waiting.values()) {
      clearTimeout(entry.timer)
      entry.reject(reason)
    }
    waiting.clear()
  }
  child.on('error', (err) => died(err))
  child.on('exit', () => died(null))

  /** One request; the bridge answers in order, the id pairs them up anyway. */
  function send(command, fields = [], { seconds = 0 } = {}) {
    if (exited) return Promise.reject(new Error(stderr.trim() || 'The H2 bridge is not running'))
    const id = String(++counter)
    return new Promise((resolve, reject) => {
      // Should JDBC's own timeout not bite, the process goes — nothing else stops it.
      const timer = seconds > 0
        ? setTimeout(() => {
          waiting.delete(id)
          reject(new DriverError('timeout', { seconds }))
          child.kill()
        }, seconds * 1000 + SAFETY_MS)
        : null
      waiting.set(id, { resolve, reject, timer, seconds })
      child.stdin.write(`${[id, command, ...fields.map(b64)].join('\t')}\n`)
    })
  }

  /** Transactions must not interleave with other calls on the one connection. */
  let queue = Promise.resolve()
  const serial = (fn) => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => {})
    return next
  }

  async function run(sql, params = [], options = {}) {
    const seconds = options.timeoutMs > 0 ? Math.max(1, Math.ceil(options.timeoutMs / 1000)) : 0
    const maxRows = options.maxRows ?? 100_000
    const answer = await send('query', [sql, String(maxRows), String(seconds), ...params.map(encodeParam)], { seconds })
    return {
      columns: answer.columns ?? [],
      rows: answer.rows ?? [],
      ...(answer.columns?.length ? {} : { affected: answer.affected }),
      truncated: Boolean(answer.truncated),
    }
  }

  const query = (sql, params, options) => serial(() => run(sql, params, options))

  try {
    await send('open', [url, connection.user || 'sa', password ?? ''])
  } catch (err) {
    child.kill()
    throw err
  }

  return {
    kind: 'sql',
    dialect: 'h2',
    rowIds: false,
    query,

    transaction(statements, options = {}) {
      return serial(async () => {
        await send('begin')
        let affected = 0
        try {
          for (const { sql, params } of statements) affected += (await run(sql, params ?? [], options)).affected ?? 0
          await send('commit')
        } catch (err) {
          await send('rollback').catch(() => {})
          throw err
        }
        return { affected }
      })
    },

    async tree() {
      const schemas = (await query(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA
        WHERE SCHEMA_NAME <> 'INFORMATION_SCHEMA' ORDER BY SCHEMA_NAME`)).rows.map((row) => String(row[0]))
      const tables = (await query(`SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA <> 'INFORMATION_SCHEMA' ORDER BY TABLE_SCHEMA, TABLE_NAME`)).rows
      const bySchema = new Map(schemas.map((name) => [name, []]))
      for (const [schema, name, type] of tables) {
        if (!bySchema.has(schema)) bySchema.set(schema, [])
        bySchema.get(schema).push({ name: String(name), kind: /VIEW/i.test(String(type)) ? 'view' : 'table' })
      }
      return [...bySchema].map(([name, list]) => ({ name, tables: list }))
    },

    async columns(schema, table) {
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
      )
      return rows.map(([name, type, nullable, defaultValue, pkOrder, generated, identity]) => ({
        name: String(name),
        type: String(type),
        nullable: nullable === 'YES',
        defaultValue: defaultValue ?? null,
        pk: Number(pkOrder) > 0,
        pkOrder: Number(pkOrder),
        generated: generated === 'ALWAYS' || identity === 'YES',
        autoIncrement: identity === 'YES',
      }))
    },

    async indexes(schema, table) {
      const { rows } = await query(
        `SELECT i.INDEX_NAME, i.INDEX_TYPE_NAME, c.COLUMN_NAME
         FROM INFORMATION_SCHEMA.INDEXES i
         JOIN INFORMATION_SCHEMA.INDEX_COLUMNS c
           ON c.INDEX_SCHEMA = i.INDEX_SCHEMA AND c.INDEX_NAME = i.INDEX_NAME
         WHERE i.TABLE_SCHEMA = ? AND i.TABLE_NAME = ? ORDER BY i.INDEX_NAME, c.ORDINAL_POSITION`,
        [schema, table],
      )
      const indexes = new Map()
      for (const [name, type, column] of rows) {
        const kind = String(type)
        const entry = indexes.get(name) ?? { name: String(name), unique: /UNIQUE|PRIMARY/i.test(kind), primary: /PRIMARY/i.test(kind), columns: [] }
        entry.columns.push(String(column))
        indexes.set(name, entry)
      }
      return [...indexes.values()]
    },

    async close() {
      if (exited) return
      const ended = new Promise((resolve) => child.once('exit', resolve))
      await Promise.race([send('close').catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))])
      child.stdin.end()
      const timer = setTimeout(() => child.kill(), 2000)
      await ended
      clearTimeout(timer)
    },
  }
}
