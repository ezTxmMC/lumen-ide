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
 * A table's data: one page at a time, sorted and filtered by the server.
 * Edited cells, new rows and rows marked for deletion wait as pending
 * changes until they are committed together — or rolled back.
 *
 * Rows are addressed by their primary key; a table without one by SQLite's
 * rowid or PostgreSQL's ctid, and otherwise not at all (read-only).
 */

import { createPending, pendingCount } from '../pending.js';
import { createTableView } from './table-view.js';
import { createTableLoader } from './table-load.js';
import { createTableHandlers } from './table-actions.js';

export function createTableTab({ ctx, t, sessions, settings, actions, refresh, api }, { connection, schema, table, kind }) {
  const state = {
    columns: null,
    keyColumns: [],
    rowIdColumn: null,
    offset: 0,
    limit: settings.pageSize(),
    sort: null,
    filter: '',
    rows: [],
    resultColumns: [],
    rowIds: [],
    total: undefined,
    loading: false,
    error: null,
    notice: null,
    pending: createPending(),
    /** row id → key values (raw), for every row seen — pending edits may sit on other pages. */
    keys: new Map(),
    /** row id → the row as loaded, for the original value of an edited cell. */
    originals: new Map(),
    dialect: null,
    generation: 0,
  };

  const editable = () => kind === 'table' && !connection.readOnly && (state.keyColumns.length > 0 || Boolean(state.rowIdColumn));

  async function driver() {
    const found = await sessions.driver(connection.id);
    if (!found) {
      throw new Error(t('error.cancelled'));
    }
    return found;
  }

  const { load, originalValue } = createTableLoader({ t, state, settings, refresh, driver, kind, schema, table });
  const { render, metaOf } = createTableView({ t, state, kind, connection, schema, table, editable });

  const handlers = createTableHandlers({ ctx, t, state, settings, actions, refresh, api, driver, load, originalValue, metaOf, connection, schema, table });

  return {
    connection,
    load,
    render,
    async onAction({ action, payload, inputs }) {
      const handler = handlers[action];
      if (handler) {
        await handler(payload, inputs);
      }
    },
    dispose() {
      state.generation++;
    },
    /** For the tests and the status: are there changes that would be lost? */
    pendingCount: () => pendingCount(state.pending),
  };
}
