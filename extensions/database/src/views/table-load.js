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
 * Loading a table page: columns, the rows of the current page, and the row
 * count that follows once the page is on screen.
 */

import { ROWID, countRows, rowIdSelect, selectPage } from '../sql.js';
import { jsonSafe } from '../format.js';
import { errorText } from '../drivers/errors.js';

export function createTableLoader({ t, state, settings, refresh, driver, kind, schema, table }) {
  async function load() {
    const generation = ++state.generation;
    state.loading = true;
    state.error = null;
    refresh();
    try {
      const db = await driver();
      state.dialect = db.dialect;
      if (!state.columns) {
        state.columns = await db.columns(schema, table);
        state.keyColumns = state.columns.filter((column) => column.pk).sort((a, b) => a.pkOrder - b.pkOrder).map((column) => column.name);
        state.rowIdColumn = !state.keyColumns.length && db.rowIds && kind === 'table' ? ROWID[db.dialect] ?? null : null;
      }
      const extra = state.rowIdColumn ? [rowIdSelect(db.dialect)] : [];
      const sql = selectPage(db.dialect, { schema, table, filter: state.filter, sort: state.sort, offset: state.offset, limit: state.limit, extra });
      const result = await db.query(sql, [], { timeoutMs: settings.timeoutMs() });
      if (generation !== state.generation) {
        return;
      }
      state.resultColumns = result.columns;
      state.rows = result.rows;
      state.rowIds = result.rows.map((row, index) => rowIdOf(row, index));
      state.loading = false;
      refresh();
      // The count can be slow on a large table; the page is already there.
      state.total = undefined;
      const counted = await db.query(countRows(db.dialect, { schema, table, filter: state.filter }), [], { timeoutMs: settings.timeoutMs() }).catch(() => null);
      if (generation !== state.generation) {
        return;
      }
      state.total = counted ? Number(counted.rows[0]?.[0] ?? 0) : undefined;
    } catch (err) {
      if (generation !== state.generation) {
        return;
      }
      state.error = errorText(t, err);
    } finally {
      if (generation === state.generation) {
        state.loading = false;
      }
      refresh();
    }
  }

  /** A stable id for a row: its key, so pending edits survive paging and sorting. */
  function rowIdOf(row, index) {
    const names = state.rowIdColumn ? [state.rowIdColumn] : state.keyColumns;
    if (!names.length) {
      return `r${state.offset + index}`;
    }
    const key = {};
    for (const name of names) {
      key[name] = row[state.resultColumns.findIndex((column) => column.name === name)];
    }
    const id = `k:${JSON.stringify(jsonSafe(key))}`;
    state.keys.set(id, key);
    state.originals.set(id, row);
    return id;
  }

  function originalValue(rowId, name) {
    const row = state.originals.get(rowId);
    const index = state.resultColumns.findIndex((column) => column.name === name);
    return row && index >= 0 ? row[index] : undefined;
  }

  return { load, originalValue };
}
