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
 * A MongoDB collection: documents found with a filter, a page at a time, in
 * a grid of their top-level fields. A click puts a document into the editor
 * below as Extended JSON; saving replaces it, a new one is inserted.
 */

import { parseDocument } from '../drivers/mongo.js';
import { errorText } from '../drivers/errors.js';
import { renderMongo, fieldsOf } from './mongo-render.js';
import { createMongoHandlers } from './mongo-actions.js';

export { fieldsOf };

export function createMongoTab({ ctx, t, sessions, settings, refresh }, { connection, db, collection }) {
  const state = {
    filter: '',
    sort: '',
    offset: 0,
    limit: settings.pageSize(),
    documents: [],
    total: undefined,
    loading: false,
    error: null,
    notice: null,
    /** The document in the editor: its id key, or 'new'. */
    editing: null,
    editorText: '',
    generation: 0,
  };

  async function driver() {
    const found = await sessions.driver(connection.id);
    if (!found) {
      throw new Error(t('error.cancelled'));
    }
    return found;
  }

  async function load() {
    const generation = ++state.generation;
    state.loading = true;
    state.error = null;
    refresh();
    try {
      const filter = parseDocument(state.filter);
      const sort = parseDocument(state.sort);
      const result = await (await driver()).find(db, collection, { filter, sort, skip: state.offset, limit: state.limit, timeoutMs: settings.timeoutMs() });
      if (generation !== state.generation) {
        return;
      }
      state.documents = result.documents;
      state.total = result.total;
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

  const render = () => renderMongo(t, state, { db, collection });
  const handlers = createMongoHandlers({ ctx, t, state, db, collection, driver, load, refresh });

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
