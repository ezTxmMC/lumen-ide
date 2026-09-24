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
 * The code of the SQLite helper process (see sqlite.js for why there is one).
 */

/** The helper's code — plain CommonJS, started with `-e`, so the bundle needs no second file. */
export const WORKER = String.raw`
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
`;
