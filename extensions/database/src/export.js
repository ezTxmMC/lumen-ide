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
 * Exporting result rows as CSV or JSON to a file the user names.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CSV_SEPARATORS, toCsv, toJson } from './format.js';

const safeName = (name) => String(name || 'result').replace(/[^\w.-]+/g, '_').slice(0, 80);

/** Write rows as CSV or JSON to a file the user names. */
export async function exportRows({ ctx, t, notifyError }, name, columns, rows) {
  const base = (ctx.workspace.root() ?? os.homedir());
  const answer = await ctx.ui.input(t('export.title'), [
    {
      id: 'format', label: t('export.format'), type: 'select', value: 'csv',
      choices: [{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }],
    },
    { id: 'file', label: t('export.file'), required: true, mono: true, value: path.join(base, `${safeName(name)}.csv`), hint: t('export.fileHint') },
  ], { submitLabel: t('export.submit'), description: t('export.rows', { count: rows.length }) });
  if (!answer?.file) {
    return;
  }
  const json = answer.format === 'json';
  let file = answer.file.trim();
  if (!path.isAbsolute(file)) {
    file = path.resolve(base, file);
  }
  if (json && file.endsWith('.csv')) {
    file = `${file.slice(0, -4)}.json`;
  }
  const separator = CSV_SEPARATORS[ctx.settings.get('csvSeparator') ?? 'comma'] ?? ',';
  const content = json ? toJson(columns, rows) : toCsv(columns, rows, separator);
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
    ctx.ui.notify(t('export.done', { count: rows.length, file }), 'success');
  } catch (err) {
    notifyError(err);
  }
}
