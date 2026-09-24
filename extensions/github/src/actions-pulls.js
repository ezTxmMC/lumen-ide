/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** One review as a markdown bullet; only the first body line, to keep the list scannable. */
function reviewLine(review) {
  const firstLine = review.body?.split('\n')[0];
  const note = firstLine ? ` — ${firstLine}` : '';
  return `- **${review.user?.login}**: ${review.state}${note}`;
}

export function pullActions({ ctx, api, store, t, notify, context, attempt, requireRepo }) {
  /* ---------------------------------------------------------------- *
   * Pull requests
   * ---------------------------------------------------------------- */

  async function hasGh() {
    const result = await ctx.exec('gh', ['--version'], { timeoutMs: 5000 }).catch(() => null);
    return result?.code === 0;
  }

  async function checkoutPull(number) {
    const ctxInfo = context();
    if (!requireRepo()) {
      return;
    }
    const sure = await ctx.ui.confirm(
      t('pull.checkoutTitle', { number: String(number) }),
      t('pull.checkoutBody', { number: String(number) }),
      { confirmLabel: t('pull.checkout') },
    );
    if (!sure) {
      return;
    }
    const run = async (command, args) => {
      const result = await ctx.exec(command, args, { cwd: ctxInfo.root, timeoutMs: 180_000, env: { GIT_TERMINAL_PROMPT: '0' } });
      if (result.code !== 0) {
        throw new Error((result.stderr || result.stdout).trim() || `${command} ${args[0]} failed`);
      }
    };
    const done = await attempt(async () => {
      if (await hasGh()) {
        await run('gh', ['pr', 'checkout', String(number)]);
        return true;
      }
      const branch = `pr-${number}`;
      await run('git', ['fetch', ctxInfo.remote, `+pull/${number}/head:${branch}`]);
      await run('git', ['switch', branch]);
      return true;
    });
    if (!done) {
      return;
    }
    notify(t('pull.checkedOut', { number: String(number) }), 'success');
    await store.readContext();
    store.emit();
  }

  async function showPull(number) {
    if (!requireRepo()) {
      return;
    }
    const base = store.repoPath();
    const data = await attempt(() =>
      Promise.all([
        api.get(`${base}/pulls/${number}`),
        api.get(`${base}/pulls/${number}/reviews?per_page=100`),
        api.get(`${base}/pulls/${number}/files?per_page=100`),
      ]),
    );
    if (!data) {
      return;
    }
    const [pull, reviews, files] = data;
    const lines = [
      `# #${pull.number} ${pull.title}`,
      '',
      `${t('pull.by', { author: pull.user?.login ?? '?' })} · \`${pull.head.label}\` → \`${pull.base.ref}\`${pull.draft ? ` · ${t('pull.draft')}` : ''}`,
      `${pull.html_url}`,
      '',
      pull.body?.trim() || `_${t('pull.noDescription')}_`,
      '',
      `## ${t('pull.reviews')}`,
      '',
      ...(reviews.length ? reviews.map(reviewLine) : [`_${t('pull.noReviews')}_`]),
      '',
      `## ${t('pull.files', { count: String(files.length) })}`,
      '',
      ...files.map((file) => `- \`${file.filename}\` (+${file.additions} −${file.deletions}) ${file.status}`),
      '',
    ];
    ctx.ui.openDocument(`PR #${pull.number}.md`, lines.join('\n'), 'markdown');
  }

  async function reviewPull(number, event) {
    if (!requireRepo()) {
      return;
    }
    const titles = { APPROVE: 'pull.approveTitle', REQUEST_CHANGES: 'pull.requestChangesTitle', COMMENT: 'pull.commentTitle' };
    const answer = await ctx.ui.input(
      t(titles[event], { number: String(number) }),
      [{ id: 'body', label: t('pull.comment'), type: 'textarea', required: event !== 'APPROVE' }],
      { submitLabel: t(titles[event], { number: String(number) }) },
    );
    if (!answer) {
      return;
    }
    const done = await attempt(() =>
      api.post(`${store.repoPath()}/pulls/${number}/reviews`, { event, body: answer.body?.trim() || undefined }).then(() => true),
    );
    if (done) {
      notify(t('pull.reviewed', { number: String(number) }), 'success');
    }
    await store.load('pulls');
  }

  return { checkoutPull, showPull, reviewPull };
}
