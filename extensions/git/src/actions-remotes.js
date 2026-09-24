/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { PULL_ARGS } from './actions-constants.js';

export function remoteActions({ ctx, repo, t, setting, flag, notify, status, attempt, requireRepo }) {
  /* ---------------------------------------------------------------- *
   * Remotes
   * ---------------------------------------------------------------- */

  /** `origin` when there is one, else the only remote, else a choice. */
  async function pickRemote() {
    const remotes = repo.state.remotes;
    if (!remotes.length) {
      notify(t('push.noRemote'), 'warning');
      return null;
    }
    const origin = remotes.find((remote) => remote.name === 'origin');
    if (origin) {
      return origin.name;
    }
    if (remotes.length === 1) {
      return remotes[0].name;
    }
    return ctx.ui.pick(
      t('push.pickRemote'),
      remotes.map((remote) => ({ value: remote.name, label: remote.name, detail: remote.push || remote.fetch })),
    );
  }

  async function push({ force = false } = {}) {
    if (!requireRepo()) {
      return;
    }
    const { branch } = status();
    if (branch.detached || !branch.head) {
      notify(t('push.detached'), 'warning');
      return;
    }
    const args = ['push'];
    if (force) {
      args.push('--force-with-lease');
    }
    if (flag('followTags', false)) {
      args.push('--follow-tags');
    }
    if (!branch.upstream) {
      const remote = await pickRemote();
      if (!remote) {
        return;
      }
      const publish = await ctx.ui.confirm(t('push.publishTitle'), t('push.publishBody', { branch: branch.head, remote }), {
        confirmLabel: t('push.publish'),
      });
      if (!publish) {
        return;
      }
      args.push('-u', remote, branch.head);
    }
    if (
      force &&
      !(await ctx.ui.confirm(t('push.forceTitle'), t('push.forceBody', { branch: branch.head }), {
        confirmLabel: t('push.force'),
        danger: true,
      }))
    ) {
      return;
    }
    const done = await attempt(() => repo.busy(t('busy.push'), () => repo.run(args, { timeoutMs: 300_000 })).then(() => true));
    if (done) {
      notify(t('push.done', { branch: branch.head }), 'success');
    }
  }

  async function pull() {
    if (!requireRepo()) {
      return false;
    }
    if (!status().branch.upstream) {
      notify(t('pull.noUpstream'), 'warning');
      return false;
    }
    const mode = PULL_ARGS[setting('pullMode')] ? setting('pullMode') : 'merge';
    const done = await attempt(() =>
      repo.busy(t('busy.pull'), () => repo.run(['pull', ...PULL_ARGS[mode]], { timeoutMs: 300_000 })).then(() => true),
    );
    if (done) {
      notify(t('pull.done'), 'success');
    }
    return Boolean(done);
  }

  async function fetch({ quiet = false } = {}) {
    if (!repo.state.isRepo) {
      return;
    }
    if (quiet) {
      await repo.run(['fetch', '--all', '--prune', '--quiet'], { timeoutMs: 120_000, allowFail: true }).catch(() => {});
      await repo.refresh();
      return;
    }
    const done = await attempt(() =>
      repo.busy(t('busy.fetch'), () => repo.run(['fetch', '--all', '--prune'], { timeoutMs: 300_000 })).then(() => true),
    );
    if (done) {
      notify(t('fetch.done'), 'success');
    }
  }

  async function sync() {
    if (!requireRepo()) {
      return;
    }
    if (!status().branch.upstream) {
      await push();
      return;
    }
    const pulled = await pull();
    if (!pulled) {
      return;
    }
    if (status().branch.ahead > 0) {
      await push();
    }
  }

  return { pickRemote, push, pull, fetch, sync };
}
