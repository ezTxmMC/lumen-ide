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
 * What the user starts from the tree and the palette: adding and editing
 * connections, opening a database file, exporting results.
 */

import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PORTS, FILE_TYPES, TYPES, typeOfFile } from './connections.js';
import { errorText } from './drivers/errors.js';
import { fieldsFor, fromAnswer } from './connection-form.js';
import { exportRows } from './export.js';

/** The failure text of a connection test, or null when it worked. */
async function testFailure(sessions, connection, password, t) {
  try {
    await sessions.test(connection, password);
    return null;
  } catch (err) {
    return errorText(t, err);
  }
}

export function createActions({ ctx, t, connections, sessions }) {
  const notifyError = (err) => ctx.ui.notify(errorText(t, err), 'error');

  /** Ask, test, save; asks again with the same values when the test fails and the user wants to fix it. */
  async function edit(type, known = {}) {
    let values = known;
    for (;;) {
      const title = known.id ? t('connection.editTitle', { name: known.name }) : t('connection.addTitle', { type: t(`type.${type}`) });
      const answer = await ctx.ui.input(title, fieldsFor(t, type, values), { submitLabel: t('connection.save') });
      if (!answer) {
        return null;
      }
      const connection = fromAnswer(t, type, answer, known);
      const typedPassword = answer.password ?? '';
      // An empty password field on an existing connection keeps the saved one.
      const password = typedPassword || !known.id ? typedPassword : undefined;
      const testPassword = password ?? (known.id ? await connections.password(known.id) : '');
      const failure = await testFailure(sessions, connection, testPassword, t);
      if (failure) {
        const keep = await ctx.ui.confirm(t('connection.testFailedTitle'), t('connection.testFailed', { error: failure }), { confirmLabel: t('connection.saveAnyway') });
        values = { ...connection, password: typedPassword };
        if (!keep) {
          continue;
        }
      }
      const saved = await connections.put(connection, password).catch(async (err) => {
        notifyError(err);
        return connections.get(connection.id) ?? null;
      });
      if (saved && known.id) {
        await sessions.disconnect(saved.id);
      }
      if (saved) {
        void sessions.connect(saved.id).catch(() => {});
      }
      return saved;
    }
  }

  return {
    async addConnection() {
      const type = await ctx.ui.pick(t('connection.pickType'), TYPES.map((value) => ({ value, label: t(`type.${value}`), detail: t(`typeDetail.${value}`) })));
      if (!type) {
        return null;
      }
      if (FILE_TYPES.includes(type)) {
        return edit(type, { name: '', user: type === 'h2' ? 'sa' : undefined });
      }
      return edit(type, { host: 'localhost', port: String(DEFAULT_PORTS[type] ?? '') });
    },

    editConnection: (id) => {
      const known = connections.get(id);
      if (!known) {
        return null;
      }
      return edit(known.type, known);
    },

    async duplicateConnection(id) {
      const known = connections.get(id);
      if (!known) {
        return;
      }
      const { id: _, ...rest } = known;
      const password = await connections.password(id);
      await connections.put({ ...rest, name: t('connection.copyName', { name: known.name }) }, password || undefined).catch(notifyError);
    },

    async removeConnection(id) {
      const known = connections.get(id);
      if (!known) {
        return;
      }
      const sure = await ctx.ui.confirm(t('connection.removeTitle'), t('connection.removeBody', { name: known.name }), { confirmLabel: t('connection.remove'), danger: true });
      if (!sure) {
        return;
      }
      await sessions.disconnect(id);
      await connections.remove(id);
    },

    /** A database file: its connection (made when needed), connected. */
    async openFile(file) {
      if (!file) {
        const answer = await ctx.ui.input(t('file.openTitle'), [
          { id: 'file', label: t('field.file'), required: true, mono: true, placeholder: '/path/to/data.sqlite', hint: t('field.fileHint') },
        ], { submitLabel: t('file.open') });
        if (!answer?.file) {
          return null;
        }
        file = answer.file.trim();
      }
      if (!path.isAbsolute(file)) {
        file = path.resolve(ctx.workspace.root() ?? os.homedir(), file);
      }
      if (!typeOfFile(file)) {
        ctx.ui.notify(t('file.unknownType', { name: path.basename(file) }), 'warning');
      }
      const connection = await connections.forFile(file).catch((err) => {
        notifyError(err);
        return null;
      });
      if (!connection) {
        return null;
      }
      await sessions.connect(connection.id).catch(notifyError);
      ctx.ui.showView('connections');
      return connection;
    },

    /** Write rows as CSV or JSON to a file the user names. */
    exportRows: (name, columns, rows) => exportRows({ ctx, t, notifyError }, name, columns, rows),
  };
}
