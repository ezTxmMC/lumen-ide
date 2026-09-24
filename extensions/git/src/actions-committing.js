/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export function commitActions({ ctx, repo, t, flag, notify, status, attempt, requireRepo, push }) {
  /* ---------------------------------------------------------------- *
   * Committing
   * ---------------------------------------------------------------- */

  /** Commit what is staged — or, after asking, everything. Returns true on success. */
  async function commit(message, { amend = false, push: andPush = false } = {}) {
    if (!requireRepo()) {
      return false;
    }
    let text = String(message ?? '').trim();
    if (!text && !amend) {
      const answer = await ctx.ui.input(
        t('commit.title'),
        [{ id: 'message', label: t('commit.message'), type: 'textarea', required: true }],
        { submitLabel: t('commit.submit') },
      );
      text = answer?.message?.trim() ?? '';
      if (!text) {
        return false;
      }
    }
    if (amend && !(await ctx.ui.confirm(t('commit.amendTitle'), t('commit.amendBody'), { confirmLabel: t('commit.amend') }))) {
      return false;
    }

    const current = status();
    const pending = current.unstaged.length + current.untracked.length;
    if (!current.staged.length && !amend) {
      if (!pending) {
        notify(t('commit.nothing'), 'info');
        return false;
      }
      const all = await ctx.ui.confirm(t('commit.stageAllTitle'), t('commit.stageAllBody', { count: String(pending) }), {
        confirmLabel: t('commit.stageAllConfirm'),
      });
      if (!all) {
        return false;
      }
      const staged = await attempt(() => repo.run(['add', '-A']).then(() => true), { full: false });
      if (!staged) {
        return false;
      }
    }

    const args = ['commit'];
    if (amend) {
      args.push('--amend');
    }
    if (amend && !text) {
      args.push('--no-edit');
    }
    if (text) {
      args.push('-F', '-');
    }
    if (flag('signOff', false)) {
      args.push('--signoff');
    }
    const done = await attempt(() =>
      repo.busy(t('busy.commit'), () => repo.run(args, { input: text ? `${text}\n` : undefined, timeoutMs: 180_000 })).then(() => true),
    );
    if (!done) {
      return false;
    }
    notify(t(amend ? 'commit.amended' : 'commit.done'), 'success');
    if (andPush) {
      await push();
    }
    return true;
  }

  return { commit };
}
