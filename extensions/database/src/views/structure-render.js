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
 * The layout of a table's structure tab: its columns, indexes and DDL.
 */

export function renderStructure(t, state, table) {
  const nodes = [];
  if (state.error) {
    nodes.push({ type: 'text', text: state.error, tone: 'danger', mono: true });
  }
  if (state.loading && !state.columns) {
    nodes.push({ type: 'progress', label: t('table.loading') });
  }
  const yes = t('structure.yes');
  nodes.push({
    type: 'section', id: 'columns', title: t('structure.columns'), badge: state.columns?.length ?? 0, children: [{
      type: 'grid',
      id: 'columns',
      height: Math.min(520, 60 + (state.columns?.length ?? 0) * 24),
      select: 'multi',
      columns: [
        { id: 'name', title: t('structure.name'), width: 200 },
        { id: 'type', title: t('structure.type'), width: 180 },
        { id: 'nullable', title: t('structure.nullable'), width: 90 },
        { id: 'default', title: t('structure.default'), width: 200 },
        { id: 'key', title: t('structure.primaryKey'), width: 110, numeric: true },
        { id: 'generated', title: t('structure.generated'), width: 110 },
      ],
      rows: (state.columns ?? []).map((column) => ({
        id: column.name,
        cells: [column.name, column.type, column.nullable ? yes : '', column.defaultValue ?? '', column.pk ? column.pkOrder || 1 : '', column.generated ? yes : ''],
      })),
    }],
  });
  nodes.push({
    type: 'section', id: 'indexes', title: t('structure.indexes'), badge: state.indexes.length, children: [{
      type: 'grid',
      id: 'indexes',
      height: Math.min(360, 60 + state.indexes.length * 24),
      columns: [
        { id: 'name', title: t('structure.name'), width: 240 },
        { id: 'columns', title: t('structure.columns'), width: 320 },
        { id: 'unique', title: t('structure.unique'), width: 90 },
        { id: 'primary', title: t('structure.primaryKey'), width: 110 },
      ],
      rows: state.indexes.map((index) => ({
        id: index.name,
        cells: [index.name, index.columns.join(', '), index.unique ? yes : '', index.primary ? yes : ''],
      })),
      empty: t('structure.noIndexes'),
    }],
  });
  if (state.ddl) {
    nodes.push({
      type: 'section', id: 'ddl', title: 'DDL', children: [
        { type: 'code', id: 'ddl', value: state.ddl, language: 'sql', readOnly: true, rows: Math.min(24, state.ddl.split('\n').length + 1) },
      ],
    });
  }
  return {
    title: t('structure.tabTitle', { table }),
    toolbar: [
      { action: 'refresh', title: t('table.refresh'), icon: 'refresh-cw' },
      { action: 'data', title: t('tree.openData'), icon: 'table' },
    ],
    nodes,
  };
}
