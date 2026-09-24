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
 * The actions of a Redis database tab: searching keys, opening, deleting and
 * expiring them, creating a key and running a raw command.
 */

import { splitCommand } from '../drivers/redis.js';
import { errorText } from '../drivers/errors.js';
import { replyText } from './redis-format.js';

const parseSelection = (value) => {
  try {
    const ids = JSON.parse(String(value || '[]'));
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
};

export function createRedisHandlers({ ctx, t, state, db, connection, driver, load, refresh, api }) {
  const selectedKeys = (payload, inputs) => {
    const keys = parseSelection(inputs.keys);
    if (!keys.length && payload?.row) {
      keys.push(payload.row);
    }
    return keys;
  };

  const handlers = {
    search: (payload, inputs) => {
      state.pattern = String(inputs.pattern ?? state.pattern).trim() || '*';
      return load();
    },
    open: (payload) => api.openRedisKey(connection, db, payload.row),
    delete: async (payload, inputs) => {
      const keys = selectedKeys(payload, inputs);
      if (!keys.length) {
        return;
      }
      const sure = await ctx.ui.confirm(t('redis.deleteTitle'), t('redis.deleteBody', { count: keys.length, first: keys[0] }), { confirmLabel: t('redis.delete'), danger: true });
      if (!sure) {
        return;
      }
      await (await driver()).remove(db, keys);
      await load();
    },
    expire: async (payload, inputs) => {
      const keys = selectedKeys(payload, inputs);
      if (!keys.length) {
        return;
      }
      const answer = await ctx.ui.input(t('redis.setTtl'), [{ id: 'seconds', label: t('redis.ttlSeconds'), hint: t('redis.ttlHint'), value: '3600' }]);
      if (!answer) {
        return;
      }
      const redis = await driver();
      for (const key of keys) {
        await redis.expire(db, key, Number(answer.seconds) || 0);
      }
      await load();
    },
    newKey: async () => {
      const answer = await ctx.ui.input(t('redis.newKey'), [
        { id: 'key', label: t('redis.key'), required: true, mono: true },
        {
          id: 'type', label: t('redis.type'), type: 'select', value: 'string',
          choices: ['string', 'hash', 'list', 'set', 'zset', 'stream'].map((value) => ({ value, label: value })),
        },
        { id: 'value', label: t('redis.firstValue'), hint: t('redis.firstValueHint'), mono: true },
      ], { submitLabel: t('redis.create') });
      if (!answer?.key) {
        return;
      }
      const redis = await driver();
      const key = answer.key;
      if (await redis.exists(db, key)) {
        throw new Error(t('redis.exists', { key }));
      }
      const value = answer.value ?? '';
      const create = {
        string: () => redis.setString(db, key, value),
        hash: () => redis.hashSet(db, key, value || 'field', ''),
        list: () => redis.listPush(db, key, value),
        set: () => redis.setAdd(db, key, [value]),
        zset: () => redis.zsetAdd(db, key, value, 0),
        stream: () => redis.streamAdd(db, key, [['field', value]]),
      };
      await create[answer.type ?? 'string']();
      await load();
      api.openRedisKey(connection, db, key);
    },
    command: async (payload, inputs) => {
      const args = splitCommand(inputs.command ?? '');
      if (!args.length) {
        return;
      }
      try {
        const reply = await (await driver()).command(db, args);
        state.output = { text: `> ${args.join(' ')}\n${replyText(reply)}`, error: false };
      } catch (err) {
        state.output = { text: `> ${args.join(' ')}\n${errorText(t, err)}`, error: true };
      }
      refresh();
    },
  };

  return handlers;
}
