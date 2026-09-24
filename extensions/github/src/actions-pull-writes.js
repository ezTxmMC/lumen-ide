/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export function pullWriteActions({ ctx, api, store, t, notify, context, attempt, requireRepo, openUrl }) {
  async function mergePull(number) {
    if (!requireRepo()) {
      return;
    }
    const answer = await ctx.ui.input(
      t('pull.mergeTitle', { number: String(number) }),
      [
        {
          id: 'method',
          label: t('pull.mergeMethod'),
          type: 'select',
          value: 'merge',
          choices: [
            { value: 'merge', label: t('pull.methodMerge') },
            { value: 'squash', label: t('pull.methodSquash') },
            { value: 'rebase', label: t('pull.methodRebase') },
          ],
        },
      ],
      { submitLabel: t('pull.merge') },
    );
    if (!answer) {
      return;
    }
    const sure = await ctx.ui.confirm(
      t('pull.mergeTitle', { number: String(number) }),
      t('pull.mergeBody', { number: String(number), method: answer.method }),
      { confirmLabel: t('pull.merge') },
    );
    if (!sure) {
      return;
    }
    const done = await attempt(() =>
      api.put(`${store.repoPath()}/pulls/${number}/merge`, { merge_method: answer.method }).then(() => true),
    );
    if (done) {
      notify(t('pull.merged', { number: String(number) }), 'success');
    }
    await store.load('pulls');
  }

  async function createPull() {
    if (!requireRepo()) {
      return;
    }
    const ctxInfo = context();
    if (!ctxInfo.branch) {
      notify(t('pull.detached'), 'warning');
      return;
    }
    const base = store.repoPath();
    const [repo, branches] = await Promise.all([api.get(base).catch(() => null), api.get(`${base}/branches?per_page=100`).catch(() => [])]);
    const defaultBranch = repo?.default_branch ?? 'main';
    const choices = [...new Set([defaultBranch, ...branches.map((branch) => branch.name)])]
      .filter((name) => name !== ctxInfo.branch)
      .map((name) => ({ value: name, label: name }));
    const last = await ctx.exec('git', ['log', '-1', '--format=%s%n%n%b'], { cwd: ctxInfo.root }).catch(() => null);
    const [subject, ...rest] = (last?.stdout ?? '').split('\n');
    const answer = await ctx.ui.input(
      t('pull.createTitle'),
      [
        { id: 'title', label: t('pull.title'), value: subject?.trim() ?? '', required: true },
        { id: 'body', label: t('pull.body'), type: 'textarea', value: rest.join('\n').trim() },
        { id: 'base', label: t('pull.base'), type: 'select', value: defaultBranch, choices },
        { id: 'draft', label: t('pull.asDraft'), type: 'toggle', value: 'false' },
      ],
      { description: t('pull.createDescription', { branch: ctxInfo.branch }), submitLabel: t('pull.create') },
    );
    if (!answer) {
      return;
    }

    if (!ctxInfo.hasUpstream) {
      const push = await ctx.ui.confirm(t('pull.pushTitle'), t('pull.pushBody', { branch: ctxInfo.branch, remote: ctxInfo.remote }), {
        confirmLabel: t('pull.push'),
      });
      if (!push) {
        return;
      }
      const pushed = await ctx.exec('git', ['push', '-u', ctxInfo.remote, ctxInfo.branch], {
        cwd: ctxInfo.root,
        timeoutMs: 300_000,
        env: { GIT_TERMINAL_PROMPT: '0' },
      });
      if (pushed.code !== 0) {
        notify((pushed.stderr || pushed.stdout).trim(), 'error');
        return;
      }
    }
    const fork = ctxInfo.fork;
    const head = fork && fork.owner !== ctxInfo.repo.owner ? `${fork.owner}:${ctxInfo.branch}` : ctxInfo.branch;
    const pull = await attempt(() =>
      api.post(`${base}/pulls`, {
        title: answer.title.trim(),
        body: answer.body?.trim() || undefined,
        head,
        base: answer.base || defaultBranch,
        draft: answer.draft === 'true',
      }),
    );
    if (!pull) {
      return;
    }
    notify(t('pull.created', { number: String(pull.number) }), 'success');
    await store.load('pulls');
    const open = await ctx.ui.confirm(t('pull.openTitle'), t('pull.openBody', { number: String(pull.number) }), {
      confirmLabel: t('action.openInBrowser'),
    });
    if (open) {
      openUrl(pull.html_url);
    }
  }

  return { mergePull, createPull };
}
