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
 * The layout of a Redis database tab: pattern search, key grid and the
 * command line with its output.
 */

import { formatTtl } from './redis-format.js';

export function renderRedis(t, state, { connection, db }) {
  const nodes = [
    {
      type: 'row',
      children: [
        { type: 'input', id: 'pattern', value: state.pattern, mono: true, placeholder: t('redis.patternPlaceholder'), submit: { action: 'search', title: t('redis.search') } },
        { type: 'buttons', buttons: [{ action: 'search', title: t('redis.search'), icon: 'search' }, { action: 'newKey', title: t('redis.newKey'), icon: 'plus' }] },
      ],
    },
  ];
  if (state.error) {
    nodes.push({ type: 'text', text: state.error, tone: 'danger', mono: true });
  }
  nodes.push({
    type: 'text',
    small: true,
    tone: 'muted',
    text: state.complete ? t('redis.found', { count: state.entries.length }) : t('redis.foundMore', { count: state.entries.length }),
  });
  nodes.push({
    type: 'grid',
    id: 'keys',
    grow: true,
    select: 'multi',
    activate: 'click',
    columns: [
      { id: 'key', title: t('redis.key'), width: 420 },
      { id: 'type', title: t('redis.type'), width: 90 },
      { id: 'ttl', title: t('redis.ttl'), width: 90, numeric: true },
    ],
    rows: state.entries.map((entry) => ({ id: entry.key, cells: [entry.key, entry.type, formatTtl(entry.ttl)] })),
    onOpen: { action: 'open', title: t('redis.open') },
    menu: [
      { action: 'open', title: t('redis.open'), icon: 'external-link' },
      { action: 'expire', title: t('redis.setTtl'), icon: 'timer' },
      { action: 'delete', title: t('redis.delete'), icon: 'trash-2', danger: true },
    ],
    empty: state.loading ? t('table.loading') : t('redis.noKeys'),
  });
  nodes.push({
    type: 'row',
    children: [
      { type: 'input', id: 'command', mono: true, placeholder: t('redis.commandPlaceholder'), submit: { action: 'command', title: t('redis.run') } },
      { type: 'buttons', buttons: [{ action: 'command', title: t('redis.run'), icon: 'play' }] },
    ],
  });
  if (state.output !== null) {
    nodes.push({ type: 'text', text: state.output.text, mono: true, small: true, tone: state.output.error ? 'danger' : 'default' });
  }
  return {
    title: `${connection.name} · db${db}`,
    layout: 'fill',
    toolbar: [
      { action: 'search', title: t('table.refresh'), icon: 'refresh-cw' },
      { action: 'newKey', title: t('redis.newKey'), icon: 'plus' },
    ],
    nodes,
  };
}
