/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export function historyActions({ ctx, repo, t, notify, branchName, attempt }) {
  /* ---------------------------------------------------------------- *
   * History
   * ---------------------------------------------------------------- */

  async function showCommit(hash) {
    const result = await repo
      .run(['show', '--stat', '--patch', '--format=fuller', hash], { readOnly: true, timeoutMs: 60_000 })
      .catch((err) => ({ error: err }));
    if (result.error) {
      notify(result.error.message, 'error');
      return;
    }
    ctx.ui.openDocument(`${hash.slice(0, 8)}.diff`, result.stdout, 'diff');
  }

  async function checkoutCommit(hash) {
    if (
      !(await ctx.ui.confirm(t('history.checkoutTitle'), t('history.checkoutBody', { hash: hash.slice(0, 8) }), {
        confirmLabel: t('history.checkout'),
      }))
    ) {
      return;
    }
    await attempt(() => repo.run(['switch', '--detach', hash]));
  }

  const cherryPick = (hash) => attempt(() => repo.run(['cherry-pick', hash]));
  const revert = (hash) => attempt(() => repo.run(['revert', '--no-edit', hash]));

  async function reset(hash, mode) {
    const danger = mode === 'hard';
    const sure = await ctx.ui.confirm(
      t('history.resetTitle', { mode }),
      t(danger ? 'history.resetHardBody' : 'history.resetBody', { hash: hash.slice(0, 8), branch: branchName() ?? 'HEAD' }),
      { confirmLabel: t('history.reset'), danger },
    );
    if (!sure) {
      return;
    }
    await attempt(() => repo.run(['reset', `--${mode}`, hash]));
  }

  return { showCommit, checkoutCommit, cherryPick, revert, reset };
}
