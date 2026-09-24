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
 * Running an SQL script statement by statement, collecting one result per
 * statement into the tab state.
 */

import { splitStatements } from '../sql.js';
import { errorText } from '../drivers/errors.js';

/** Statements after which the tree may have changed. */
const CHANGES_SCHEMA = /^\s*(create|drop|alter|rename|attach|detach)\b/i;

export function createRunner({ t, state, sessions, settings, refresh, connection }) {
  return async function run(text) {
    const generation = ++state.generation;
    const db = await sessions.driver(connection.id);
    if (!db) {
      return;
    }
    const statements = splitStatements(text, db.dialect);
    if (!statements.length) {
      return;
    }
    state.running = true;
    state.error = null;
    state.results = [];
    state.shown = 0;
    refresh();
    let schemaChanged = false;
    for (const statement of statements) {
      const started = Date.now();
      try {
        const result = await db.query(statement, [], { maxRows: settings.maxRows(), timeoutMs: settings.timeoutMs() });
        if (generation !== state.generation) {
          return;
        }
        state.results.push({ statement, ...result, ms: Date.now() - started });
        if (CHANGES_SCHEMA.test(statement)) {
          schemaChanged = true;
        }
      } catch (err) {
        if (generation !== state.generation) {
          return;
        }
        state.results.push({ statement, error: errorText(t, err), ms: Date.now() - started });
        break;
      }
      refresh();
    }
    // Show the last result with rows, or else the last one.
    const withRows = state.results.map((result, index) => ({ result, index })).filter(({ result }) => result.columns?.length);
    state.shown = withRows.length ? withRows[withRows.length - 1].index : state.results.length - 1;
    state.running = false;
    refresh();
    if (schemaChanged) {
      void sessions.refreshTree(connection.id);
    }
  };
}
