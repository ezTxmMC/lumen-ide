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
 * The connection form: the fields to ask for per connection type, and the
 * connection a filled-in form stands for.
 */

import { DEFAULT_PORTS, FILE_TYPES } from './connections.js';

/** The fields of the connection form for one type, filled with what is known. */
export function fieldsFor(t, type, known = {}) {
  const text = (id, extra = {}) => ({ id, label: t(`field.${id}`), value: known[id] === undefined ? '' : String(known[id]), ...extra });
  const name = text('name', { required: true, value: known.name ?? '' });
  if (FILE_TYPES.includes(type)) {
    return [
      name,
      text('file', { required: true, mono: true, placeholder: type === 'h2' ? '/path/to/data.mv.db' : '/path/to/data.sqlite', hint: t('field.fileHint') }),
      ...(type === 'h2' ? [
        text('user', { value: known.user ?? 'sa' }),
        { id: 'password', label: t('field.password'), type: 'password', placeholder: known.id ? t('field.passwordKeep') : '' },
      ] : []),
      { id: 'readOnly', label: t('field.readOnly'), type: 'toggle', value: known.readOnly ? 'true' : 'false' },
    ];
  }
  return [
    name,
    text('host', { placeholder: 'localhost' }),
    text('port', { placeholder: String(DEFAULT_PORTS[type] ?? '') }),
    text('user', { placeholder: type === 'mssql' ? 'sa' : '' }),
    { id: 'password', label: t('field.password'), type: 'password', placeholder: known.id ? t('field.passwordKeep') : '' },
    text('database', { placeholder: t(`field.databasePlaceholder.${type}`) }),
    text('url', { mono: true, placeholder: t(`field.urlPlaceholder.${type}`), hint: t('field.urlHint') }),
    {
      id: 'ssl', label: t('field.ssl'), type: 'select', value: known.ssl ?? 'off',
      choices: ['off', 'require', 'verify'].map((value) => ({ value, label: t(`field.sslMode.${value}`) })),
    },
    text('sslCa', { mono: true, placeholder: '/path/to/ca.pem' }),
    { id: 'savePassword', label: t('field.savePassword'), type: 'toggle', value: known.savePassword === false ? 'false' : 'true' },
  ];
}

/** The form's answer as a connection. */
export function fromAnswer(t, type, answer, known = {}) {
  const clean = (value) => String(value ?? '').trim();
  const connection = { ...known, type, name: clean(answer.name) || t(`type.${type}`) };
  for (const key of ['file', 'host', 'port', 'user', 'database', 'url', 'sslCa']) {
    const value = clean(answer[key]);
    delete connection[key];
    if (value) {
      connection[key] = value;
    }
  }
  if ('ssl' in answer) {
    connection.ssl = answer.ssl || 'off';
  }
  connection.readOnly = answer.readOnly === 'true';
  connection.savePassword = FILE_TYPES.includes(type) ? true : answer.savePassword !== 'false';
  return connection;
}
