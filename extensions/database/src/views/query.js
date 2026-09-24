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
 * An SQL console: an editor, Ctrl+Enter runs the script (or the selection),
 * statement by statement, and the results show below — one grid per
 * statement that returned rows, the others as a line each.
 */

import { qualified } from '../sql.js';
import { createRunner } from './query-run.js';
import { renderQuery } from './query-render.js';

function firstSql(dialect, schema, table, limit) {
  if (!table) {
    return '';
  }
  const from = qualified(dialect, schema && schema !== 'main' ? schema : null, table);
  if (dialect === 'mssql') {
    return `SELECT TOP ${limit} * FROM ${from};\n`;
  }
  return `SELECT * FROM ${from} LIMIT ${limit};\n`;
}

export function createQueryTab({ t, sessions, settings, actions, refresh }, { connection, schema, table, sql }) {
  const state = {
    sql: sql ?? null,
    results: [],
    shown: 0,
    running: false,
    error: null,
    generation: 0,
  };

  async function load() {
    if (state.sql !== null) {
      return;
    }
    // The dialect is known only once connected; the first statement waits for that.
    const db = await sessions.driver(connection.id).catch(() => null);
    state.sql = db ? firstSql(db.dialect, schema, table, Math.min(settings.pageSize(), 1000)) : '';
    refresh();
  }

  const run = createRunner({ t, state, sessions, settings, refresh, connection });
  const render = () => renderQuery(t, state, connection);

  const handlers = {
    run: (payload, inputs) => {
      const text = String(inputs.sql ?? state.sql ?? '');
      state.sql = text;
      const selection = String(inputs['sql.selection'] ?? '').trim();
      return run(selection || text);
    },
    // A running statement cannot always be stopped; the console just stops waiting for it.
    cancel: () => {
      state.generation++;
      state.running = false;
      refresh();
    },
    clear: (payload, inputs) => {
      state.sql = String(inputs.sql ?? state.sql ?? '');
      state.results = [];
      refresh();
    },
    show: (payload) => {
      state.shown = Number(payload) || 0;
      refresh();
    },
    export: async () => {
      const result = state.results[state.shown];
      if (!result?.columns?.length) {
        return;
      }
      await actions.exportRows(connection.name, result.columns, result.rows);
    },
  };

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
  };
}
