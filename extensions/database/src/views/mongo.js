/**
 * A MongoDB collection: documents found with a filter, a page at a time, in
 * a grid of their top-level fields. A click puts a document into the editor
 * below as Extended JSON; saving replaces it, a new one is inserted.
 */

import { documentText, fieldSummary, idFromKey, idKey, parseDocument } from '../drivers/mongo.js'
import { errorText } from '../drivers/errors.js'
import { uniqueNames } from '../format.js'

/** Columns drawn at most — documents can have hundreds of fields. */
const MAX_COLUMNS = 40

const parseSelection = (value) => {
  try {
    const ids = JSON.parse(String(value || '[]'))
    return Array.isArray(ids) ? ids.map(String) : []
  } catch {
    return []
  }
}

/** The top-level fields of a page of documents, `_id` first, in the order they appear. */
export function fieldsOf(documents) {
  const seen = new Set(['_id'])
  for (const document of documents) {
    for (const field of Object.keys(document)) seen.add(field)
    if (seen.size >= MAX_COLUMNS) break
  }
  return [...seen].slice(0, MAX_COLUMNS)
}

const NEW_DOCUMENT = '{\n  \n}\n'

export function createMongoTab({ ctx, t, sessions, settings, refresh }, { connection, db, collection }) {
  const state = {
    filter: '',
    sort: '',
    offset: 0,
    limit: settings.pageSize(),
    documents: [],
    total: undefined,
    loading: false,
    error: null,
    notice: null,
    /** The document in the editor: its id key, or 'new'. */
    editing: null,
    editorText: '',
    generation: 0,
  }

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
      const filter = parseDocument(state.filter)
      const sort = parseDocument(state.sort)
      const result = await (await driver()).find(db, collection, { filter, sort, skip: state.offset, limit: state.limit, timeoutMs: settings.timeoutMs() })
      if (generation !== state.generation) return
      state.documents = result.documents
      state.total = result.total
    } catch (err) {
      if (generation !== state.generation) return
      state.error = errorText(t, err)
    } finally {
      if (generation === state.generation) state.loading = false
      refresh()
    }
  }

  function render() {
    const fields = fieldsOf(state.documents)
    const ids = uniqueNames(fields)
    const nodes = [
      {
        type: 'row',
        children: [
          { type: 'input', id: 'filter', value: state.filter, mono: true, placeholder: t('mongo.filterPlaceholder'), submit: { action: 'find', title: t('mongo.find') } },
          { type: 'input', id: 'sort', value: state.sort, mono: true, placeholder: t('mongo.sortPlaceholder'), submit: { action: 'find', title: t('mongo.find') } },
          {
            type: 'buttons', buttons: [
              { action: 'find', title: t('mongo.find'), icon: 'search' },
              { action: 'newDocument', title: t('mongo.newDocument'), icon: 'plus' },
            ],
          },
        ],
      },
    ]
    if (state.error) nodes.push({ type: 'text', text: state.error, tone: 'danger', mono: true })
    if (state.notice) nodes.push({ type: 'text', text: state.notice, tone: 'success', small: true })
    nodes.push({
      type: 'grid',
      id: 'documents',
      grow: true,
      select: 'multi',
      activate: 'click',
      columns: fields.map((field, index) => ({ id: ids[index], title: field, width: field === '_id' ? 220 : 180 })),
      rows: state.documents.map((document) => ({
        id: idKey(document._id),
        cells: fields.map((field) => fieldSummary(document[field])),
        ...(state.editing === idKey(document._id) ? { tone: 'accent' } : {}),
      })),
      onOpen: { action: 'edit', title: t('mongo.edit') },
      menu: [
        { action: 'edit', title: t('mongo.edit'), icon: 'pencil' },
        { action: 'duplicate', title: t('mongo.duplicate'), icon: 'copy' },
        { action: 'deleteDocuments', title: t('mongo.delete'), icon: 'trash-2', danger: true },
      ],
      paging: {
        offset: state.offset, limit: state.limit, total: state.total,
        more: state.documents.length >= state.limit, action: { action: 'page', title: t('table.page') },
      },
      empty: state.loading ? t('table.loading') : t('mongo.noDocuments'),
    })
    if (state.editing) {
      nodes.push({ type: 'text', small: true, tone: 'muted', text: state.editing === 'new' ? t('mongo.editingNew') : t('mongo.editingDocument') })
      nodes.push({ type: 'code', id: 'document', language: 'json', value: state.editorText, rows: 12, submit: { action: 'save', title: t('mongo.save') } })
      nodes.push({
        type: 'buttons', buttons: [
          { action: 'save', title: state.editing === 'new' ? t('mongo.insert') : t('mongo.save'), icon: 'save', variant: 'primary' },
          { action: 'closeEditor', title: t('mongo.close'), icon: 'x' },
          ...(state.editing !== 'new' ? [{ action: 'deleteEditing', title: t('mongo.delete'), icon: 'trash-2', variant: 'danger' }] : []),
        ],
      })
    }
    return {
      title: `${db}.${collection}`,
      layout: 'fill',
      toolbar: [
        { action: 'find', title: t('table.refresh'), icon: 'refresh-cw' },
        { action: 'newDocument', title: t('mongo.newDocument'), icon: 'plus' },
      ],
      nodes,
    }
  }

  const documentFor = (key) => state.documents.find((document) => idKey(document._id) === key)

  async function removeDocuments(keys) {
    if (!keys.length) return
    const sure = await ctx.ui.confirm(t('mongo.deleteTitle'), t('mongo.deleteBody', { count: keys.length }), { confirmLabel: t('mongo.delete'), danger: true })
    if (!sure) return
    const removed = await (await driver()).remove(db, collection, keys.map(idFromKey))
    if (keys.includes(state.editing)) state.editing = null
    state.notice = t('mongo.deleted', { count: removed })
    await load()
  }

  const handlers = {
    find: (payload, inputs) => {
      state.filter = String(inputs.filter ?? state.filter).trim()
      state.sort = String(inputs.sort ?? state.sort).trim()
      state.offset = 0
      state.notice = null
      return load()
    },
    page: (payload) => {
      state.offset = Math.max(0, Number(payload?.offset ?? 0))
      return load()
    },
    edit: (payload) => {
      const document = documentFor(payload.row)
      if (!document) return
      state.editing = payload.row
      state.editorText = documentText(document)
      refresh()
    },
    duplicate: (payload) => {
      const document = documentFor(payload.row)
      if (!document) return
      const { _id: _, ...rest } = document
      state.editing = 'new'
      state.editorText = documentText(rest)
      refresh()
    },
    newDocument: () => {
      state.editing = 'new'
      state.editorText = NEW_DOCUMENT
      refresh()
    },
    closeEditor: () => {
      state.editing = null
      refresh()
    },
    save: async (payload, inputs) => {
      const text = String(inputs.document ?? state.editorText)
      state.editorText = text
      let document
      try {
        document = parseDocument(text)
      } catch (err) {
        state.error = t('mongo.invalidJson', { error: err.message })
        refresh()
        return
      }
      const mongo = await driver()
      if (state.editing === 'new') {
        const id = await mongo.insert(db, collection, document)
        state.editing = idKey(id)
        state.editorText = documentText({ _id: id, ...document })
        state.notice = t('mongo.inserted')
        await load()
        return
      }
      const id = idFromKey(state.editing)
      // The editor may not change the _id: replaceOne keeps the one it found.
      const { _id: _, ...rest } = document
      const matched = await mongo.replace(db, collection, id, rest)
      state.notice = matched ? t('mongo.saved') : t('mongo.notFound')
      await load()
    },
    deleteEditing: () => removeDocuments(state.editing && state.editing !== 'new' ? [state.editing] : []),
    deleteDocuments: (payload, inputs) => {
      const keys = parseSelection(inputs.documents)
      if (!keys.length && payload?.row) keys.push(payload.row)
      return removeDocuments(keys)
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
