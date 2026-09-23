/**
 * Changes to a table that are not written yet: edited cells, new rows, rows
 * marked for deletion. Nothing reaches the database until they are committed
 * — then all of them in one transaction, or none.
 *
 * Pure — `test.mjs` covers it.
 */

import { deleteStatement, insertStatement, updateStatement } from './sql.js'

export function createPending() {
  return {
    /** row id → { column → new value } */
    edits: new Map(),
    /** new rows in the order they were added: { id, values: { column → value } } */
    inserts: [],
    /** ids of existing rows to delete */
    deletes: new Set(),
    counter: 0,
  }
}

export const isNewRow = (pending, rowId) => pending.inserts.some((row) => row.id === rowId)

export function pendingCount(pending) {
  return pending.edits.size + pending.inserts.length + pending.deletes.size
}

/** Set a cell. `original` is the value it had when loaded: setting it back drops the edit. */
export function setCell(pending, rowId, column, value, original) {
  const inserted = pending.inserts.find((row) => row.id === rowId)
  if (inserted) {
    inserted.values[column] = value
    return
  }
  const edits = { ...(pending.edits.get(rowId) ?? {}) }
  if (sameValue(value, original)) delete edits[column]
  if (!sameValue(value, original)) edits[column] = value
  if (Object.keys(edits).length) pending.edits.set(rowId, edits)
  if (!Object.keys(edits).length) pending.edits.delete(rowId)
}

function sameValue(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return (a ?? null) === (b ?? null)
  return String(a) === String(b)
}

export function addRow(pending) {
  const id = `new-${++pending.counter}`
  pending.inserts.push({ id, values: {} })
  return id
}

/** Mark rows for deletion; a new row simply goes. Marking a marked row again unmarks it. */
export function toggleDelete(pending, rowIds) {
  for (const rowId of rowIds) {
    const index = pending.inserts.findIndex((row) => row.id === rowId)
    if (index >= 0) {
      pending.inserts.splice(index, 1)
      continue
    }
    if (pending.deletes.has(rowId)) {
      pending.deletes.delete(rowId)
      continue
    }
    pending.deletes.add(rowId)
  }
}

export function clearPending(pending) {
  pending.edits.clear()
  pending.inserts.length = 0
  pending.deletes.clear()
}

/**
 * The statements that write the changes: deletes first (a key freed by a
 * delete may be taken by an insert), then updates, then inserts.
 * `keyOf(rowId)` gives the key columns and values of an existing row.
 */
export function pendingStatements(pending, { dialect, schema, table, keyOf }) {
  const target = { schema, table }
  const statements = []
  for (const rowId of pending.deletes) statements.push(deleteStatement(dialect, target, keyOf(rowId)))
  for (const [rowId, values] of pending.edits) {
    if (pending.deletes.has(rowId)) continue
    statements.push(updateStatement(dialect, target, keyOf(rowId), values))
  }
  for (const row of pending.inserts) statements.push(insertStatement(dialect, target, row.values))
  return statements
}
