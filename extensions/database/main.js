/**
 * Databases for Lumen: SQLite and H2 files, MariaDB/MySQL, PostgreSQL,
 * SQL Server, Redis and MongoDB. A view of connections on the left; tables,
 * consoles, keys and collections open as tabs in the editor area.
 *
 * The drivers are bundled into this file (see package.json); only H2 needs
 * something from outside — a Java runtime, and its jar, fetched on first use.
 */

import { createT } from './src/i18n/index.js'
import { createConnections, SQL_TYPES } from './src/connections.js'
import { createSessions } from './src/session.js'
import { createSettings } from './src/settings.js'
import { createActions } from './src/actions.js'
import { createExplorerView } from './src/views/explorer.js'
import { createTabs, VIEW } from './src/views/tabs.js'
import { errorText } from './src/drivers/errors.js'

export function activate(ctx) {
  const t = createT(ctx)
  const settings = createSettings(ctx)
  const connections = createConnections(ctx)
  const sessions = createSessions({ ctx, t, connections })
  const actions = createActions({ ctx, t, connections, sessions })
  const tabs = createTabs({ ctx, t, sessions, settings, actions, connections })
  const explorer = createExplorerView({ ctx, t, connections, sessions, tabs, actions })

  ctx.views.register('connections', explorer)
  ctx.views.register(VIEW, tabs.provider)

  const refreshTree = () => ctx.views.refresh('connections')
  const offSessions = sessions.onChange(refreshTree)
  const offConnections = connections.onChange(refreshTree)
  ctx.events.on('locale', () => {
    refreshTree()
    tabs.refreshAll()
  })

  const run = (fn) => async (args) => {
    try {
      return await fn(args)
    } catch (err) {
      ctx.ui.notify(errorText(t, err), 'error')
      return null
    }
  }

  ctx.commands.register('database.show', () => ctx.ui.showView('connections'))
  ctx.commands.register('database.add-connection', run(() => actions.addConnection()))
  // Also the target of “Open with …” for database files: `{ path }`.
  ctx.commands.register('database.open-file', run((args) => actions.openFile(typeof args?.path === 'string' ? args.path : undefined)))
  ctx.commands.register('database.new-query', run(async () => {
    const candidates = connections.list().filter((connection) => SQL_TYPES.includes(connection.type))
    if (!candidates.length) {
      ctx.ui.notify(t('command.noSqlConnection'), 'info')
      return
    }
    const connected = candidates.filter((connection) => sessions.state(connection.id).status === 'connected')
    const id = connected.length === 1
      ? connected[0].id
      : await ctx.ui.pick(t('command.pickConnection'), candidates.map((connection) => ({ value: connection.id, label: connection.name, detail: t(`type.${connection.type}`) })))
    if (!id) return
    tabs.openQuery(connections.get(id))
  }))
  ctx.commands.register('database.refresh', run(async () => {
    for (const connection of connections.list()) await sessions.refreshTree(connection.id)
    tabs.refreshAll()
  }))
  ctx.commands.register('database.disconnect-all', run(() => sessions.closeAll().then(refreshTree)))

  return async () => {
    offSessions()
    offConnections()
    await sessions.closeAll()
  }
}
