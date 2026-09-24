/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import path from 'node:path';

export function repoActions({ ctx, repo, t, notify, attempt }) {
  /* ---------------------------------------------------------------- *
   * Repositories
   * ---------------------------------------------------------------- */

  async function init() {
    const folder = ctx.workspace.root();
    if (!folder) {
      notify(t('error.noFolder'), 'warning');
      return;
    }
    const done = await attempt(() => repo.run(['init'], { cwd: folder }).then(() => true));
    if (done) {
      notify(t('repo.initialized'), 'success');
    }
  }

  async function clone() {
    const parent = ctx.workspace.root() ? path.dirname(ctx.workspace.root()) : '';
    const answer = await ctx.ui.input(
      t('clone.title'),
      [
        { id: 'url', label: t('clone.url'), required: true, mono: true, placeholder: 'https://github.com/owner/repo.git' },
        { id: 'parent', label: t('clone.parent'), required: true, mono: true, value: parent, hint: t('clone.parentHint') },
        { id: 'name', label: t('clone.name'), mono: true, placeholder: t('clone.namePlaceholder') },
      ],
      { submitLabel: t('clone.submit') },
    );
    const url = answer?.url?.trim();
    const target = answer?.parent?.trim();
    if (!url || !target) {
      return;
    }
    if (!path.isAbsolute(target)) {
      notify(t('clone.absolute'), 'error');
      return;
    }
    const args = ['clone', '--progress', url];
    if (answer.name?.trim()) {
      args.push(answer.name.trim());
    }
    try {
      await repo.busy(t('busy.clone'), () => repo.run(args, { cwd: target, timeoutMs: 1_800_000 }));
      notify(t('clone.done', { folder: path.join(target, answer.name?.trim() || path.basename(url).replace(/\.git$/, '')) }), 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  return { init, clone };
}
