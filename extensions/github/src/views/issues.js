/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The issues view: open issues with filters, details, comments, close and reopen. */

import { gate, labelText, repoLine } from './common.js';
import { relativeTime } from '../i18n.js';

export function createIssuesView({ ctx, store, actions, t }) {
  function row(issue) {
    const payload = issue.number;
    const assignees = (issue.assignees ?? []).map((user) => user.login).join(', ');
    return {
      type: 'item',
      id: `issue:${issue.number}`,
      label: `#${issue.number} ${issue.title}`,
      description: `${issue.user?.login ?? '?'} · ${relativeTime(ctx, Date.parse(issue.updated_at))}${issue.comments ? ` · 💬 ${issue.comments}` : ''}`,
      tooltip: [issue.title, issue.html_url, assignees ? t('issue.assignees', { names: assignees }) : ''].filter(Boolean).join('\n'),
      icon: 'circle-dot',
      iconTone: 'success',
      badge: labelText(issue.labels),
      badgeTone: 'accent',
      onClick: { action: 'show', title: t('issue.show'), payload },
      actions: [
        { action: 'comment', title: t('issue.commentAction'), icon: 'message-square-plus', payload },
        { action: 'browser', title: t('action.openInBrowser'), icon: 'external-link', payload: issue.html_url },
      ],
      menu: [
        { action: 'show', title: t('issue.show'), payload },
        { action: 'browser', title: t('action.openInBrowser'), payload: issue.html_url },
        { action: 'comment', title: t('issue.commentAction'), payload },
        { action: 'close', title: t('issue.close'), payload, danger: true },
      ],
    };
  }

  function render() {
    const blocked = gate(store, 'issues', t);
    const toolbar = [
      { action: 'create', title: t('issue.createTitle'), icon: 'plus' },
      { action: 'refresh', title: t('action.refresh'), icon: 'refresh-cw' },
    ];
    if (blocked) {
      return { title: t('view.issues'), toolbar, nodes: blocked };
    }
    const { filter, items, loading, loaded } = store.state.issues;
    return {
      title: t('view.issues'),
      badge: items.length || undefined,
      toolbar,
      nodes: [
        ...repoLine(store, t),
        {
          type: 'select',
          id: 'filter',
          value: filter,
          options: [
            { value: 'all', label: t('filter.allIssues') },
            { value: 'assigned', label: t('filter.assigned') },
            { value: 'created', label: t('filter.created') },
          ],
          change: { action: 'filter', title: t('filter.label') },
        },
        ...(loading ? [{ type: 'progress', label: t('busy.loading') }] : []),
        ...items.map(row),
        ...(!items.length && loaded && !loading ? [{ type: 'empty', title: t('empty.noIssues'), icon: 'circle-check' }] : []),
        { type: 'buttons', buttons: [{ action: 'create', title: t('issue.createTitle'), icon: 'plus', variant: 'secondary' }] },
      ],
    };
  }

  const handlers = {
    refresh: () => store.refreshAll(),
    signIn: () => actions.signIn(),
    create: () => actions.createIssue(),
    filter: (_payload, inputs) => store.setFilter('issues', String(inputs.filter ?? 'all')),
    show: (number) => actions.showIssue(number),
    browser: (url) => actions.openUrl(String(url)),
    comment: (number) => actions.comment(number),
    close: (number) => actions.setIssueState(number, 'closed'),
  };

  async function onAction(event) {
    const handler = handlers[event.action];
    if (handler) {
      await handler(event.payload, event.inputs ?? {});
    }
  }

  return { render, onAction };
}
