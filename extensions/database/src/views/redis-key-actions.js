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
 * The actions of the Redis key tab: every change is written at once through
 * `change`, which reads the key again afterwards.
 */

const parseSelection = (value) => {
  try {
    const ids = JSON.parse(String(value || '[]'));
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
};

/** `a 1 b 2` → [['a', '1'], ['b', '2']] — the fields of a new stream entry. */
export function fieldPairs(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const pairs = [];
  for (let i = 0; i + 1 < words.length; i += 2) {
    pairs.push([words[i], words[i + 1]]);
  }
  return pairs;
}

export function createKeyHandlers({ ctx, t, state, db, driver, change, load }) {
  const selected = (payload, inputs) => {
    const ids = parseSelection(inputs.items);
    if (!ids.length && payload?.row) {
      ids.push(payload.row);
    }
    return ids;
  };
  const text = (inputs, id) => String(inputs[id] ?? '');

  const handlers = {
    refresh: () => load(),
    saveString: (payload, inputs) => change((redis) => redis.setString(db, state.key, text(inputs, 'value')), t('redisKey.saved')),
    editHash: (payload) => change((redis) => redis.hashSet(db, state.key, payload.row, payload.value ?? '')),
    addHash: (payload, inputs) => {
      if (!text(inputs, 'newField')) {
        return;
      }
      return change((redis) => redis.hashSet(db, state.key, text(inputs, 'newField'), text(inputs, 'newValue')));
    },
    editList: (payload) => change((redis) => redis.listSet(db, state.key, Number(payload.row), payload.value ?? '')),
    pushLeft: (payload, inputs) => change((redis) => redis.listPush(db, state.key, text(inputs, 'newValue'), 'left')),
    pushRight: (payload, inputs) => change((redis) => redis.listPush(db, state.key, text(inputs, 'newValue'), 'right')),
    addSet: (payload, inputs) => {
      if (!text(inputs, 'newValue')) {
        return;
      }
      return change((redis) => redis.setAdd(db, state.key, [text(inputs, 'newValue')]));
    },
    editScore: (payload) => {
      const score = Number(payload.value);
      if (!Number.isFinite(score)) {
        throw new Error(t('redisKey.badScore'));
      }
      return change((redis) => redis.zsetAdd(db, state.key, payload.row, score));
    },
    addZset: (payload, inputs) => {
      const score = Number(text(inputs, 'newScore') || 0);
      if (!text(inputs, 'newValue') || !Number.isFinite(score)) {
        throw new Error(t('redisKey.badScore'));
      }
      return change((redis) => redis.zsetAdd(db, state.key, text(inputs, 'newValue'), score));
    },
    addStream: (payload, inputs) => {
      const pairs = fieldPairs(text(inputs, 'newValue'));
      if (!pairs.length) {
        throw new Error(t('redisKey.badStream'));
      }
      return change((redis) => redis.streamAdd(db, state.key, pairs));
    },
    removeItems: async (payload, inputs) => {
      const ids = selected(payload, inputs);
      if (!ids.length) {
        return;
      }
      const remove = {
        hash: (redis) => redis.hashDelete(db, state.key, ids),
        list: (redis) => redis.listRemove(db, state.key, ids.map(Number)),
        set: (redis) => redis.setRemove(db, state.key, ids),
        zset: (redis) => redis.zsetRemove(db, state.key, ids),
        stream: (redis) => redis.streamDelete(db, state.key, ids),
      }[state.data?.type];
      if (!remove) {
        return;
      }
      await change(remove);
    },
    expire: async () => {
      const answer = await ctx.ui.input(t('redis.setTtl'), [{ id: 'seconds', label: t('redis.ttlSeconds'), hint: t('redis.ttlHint'), value: state.data?.ttl > 0 ? String(Math.round(state.data.ttl / 1000)) : '' }]);
      if (!answer) {
        return;
      }
      await change((redis) => redis.expire(db, state.key, Number(answer.seconds) || 0));
    },
    rename: async () => {
      const answer = await ctx.ui.input(t('redisKey.rename'), [{ id: 'name', label: t('redis.key'), value: state.key, required: true, mono: true }]);
      if (!answer?.name || answer.name === state.key) {
        return;
      }
      await (await driver()).rename(db, state.key, answer.name);
      state.key = answer.name;
      await load();
    },
    deleteKey: async () => {
      const sure = await ctx.ui.confirm(t('redis.deleteTitle'), t('redis.deleteBody', { count: 1, first: state.key }), { confirmLabel: t('redis.delete'), danger: true });
      if (!sure) {
        return;
      }
      await change((redis) => redis.remove(db, [state.key]));
    },
  };

  return handlers;
}
