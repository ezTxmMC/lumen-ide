/**
 * An SQL console: an editor, Ctrl+Enter runs the script (or the selection),
 * statement by statement, and the results show below — one grid per
 * statement that returned rows, the others as a line each.
 */

import { qualified, splitStatements } from '../sql.js'
import { formatDuration, isNumericType, toCell, uniqueNames } from '../format.js'
import { errorText } from '../drivers/errors.js'

/** Statements after which the tree may have changed. */
const CHANGES_SCHEMA = /^\s*(create|drop|alter|rename|attach|detach)\b/i

function firstSql(dialect, schema, table, limit) {
  if (!table) return ''
  const from = qualified(dialect, schema && schema !== 'main' ? schema : null, table)
  if (dialect === 'mssql') return `SELECT TOP ${limit} * FROM ${from};\n`
  return `SELECT * FROM ${from} LIMIT ${limit};\n`
}

/** One line for a statement in the result picker. */
const shorten = (statement) => statement.replace(/\s+/g, ' ').slice(0, 60)

export function createQueryTab({ t, sessions, settings, actions, refresh }, { connection, schema, table, sql }) {
  const state = {
    sql: sql ?? null,
    results: [],
    shown: 0,
    running: false,
    error: null,
    generation: 0,
  }

  async function load() {
    if (state.sql !== null) return
    // The dialect is known only once connected; the first statement waits for that.
    const db = await sessions.driver(connection.id).catch(() => null)
    state.sql = db ? firstSql(db.dialect, schema, table, Math.min(settings.pageSize(), 1000)) : ''
    refresh()
  }

  async function run(text) {
    const generation = ++state.generation
    const db = await sessions.driver(connection.id)
    if (!db) return
    const statements = splitStatements(text, db.dialect)
    if (!statements.length) return
    state.running = true
    state.error = null
    state.results = []
    state.shown = 0
    refresh()
    let schemaChanged = false
    for (const statement of statements) {
      const started = Date.now()
      try {
        const result = await db.query(statement, [], { maxRows: settings.maxRows(), timeoutMs: settings.timeoutMs() })
        if (generation !== state.generation) return
        state.results.push({ statement, ...result, ms: Date.now() - started })
        if (CHANGES_SCHEMA.test(statement)) schemaChanged = true
      } catch (err) {
        if (generation !== state.generation) return
        state.results.push({ statement, error: errorText(t, err), ms: Date.now() - started })
        break
      }
      refresh()
    }
    // Show the last result with rows, or else the last one.
    const withRows = state.results.map((result, index) => ({ result, index })).filter(({ result }) => result.columns?.length)
    state.shown = withRows.length ? withRows[withRows.length - 1].index : state.results.length - 1
    state.running = false
    refresh()
    if (schemaChanged) void sessions.refreshTree(connection.id)
  }

  function summary(result) {
    if (result.error) return t('query.failed', { error: result.error })
    const time = formatDuration(result.ms)
    if (result.columns?.length) {
      if (result.truncated) return t('query.rowsTruncated', { count: result.rows.length, time })
      return t('query.rows', { count: result.rows.length, time })
    }
    if (result.affected !== undefined && result.affected !== null) return t('query.affected', { count: result.affected, time })
    return t('query.done', { time })
  }

  function render() {
    const nodes = [
      {
        type: 'code',
        id: 'sql',
        language: 'sql',
        value: state.sql ?? '',
        rows: 10,
        placeholder: t('query.placeholder'),
        submit: { action: 'run', title: t('query.run') },
      },
      {
        type: 'row',
        children: [
          {
            type: 'buttons', buttons: [
              { action: 'run', title: t('query.run'), icon: 'play', variant: 'primary', disabled: state.running },
              ...(state.running ? [{ action: 'cancel', title: t('query.stopWaiting'), icon: 'square' }] : []),
              { action: 'clear', title: t('query.clear'), icon: 'rotate-ccw', disabled: !state.results.length },
            ],
          },
          { type: 'text', text: t('query.hint'), tone: 'muted', small: true },
        ],
      },
    ]
    if (state.running) nodes.push({ type: 'progress', label: t('query.running') })
    if (state.results.length > 1) {
      nodes.push({
        type: 'select',
        id: 'result',
        label: t('query.result'),
        value: String(state.shown),
        options: state.results.map((result, index) => ({ value: String(index), label: `${index + 1}. ${shorten(result.statement)} — ${summary(result)}` })),
        change: { action: 'show', title: t('query.result') },
      })
    }
    const result = state.results[state.shown]
    if (result) {
      nodes.push({ type: 'text', text: summary(result), tone: result.error ? 'danger' : 'muted', small: !result.error, mono: Boolean(result.error) })
    }
    if (result?.columns?.length) {
      const names = uniqueNames(result.columns.map((column) => column.name))
      nodes.push({
        type: 'grid',
        id: 'rows',
        grow: true,
        select: 'multi',
        columns: result.columns.map((column, index) => ({
          id: names[index],
          title: column.name,
          detail: column.type || undefined,
          numeric: isNumericType(column.type),
          width: Math.min(320, Math.max(90, column.name.length * 9 + 40)),
        })),
        rows: result.rows.map((row, index) => ({ id: String(index), cells: row.map(toCell) })),
        empty: t('query.noRows'),
      })
    }
    return {
      title: t('query.title', { name: connection.name }),
      layout: 'fill',
      toolbar: [
        { action: 'run', title: t('query.run'), icon: 'play' },
        { action: 'export', title: t('table.export'), icon: 'download', disabled: !result?.columns?.length },
      ],
      nodes,
    }
  }

  const handlers = {
    run: (payload, inputs) => {
      const text = String(inputs.sql ?? state.sql ?? '')
      state.sql = text
      const selection = String(inputs['sql.selection'] ?? '').trim()
      return run(selection || text)
    },
    // A running statement cannot always be stopped; the console just stops waiting for it.
    cancel: () => {
      state.generation++
      state.running = false
      refresh()
    },
    clear: (payload, inputs) => {
      state.sql = String(inputs.sql ?? state.sql ?? '')
      state.results = []
      refresh()
    },
    show: (payload) => {
      state.shown = Number(payload) || 0
      refresh()
    },
    export: async () => {
      const result = state.results[state.shown]
      if (!result?.columns?.length) return
      await actions.exportRows(connection.name, result.columns, result.rows)
    },
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
  }
}
