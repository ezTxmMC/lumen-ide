/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export function issueActions({ ctx, api, store, t, notify, attempt, requireRepo }) {
  /* ---------------------------------------------------------------- *
   * Issues
   * ---------------------------------------------------------------- */

  async function showIssue(number) {
    if (!requireRepo()) {
      return;
    }
    const base = store.repoPath();
    const data = await attempt(() =>
      Promise.all([api.get(`${base}/issues/${number}`), api.get(`${base}/issues/${number}/comments?per_page=100`)]),
    );
    if (!data) {
      return;
    }
    const [issue, comments] = data;
    const labels = (issue.labels ?? []).map((label) => `\`${label.name}\``).join(' ');
    const lines = [
      `# #${issue.number} ${issue.title}`,
      '',
      `${t('issue.by', { author: issue.user?.login ?? '?' })} · ${issue.state}${labels ? ` · ${labels}` : ''}`,
      `${issue.html_url}`,
      '',
      issue.body?.trim() || `_${t('issue.noDescription')}_`,
      '',
      `## ${t('issue.comments', { count: String(comments.length) })}`,
      '',
      ...comments.flatMap((comment) => [
        `### ${comment.user?.login} · ${new Date(comment.created_at).toLocaleString(ctx.locale())}`,
        '',
        comment.body ?? '',
        '',
      ]),
    ];
    ctx.ui.openDocument(`Issue #${issue.number}.md`, lines.join('\n'), 'markdown');
  }

  async function createIssue() {
    if (!requireRepo()) {
      return;
    }
    const answer = await ctx.ui.input(
      t('issue.createTitle'),
      [
        { id: 'title', label: t('issue.title'), required: true },
        { id: 'body', label: t('issue.body'), type: 'textarea' },
        { id: 'labels', label: t('issue.labels'), placeholder: 'bug, enhancement', hint: t('issue.labelsHint') },
      ],
      { submitLabel: t('issue.create') },
    );
    if (!answer) {
      return;
    }
    const labels = (answer.labels ?? '')
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean);
    const issue = await attempt(() =>
      api.post(`${store.repoPath()}/issues`, {
        title: answer.title.trim(),
        body: answer.body?.trim() || undefined,
        labels: labels.length ? labels : undefined,
      }),
    );
    if (!issue) {
      return;
    }
    notify(t('issue.created', { number: String(issue.number) }), 'success');
    await store.load('issues');
  }

  async function setIssueState(number, state) {
    if (!requireRepo()) {
      return;
    }
    const key = state === 'closed' ? 'issue.close' : 'issue.reopen';
    const sure = await ctx.ui.confirm(t(`${key}Title`, { number: String(number) }), t(`${key}Body`, { number: String(number) }), {
      confirmLabel: t(key),
      danger: state === 'closed',
    });
    if (!sure) {
      return;
    }
    await attempt(() => api.patch(`${store.repoPath()}/issues/${number}`, { state }));
    await store.load('issues');
  }

  async function comment(number) {
    if (!requireRepo()) {
      return;
    }
    const answer = await ctx.ui.input(
      t('issue.commentTitle', { number: String(number) }),
      [{ id: 'body', label: t('pull.comment'), type: 'textarea', required: true }],
      { submitLabel: t('issue.commentSubmit') },
    );
    const body = answer?.body?.trim();
    if (!body) {
      return;
    }
    const done = await attempt(() => api.post(`${store.repoPath()}/issues/${number}/comments`, { body }).then(() => true));
    if (done) {
      notify(t('issue.commented', { number: String(number) }), 'success');
    }
  }

  return { showIssue, createIssue, setIssueState, comment };
}
