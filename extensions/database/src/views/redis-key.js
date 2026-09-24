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
 * One Redis key, shown and edited the way its type wants: text for a string,
 * field and value for a hash, positions for a list, members for sets, scores
 * for sorted sets, entries for a stream. Changes are written at once — Redis
 * has no transaction to roll back.
 */

import { errorText } from '../drivers/errors.js';
import { formatTtl } from './redis.js';
import { createKeyViews } from './redis-key-views.js';
import { createKeyHandlers, fieldPairs } from './redis-key-actions.js';

export { fieldPairs };

export function createRedisKeyTab({ ctx, t, sessions, refresh }, { connection, db, key }) {
  const state = { data: null, loading: false, error: null, notice: null, key };

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
      state.data = await (await driver()).read(db, state.key);
    } catch (err) {
      state.error = errorText(t, err);
    } finally {
      state.loading = false;
      refresh();
    }
  }

  /** Run a change, then read the key again. */
  async function change(fn, notice) {
    try {
      await fn(await driver());
      state.notice = notice ?? null;
      state.error = null;
    } catch (err) {
      state.error = errorText(t, err);
    }
    await load();
  }

  const views = createKeyViews(t);

  function render() {
    const data = state.data;
    const nodes = [];
    if (state.error) {
      nodes.push({ type: 'text', text: state.error, tone: 'danger', mono: true });
    }
    if (state.notice) {
      nodes.push({ type: 'text', text: state.notice, tone: 'success', small: true });
    }
    if (!data && state.loading) {
      nodes.push({ type: 'progress', label: t('table.loading') });
    }
    if (data) {
      nodes.push({
        type: 'keyValue', rows: [
          { key: t('redis.key'), value: state.key },
          { key: t('redis.type'), value: data.type },
          { key: t('redis.ttl'), value: data.ttl < 0 ? t('redisKey.noExpiry') : formatTtl(data.ttl) },
          ...(data.total !== undefined ? [{ key: t('redisKey.size'), value: String(data.total) }] : []),
        ],
      });
    }
    if (data?.type === 'none') {
      nodes.push({ type: 'empty', icon: 'key-round', title: t('redisKey.gone'), hint: t('redisKey.goneHint') });
    }
    const view = data ? views[data.type] : null;
    if (view) {
      nodes.push(...view(data));
    }
    if (data && !view && data.type !== 'none') {
      nodes.push({ type: 'text', text: t('redisKey.unsupported', { type: data.type }), tone: 'muted' });
    }
    return {
      title: state.key,
      layout: 'fill',
      toolbar: [
        { action: 'refresh', title: t('table.refresh'), icon: 'refresh-cw' },
        { action: 'expire', title: t('redis.setTtl'), icon: 'timer' },
        { action: 'rename', title: t('redisKey.rename'), icon: 'pencil' },
        { action: 'deleteKey', title: t('redisKey.deleteKey'), icon: 'trash-2' },
      ],
      nodes,
    };
  }

  const handlers = createKeyHandlers({ ctx, t, state, db, driver, change, load });

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
