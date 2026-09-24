/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export function tagActions({ ctx, repo, t, attempt, requireRepo, pickRemote }) {
  /** Tags. */
  async function createTag(target) {
    if (!requireRepo()) {
      return;
    }
    const answer = await ctx.ui.input(
      t('tag.createTitle'),
      [
        { id: 'name', label: t('tag.name'), required: true, mono: true, placeholder: 'v1.0.0' },
        { id: 'message', label: t('tag.message'), type: 'textarea', hint: t('tag.messageHint') },
      ],
      { submitLabel: t('tag.create') },
    );
    const name = answer?.name?.trim();
    if (!name) {
      return;
    }
    const message = answer.message?.trim();
    const args = message ? ['tag', '-a', name, '-m', message] : ['tag', name];
    if (target) {
      args.push(target);
    }
    await attempt(() => repo.run(args));
  }

  async function deleteTag(name) {
    if (
      !(await ctx.ui.confirm(t('tag.deleteTitle'), t('tag.deleteBody', { tag: name }), { confirmLabel: t('tag.delete'), danger: true }))
    ) {
      return;
    }
    await attempt(() => repo.run(['tag', '-d', name]));
  }

  async function pushTag(name) {
    const remote = await pickRemote();
    if (!remote) {
      return;
    }
    await attempt(() => repo.busy(t('busy.push'), () => repo.run(['push', remote, `refs/tags/${name}`], { timeoutMs: 300_000 })));
  }

  return { createTag, deleteTag, pushTag };
}
