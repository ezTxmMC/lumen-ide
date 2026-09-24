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
 * The keys of a Redis database: found with a pattern (SCAN), shown with type
 * and time to live. A click opens a key in its own tab; a command line below
 * runs anything else.
 */

import { errorText } from '../drivers/errors.js';
import { formatTtl, replyText } from './redis-format.js';
import { renderRedis } from './redis-render.js';
import { createRedisHandlers } from './redis-actions.js';

export { formatTtl, replyText };

export function createRedisTab({ ctx, t, sessions, settings, refresh, api }, { connection, db }) {
  const state = { pattern: '*', entries: [], complete: true, loading: false, error: null, output: null };

  async function driver() {
    const found = await sessions.driver(connection.id);
    if (!found) {
      throw new Error(t('error.cancelled'));
    }
    return found;
  }

  async function load() {
    state.loading = true;
    state.error = null;
    refresh();
    try {
      const result = await (await driver()).scan(db, state.pattern, settings.redisScanLimit());
      state.entries = result.entries;
      state.complete = result.complete;
    } catch (err) {
      state.error = errorText(t, err);
    } finally {
      state.loading = false;
      refresh();
    }
  }

  const render = () => renderRedis(t, state, { connection, db });
  const handlers = createRedisHandlers({ ctx, t, state, db, connection, driver, load, refresh, api });

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
  };
}
