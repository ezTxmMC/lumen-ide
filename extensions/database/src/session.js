/**
 * Open connections: connecting (asking for a password that is not saved),
 * the object tree of each connection, and closing again. Everything that
 * shows a connection listens here for changes.
 */

import { openDriver } from './drivers/index.js'
import { errorText } from './drivers/errors.js'

export function createSessions({ ctx, t, connections }) {
  /** id → { status: 'connecting' | 'connected' | 'error', driver, tree, error, pending } */
  const sessions = new Map()
  /** Passwords typed for this run only (connections that do not save theirs). */
  const typed = new Map()
  const listeners = new Set()
  const changed = () => {
    for (const fn of listeners) fn()
  }

  const stateOf = (id) => sessions.get(id) ?? { status: 'idle' }

  async function passwordFor(connection) {
    if (connection.type === 'sqlite') return ''
    if (connection.savePassword !== false) return connections.password(connection.id)
    if (typed.has(connection.id)) return typed.get(connection.id)
    const answer = await ctx.ui.input(t('connect.passwordTitle', { name: connection.name }), [
      { id: 'password', label: t('field.password'), type: 'password' },
    ], { submitLabel: t('connect.submit') })
    if (!answer) return null
    typed.set(connection.id, answer.password ?? '')
    return answer.password ?? ''
  }

  /** What the tree shows under a connection. */
  async function loadTree(driver) {
    if (driver.kind === 'sql') return { schemas: await driver.tree() }
    if (driver.kind === 'redis') return { databases: await driver.databases() }
    const names = await driver.databases()
    const databases = await Promise.all(names.slice(0, 64).map(async (name) => ({
      name,
      collections: await driver.collections(name).catch(() => []),
    })))
    return { databases }
  }

  async function connect(id) {
    const known = sessions.get(id)
    if (known?.status === 'connected') return known.driver
    if (known?.pending) return known.pending
    const connection = connections.get(id)
    if (!connection) throw new Error(t('error.noConnection'))

    const pending = (async () => {
      const password = await passwordFor(connection)
      if (password === null) {
        sessions.delete(id)
        changed()
        return null
      }
      const driver = await openDriver(connection, { password, ctx, t })
      const tree = await loadTree(driver).catch((err) => ({ error: errorText(t, err) }))
      sessions.set(id, { status: 'connected', driver, tree })
      changed()
      return driver
    })()
    sessions.set(id, { status: 'connecting', pending })
    changed()
    try {
      return await pending
    } catch (err) {
      typed.delete(id)
      sessions.set(id, { status: 'error', error: errorText(t, err) })
      changed()
      throw err
    }
  }

  async function disconnect(id) {
    const known = sessions.get(id)
    sessions.delete(id)
    changed()
    await known?.driver?.close().catch(() => {})
  }

  return {
    state: stateOf,
    connect,
    disconnect,
    onChange(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },

    /** The driver of a connection, connecting first when needed. `null` when the user cancelled. */
    driver: (id) => connect(id),

    async refreshTree(id) {
      const known = sessions.get(id)
      if (known?.status !== 'connected') return
      known.tree = await loadTree(known.driver).catch((err) => ({ error: errorText(t, err) }))
      changed()
    },

    /** Try a connection without keeping it open. */
    async test(connection, password) {
      const driver = await openDriver(connection, { password, ctx, t })
      try {
        if (driver.kind === 'sql') await driver.query('SELECT 1', [], { maxRows: 1, timeoutMs: 15_000 })
        if (driver.kind !== 'sql') await loadTree(driver)
      } finally {
        await driver.close().catch(() => {})
      }
    },

    async closeAll() {
      const all = [...sessions.values()]
      sessions.clear()
      await Promise.all(all.map((entry) => entry.driver?.close().catch(() => {})))
    },
  }
}
