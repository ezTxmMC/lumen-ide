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
 * The actions of a MongoDB collection tab: searching, paging, opening a
 * document in the editor, saving and deleting.
 */

import { documentText, idFromKey, idKey, parseDocument } from '../drivers/mongo.js';

const parseSelection = (value) => {
  try {
    const ids = JSON.parse(String(value || '[]'));
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
};

const NEW_DOCUMENT = '{\n  \n}\n';

export function createMongoHandlers({ ctx, t, state, db, collection, driver, load, refresh }) {
  const documentFor = (key) => state.documents.find((document) => idKey(document._id) === key);

  async function removeDocuments(keys) {
    if (!keys.length) {
      return;
    }
    const sure = await ctx.ui.confirm(t('mongo.deleteTitle'), t('mongo.deleteBody', { count: keys.length }), { confirmLabel: t('mongo.delete'), danger: true });
    if (!sure) {
      return;
    }
    const removed = await (await driver()).remove(db, collection, keys.map(idFromKey));
    if (keys.includes(state.editing)) {
      state.editing = null;
    }
    state.notice = t('mongo.deleted', { count: removed });
    await load();
  }

  const handlers = {
    find: (payload, inputs) => {
      state.filter = String(inputs.filter ?? state.filter).trim();
      state.sort = String(inputs.sort ?? state.sort).trim();
      state.offset = 0;
      state.notice = null;
      return load();
    },
    page: (payload) => {
      state.offset = Math.max(0, Number(payload?.offset ?? 0));
      return load();
    },
    edit: (payload) => {
      const document = documentFor(payload.row);
      if (!document) {
        return;
      }
      state.editing = payload.row;
      state.editorText = documentText(document);
      refresh();
    },
    duplicate: (payload) => {
      const document = documentFor(payload.row);
      if (!document) {
        return;
      }
      const { _id: _, ...rest } = document;
      state.editing = 'new';
      state.editorText = documentText(rest);
      refresh();
    },
    newDocument: () => {
      state.editing = 'new';
      state.editorText = NEW_DOCUMENT;
      refresh();
    },
    closeEditor: () => {
      state.editing = null;
      refresh();
    },
    save: async (payload, inputs) => {
      const text = String(inputs.document ?? state.editorText);
      state.editorText = text;
      let document;
      try {
        document = parseDocument(text);
      } catch (err) {
        state.error = t('mongo.invalidJson', { error: err.message });
        refresh();
        return;
      }
      const mongo = await driver();
      if (state.editing === 'new') {
        const id = await mongo.insert(db, collection, document);
        state.editing = idKey(id);
        state.editorText = documentText({ _id: id, ...document });
        state.notice = t('mongo.inserted');
        await load();
        return;
      }
      const id = idFromKey(state.editing);
      // The editor may not change the _id: replaceOne keeps the one it found.
      const { _id: _, ...rest } = document;
      const matched = await mongo.replace(db, collection, id, rest);
      state.notice = matched ? t('mongo.saved') : t('mongo.notFound');
      await load();
    },
    deleteEditing: () => removeDocuments(state.editing && state.editing !== 'new' ? [state.editing] : []),
    deleteDocuments: (payload, inputs) => {
      const keys = parseSelection(inputs.documents);
      if (!keys.length && payload?.row) {
        keys.push(payload.row);
      }
      return removeDocuments(keys);
    },
  };

  return handlers;
}
