/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */
/**
 * The tree nodes of the connections view: a connection with its schemas and
 * tables (SQL), databases (Redis) or databases and collections (MongoDB).
 */

import { SQL_TYPES, TYPE_ICONS, describe } from '../connections.js';

const TYPE_BADGES = { sqlite: 'SQLite', h2: 'H2', postgres: 'PG', mysql: 'MySQL', mssql: 'MSSQL', redis: 'Redis', mongo: 'Mongo' };

/** Schemas opened from the start: the only one, or the usual default of the server. */
const DEFAULT_SCHEMAS = ['main', 'public', 'dbo', 'PUBLIC'];

/** Builds the node of one connection from its session state. */
export function createConnectionItem({ t, sessions }) {
  const payloadOf = (connection, extra = {}) => ({ id: connection.id, ...extra });

  function tableItem(connection, schema, table) {
    const target = payloadOf(connection, { schema, table: table.name, kind: table.kind });
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
    };
  }

  function sqlChildren(connection, tree) {
    const schemas = tree.schemas ?? [];
    // A database with a single schema (SQLite's `main`) needs no schema level.
    if (schemas.length === 1) {
      return schemaChildren(connection, schemas[0]);
    }
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
    }));
  }

  function schemaChildren(connection, schema) {
    if (!schema.tables.length) {
      return [{ type: 'text', text: t('tree.noTables'), tone: 'muted', small: true }];
    }
    const tables = schema.tables.filter((table) => table.kind !== 'view');
    const views = schema.tables.filter((table) => table.kind === 'view');
    return [...tables, ...views].map((table) => tableItem(connection, schema.name, table));
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
    }));
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
          const target = payloadOf(connection, { db: db.name, collection: collection.name });
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
          };
        })
        : [{ type: 'text', text: t('tree.noCollections'), tone: 'muted', small: true }],
    }));
  }

  function connectionItem(connection) {
    const state = sessions.state(connection.id);
    const connected = state.status === 'connected';
    const payload = payloadOf(connection);
    const isSql = SQL_TYPES.includes(connection.type);
    const children = [];
    if (state.status === 'connecting') {
      children.push({ type: 'progress', label: t('tree.connecting') });
    }
    if (state.status === 'error') {
      children.push({ type: 'text', text: state.error, tone: 'danger', small: true });
    }
    if (connected && state.tree?.error) {
      children.push({ type: 'text', text: state.tree.error, tone: 'danger', small: true });
    }
    if (connected && !state.tree?.error) {
      if (isSql) {
        children.push(...sqlChildren(connection, state.tree));
      }
      if (connection.type === 'redis') {
        children.push(...redisChildren(connection, state.tree));
      }
      if (connection.type === 'mongo') {
        children.push(...mongoChildren(connection, state.tree));
      }
    }
    const tone = { connected: 'success', error: 'danger', connecting: 'accent' }[state.status] ?? 'muted';
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
    };
  }

  return connectionItem;
}
