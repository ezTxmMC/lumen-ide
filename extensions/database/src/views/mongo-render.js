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
 * The layout of a MongoDB collection tab: filter bar, document grid and the
 * document editor.
 */

import { fieldSummary, idKey } from '../drivers/mongo.js';
import { uniqueNames } from '../format.js';

/** Columns drawn at most — documents can have hundreds of fields. */
const MAX_COLUMNS = 40;

/** The top-level fields of a page of documents, `_id` first, in the order they appear. */
export function fieldsOf(documents) {
  const seen = new Set(['_id']);
  for (const document of documents) {
    for (const field of Object.keys(document)) {
      seen.add(field);
    }
    if (seen.size >= MAX_COLUMNS) {
      break;
    }
  }
  return [...seen].slice(0, MAX_COLUMNS);
}

export function renderMongo(t, state, { db, collection }) {
  const fields = fieldsOf(state.documents);
  const ids = uniqueNames(fields);
  const nodes = [
    {
      type: 'row',
      children: [
        { type: 'input', id: 'filter', value: state.filter, mono: true, placeholder: t('mongo.filterPlaceholder'), submit: { action: 'find', title: t('mongo.find') } },
        { type: 'input', id: 'sort', value: state.sort, mono: true, placeholder: t('mongo.sortPlaceholder'), submit: { action: 'find', title: t('mongo.find') } },
        {
          type: 'buttons', buttons: [
            { action: 'find', title: t('mongo.find'), icon: 'search' },
            { action: 'newDocument', title: t('mongo.newDocument'), icon: 'plus' },
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
  nodes.push({
    type: 'grid',
    id: 'documents',
    grow: true,
    select: 'multi',
    activate: 'click',
    columns: fields.map((field, index) => ({ id: ids[index], title: field, width: field === '_id' ? 220 : 180 })),
    rows: state.documents.map((document) => ({
      id: idKey(document._id),
      cells: fields.map((field) => fieldSummary(document[field])),
      ...(state.editing === idKey(document._id) ? { tone: 'accent' } : {}),
    })),
    onOpen: { action: 'edit', title: t('mongo.edit') },
    menu: [
      { action: 'edit', title: t('mongo.edit'), icon: 'pencil' },
      { action: 'duplicate', title: t('mongo.duplicate'), icon: 'copy' },
      { action: 'deleteDocuments', title: t('mongo.delete'), icon: 'trash-2', danger: true },
    ],
    paging: {
      offset: state.offset, limit: state.limit, total: state.total,
      more: state.documents.length >= state.limit, action: { action: 'page', title: t('table.page') },
    },
    empty: state.loading ? t('table.loading') : t('mongo.noDocuments'),
  });
  if (state.editing) {
    nodes.push({ type: 'text', small: true, tone: 'muted', text: state.editing === 'new' ? t('mongo.editingNew') : t('mongo.editingDocument') });
    nodes.push({ type: 'code', id: 'document', language: 'json', value: state.editorText, rows: 12, submit: { action: 'save', title: t('mongo.save') } });
    nodes.push({
      type: 'buttons', buttons: [
        { action: 'save', title: state.editing === 'new' ? t('mongo.insert') : t('mongo.save'), icon: 'save', variant: 'primary' },
        { action: 'closeEditor', title: t('mongo.close'), icon: 'x' },
        ...(state.editing !== 'new' ? [{ action: 'deleteEditing', title: t('mongo.delete'), icon: 'trash-2', variant: 'danger' }] : []),
      ],
    });
  }
  return {
    title: `${db}.${collection}`,
    layout: 'fill',
    toolbar: [
      { action: 'find', title: t('table.refresh'), icon: 'refresh-cw' },
      { action: 'newDocument', title: t('mongo.newDocument'), icon: 'plus' },
    ],
    nodes,
  };
}
