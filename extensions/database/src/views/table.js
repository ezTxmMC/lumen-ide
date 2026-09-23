/**
 * A table's data: one page at a time, sorted and filtered by the server.
 * Edited cells, new rows and rows marked for deletion wait as pending
 * changes until they are committed together — or rolled back.
 *
 * Rows are addressed by their primary key; a table without one by SQLite's
 * rowid or PostgreSQL's ctid, and otherwise not at all (read-only).
 */

import { ROWID, countRows, inlineParams, rowIdSelect, selectAll, selectPage } from '../sql.js'
import { isNumericType, jsonSafe, parseInput, toCell } from '../format.js'
import { addRow, clearPending, createPending, isNewRow, pendingCount, pendingStatements, setCell, toggleDelete } from '../pending.js'
import { errorText } from '../drivers/errors.js'

/** Rows exported at most. */
const EXPORT_LIMIT = 1_000_000

const parseSelection = (value) => {
  try {
    const ids = JSON.parse(String(value || '[]'))
    return Array.isArray(ids) ? ids.map(String) : []
  } catch {
    return []
  }
}

export function createTableTab({ ctx, t, sessions, settings, actions, refresh, api }, { connection, schema, table, kind }) {
  const state = {
    columns: null,
    keyColumns: [],
    rowIdColumn: null,
    offset: 0,
    limit: settings.pageSize(),
    sort: null,
    filter: '',
    rows: [],
    resultColumns: [],
    rowIds: [],
    total: undefined,
    loading: false,
    error: null,
    notice: null,
    pending: createPending(),
    /** row id → key values (raw), for every row seen — pending edits may sit on other pages. */
    keys: new Map(),
    /** row id → the row as loaded, for the original value of an edited cell. */
    originals: new Map(),
    dialect: null,
    generation: 0,
  }

  const editable = () => kind === 'table' && !connection.readOnly && (state.keyColumns.length > 0 || Boolean(state.rowIdColumn))

  async function driver() {
    const found = await sessions.driver(connection.id)
    if (!found) throw new Error(t('error.cancelled'))
    return found
  }

  async function load() {
    const generation = ++state.generation
    state.loading = true
    state.error = null
    refresh()
    try {
      const db = await driver()
      state.dialect = db.dialect
      if (!state.columns) {
        state.columns = await db.columns(schema, table)
        state.keyColumns = state.columns.filter((column) => column.pk).sort((a, b) => a.pkOrder - b.pkOrder).map((column) => column.name)
        state.rowIdColumn = !state.keyColumns.length && db.rowIds && kind === 'table' ? ROWID[db.dialect] ?? null : null
      }
      const extra = state.rowIdColumn ? [rowIdSelect(db.dialect)] : []
      const sql = selectPage(db.dialect, { schema, table, filter: state.filter, sort: state.sort, offset: state.offset, limit: state.limit, extra })
      const result = await db.query(sql, [], { timeoutMs: settings.timeoutMs() })
      if (generation !== state.generation) return
      state.resultColumns = result.columns
      state.rows = result.rows
      state.rowIds = result.rows.map((row, index) => rowIdOf(row, index))
      state.loading = false
      refresh()
      // The count can be slow on a large table; the page is already there.
      state.total = undefined
      const counted = await db.query(countRows(db.dialect, { schema, table, filter: state.filter }), [], { timeoutMs: settings.timeoutMs() }).catch(() => null)
      if (generation !== state.generation) return
      state.total = counted ? Number(counted.rows[0]?.[0] ?? 0) : undefined
    } catch (err) {
      if (generation !== state.generation) return
      state.error = errorText(t, err)
    } finally {
      if (generation === state.generation) state.loading = false
      refresh()
    }
  }

  /** A stable id for a row: its key, so pending edits survive paging and sorting. */
  function rowIdOf(row, index) {
    const names = state.rowIdColumn ? [state.rowIdColumn] : state.keyColumns
    if (!names.length) return `r${state.offset + index}`
    const key = {}
    for (const name of names) key[name] = row[state.resultColumns.findIndex((column) => column.name === name)]
    const id = `k:${JSON.stringify(jsonSafe(key))}`
    state.keys.set(id, key)
    state.originals.set(id, row)
    return id
  }

  /** Visible columns: the result's, without the hidden row id. */
  const visibleColumns = () => state.resultColumns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.name !== state.rowIdColumn)

  const metaOf = (name) => state.columns?.find((column) => column.name === name) ?? { name, type: '' }

  function originalValue(rowId, name) {
    const row = state.originals.get(rowId)
    const index = state.resultColumns.findIndex((column) => column.name === name)
    return row && index >= 0 ? row[index] : undefined
  }

  /* ---------------- rendering ---------------- */

  function gridRows() {
    const visible = visibleColumns()
    const rows = state.rows.map((row, index) => {
      const id = state.rowIds[index]
      const edits = state.pending.edits.get(id) ?? {}
      const deleted = state.pending.deletes.has(id)
      const changed = []
      const cells = visible.map(({ column, index: at }, position) => {
        if (column.name in edits) {
          changed.push(position)
          return toCell(edits[column.name])
        }
        return toCell(row[at])
      })
      const tone = (deleted && 'deleted') || (changed.length && 'modified') || undefined
      return { id, cells, ...(tone ? { tone } : {}), ...(deleted ? { strike: true } : {}), ...(changed.length ? { changed } : {}) }
    })
    for (const inserted of state.pending.inserts) {
      rows.push({
        id: inserted.id,
        tone: 'added',
        cells: visible.map(({ column }) => (column.name in inserted.values ? toCell(inserted.values[column.name]) : t('table.default'))),
        changed: visible.map((_, position) => position).filter((position) => visible[position].column.name in inserted.values),
      })
    }
    return rows
  }

  function gridColumns() {
    const canEdit = editable()
    return visibleColumns().map(({ column }) => {
      const meta = metaOf(column.name)
      return {
        id: column.name,
        title: column.name,
        detail: meta.type || column.type || undefined,
        numeric: isNumericType(meta.type || column.type),
        sortable: true,
        key: Boolean(meta.pk),
        editable: canEdit && !meta.generated,
        nullable: meta.nullable !== false,
        width: Math.min(320, Math.max(90, column.name.length * 9 + 40)),
      }
    })
  }

  function render() {
    const count = pendingCount(state.pending)
    const canEdit = editable()
    const title = `${schema && schema !== 'main' ? `${schema}.` : ''}${table}`
    const nodes = [
      {
        type: 'row',
        children: [
          {
            type: 'input', id: 'filter', value: state.filter, mono: true,
            placeholder: t('table.filterPlaceholder'),
            submit: { action: 'filter', title: t('table.applyFilter') },
          },
          {
            type: 'buttons', buttons: [
              { action: 'filter', title: t('table.applyFilter'), icon: 'filter' },
              ...(state.filter ? [{ action: 'clearFilter', title: t('table.clearFilter'), icon: 'x' }] : []),
            ],
          },
        ],
      },
    ]
    if (state.error) nodes.push({ type: 'text', text: state.error, tone: 'danger', mono: true })
    if (state.notice) nodes.push({ type: 'text', text: state.notice, tone: 'success', small: true })
    if (!canEdit && state.columns && kind === 'table' && !connection.readOnly) nodes.push({ type: 'text', text: t('table.readOnlyNoKey'), tone: 'muted', small: true })
    if (state.loading && !state.rows.length) nodes.push({ type: 'progress', label: t('table.loading') })
    nodes.push({
      type: 'grid',
      id: 'grid',
      grow: true,
      columns: gridColumns(),
      rows: gridRows(),
      select: 'multi',
      sort: state.sort ?? undefined,
      onSort: { action: 'sort', title: t('table.sort') },
      ...(canEdit ? { onEdit: { action: 'edit', title: t('table.edit') } } : {}),
      menu: canEdit
        ? [
          { action: 'addRow', title: t('table.addRow'), icon: 'plus' },
          { action: 'deleteRows', title: t('table.deleteRows'), icon: 'trash-2', danger: true },
        ]
        : [],
      paging: {
        offset: state.offset, limit: state.limit, total: state.total,
        more: state.rows.length >= state.limit, action: { action: 'page', title: t('table.page') },
      },
      empty: state.loading ? t('table.loading') : t('table.empty'),
    })
    if (count) {
      nodes.push({
        type: 'row',
        children: [
          { type: 'text', text: t('table.pending', { count }), tone: 'warning' },
          {
            type: 'buttons', buttons: [
              { action: 'commit', title: t('table.commit'), icon: 'check', variant: 'primary' },
              { action: 'rollback', title: t('table.rollback'), icon: 'undo' },
              { action: 'showSql', title: t('table.showSql'), icon: 'file-code' },
            ],
          },
        ],
      })
    }
    return {
      title,
      layout: 'fill',
      badge: count || undefined,
      toolbar: [
        { action: 'refresh', title: t('table.refresh'), icon: 'refresh-cw' },
        ...(canEdit ? [
          { action: 'addRow', title: t('table.addRow'), icon: 'plus' },
          { action: 'deleteRows', title: t('table.deleteRows'), icon: 'trash-2' },
        ] : []),
        { action: 'export', title: t('table.export'), icon: 'download' },
        { action: 'structure', title: t('tree.structure'), icon: 'list-tree' },
        { action: 'query', title: t('tree.selectQuery'), icon: 'square-terminal' },
      ],
      nodes,
    }
  }

  /* ---------------- changes ---------------- */

  function statements() {
    return pendingStatements(state.pending, {
      dialect: state.dialect,
      schema,
      table,
      keyOf: (rowId) => state.keys.get(rowId) ?? {},
    })
  }

  async function commit() {
    const list = statements()
    if (!list.length) return
    if (settings.confirmCommit()) {
      const preview = list.slice(0, 8).map((statement) => inlineParams(state.dialect, statement.sql, statement.params)).join(';\n')
      const more = list.length > 8 ? `\n… ${t('table.moreStatements', { count: list.length - 8 })}` : ''
      const sure = await ctx.ui.confirm(t('table.commitTitle', { count: list.length }), `${preview};${more}`, { confirmLabel: t('table.commit') })
      if (!sure) return
    }
    try {
      const db = await driver()
      const result = await db.transaction(list, { timeoutMs: settings.timeoutMs() })
      clearPending(state.pending)
      state.notice = t('table.committed', { count: list.length, affected: result.affected ?? 0 })
      await load()
    } catch (err) {
      state.error = t('table.commitFailed', { error: errorText(t, err) })
      refresh()
    }
  }

  const handlers = {
    refresh: () => load(),
    filter: (payload, inputs) => {
      state.filter = String(inputs.filter ?? '').trim()
      state.offset = 0
      return load()
    },
    clearFilter: () => {
      state.filter = ''
      state.offset = 0
      return load()
    },
    sort: (payload) => {
      state.sort = payload?.direction ? { column: payload.column, direction: payload.direction } : null
      state.offset = 0
      return load()
    },
    page: (payload) => {
      state.offset = Math.max(0, Number(payload?.offset ?? 0))
      return load()
    },
    edit: (payload) => {
      const { row, column, value } = payload
      if (state.pending.deletes.has(row)) return
      const parsed = parseInput(value, metaOf(column), state.dialect)
      setCell(state.pending, row, column, parsed, isNewRow(state.pending, row) ? undefined : originalValue(row, column))
      state.notice = null
      refresh()
    },
    addRow: () => {
      addRow(state.pending)
      state.notice = null
      refresh()
    },
    deleteRows: (payload, inputs) => {
      // The selection, or the row the context menu was opened on.
      const ids = parseSelection(inputs.grid)
      if (!ids.length && payload?.row) ids.push(payload.row)
      if (!ids.length) {
        ctx.ui.notify(t('table.selectRows'), 'info')
        return
      }
      toggleDelete(state.pending, ids)
      state.notice = null
      refresh()
    },
    rollback: () => {
      clearPending(state.pending)
      state.notice = null
      refresh()
    },
    commit,
    showSql: () => {
      const text = statements().map((statement) => `${inlineParams(state.dialect, statement.sql, statement.params)};`).join('\n')
      ctx.ui.openDocument(`${table}.sql`, `${text}\n`, 'sql')
    },
    export: async () => {
      const db = await driver()
      const sql = selectAll(db.dialect, { schema, table, filter: state.filter, sort: state.sort })
      const result = await db.query(sql, [], { maxRows: EXPORT_LIMIT, timeoutMs: settings.timeoutMs() })
      await actions.exportRows(table, result.columns, result.rows)
    },
    structure: () => api.openStructure(connection, schema, table),
    query: () => api.openQuery(connection, { schema, table }),
  }

  return {
    connection,
    load,
    render,
    async onAction({ action, payload, inputs }) {
      const handler = handlers[action]
      if (handler) await handler(payload, inputs)
    },
    dispose() {
      state.generation++
    },
    /** For the tests and the status: are there changes that would be lost? */
    pendingCount: () => pendingCount(state.pending),
  }
}
