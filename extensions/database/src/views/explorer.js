/**
 * The connections view: every saved connection, and once connected its
 * schemas and tables (SQL), databases (Redis) or databases and collections
 * (MongoDB). A click opens what it names in a tab of the editor area.
 */

import { SQL_TYPES, TYPE_ICONS, describe } from '../connections.js'

const TYPE_BADGES = { sqlite: 'SQLite', h2: 'H2', postgres: 'PG', mysql: 'MySQL', mssql: 'MSSQL', redis: 'Redis', mongo: 'Mongo' }

/** Schemas opened from the start: the only one, or the usual default of the server. */
const DEFAULT_SCHEMAS = ['main', 'public', 'dbo', 'PUBLIC']

export function createExplorerView({ ctx, t, connections, sessions, tabs, actions }) {
  const payloadOf = (connection, extra = {}) => ({ id: connection.id, ...extra })

  function tableItem(connection, schema, table) {
    const target = payloadOf(connection, { schema, table: table.name, kind: table.kind })
    return {
      type: 'item',
      id: `${connection.id}/${schema}/${table.name}`,
      label: table.name,
      icon: table.kind === 'view' ? 'eye' : 'table',
      iconTone: 'muted',
      onClick: { action: 'openTable', title: t('tree.openData'), payload: target },
      actions: [{ action: 'structure', title: t('tree.structure'), icon: 'list-tree', payload: target }],
      menu: [
        { action: 'openTable', title: t('tree.openData'), payload: target },
        { action: 'structure', title: t('tree.structure'), payload: target },
        { action: 'selectQuery', title: t('tree.selectQuery'), payload: target },
      ],
    }
  }

  function sqlChildren(connection, tree) {
    const schemas = tree.schemas ?? []
    // A database with a single schema (SQLite's `main`) needs no schema level.
    if (schemas.length === 1) return schemaChildren(connection, schemas[0])
    return schemas.map((schema) => ({
      type: 'item',
      id: `${connection.id}/${schema.name}`,
      label: schema.name,
      icon: 'folder',
      iconTone: 'muted',
      badge: schema.tables.length || undefined,
      expanded: DEFAULT_SCHEMAS.includes(schema.name) || schema.name === connection.database,
      children: schemaChildren(connection, schema),
      menu: [{ action: 'newQuery', title: t('tree.newQuery'), payload: payloadOf(connection, { schema: schema.name }) }],
    }))
  }

  function schemaChildren(connection, schema) {
    if (!schema.tables.length) return [{ type: 'text', text: t('tree.noTables'), tone: 'muted', small: true }]
    const tables = schema.tables.filter((table) => table.kind !== 'view')
    const views = schema.tables.filter((table) => table.kind === 'view')
    return [...tables, ...views].map((table) => tableItem(connection, schema.name, table))
  }

  function redisChildren(connection, tree) {
    return (tree.databases ?? []).map((db) => ({
      type: 'item',
      id: `${connection.id}/db${db.index}`,
      label: `db${db.index}`,
      icon: 'database',
      iconTone: 'muted',
      description: t('tree.keys', { count: db.keys }),
      onClick: { action: 'openRedis', title: t('tree.openKeys'), payload: payloadOf(connection, { db: db.index }) },
    }))
  }

  function mongoChildren(connection, tree) {
    return (tree.databases ?? []).map((db) => ({
      type: 'item',
      id: `${connection.id}/${db.name}`,
      label: db.name,
      icon: 'database',
      iconTone: 'muted',
      badge: db.collections.length || undefined,
      expanded: db.name === connection.database,
      menu: [{ action: 'newCollection', title: t('tree.newCollection'), payload: payloadOf(connection, { db: db.name }) }],
      children: db.collections.length
        ? db.collections.map((collection) => {
          const target = payloadOf(connection, { db: db.name, collection: collection.name })
          return {
            type: 'item',
            id: `${connection.id}/${db.name}/${collection.name}`,
            label: collection.name,
            icon: collection.kind === 'view' ? 'eye' : 'folder-open',
            iconTone: 'muted',
            onClick: { action: 'openCollection', title: t('tree.openCollection'), payload: target },
            menu: [
              { action: 'openCollection', title: t('tree.openCollection'), payload: target },
              { action: 'dropCollection', title: t('tree.dropCollection'), payload: target, danger: true, confirm: t('tree.dropCollectionConfirm', { name: collection.name }) },
            ],
          }
        })
        : [{ type: 'text', text: t('tree.noCollections'), tone: 'muted', small: true }],
    }))
  }

  function connectionItem(connection) {
    const state = sessions.state(connection.id)
    const connected = state.status === 'connected'
    const payload = payloadOf(connection)
    const isSql = SQL_TYPES.includes(connection.type)
    const children = []
    if (state.status === 'connecting') children.push({ type: 'progress', label: t('tree.connecting') })
    if (state.status === 'error') children.push({ type: 'text', text: state.error, tone: 'danger', small: true })
    if (connected && state.tree?.error) children.push({ type: 'text', text: state.tree.error, tone: 'danger', small: true })
    if (connected && !state.tree?.error) {
      if (isSql) children.push(...sqlChildren(connection, state.tree))
      if (connection.type === 'redis') children.push(...redisChildren(connection, state.tree))
      if (connection.type === 'mongo') children.push(...mongoChildren(connection, state.tree))
    }
    const tone = { connected: 'success', error: 'danger', connecting: 'accent' }[state.status] ?? 'muted'
    return {
      type: 'item',
      id: connection.id,
      label: connection.name,
      description: describe(connection),
      tooltip: `${connection.name}\n${t(`type.${connection.type}`)} · ${describe(connection)}\n${t(`status.${state.status}`)}`,
      icon: TYPE_ICONS[connection.type],
      iconTone: tone,
      badge: TYPE_BADGES[connection.type],
      badgeTone: 'muted',
      expanded: state.status !== 'idle',
      // Unconnected rows connect on a click; connected ones fold.
      ...(connected || state.status === 'connecting' ? {} : { onClick: { action: 'connect', title: t('tree.connect'), payload } }),
      children,
      actions: [
        ...(isSql && connected ? [{ action: 'newQuery', title: t('tree.newQuery'), icon: 'square-terminal', payload }] : []),
        ...(connected ? [{ action: 'refreshConnection', title: t('tree.refresh'), icon: 'refresh-cw', payload }] : []),
        ...(connected ? [{ action: 'disconnect', title: t('tree.disconnect'), icon: 'log-out', payload }] : []),
        ...(!connected ? [{ action: 'connect', title: t('tree.connect'), icon: 'plug', payload }] : []),
      ],
      menu: [
        ...(!connected ? [{ action: 'connect', title: t('tree.connect'), payload }] : []),
        ...(connected ? [{ action: 'disconnect', title: t('tree.disconnect'), payload }] : []),
        ...(isSql ? [{ action: 'newQuery', title: t('tree.newQuery'), payload }] : []),
        ...(connected ? [{ action: 'refreshConnection', title: t('tree.refresh'), payload }] : []),
        { action: 'edit', title: t('tree.edit'), payload },
        { action: 'duplicate', title: t('tree.duplicate'), payload },
        { action: 'remove', title: t('tree.remove'), payload, danger: true },
      ],
    }
  }

  function render() {
    const list = connections.list()
    return {
      title: t('view.connections'),
      toolbar: [
        { action: 'add', title: t('toolbar.add'), icon: 'plus' },
        { action: 'openFile', title: t('toolbar.openFile'), icon: 'folder-open' },
        { action: 'refreshAll', title: t('toolbar.refresh'), icon: 'refresh-cw' },
      ],
      badge: list.filter((connection) => sessions.state(connection.id).status === 'connected').length || undefined,
      nodes: list.length
        ? [...list].sort((a, b) => a.name.localeCompare(b.name)).map(connectionItem)
        : [{
          type: 'empty',
          icon: 'database',
          title: t('tree.emptyTitle'),
          hint: t('tree.emptyHint'),
          action: { action: 'add', title: t('toolbar.add'), variant: 'primary' },
        }],
    }
  }

  const connectionOf = (payload) => connections.get(payload?.id)
  const report = (err) => ctx.ui.notify(err?.message ?? String(err), 'error')

  const handlers = {
    add: () => actions.addConnection(),
    openFile: () => actions.openFile(),
    refreshAll: async () => {
      for (const connection of connections.list()) await sessions.refreshTree(connection.id)
    },
    // The error shows in the tree under the connection.
    connect: (payload) => sessions.connect(payload.id).catch(() => {}),
    disconnect: (payload) => sessions.disconnect(payload.id),
    refreshConnection: (payload) => sessions.refreshTree(payload.id),
    edit: (payload) => actions.editConnection(payload.id),
    duplicate: (payload) => actions.duplicateConnection(payload.id),
    remove: (payload) => actions.removeConnection(payload.id),
    newQuery: (payload) => tabs.openQuery(connectionOf(payload), { schema: payload.schema }),
    openTable: (payload) => tabs.openTable(connectionOf(payload), payload.schema, payload.table, payload.kind),
    structure: (payload) => tabs.openStructure(connectionOf(payload), payload.schema, payload.table),
    selectQuery: (payload) => tabs.openQuery(connectionOf(payload), { schema: payload.schema, table: payload.table }),
    openRedis: (payload) => tabs.openRedis(connectionOf(payload), payload.db),
    openCollection: (payload) => tabs.openCollection(connectionOf(payload), payload.db, payload.collection),
    newCollection: async (payload) => {
      const answer = await ctx.ui.input(t('tree.newCollection'), [{ id: 'name', label: t('field.name'), required: true }])
      if (!answer?.name) return
      const driver = await sessions.driver(payload.id)
      await driver.createCollection(payload.db, answer.name.trim())
      await sessions.refreshTree(payload.id)
    },
    dropCollection: async (payload) => {
      const driver = await sessions.driver(payload.id)
      await driver.dropCollection(payload.db, payload.collection)
      await sessions.refreshTree(payload.id)
    },
  }

  return {
    render,
    async onAction({ action, payload }) {
      const handler = handlers[action]
      if (!handler) return
      try {
        await handler(payload)
      } catch (err) {
        report(err)
      }
    },
  }
}
