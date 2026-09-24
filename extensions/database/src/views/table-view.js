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
 * How a table tab looks: the grid's columns and rows, and the tab's whole
 * view. Reads the tab's state, never changes it.
 */

import { isNumericType, toCell } from '../format.js';
import { pendingCount } from '../pending.js';

export function createTableView({ t, state, kind, connection, schema, table, editable }) {
  /** Visible columns: the result's, without the hidden row id. */
  const visibleColumns = () => state.resultColumns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.name !== state.rowIdColumn);

  const metaOf = (name) => state.columns?.find((column) => column.name === name) ?? { name, type: '' };

  function gridRows() {
    const visible = visibleColumns();
    const rows = state.rows.map((row, index) => {
      const id = state.rowIds[index];
      const edits = state.pending.edits.get(id) ?? {};
      const deleted = state.pending.deletes.has(id);
      const changed = [];
      const cells = visible.map(({ column, index: at }, position) => {
        if (column.name in edits) {
          changed.push(position);
          return toCell(edits[column.name]);
        }
        return toCell(row[at]);
      });
      const tone = (deleted && 'deleted') || (changed.length && 'modified') || undefined;
      return { id, cells, ...(tone ? { tone } : {}), ...(deleted ? { strike: true } : {}), ...(changed.length ? { changed } : {}) };
    });
    for (const inserted of state.pending.inserts) {
      rows.push({
        id: inserted.id,
        tone: 'added',
        cells: visible.map(({ column }) => (column.name in inserted.values ? toCell(inserted.values[column.name]) : t('table.default'))),
        changed: visible.map((_, position) => position).filter((position) => visible[position].column.name in inserted.values),
      });
    }
    return rows;
  }

  function gridColumns() {
    const canEdit = editable();
    return visibleColumns().map(({ column }) => {
      const meta = metaOf(column.name);
      return {
        id: column.name,
        title: column.name,
        detail: meta.type || column.type || undefined,
        numeric: isNumericType(meta.type || column.type),
        sortable: true,
        key: Boolean(meta.pk),
        editable: canEdit && !meta.generated,
        nullable: meta.nullable !== false,
        width: Math.min(320, Math.max(90, column.name.length * 9 + 40)),
      };
    });
  }

  function render() {
    const count = pendingCount(state.pending);
    const canEdit = editable();
    const title = `${schema && schema !== 'main' ? `${schema}.` : ''}${table}`;
    const nodes = [
      {
        type: 'row',
        children: [
          {
            type: 'input', id: 'filter', value: state.filter, mono: true,
            placeholder: t('table.filterPlaceholder'),
            submit: { action: 'filter', title: t('table.applyFilter') },
          },
          {
            type: 'buttons', buttons: [
              { action: 'filter', title: t('table.applyFilter'), icon: 'filter' },
              ...(state.filter ? [{ action: 'clearFilter', title: t('table.clearFilter'), icon: 'x' }] : []),
            ],
          },
        ],
      },
    ];
    if (state.error) {
      nodes.push({ type: 'text', text: state.error, tone: 'danger', mono: true });
    }
    if (state.notice) {
      nodes.push({ type: 'text', text: state.notice, tone: 'success', small: true });
    }
    if (!canEdit && state.columns && kind === 'table' && !connection.readOnly) {
      nodes.push({ type: 'text', text: t('table.readOnlyNoKey'), tone: 'muted', small: true });
    }
    if (state.loading && !state.rows.length) {
      nodes.push({ type: 'progress', label: t('table.loading') });
    }
    nodes.push({
      type: 'grid',
      id: 'grid',
      grow: true,
      columns: gridColumns(),
      rows: gridRows(),
      select: 'multi',
      sort: state.sort ?? undefined,
      onSort: { action: 'sort', title: t('table.sort') },
      ...(canEdit ? { onEdit: { action: 'edit', title: t('table.edit') } } : {}),
      menu: canEdit
        ? [
          { action: 'addRow', title: t('table.addRow'), icon: 'plus' },
          { action: 'deleteRows', title: t('table.deleteRows'), icon: 'trash-2', danger: true },
        ]
        : [],
      paging: {
        offset: state.offset, limit: state.limit, total: state.total,
        more: state.rows.length >= state.limit, action: { action: 'page', title: t('table.page') },
      },
      empty: state.loading ? t('table.loading') : t('table.empty'),
    });
    if (count) {
      nodes.push({
        type: 'row',
        children: [
          { type: 'text', text: t('table.pending', { count }), tone: 'warning' },
          {
            type: 'buttons', buttons: [
              { action: 'commit', title: t('table.commit'), icon: 'check', variant: 'primary' },
              { action: 'rollback', title: t('table.rollback'), icon: 'undo' },
              { action: 'showSql', title: t('table.showSql'), icon: 'file-code' },
            ],
          },
        ],
      });
    }
    return {
      title,
      layout: 'fill',
      badge: count || undefined,
      toolbar: [
        { action: 'refresh', title: t('table.refresh'), icon: 'refresh-cw' },
        ...(canEdit ? [
          { action: 'addRow', title: t('table.addRow'), icon: 'plus' },
          { action: 'deleteRows', title: t('table.deleteRows'), icon: 'trash-2' },
        ] : []),
        { action: 'export', title: t('table.export'), icon: 'download' },
        { action: 'structure', title: t('tree.structure'), icon: 'list-tree' },
        { action: 'query', title: t('tree.selectQuery'), icon: 'square-terminal' },
      ],
      nodes,
    };
  }

  return { render, metaOf };
}
