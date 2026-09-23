/**
 * SQL for the five dialects the extension speaks: quoting, placeholders,
 * paging, and the statements that browse and change a table. Also a splitter
 * that cuts a script into statements the way the servers would.
 *
 * Pure functions — `test.mjs` covers them.
 */

export const DIALECTS = ['sqlite', 'postgres', 'mysql', 'mssql', 'h2']

/** Quote an identifier: `"a""b"`, `` `a``b` `` or `[a]]b]`. */
export function quoteIdent(dialect, name) {
  const text = String(name)
  if (dialect === 'mysql') return `\`${text.replace(/`/g, '``')}\``
  if (dialect === 'mssql') return `[${text.replace(/]/g, ']]')}]`
  return `"${text.replace(/"/g, '""')}"`
}

/** `schema.table`, or just `table` when there is no schema. */
export function qualified(dialect, schema, table) {
  if (!schema) return quoteIdent(dialect, table)
  return `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, table)}`
}

/** The n-th (1-based) parameter placeholder. */
export function placeholder(dialect, index) {
  if (dialect === 'postgres') return `$${index}`
  if (dialect === 'mssql') return `@p${index}`
  return '?'
}

/** A literal, for statements shown to the user (the ones run use parameters). */
export function sqlLiteral(dialect, value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') {
    if (dialect === 'mssql' || dialect === 'sqlite') return value ? '1' : '0'
    return value ? 'TRUE' : 'FALSE'
  }
  if (value instanceof Uint8Array) {
    const hex = Buffer.from(value).toString('hex')
    if (dialect === 'postgres') return `'\\x${hex}'::bytea`
    if (dialect === 'mssql') return `0x${hex}`
    return `X'${hex}'`
  }
  const text = String(value).replace(/'/g, "''")
  if (dialect === 'mysql') return `'${text.replace(/\\/g, '\\\\')}'`
  if (dialect === 'mssql') return `N'${text}'`
  return `'${text}'`
}

/** Replace the placeholders of a statement with literals — only for showing it. */
export function inlineParams(dialect, sql, params) {
  if (!params?.length) return sql
  if (dialect === 'postgres') return sql.replace(/\$(\d+)/g, (match, n) => (params[n - 1] !== undefined ? sqlLiteral(dialect, params[n - 1]) : match))
  if (dialect === 'mssql') return sql.replace(/@p(\d+)/g, (match, n) => (params[n - 1] !== undefined ? sqlLiteral(dialect, params[n - 1]) : match))
  let index = 0
  return sql.replace(/\?/g, () => sqlLiteral(dialect, params[index++]))
}

/**
 * One page of a table: `SELECT … FROM t WHERE <filter> ORDER BY … LIMIT …`.
 * `extra` are expressions selected in front of the columns (a row id).
 * The filter is the user's own SQL condition, pasted as it is.
 */
