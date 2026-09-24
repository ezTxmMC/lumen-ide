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
 * The layout of an SQL console tab: editor, run buttons, the result picker
 * and the grid of the shown result.
 */

import { formatDuration, isNumericType, toCell, uniqueNames } from '../format.js';

/** One line for a statement in the result picker. */
const shorten = (statement) => statement.replace(/\s+/g, ' ').slice(0, 60);

function summary(t, result) {
  if (result.error) {
    return t('query.failed', { error: result.error });
  }
  const time = formatDuration(result.ms);
  if (result.columns?.length) {
    if (result.truncated) {
      return t('query.rowsTruncated', { count: result.rows.length, time });
    }
    return t('query.rows', { count: result.rows.length, time });
  }
  if (result.affected !== undefined && result.affected !== null) {
    return t('query.affected', { count: result.affected, time });
  }
  return t('query.done', { time });
}

export function renderQuery(t, state, connection) {
  const nodes = [
    {
      type: 'code',
      id: 'sql',
      language: 'sql',
      value: state.sql ?? '',
      rows: 10,
      placeholder: t('query.placeholder'),
      submit: { action: 'run', title: t('query.run') },
    },
    {
      type: 'row',
      children: [
        {
          type: 'buttons', buttons: [
            { action: 'run', title: t('query.run'), icon: 'play', variant: 'primary', disabled: state.running },
            ...(state.running ? [{ action: 'cancel', title: t('query.stopWaiting'), icon: 'square' }] : []),
            { action: 'clear', title: t('query.clear'), icon: 'rotate-ccw', disabled: !state.results.length },
          ],
        },
        { type: 'text', text: t('query.hint'), tone: 'muted', small: true },
      ],
    },
  ];
  if (state.running) {
    nodes.push({ type: 'progress', label: t('query.running') });
  }
  if (state.results.length > 1) {
    nodes.push({
      type: 'select',
      id: 'result',
      label: t('query.result'),
      value: String(state.shown),
      options: state.results.map((result, index) => ({ value: String(index), label: `${index + 1}. ${shorten(result.statement)} — ${summary(t, result)}` })),
      change: { action: 'show', title: t('query.result') },
    });
  }
  const result = state.results[state.shown];
  if (result) {
    nodes.push({ type: 'text', text: summary(t, result), tone: result.error ? 'danger' : 'muted', small: !result.error, mono: Boolean(result.error) });
  }
  if (result?.columns?.length) {
    const names = uniqueNames(result.columns.map((column) => column.name));
    nodes.push({
      type: 'grid',
      id: 'rows',
      grow: true,
      select: 'multi',
      columns: result.columns.map((column, index) => ({
        id: names[index],
        title: column.name,
        detail: column.type || undefined,
        numeric: isNumericType(column.type),
        width: Math.min(320, Math.max(90, column.name.length * 9 + 40)),
      })),
      rows: result.rows.map((row, index) => ({ id: String(index), cells: row.map(toCell) })),
      empty: t('query.noRows'),
    });
  }
  return {
    title: t('query.title', { name: connection.name }),
    layout: 'fill',
    toolbar: [
      { action: 'run', title: t('query.run'), icon: 'play' },
      { action: 'export', title: t('table.export'), icon: 'download', disabled: !result?.columns?.length },
    ],
    nodes,
  };
}
