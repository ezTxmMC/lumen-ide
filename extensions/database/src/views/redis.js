/**
 * The keys of a Redis database: found with a pattern (SCAN), shown with type
 * and time to live. A click opens a key in its own tab; a command line below
 * runs anything else.
 */

import { splitCommand } from '../drivers/redis.js'
import { errorText } from '../drivers/errors.js'
import { jsonSafe } from '../format.js'

const parseSelection = (value) => {
  try {
    const ids = JSON.parse(String(value || '[]'))
    return Array.isArray(ids) ? ids.map(String) : []
  } catch {
    return []
  }
}

/** “12 s”, “5 min”, “3 h”, “2 d” — or nothing for a key without expiry. */
export function formatTtl(ms) {
  if (ms < 0) return ''
  const seconds = Math.round(ms / 1000)
  if (seconds < 120) return `${seconds} s`
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`
  if (seconds < 172_800) return `${Math.round(seconds / 3600)} h`
  return `${Math.round(seconds / 86_400)} d`
}

/** A reply of any shape as text for the command line's output. */
export function replyText(reply) {
  if (reply === null || reply === undefined) return '(nil)'
  if (Buffer.isBuffer(reply)) return reply.toString('utf8')
  if (Array.isArray(reply)) {
    if (!reply.length) return '(empty)'
    return reply.map((entry, index) => `${index + 1}) ${replyText(entry)}`).join('\n')
  }
  if (typeof reply === 'object') return JSON.stringify(jsonSafe(reply), null, 2)
  return String(reply)
}

export function createRedisTab({ ctx, t, sessions, settings, refresh, api }, { connection, db }) {
  const state = { pattern: '*', entries: [], complete: true, loading: false, error: null, output: null }

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
      const result = await (await driver()).scan(db, state.pattern, settings.redisScanLimit())
      state.entries = result.entries
      state.complete = result.complete
    } catch (err) {
      state.error = errorText(t, err)
    } finally {
      state.loading = false
      refresh()
    }
  }

  function render() {
    const nodes = [
      {
        type: 'row',
        children: [
          { type: 'input', id: 'pattern', value: state.pattern, mono: true, placeholder: t('redis.patternPlaceholder'), submit: { action: 'search', title: t('redis.search') } },
          { type: 'buttons', buttons: [{ action: 'search', title: t('redis.search'), icon: 'search' }, { action: 'newKey', title: t('redis.newKey'), icon: 'plus' }] },
        ],
      },
    ]
    if (state.error) nodes.push({ type: 'text', text: state.error, tone: 'danger', mono: true })
    nodes.push({
      type: 'text',
      small: true,
      tone: 'muted',
      text: state.complete ? t('redis.found', { count: state.entries.length }) : t('redis.foundMore', { count: state.entries.length }),
    })
    nodes.push({
      type: 'grid',
      id: 'keys',
      grow: true,
      select: 'multi',
      activate: 'click',
      columns: [
        { id: 'key', title: t('redis.key'), width: 420 },
        { id: 'type', title: t('redis.type'), width: 90 },
        { id: 'ttl', title: t('redis.ttl'), width: 90, numeric: true },
      ],
      rows: state.entries.map((entry) => ({ id: entry.key, cells: [entry.key, entry.type, formatTtl(entry.ttl)] })),
      onOpen: { action: 'open', title: t('redis.open') },
      menu: [
        { action: 'open', title: t('redis.open'), icon: 'external-link' },
        { action: 'expire', title: t('redis.setTtl'), icon: 'timer' },
        { action: 'delete', title: t('redis.delete'), icon: 'trash-2', danger: true },
      ],
      empty: state.loading ? t('table.loading') : t('redis.noKeys'),
    })
    nodes.push({
      type: 'row',
      children: [
        { type: 'input', id: 'command', mono: true, placeholder: t('redis.commandPlaceholder'), submit: { action: 'command', title: t('redis.run') } },
        { type: 'buttons', buttons: [{ action: 'command', title: t('redis.run'), icon: 'play' }] },
      ],
    })
    if (state.output !== null) nodes.push({ type: 'text', text: state.output.text, mono: true, small: true, tone: state.output.error ? 'danger' : 'default' })
    return {
      title: `${connection.name} · db${db}`,
      layout: 'fill',
      toolbar: [
        { action: 'search', title: t('table.refresh'), icon: 'refresh-cw' },
        { action: 'newKey', title: t('redis.newKey'), icon: 'plus' },
      ],
      nodes,
    }
  }

  const selectedKeys = (payload, inputs) => {
    const keys = parseSelection(inputs.keys)
    if (!keys.length && payload?.row) keys.push(payload.row)
    return keys
  }

  const handlers = {
    search: (payload, inputs) => {
      state.pattern = String(inputs.pattern ?? state.pattern).trim() || '*'
      return load()
    },
    open: (payload) => api.openRedisKey(connection, db, payload.row),
    delete: async (payload, inputs) => {
      const keys = selectedKeys(payload, inputs)
      if (!keys.length) return
      const sure = await ctx.ui.confirm(t('redis.deleteTitle'), t('redis.deleteBody', { count: keys.length, first: keys[0] }), { confirmLabel: t('redis.delete'), danger: true })
      if (!sure) return
      await (await driver()).remove(db, keys)
      await load()
    },
    expire: async (payload, inputs) => {
      const keys = selectedKeys(payload, inputs)
      if (!keys.length) return
      const answer = await ctx.ui.input(t('redis.setTtl'), [{ id: 'seconds', label: t('redis.ttlSeconds'), hint: t('redis.ttlHint'), value: '3600' }])
      if (!answer) return
      const redis = await driver()
      for (const key of keys) await redis.expire(db, key, Number(answer.seconds) || 0)
      await load()
    },
    newKey: async () => {
      const answer = await ctx.ui.input(t('redis.newKey'), [
        { id: 'key', label: t('redis.key'), required: true, mono: true },
        {
          id: 'type', label: t('redis.type'), type: 'select', value: 'string',
          choices: ['string', 'hash', 'list', 'set', 'zset', 'stream'].map((value) => ({ value, label: value })),
        },
        { id: 'value', label: t('redis.firstValue'), hint: t('redis.firstValueHint'), mono: true },
      ], { submitLabel: t('redis.create') })
      if (!answer?.key) return
      const redis = await driver()
      const key = answer.key
      if (await redis.exists(db, key)) throw new Error(t('redis.exists', { key }))
      const value = answer.value ?? ''
      const create = {
        string: () => redis.setString(db, key, value),
        hash: () => redis.hashSet(db, key, value || 'field', ''),
        list: () => redis.listPush(db, key, value),
        set: () => redis.setAdd(db, key, [value]),
        zset: () => redis.zsetAdd(db, key, value, 0),
        stream: () => redis.streamAdd(db, key, [['field', value]]),
      }
      await create[answer.type ?? 'string']()
      await load()
      api.openRedisKey(connection, db, key)
    },
    command: async (payload, inputs) => {
      const args = splitCommand(inputs.command ?? '')
      if (!args.length) return
      try {
        const reply = await (await driver()).command(db, args)
        state.output = { text: `> ${args.join(' ')}\n${replyText(reply)}`, error: false }
      } catch (err) {
        state.output = { text: `> ${args.join(' ')}\n${errorText(t, err)}`, error: true }
      }
      refresh()
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
