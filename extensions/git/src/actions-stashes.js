/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export function stashActions({ ctx, repo, t, notify, attempt, requireRepo }) {
  /** Stashes. */
  async function stash() {
    if (!requireRepo()) {
      return;
    }
    const answer = await ctx.ui.input(
      t('stash.title'),
      [
        { id: 'message', label: t('stash.message'), placeholder: t('stash.messagePlaceholder') },
        { id: 'untracked', label: t('stash.includeUntracked'), type: 'toggle', value: 'true' },
      ],
      { submitLabel: t('stash.submit') },
    );
    if (!answer) {
      return;
    }
    const args = ['stash', 'push'];
    if (answer.untracked !== 'false') {
      args.push('--include-untracked');
    }
    if (answer.message?.trim()) {
      args.push('-m', answer.message.trim());
    }
    const done = await attempt(() => repo.run(args).then(() => true));
    if (done) {
      notify(t('stash.done'), 'success');
    }
  }

  const stashPop = (ref = 'stash@{0}') => attempt(() => repo.run(['stash', 'pop', ref]));
  const stashApply = (ref) => attempt(() => repo.run(['stash', 'apply', ref]));

  async function stashDrop(ref) {
    if (
      !(await ctx.ui.confirm(t('stash.dropTitle'), t('stash.dropBody', { stash: ref }), { confirmLabel: t('stash.drop'), danger: true }))
    ) {
      return;
    }
    await attempt(() => repo.run(['stash', 'drop', ref]));
  }

  async function stashShow(ref) {
    const result = await repo
      .run(['stash', 'show', '--include-untracked', '--stat', '--patch', ref], { readOnly: true })
      .catch((err) => ({ error: err }));
    if (result.error) {
      notify(result.error.message, 'error');
      return;
    }
    ctx.ui.openDocument(`${ref}.diff`, result.stdout, 'diff');
  }

  return { stash, stashPop, stashApply, stashDrop, stashShow };
}
