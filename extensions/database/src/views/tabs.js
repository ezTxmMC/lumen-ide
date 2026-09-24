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
 * The tabs of the editor area: table data, a table's structure, SQL consoles,
 * Redis keys, MongoDB collections. They are instances of the one editor view
 * `data`; each instance is an object with `render`, `onAction`, `load` and
 * `dispose`, made by the files next to this one.
 *
 * Opening something that already has a tab brings that tab forward.
 */

import { createTableTab } from './table.js';
import { createStructureTab } from './structure.js';
import { createQueryTab } from './query.js';
import { createRedisTab } from './redis.js';
import { createRedisKeyTab } from './redis-key.js';
import { createMongoTab } from './mongo.js';
import { errorText } from '../drivers/errors.js';
import { createProvider } from './tabs-provider.js';

export const VIEW = 'data';

export function createTabs(deps) {
  const { ctx, t } = deps;
  const tabs = new Map();
  const byKey = new Map();
  let counter = 0;
  let consoles = 0;

  function open(key, title, create) {
    const known = byKey.get(key);
    if (known && tabs.has(known)) {
      ctx.views.open(VIEW, known, title);
      return tabs.get(known);
    }
    const instance = `t${++counter}`;
    const tab = create({ ...deps, instance, refresh: () => ctx.views.refresh(VIEW, instance), api });
    tab.key = key;
    tabs.set(instance, tab);
    byKey.set(key, instance);
    ctx.views.open(VIEW, instance, title);
    void Promise.resolve(tab.load?.()).catch((err) => ctx.ui.notify(errorText(t, err), 'error'));
    return tab;
  }

  const api = {
    openTable(connection, schema, table, kind = 'table') {
      if (!connection) {
        return;
      }
      return open(`table:${connection.id}:${schema}:${table}`, table, (tabDeps) => createTableTab(tabDeps, { connection, schema, table, kind }));
    },
    openStructure(connection, schema, table) {
      if (!connection) {
        return;
      }
      return open(`structure:${connection.id}:${schema}:${table}`, t('structure.tabTitle', { table }), (tabDeps) => createStructureTab(tabDeps, { connection, schema, table }));
    },
    /** A new console every time: several side by side are normal. */
    openQuery(connection, { schema, table, sql } = {}) {
      if (!connection) {
        return;
      }
      const number = ++consoles;
      return open(`query:${connection.id}:${number}`, t('query.tabTitle', { name: connection.name, number }), (tabDeps) => createQueryTab(tabDeps, { connection, schema, table, sql }));
    },
    openRedis(connection, db) {
      if (!connection) {
        return;
      }
      return open(`redis:${connection.id}:${db}`, `${connection.name} · db${db}`, (tabDeps) => createRedisTab(tabDeps, { connection, db }));
    },
    openRedisKey(connection, db, key) {
      if (!connection) {
        return;
      }
      return open(`rediskey:${connection.id}:${db}:${key}`, key, (tabDeps) => createRedisKeyTab(tabDeps, { connection, db, key }));
    },
    openCollection(connection, db, collection) {
      if (!connection) {
        return;
      }
      return open(`mongo:${connection.id}:${db}:${collection}`, collection, (tabDeps) => createMongoTab(tabDeps, { connection, db, collection }));
    },
    /** Tabs of a connection — to refresh or close them when it changes. */
    ofConnection: (id) => [...tabs.values()].filter((tab) => tab.connection?.id === id),
    refreshAll() {
      for (const instance of tabs.keys()) {
        ctx.views.refresh(VIEW, instance);
      }
    },
  };

  const provider = createProvider({ ctx, t, tabs, byKey });

  return { ...api, provider };
}