export function selectPage(dialect, { schema, table, filter, sort, offset = 0, limit = 200, extra = [] }) {
  const select = [...extra, '*'].join(', ')
  const where = filter?.trim() ? ` WHERE ${filter.trim()}` : ''
  const order = sort?.column ? ` ORDER BY ${quoteIdent(dialect, sort.column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'}` : ''
  const from = qualified(dialect, schema, table)
  if (dialect === 'mssql') {
    // OFFSET … FETCH needs an ORDER BY; without a chosen column any order will do.
    return `SELECT ${select} FROM ${from}${where}${order || ' ORDER BY (SELECT NULL)'} OFFSET ${Number(offset)} ROWS FETCH NEXT ${Number(limit)} ROWS ONLY`
  }
  return `SELECT ${select} FROM ${from}${where}${order} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
}

/** Every row of a table, filtered and sorted like the page — for exports. */
export function selectAll(dialect, { schema, table, filter, sort }) {
  const where = filter?.trim() ? ` WHERE ${filter.trim()}` : ''
  const order = sort?.column ? ` ORDER BY ${quoteIdent(dialect, sort.column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'}` : ''
  return `SELECT * FROM ${qualified(dialect, schema, table)}${where}${order}`
}

export function countRows(dialect, { schema, table, filter }) {
  const where = filter?.trim() ? ` WHERE ${filter.trim()}` : ''
  return `SELECT COUNT(*) FROM ${qualified(dialect, schema, table)}${where}`
}

/** `a = ? AND b IS NULL` for the key of a row. Returns the condition and its parameters. */
function keyCondition(dialect, key, startIndex) {
  const parts = []
  const params = []
  for (const [column, value] of Object.entries(key)) {
    if (value === null || value === undefined) {
      parts.push(`${keyColumnSql(dialect, column)} IS NULL`)
      continue
    }
    params.push(value)
    parts.push(`${keyColumnSql(dialect, column)} = ${placeholder(dialect, startIndex + params.length)}`)
  }
  return { sql: parts.join(' AND '), params }
}

/** Row ids that are not columns: SQLite's rowid and PostgreSQL's ctid. */
function keyColumnSql(dialect, column) {
  if (column === ROWID.sqlite && dialect === 'sqlite') return 'rowid'
  if (column === ROWID.postgres && dialect === 'postgres') return 'ctid'
  return quoteIdent(dialect, column)
}

/** Names under which a hidden row id is selected. */
export const ROWID = { sqlite: '__lumen_rowid', postgres: '__lumen_ctid' }

/** The expression that selects the hidden row id, for tables without a primary key. */
export function rowIdSelect(dialect) {
  if (dialect === 'sqlite') return `rowid AS ${quoteIdent(dialect, ROWID.sqlite)}`
  if (dialect === 'postgres') return `ctid::text AS ${quoteIdent(dialect, ROWID.postgres)}`
  return null
}

export function updateStatement(dialect, { schema, table }, key, values) {
  const params = []
  const sets = Object.entries(values).map(([column, value]) => {
    params.push(value)
    return `${quoteIdent(dialect, column)} = ${placeholder(dialect, params.length)}`
  })
  const where = keyCondition(dialect, key, params.length)
  // `ctid` compares with a tid, which a text parameter is not.
  const sql = `UPDATE ${qualified(dialect, schema, table)} SET ${sets.join(', ')} WHERE ${castRowId(dialect, where.sql)}`
  return { sql, params: [...params, ...where.params] }
}

export function deleteStatement(dialect, { schema, table }, key) {
  const where = keyCondition(dialect, key, 0)
  return { sql: `DELETE FROM ${qualified(dialect, schema, table)} WHERE ${castRowId(dialect, where.sql)}`, params: where.params }
}

export function insertStatement(dialect, { schema, table }, values) {
  const columns = Object.keys(values)
  const from = qualified(dialect, schema, table)
  if (!columns.length) {
    if (dialect === 'mysql') return { sql: `INSERT INTO ${from} () VALUES ()`, params: [] }
    return { sql: `INSERT INTO ${from} DEFAULT VALUES`, params: [] }
  }
  const params = columns.map((column) => values[column])
  const marks = columns.map((_, index) => placeholder(dialect, index + 1))
  return {
    sql: `INSERT INTO ${from} (${columns.map((column) => quoteIdent(dialect, column)).join(', ')}) VALUES (${marks.join(', ')})`,
    params,
  }
}

function castRowId(dialect, condition) {
  if (dialect !== 'postgres') return condition
  return condition.replace(/\bctid = (\$\d+)/g, 'ctid = $1::tid')
}

/* ------------------------------------------------------------------ *
 * Splitting a script into statements
 * ------------------------------------------------------------------ */

/**
 * Cut a script at the semicolons that end statements — not those inside
 * strings, quoted names, comments or PostgreSQL's `$tag$` bodies. MS SQL's
 * `GO` on a line of its own separates batches as well. Empty statements go.
 */
export function splitStatements(script, dialect = '') {
  const statements = []
  let start = 0
  let i = 0
  const text = String(script)
  const push = (end) => {
    const statement = text.slice(start, end).trim()
    if (statement && !/^(--[^\n]*\n?|\/\*[\s\S]*?\*\/|\s)*$/.test(statement)) statements.push(statement)
  }
  while (i < text.length) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '-' && next === '-') {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end + 1
      continue
    }
    if (char === '#' && dialect === 'mysql') {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end + 1
      continue
    }
    if (char === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
      continue
    }
    if (char === "'" || char === '"' || char === '`' || (char === '[' && dialect === 'mssql')) {
      const close = char === '[' ? ']' : char
      i++
      while (i < text.length) {
        if (text[i] === '\\' && char === "'" && dialect === 'mysql') {
          i += 2
          continue
        }
        if (text[i] === close) {
          if (text[i + 1] === close) {
            i += 2
            continue
          }
          break
        }
        i++
      }
      i++
      continue
    }
    if (char === '$' && dialect === 'postgres') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i))
      if (tag) {
        const end = text.indexOf(tag[0], i + tag[0].length)
        i = end === -1 ? text.length : end + tag[0].length
        continue
      }
    }
    if (char === ';') {
      push(i)
      start = i + 1
      i++
      continue
    }
    if (dialect === 'mssql' && (i === 0 || text[i - 1] === '\n')) {
      const go = /^[ \t]*GO[ \t]*(\r?\n|$)/i.exec(text.slice(i))
      if (go) {
        push(i)
        i += go[0].length
        start = i
        continue
      }
    }
    i++
  }
  push(text.length)
  return statements
}

/** Does a statement return rows? (A guess by its first word — for choosing how to run it.) */
export function returnsRows(statement) {
  const word = /^\s*(?:(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*([a-z]+)/i.exec(statement)?.[1]?.toLowerCase()
  return ['select', 'with', 'show', 'pragma', 'explain', 'describe', 'desc', 'values', 'table', 'call', 'exec', 'execute'].includes(word ?? '')
}
