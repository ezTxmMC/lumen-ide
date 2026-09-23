/**
 * One Redis key, shown and edited the way its type wants: text for a string,
 * field and value for a hash, positions for a list, members for sets, scores
 * for sorted sets, entries for a stream. Changes are written at once — Redis
 * has no transaction to roll back.
 */

import { errorText } from '../drivers/errors.js'
import { formatTtl } from './redis.js'

const parseSelection = (value) => {
  try {
    const ids = JSON.parse(String(value || '[]'))
    return Array.isArray(ids) ? ids.map(String) : []
  } catch {
    return []
  }
}

/** `a 1 b 2` → [['a', '1'], ['b', '2']] — the fields of a new stream entry. */
export function fieldPairs(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean)
  const pairs = []
  for (let i = 0; i + 1 < words.length; i += 2) pairs.push([words[i], words[i + 1]])
  return pairs
}

/** A stream entry's flat [field, value, …] as pairs. */
const pairsOf = (flat) => {
  const pairs = []
  for (let i = 0; i + 1 < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]])
  return pairs
}

export function createRedisKeyTab({ ctx, t, sessions, refresh }, { connection, db, key }) {
  const state = { data: null, loading: false, error: null, notice: null, key }

  async function driver() {
    const found = await sessions.driver(connection.id)
    if (!found) throw new Error(t('error.cancelled'))
    return found
  }

  async function load() {
    state.loading = true
    state.error = null
    refresh()
    try {
      state.data = await (await driver()).read(db, state.key)
    } catch (err) {
      state.error = errorText(t, err)
    } finally {
      state.loading = false
      refresh()
    }
  }

  /** Run a change, then read the key again. */
  async function change(fn, notice) {
    try {
      await fn(await driver())
      state.notice = notice ?? null
      state.error = null
    } catch (err) {
      state.error = errorText(t, err)
    }
    await load()
  }

  const grid = (columns, rows, extra = {}) => ({
    type: 'grid', id: 'items', grow: true, select: 'multi', columns, rows, ...extra,
  })
  const removeMenu = [{ action: 'removeItems', title: t('redisKey.remove'), icon: 'trash-2', danger: true }]
  const truncatedNote = (total, shown) => (total > shown ? [{ type: 'text', small: true, tone: 'warning', text: t('redisKey.truncated', { shown, total }) }] : [])

  const views = {
    string: (data) => [
      { type: 'code', id: 'value', value: data.value ?? '', grow: true, language: looksLikeJson(data.value) ? 'json' : undefined, submit: { action: 'saveString', title: t('redisKey.save') } },
      { type: 'buttons', buttons: [{ action: 'saveString', title: t('redisKey.save'), icon: 'save', variant: 'primary' }] },
    ],
    hash: (data) => [
      ...truncatedNote(data.total, data.entries.length),
      grid(
        [{ id: 'field', title: t('redisKey.field'), width: 260 }, { id: 'value', title: t('redisKey.value'), width: 480, editable: true }],
        data.entries.map(([field, value]) => ({ id: field, cells: [field, value] })),
        { onEdit: { action: 'editHash', title: t('redisKey.edit') }, menu: removeMenu },
      ),
      {
        type: 'row', children: [
          { type: 'input', id: 'newField', mono: true, placeholder: t('redisKey.field') },
          { type: 'input', id: 'newValue', mono: true, placeholder: t('redisKey.value'), submit: { action: 'addHash', title: t('redisKey.add') } },
          { type: 'buttons', buttons: [{ action: 'addHash', title: t('redisKey.add'), icon: 'plus' }] },
        ],
      },
    ],
    list: (data) => [
      ...truncatedNote(data.total, data.items.length),
      grid(
        [{ id: 'index', title: '#', width: 70, numeric: true }, { id: 'value', title: t('redisKey.value'), width: 600, editable: true }],
        data.items.map((value, index) => ({ id: String(index), cells: [index, value] })),
        { onEdit: { action: 'editList', title: t('redisKey.edit') }, menu: removeMenu },
      ),
      {
        type: 'row', children: [
          { type: 'input', id: 'newValue', mono: true, placeholder: t('redisKey.value'), submit: { action: 'pushRight', title: t('redisKey.pushRight') } },
          {
            type: 'buttons', buttons: [
              { action: 'pushLeft', title: t('redisKey.pushLeft'), icon: 'arrow-up' },
              { action: 'pushRight', title: t('redisKey.pushRight'), icon: 'arrow-down' },
            ],
          },
        ],
      },
    ],
    set: (data) => [
      ...truncatedNote(data.total, data.members.length),
      grid([{ id: 'member', title: t('redisKey.member'), width: 640 }], data.members.map((member) => ({ id: member, cells: [member] })), { menu: removeMenu }),
      {
        type: 'row', children: [
          { type: 'input', id: 'newValue', mono: true, placeholder: t('redisKey.member'), submit: { action: 'addSet', title: t('redisKey.add') } },
          { type: 'buttons', buttons: [{ action: 'addSet', title: t('redisKey.add'), icon: 'plus' }] },
        ],
      },
    ],
    zset: (data) => [
      ...truncatedNote(data.total, data.members.length),
      grid(
        [{ id: 'member', title: t('redisKey.member'), width: 480 }, { id: 'score', title: t('redisKey.score'), width: 140, numeric: true, editable: true }],
        data.members.map(([member, score]) => ({ id: member, cells: [member, Number(score)] })),
        { onEdit: { action: 'editScore', title: t('redisKey.edit') }, menu: removeMenu },
      ),
      {
        type: 'row', children: [
          { type: 'input', id: 'newValue', mono: true, placeholder: t('redisKey.member') },
          { type: 'input', id: 'newScore', mono: true, placeholder: t('redisKey.score'), submit: { action: 'addZset', title: t('redisKey.add') } },
          { type: 'buttons', buttons: [{ action: 'addZset', title: t('redisKey.add'), icon: 'plus' }] },
        ],
      },
    ],
    stream: (data) => [
      ...truncatedNote(data.total, data.entries.length),
      grid(
        [{ id: 'id', title: 'ID', width: 200 }, { id: 'fields', title: t('redisKey.fields'), width: 560 }],
        data.entries.map((entry) => ({ id: entry.id, cells: [entry.id, pairsOf(entry.fields).map(([field, value]) => `${field}=${value}`).join('  ')] })),
        { menu: removeMenu },
      ),
      {
        type: 'row', children: [
          { type: 'input', id: 'newValue', mono: true, placeholder: t('redisKey.streamPlaceholder'), submit: { action: 'addStream', title: t('redisKey.add') } },
          { type: 'buttons', buttons: [{ action: 'addStream', title: t('redisKey.add'), icon: 'plus' }] },
        ],
      },
    ],
  }

  function render() {
    const data = state.data
    const nodes = []
    if (state.error) nodes.push({ type: 'text', text: state.error, tone: 'danger', mono: true })
    if (state.notice) nodes.push({ type: 'text', text: state.notice, tone: 'success', small: true })
    if (!data && state.loading) nodes.push({ type: 'progress', label: t('table.loading') })
    if (data) {
      nodes.push({
        type: 'keyValue', rows: [
          { key: t('redis.key'), value: state.key },
          { key: t('redis.type'), value: data.type },
          { key: t('redis.ttl'), value: data.ttl < 0 ? t('redisKey.noExpiry') : formatTtl(data.ttl) },
          ...(data.total !== undefined ? [{ key: t('redisKey.size'), value: String(data.total) }] : []),
        ],
      })
    }
    if (data?.type === 'none') nodes.push({ type: 'empty', icon: 'key-round', title: t('redisKey.gone'), hint: t('redisKey.goneHint') })
    const view = data ? views[data.type] : null
    if (view) nodes.push(...view(data))
    if (data && !view && data.type !== 'none') nodes.push({ type: 'text', text: t('redisKey.unsupported', { type: data.type }), tone: 'muted' })
    return {
      title: state.key,
      layout: 'fill',
      toolbar: [
        { action: 'refresh', title: t('table.refresh'), icon: 'refresh-cw' },
        { action: 'expire', title: t('redis.setTtl'), icon: 'timer' },
        { action: 'rename', title: t('redisKey.rename'), icon: 'pencil' },
        { action: 'deleteKey', title: t('redisKey.deleteKey'), icon: 'trash-2' },
      ],
      nodes,
    }
  }

  const selected = (payload, inputs) => {
    const ids = parseSelection(inputs.items)
    if (!ids.length && payload?.row) ids.push(payload.row)
    return ids
  }
  const text = (inputs, id) => String(inputs[id] ?? '')

  const handlers = {
    refresh: () => load(),
    saveString: (payload, inputs) => change((redis) => redis.setString(db, state.key, text(inputs, 'value')), t('redisKey.saved')),
    editHash: (payload) => change((redis) => redis.hashSet(db, state.key, payload.row, payload.value ?? '')),
    addHash: (payload, inputs) => {
      if (!text(inputs, 'newField')) return
      return change((redis) => redis.hashSet(db, state.key, text(inputs, 'newField'), text(inputs, 'newValue')))
    },
    editList: (payload) => change((redis) => redis.listSet(db, state.key, Number(payload.row), payload.value ?? '')),
    pushLeft: (payload, inputs) => change((redis) => redis.listPush(db, state.key, text(inputs, 'newValue'), 'left')),
    pushRight: (payload, inputs) => change((redis) => redis.listPush(db, state.key, text(inputs, 'newValue'), 'right')),
    addSet: (payload, inputs) => {
      if (!text(inputs, 'newValue')) return
      return change((redis) => redis.setAdd(db, state.key, [text(inputs, 'newValue')]))
    },
    editScore: (payload) => {
      const score = Number(payload.value)
      if (!Number.isFinite(score)) throw new Error(t('redisKey.badScore'))
      return change((redis) => redis.zsetAdd(db, state.key, payload.row, score))
    },
    addZset: (payload, inputs) => {
      const score = Number(text(inputs, 'newScore') || 0)
      if (!text(inputs, 'newValue') || !Number.isFinite(score)) throw new Error(t('redisKey.badScore'))
      return change((redis) => redis.zsetAdd(db, state.key, text(inputs, 'newValue'), score))
    },
    addStream: (payload, inputs) => {
      const pairs = fieldPairs(text(inputs, 'newValue'))
      if (!pairs.length) throw new Error(t('redisKey.badStream'))
      return change((redis) => redis.streamAdd(db, state.key, pairs))
    },
    removeItems: async (payload, inputs) => {
      const ids = selected(payload, inputs)
      if (!ids.length) return
      const remove = {
        hash: (redis) => redis.hashDelete(db, state.key, ids),
        list: (redis) => redis.listRemove(db, state.key, ids.map(Number)),
        set: (redis) => redis.setRemove(db, state.key, ids),
        zset: (redis) => redis.zsetRemove(db, state.key, ids),
        stream: (redis) => redis.streamDelete(db, state.key, ids),
      }[state.data?.type]
      if (!remove) return
      await change(remove)
    },
    expire: async () => {
      const answer = await ctx.ui.input(t('redis.setTtl'), [{ id: 'seconds', label: t('redis.ttlSeconds'), hint: t('redis.ttlHint'), value: state.data?.ttl > 0 ? String(Math.round(state.data.ttl / 1000)) : '' }])
      if (!answer) return
      await change((redis) => redis.expire(db, state.key, Number(answer.seconds) || 0))
    },
    rename: async () => {
      const answer = await ctx.ui.input(t('redisKey.rename'), [{ id: 'name', label: t('redis.key'), value: state.key, required: true, mono: true }])
      if (!answer?.name || answer.name === state.key) return
      await (await driver()).rename(db, state.key, answer.name)
      state.key = answer.name
      await load()
    },
    deleteKey: async () => {
      const sure = await ctx.ui.confirm(t('redis.deleteTitle'), t('redis.deleteBody', { count: 1, first: state.key }), { confirmLabel: t('redis.delete'), danger: true })
      if (!sure) return
      await change((redis) => redis.remove(db, [state.key]))
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
  }
}

function looksLikeJson(value) {
  if (typeof value !== 'string' || value.length > 200_000) return false
  const trimmed = value.trim()
  if (!/^[[{]/.test(trimmed)) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}
