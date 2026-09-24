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
 * The actions of a table tab: paging, filtering, sorting, editing cells and
 * committing the pending changes.
 */

import { inlineParams, selectAll } from '../sql.js';
import { parseInput } from '../format.js';
import { addRow, clearPending, isNewRow, pendingStatements, setCell, toggleDelete } from '../pending.js';
import { errorText } from '../drivers/errors.js';

/** Rows exported at most. */
const EXPORT_LIMIT = 1_000_000;

const parseSelection = (value) => {
  try {
    const ids = JSON.parse(String(value || '[]'));
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
};

export function createTableHandlers({ ctx, t, state, settings, actions, refresh, api, driver, load, originalValue, metaOf, connection, schema, table }) {
  /* ---------------- changes ---------------- */

  function statements() {
    return pendingStatements(state.pending, {
      dialect: state.dialect,
      schema,
      table,
      keyOf: (rowId) => state.keys.get(rowId) ?? {},
    });
  }

  async function commit() {
    const list = statements();
    if (!list.length) {
      return;
    }
    if (settings.confirmCommit()) {
      const preview = list.slice(0, 8).map((statement) => inlineParams(state.dialect, statement.sql, statement.params)).join(';\n');
      const more = list.length > 8 ? `\n… ${t('table.moreStatements', { count: list.length - 8 })}` : '';
      const sure = await ctx.ui.confirm(t('table.commitTitle', { count: list.length }), `${preview};${more}`, { confirmLabel: t('table.commit') });
      if (!sure) {
        return;
      }
    }
    try {
      const db = await driver();
      const result = await db.transaction(list, { timeoutMs: settings.timeoutMs() });
      clearPending(state.pending);
      state.notice = t('table.committed', { count: list.length, affected: result.affected ?? 0 });
      await load();
    } catch (err) {
      state.error = t('table.commitFailed', { error: errorText(t, err) });
      refresh();
    }
  }

  const handlers = {
    refresh: () => load(),
    filter: (payload, inputs) => {
      state.filter = String(inputs.filter ?? '').trim();
      state.offset = 0;
      return load();
    },
    clearFilter: () => {
      state.filter = '';
      state.offset = 0;
      return load();
    },
    sort: (payload) => {
      state.sort = payload?.direction ? { column: payload.column, direction: payload.direction } : null;
      state.offset = 0;
      return load();
    },
    page: (payload) => {
      state.offset = Math.max(0, Number(payload?.offset ?? 0));
      return load();
    },
    edit: (payload) => {
      const { row, column, value } = payload;
      if (state.pending.deletes.has(row)) {
        return;
      }
      const parsed = parseInput(value, metaOf(column), state.dialect);
      setCell(state.pending, row, column, parsed, isNewRow(state.pending, row) ? undefined : originalValue(row, column));
      state.notice = null;
      refresh();
    },
    addRow: () => {
      addRow(state.pending);
      state.notice = null;
      refresh();
    },
    deleteRows: (payload, inputs) => {
      // The selection, or the row the context menu was opened on.
      const ids = parseSelection(inputs.grid);
      if (!ids.length && payload?.row) {
        ids.push(payload.row);
      }
      if (!ids.length) {
        ctx.ui.notify(t('table.selectRows'), 'info');
        return;
      }
      toggleDelete(state.pending, ids);
      state.notice = null;
      refresh();
    },
    rollback: () => {
      clearPending(state.pending);
      state.notice = null;
      refresh();
    },
    commit,
    showSql: () => {
      const text = statements().map((statement) => `${inlineParams(state.dialect, statement.sql, statement.params)};`).join('\n');
      ctx.ui.openDocument(`${table}.sql`, `${text}\n`, 'sql');
    },
    export: async () => {
      const db = await driver();
      const sql = selectAll(db.dialect, { schema, table, filter: state.filter, sort: state.sort });
      const result = await db.query(sql, [], { maxRows: EXPORT_LIMIT, timeoutMs: settings.timeoutMs() });
      await actions.exportRows(table, result.columns, result.rows);
    },
    structure: () => api.openStructure(connection, schema, table),
    query: () => api.openQuery(connection, { schema, table }),
  };

  return handlers;
}
