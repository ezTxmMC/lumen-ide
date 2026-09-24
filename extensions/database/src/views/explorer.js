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
 * The connections view: every saved connection, and once connected its
 * schemas and tables (SQL), databases (Redis) or databases and collections
 * (MongoDB). A click opens what it names in a tab of the editor area.
 */

import { createConnectionItem } from './explorer-tree.js';

export function createExplorerView({ ctx, t, connections, sessions, tabs, actions }) {
  const connectionItem = createConnectionItem({ t, sessions });

  function render() {
    const list = connections.list();
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
    };
  }

  const connectionOf = (payload) => connections.get(payload?.id);
  const report = (err) => ctx.ui.notify(err?.message ?? String(err), 'error');

  const handlers = {
    add: () => actions.addConnection(),
    openFile: () => actions.openFile(),
    refreshAll: async () => {
      for (const connection of connections.list()) {
        await sessions.refreshTree(connection.id);
      }
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
      const answer = await ctx.ui.input(t('tree.newCollection'), [{ id: 'name', label: t('field.name'), required: true }]);
      if (!answer?.name) {
        return;
      }
      const driver = await sessions.driver(payload.id);
      await driver.createCollection(payload.db, answer.name.trim());
      await sessions.refreshTree(payload.id);
    },
    dropCollection: async (payload) => {
      const driver = await sessions.driver(payload.id);
      await driver.dropCollection(payload.db, payload.collection);
      await sessions.refreshTree(payload.id);
    },
  };

  return {
    render,
    async onAction({ action, payload }) {
      const handler = handlers[action];
      if (!handler) {
        return;
      }
      try {
        await handler(payload);
      } catch (err) {
        report(err);
      }
    },
  };
}
