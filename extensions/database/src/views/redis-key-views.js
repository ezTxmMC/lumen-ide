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
 * The per-type layouts of the Redis key tab: one builder per Redis type that
 * turns a value read from the server into interface nodes.
 */

/** A stream entry's flat [field, value, …] as pairs. */
const pairsOf = (flat) => {
  const pairs = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    pairs.push([flat[i], flat[i + 1]]);
  }
  return pairs;
};

export function createKeyViews(t) {
  const grid = (columns, rows, extra = {}) => ({
    type: 'grid', id: 'items', grow: true, select: 'multi', columns, rows, ...extra,
  });
  const removeMenu = [{ action: 'removeItems', title: t('redisKey.remove'), icon: 'trash-2', danger: true }];
  const truncatedNote = (total, shown) => (total > shown ? [{ type: 'text', small: true, tone: 'warning', text: t('redisKey.truncated', { shown, total }) }] : []);

  const views = {
    string: (data) => [
      { type: 'code', id: 'value', value: data.value ?? '', grow: true, language: looksLikeJson(data.value) ? 'json' : undefined, submit: { action: 'saveString', title: t('redisKey.save') } },
      { type: 'buttons', buttons: [{ action: 'saveString', title: t('redisKey.save'), icon: 'save', variant: 'primary' }] },
    ],
    hash: (data) => [
      ...truncatedNote(data.total, data.entries.length),
      grid(
        [{ id: 'field', title: t('redisKey.field'), width: 260 }, { id: 'value', title: t('redisKey.value'), width: 480, editable: true }],
        data.entries.map(([field, value]) => ({ id: field, cells: [field, value] })),
        { onEdit: { action: 'editHash', title: t('redisKey.edit') }, menu: removeMenu },
      ),
      {
        type: 'row', children: [
          { type: 'input', id: 'newField', mono: true, placeholder: t('redisKey.field') },
          { type: 'input', id: 'newValue', mono: true, placeholder: t('redisKey.value'), submit: { action: 'addHash', title: t('redisKey.add') } },
          { type: 'buttons', buttons: [{ action: 'addHash', title: t('redisKey.add'), icon: 'plus' }] },
        ],
      },
    ],
    list: (data) => [
      ...truncatedNote(data.total, data.items.length),
      grid(
        [{ id: 'index', title: '#', width: 70, numeric: true }, { id: 'value', title: t('redisKey.value'), width: 600, editable: true }],
        data.items.map((value, index) => ({ id: String(index), cells: [index, value] })),
        { onEdit: { action: 'editList', title: t('redisKey.edit') }, menu: removeMenu },
      ),
      {
        type: 'row', children: [
          { type: 'input', id: 'newValue', mono: true, placeholder: t('redisKey.value'), submit: { action: 'pushRight', title: t('redisKey.pushRight') } },
          {
            type: 'buttons', buttons: [
              { action: 'pushLeft', title: t('redisKey.pushLeft'), icon: 'arrow-up' },
              { action: 'pushRight', title: t('redisKey.pushRight'), icon: 'arrow-down' },
            ],
          },
        ],
      },
    ],
    set: (data) => [
      ...truncatedNote(data.total, data.members.length),
      grid([{ id: 'member', title: t('redisKey.member'), width: 640 }], data.members.map((member) => ({ id: member, cells: [member] })), { menu: removeMenu }),
      {
        type: 'row', children: [
          { type: 'input', id: 'newValue', mono: true, placeholder: t('redisKey.member'), submit: { action: 'addSet', title: t('redisKey.add') } },
          { type: 'buttons', buttons: [{ action: 'addSet', title: t('redisKey.add'), icon: 'plus' }] },
        ],
      },
    ],
    zset: (data) => [
      ...truncatedNote(data.total, data.members.length),
      grid(
        [{ id: 'member', title: t('redisKey.member'), width: 480 }, { id: 'score', title: t('redisKey.score'), width: 140, numeric: true, editable: true }],
        data.members.map(([member, score]) => ({ id: member, cells: [member, Number(score)] })),
        { onEdit: { action: 'editScore', title: t('redisKey.edit') }, menu: removeMenu },
      ),
      {
        type: 'row', children: [
          { type: 'input', id: 'newValue', mono: true, placeholder: t('redisKey.member') },
          { type: 'input', id: 'newScore', mono: true, placeholder: t('redisKey.score'), submit: { action: 'addZset', title: t('redisKey.add') } },
          { type: 'buttons', buttons: [{ action: 'addZset', title: t('redisKey.add'), icon: 'plus' }] },
        ],
      },
    ],
    stream: (data) => [
      ...truncatedNote(data.total, data.entries.length),
      grid(
        [{ id: 'id', title: 'ID', width: 200 }, { id: 'fields', title: t('redisKey.fields'), width: 560 }],
        data.entries.map((entry) => ({ id: entry.id, cells: [entry.id, pairsOf(entry.fields).map(([field, value]) => `${field}=${value}`).join('  ')] })),
        { menu: removeMenu },
      ),
      {
        type: 'row', children: [
          { type: 'input', id: 'newValue', mono: true, placeholder: t('redisKey.streamPlaceholder'), submit: { action: 'addStream', title: t('redisKey.add') } },
          { type: 'buttons', buttons: [{ action: 'addStream', title: t('redisKey.add'), icon: 'plus' }] },
        ],
      },
    ],
  };

  return views;
}

function looksLikeJson(value) {
  if (typeof value !== 'string' || value.length > 200_000) {
    return false;
  }
  const trimmed = value.trim();
  if (!/^[[{]/.test(trimmed)) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
