/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { splitPath } from './parse.js';

export function activeFileActions({ ctx, repo, t, notify }) {
  /* ---------------------------------------------------------------- *
   * The active file
   * ---------------------------------------------------------------- */

  async function fileDocument(file, args, suffix) {
    const relative = file ? repo.relative(file) : null;
    if (!relative) {
      notify(t('file.none'), 'warning');
      return;
    }
    const result = await repo.run([...args, '--', relative], { readOnly: true, timeoutMs: 120_000 }).catch((err) => ({ error: err }));
    if (result.error) {
      notify(result.error.message, 'error');
      return;
    }
    if (!result.stdout.trim()) {
      notify(t('file.noHistory'), 'info');
      return;
    }
    ctx.ui.openDocument(`${splitPath(relative).name} (${suffix})`, result.stdout, args[0] === 'blame' ? undefined : 'diff');
  }

  const fileHistory = (file) =>
    fileDocument(file, ['log', '--follow', '--patch', '--max-count=100', '--format=fuller'], t('file.historySuffix'));
  const blame = (file) => fileDocument(file, ['blame', '--date=short'], t('file.blameSuffix'));

  return { fileHistory, blame };
}
