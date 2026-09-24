/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** A table's structure: its columns, its indexes and — where the server tells — its DDL. */

import { errorText } from '../drivers/errors.js';
import { renderStructure } from './structure-render.js';

export function createStructureTab({ t, sessions, refresh, api }, { connection, schema, table }) {
  const state = { columns: null, indexes: [], ddl: null, error: null, loading: false };

  async function load() {
    state.loading = true;
    state.error = null;
    refresh();
    try {
      const db = await sessions.driver(connection.id);
      if (!db) {
        throw new Error(t('error.cancelled'));
      }
      state.columns = await db.columns(schema, table);
      state.indexes = await db.indexes(schema, table).catch(() => []);
      state.ddl = db.ddl ? await db.ddl(schema, table).catch(() => null) : null;
    } catch (err) {
      state.error = errorText(t, err);
    } finally {
      state.loading = false;
      refresh();
    }
  }

  const render = () => renderStructure(t, state, table);

  return {
    connection,
    load,
    render,
    async onAction({ action }) {
      if (action === 'refresh') {
        await load();
      }
      if (action === 'data') {
        api.openTable(connection, schema, table);
      }
    },
  };
}
