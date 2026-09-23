/**
 * What the user starts from the tree and the palette: adding and editing
 * connections, opening a database file, exporting results.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_PORTS, FILE_TYPES, TYPES, typeOfFile } from './connections.js'
import { errorText } from './drivers/errors.js'
import { CSV_SEPARATORS, toCsv, toJson } from './format.js'

export function createActions({ ctx, t, connections, sessions }) {
  const notifyError = (err) => ctx.ui.notify(errorText(t, err), 'error')

  /** The fields of the connection form for one type, filled with what is known. */
  function fieldsFor(type, known = {}) {
    const text = (id, extra = {}) => ({ id, label: t(`field.${id}`), value: known[id] === undefined ? '' : String(known[id]), ...extra })
    const name = text('name', { required: true, value: known.name ?? '' })
    if (FILE_TYPES.includes(type)) {
      return [
        name,
        text('file', { required: true, mono: true, placeholder: type === 'h2' ? '/path/to/data.mv.db' : '/path/to/data.sqlite', hint: t('field.fileHint') }),
        ...(type === 'h2' ? [
          text('user', { value: known.user ?? 'sa' }),
          { id: 'password', label: t('field.password'), type: 'password', placeholder: known.id ? t('field.passwordKeep') : '' },
        ] : []),
        { id: 'readOnly', label: t('field.readOnly'), type: 'toggle', value: known.readOnly ? 'true' : 'false' },
      ]
    }
    return [
      name,
      text('host', { placeholder: 'localhost' }),
      text('port', { placeholder: String(DEFAULT_PORTS[type] ?? '') }),
      text('user', { placeholder: type === 'mssql' ? 'sa' : '' }),
      { id: 'password', label: t('field.password'), type: 'password', placeholder: known.id ? t('field.passwordKeep') : '' },
      text('database', { placeholder: t(`field.databasePlaceholder.${type}`) }),
      text('url', { mono: true, placeholder: t(`field.urlPlaceholder.${type}`), hint: t('field.urlHint') }),
      {
        id: 'ssl', label: t('field.ssl'), type: 'select', value: known.ssl ?? 'off',
        choices: ['off', 'require', 'verify'].map((value) => ({ value, label: t(`field.sslMode.${value}`) })),
      },
      text('sslCa', { mono: true, placeholder: '/path/to/ca.pem' }),
      { id: 'savePassword', label: t('field.savePassword'), type: 'toggle', value: known.savePassword === false ? 'false' : 'true' },
    ]
  }

  /** The form's answer as a connection. */
  function fromAnswer(type, answer, known = {}) {
    const clean = (value) => String(value ?? '').trim()
    const connection = { ...known, type, name: clean(answer.name) || t(`type.${type}`) }
    for (const key of ['file', 'host', 'port', 'user', 'database', 'url', 'sslCa']) {
      const value = clean(answer[key])
      delete connection[key]
      if (value) connection[key] = value
    }
    if ('ssl' in answer) connection.ssl = answer.ssl || 'off'
    connection.readOnly = answer.readOnly === 'true'
    connection.savePassword = FILE_TYPES.includes(type) ? true : answer.savePassword !== 'false'
    return connection
  }

  /** Ask, test, save; asks again with the same values when the test fails and the user wants to fix it. */
  async function edit(type, known = {}) {
    let values = known
    for (;;) {
      const title = known.id ? t('connection.editTitle', { name: known.name }) : t('connection.addTitle', { type: t(`type.${type}`) })
      const answer = await ctx.ui.input(title, fieldsFor(type, values), { submitLabel: t('connection.save') })
      if (!answer) return null
      const connection = fromAnswer(type, answer, known)
      const typedPassword = answer.password ?? ''
      // An empty password field on an existing connection keeps the saved one.
      const password = typedPassword || !known.id ? typedPassword : undefined
      const testPassword = password ?? (known.id ? await connections.password(known.id) : '')
      const failure = await sessions.test(connection, testPassword).then(() => null, (err) => errorText(t, err))
      if (failure) {
        const keep = await ctx.ui.confirm(t('connection.testFailedTitle'), t('connection.testFailed', { error: failure }), { confirmLabel: t('connection.saveAnyway') })
        values = { ...connection, password: typedPassword }
        if (!keep) continue
      }
      const saved = await connections.put(connection, password).catch(async (err) => {
        notifyError(err)
        return connections.get(connection.id) ?? null
      })
      if (saved && known.id) await sessions.disconnect(saved.id)
      if (saved) void sessions.connect(saved.id).catch(() => {})
      return saved
    }
  }

  return {
    async addConnection() {
      const type = await ctx.ui.pick(t('connection.pickType'), TYPES.map((value) => ({ value, label: t(`type.${value}`), detail: t(`typeDetail.${value}`) })))
      if (!type) return null
      if (FILE_TYPES.includes(type)) return edit(type, { name: '', user: type === 'h2' ? 'sa' : undefined })
      return edit(type, { host: 'localhost', port: String(DEFAULT_PORTS[type] ?? '') })
    },

    editConnection: (id) => {
      const known = connections.get(id)
      if (!known) return null
      return edit(known.type, known)
    },

    async duplicateConnection(id) {
      const known = connections.get(id)
      if (!known) return
      const { id: _, ...rest } = known
      const password = await connections.password(id)
      await connections.put({ ...rest, name: t('connection.copyName', { name: known.name }) }, password || undefined).catch(notifyError)
    },

    async removeConnection(id) {
      const known = connections.get(id)
      if (!known) return
      const sure = await ctx.ui.confirm(t('connection.removeTitle'), t('connection.removeBody', { name: known.name }), { confirmLabel: t('connection.remove'), danger: true })
      if (!sure) return
      await sessions.disconnect(id)
      await connections.remove(id)
    },

    /** A database file: its connection (made when needed), connected. */
    async openFile(file) {
      if (!file) {
        const answer = await ctx.ui.input(t('file.openTitle'), [
          { id: 'file', label: t('field.file'), required: true, mono: true, placeholder: '/path/to/data.sqlite', hint: t('field.fileHint') },
        ], { submitLabel: t('file.open') })
        if (!answer?.file) return null
        file = answer.file.trim()
      }
      if (!path.isAbsolute(file)) file = path.resolve(ctx.workspace.root() ?? os.homedir(), file)
      if (!typeOfFile(file)) ctx.ui.notify(t('file.unknownType', { name: path.basename(file) }), 'warning')
      const connection = await connections.forFile(file).catch((err) => {
        notifyError(err)
        return null
      })
      if (!connection) return null
      await sessions.connect(connection.id).catch(notifyError)
      ctx.ui.showView('connections')
      return connection
    },

    /** Write rows as CSV or JSON to a file the user names. */
    async exportRows(name, columns, rows) {
      const base = (ctx.workspace.root() ?? os.homedir())
      const answer = await ctx.ui.input(t('export.title'), [
        {
          id: 'format', label: t('export.format'), type: 'select', value: 'csv',
          choices: [{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }],
        },
        { id: 'file', label: t('export.file'), required: true, mono: true, value: path.join(base, `${safeName(name)}.csv`), hint: t('export.fileHint') },
      ], { submitLabel: t('export.submit'), description: t('export.rows', { count: rows.length }) })
      if (!answer?.file) return
      const json = answer.format === 'json'
      let file = answer.file.trim()
      if (!path.isAbsolute(file)) file = path.resolve(base, file)
      if (json && file.endsWith('.csv')) file = `${file.slice(0, -4)}.json`
      const separator = CSV_SEPARATORS[ctx.settings.get('csvSeparator') ?? 'comma'] ?? ','
      const content = json ? toJson(columns, rows) : toCsv(columns, rows, separator)
      try {
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.writeFile(file, content, 'utf8')
        ctx.ui.notify(t('export.done', { count: rows.length, file }), 'success')
      } catch (err) {
        notifyError(err)
      }
    },
  }
}

const safeName = (name) => String(name || 'result').replace(/[^\w.-]+/g, '_').slice(0, 80)
