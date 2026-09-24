/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export function branchOpActions({ ctx, repo, t, notify, branchName, attempt, requireRepo, validBranchName }) {
  /** Merging, rebasing, renaming and deleting branches. */
  async function pickOtherBranch(title) {
    const items = [
      ...repo.state.refs.local
        .filter((branch) => !branch.current)
        .map((branch) => ({ value: branch.name, label: branch.name, detail: branch.subject })),
      ...repo.state.refs.remote.map((branch) => ({ value: branch.name, label: branch.name, detail: t('branch.remoteDetail') })),
    ];
    if (!items.length) {
      notify(t('branch.noOther'), 'info');
      return null;
    }
    return ctx.ui.pick(title, items);
  }

  async function merge(name) {
    if (!requireRepo()) {
      return;
    }
    const target = name ?? (await pickOtherBranch(t('branch.mergeTitle', { branch: branchName() ?? 'HEAD' })));
    if (!target) {
      return;
    }
    const done = await attempt(() =>
      repo.busy(t('busy.merge'), () => repo.run(['merge', '--no-edit', target], { timeoutMs: 300_000 })).then(() => true),
    );
    if (done) {
      notify(t('branch.merged', { branch: target }), 'success');
    }
    if (!done && repo.state.status.conflicts.length) {
      ctx.ui.showView('changes');
    }
  }

  async function rebase(name) {
    if (!requireRepo()) {
      return;
    }
    const target = name ?? (await pickOtherBranch(t('branch.rebaseTitle', { branch: branchName() ?? 'HEAD' })));
    if (!target) {
      return;
    }
    const done = await attempt(() =>
      repo.busy(t('busy.rebase'), () => repo.run(['rebase', target], { timeoutMs: 300_000 })).then(() => true),
    );
    if (done) {
      notify(t('branch.rebased', { branch: target }), 'success');
    }
    if (!done && repo.state.operation) {
      ctx.ui.showView('changes');
    }
  }

  async function renameBranch(name) {
    const answer = await ctx.ui.input(
      t('branch.renameTitle', { branch: name }),
      [{ id: 'name', label: t('branch.newName'), value: name, required: true, mono: true }],
      { submitLabel: t('branch.rename') },
    );
    const next = answer?.name?.trim();
    if (!next || next === name) {
      return;
    }
    if (!(await validBranchName(next))) {
      notify(t('branch.invalidName', { name: next }), 'error');
      return;
    }
    await attempt(() => repo.run(['branch', '-m', name, next]));
  }

  async function deleteBranch(name) {
    const sure = await ctx.ui.confirm(t('branch.deleteTitle'), t('branch.deleteBody', { branch: name }), {
      confirmLabel: t('branch.delete'),
      danger: true,
    });
    if (!sure) {
      return;
    }
    const result = await repo.run(['branch', '-d', name], { allowFail: true }).catch((err) => ({ code: 1, stderr: err.message }));
    if (result.code === 0) {
      await repo.refresh();
      return;
    }
    // Not merged: git refuses `-d`; ask once more before forcing.
    const force = await ctx.ui.confirm(t('branch.forceDeleteTitle'), t('branch.forceDeleteBody', { branch: name }), {
      confirmLabel: t('branch.forceDelete'),
      danger: true,
    });
    if (!force) {
      return;
    }
    await attempt(() => repo.run(['branch', '-D', name]));
  }

  return { merge, rebase, renameBranch, deleteBranch };
}
