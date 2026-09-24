/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export function branchActions({ ctx, repo, t, notify, attempt, requireRepo }) {
  /** Creating and switching branches. */
  async function validBranchName(name) {
    const result = await repo.run(['check-ref-format', '--branch', name], { allowFail: true, readOnly: true });
    return result.code === 0;
  }

  async function createBranch(startPoint) {
    if (!requireRepo()) {
      return;
    }
    const answer = await ctx.ui.input(
      t('branch.createTitle'),
      [
        { id: 'name', label: t('branch.name'), required: true, mono: true, placeholder: 'feature/…' },
        { id: 'from', label: t('branch.from'), value: startPoint ?? '', placeholder: 'HEAD', mono: true },
        { id: 'checkout', label: t('branch.checkoutAfter'), type: 'toggle', value: 'true' },
      ],
      { submitLabel: t('branch.create') },
    );
    const name = answer?.name?.trim();
    if (!name) {
      return;
    }
    if (!(await validBranchName(name))) {
      notify(t('branch.invalidName', { name }), 'error');
      return;
    }
    const from = answer.from?.trim();
    const args = answer.checkout === 'false' ? ['branch', name] : ['switch', '-c', name];
    if (from) {
      args.push(from);
    }
    await attempt(() => repo.run(args));
  }

  async function checkoutRef(name, remote = false) {
    if (!remote) {
      return attempt(() => repo.busy(t('busy.checkout'), () => repo.run(['switch', name])));
    }
    const local = name.slice(name.indexOf('/') + 1);
    const exists = repo.state.refs.local.some((branch) => branch.name === local);
    if (exists) {
      return attempt(() => repo.busy(t('busy.checkout'), () => repo.run(['switch', local])));
    }
    return attempt(() => repo.busy(t('busy.checkout'), () => repo.run(['switch', '--track', name])));
  }

  async function checkout() {
    if (!requireRepo()) {
      return;
    }
    const { local, remote } = repo.state.refs;
    const localNames = new Set(local.map((branch) => branch.name));
    const items = [
      { value: '\0new', label: t('branch.createItem'), detail: '' },
      ...local
        .filter((branch) => !branch.current)
        .map((branch) => ({ value: `l:${branch.name}`, label: branch.name, detail: branch.subject })),
      ...remote
        .filter((branch) => !localNames.has(branch.branch))
        .map((branch) => ({ value: `r:${branch.name}`, label: branch.name, detail: t('branch.remoteDetail') })),
    ];
    const picked = await ctx.ui.pick(t('branch.checkoutTitle'), items, { placeholder: t('branch.checkoutPlaceholder') });
    if (!picked) {
      return;
    }
    if (picked === '\0new') {
      await createBranch();
      return;
    }
    await checkoutRef(picked.slice(2), picked.startsWith('r:'));
  }

  return { validBranchName, createBranch, checkoutRef, checkout };
}
