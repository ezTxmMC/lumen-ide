/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The Actions view: recent workflow runs with their state, re-run and cancel. */

import { gate, repoLine } from './common.js';
import { relativeTime } from '../i18n.js';

/** A run's state and conclusion → the key of its label, tone and icon. */
export function runState(run) {
  if (run.status !== 'completed') {
    return run.status === 'queued' || run.status === 'waiting' ? 'queued' : 'running';
  }
  const byConclusion = {
    success: 'success',
    failure: 'failure',
    cancelled: 'cancelled',
    skipped: 'skipped',
    timed_out: 'failure',
    action_required: 'waiting',
    startup_failure: 'failure',
    neutral: 'skipped',
  };
  return byConclusion[run.conclusion] ?? 'skipped';
}

export const RUN_LOOK = {
  success: { tone: 'success', icon: 'circle-check', symbol: '✓' },
  failure: { tone: 'danger', icon: 'circle-x', symbol: '✗' },
  cancelled: { tone: 'muted', icon: 'ban', symbol: '⊘' },
  skipped: { tone: 'muted', icon: 'circle-dashed', symbol: '–' },
  waiting: { tone: 'warning', icon: 'pause', symbol: '●' },
  queued: { tone: 'warning', icon: 'circle-dashed', symbol: '●' },
  running: { tone: 'warning', icon: 'loader', symbol: '●' },
};

export function createRunsView({ ctx, store, actions, t }) {
  function row(run) {
    const state = runState(run);
    const look = RUN_LOOK[state];
    const finished = run.status === 'completed';
    return {
      type: 'item',
      id: `run:${run.id}`,
      label: `${run.name ?? run.workflow_id} #${run.run_number}`,
      description: `${run.head_branch ?? ''} · ${run.event} · ${run.display_title ?? ''} · ${relativeTime(ctx, Date.parse(run.updated_at))}`,
      tooltip: [`${run.name} #${run.run_number}`, t(`run.state.${state}`), run.head_sha?.slice(0, 8), run.html_url]
        .filter(Boolean)
        .join('\n'),
      icon: look.icon,
      iconTone: look.tone,
      tone: state === 'failure' ? 'danger' : 'default',
      badge: t(`run.state.${state}`),
      badgeTone: look.tone,
      onClick: { action: 'browser', title: t('run.open'), payload: run.html_url },
      actions: [
        ...(finished ? [{ action: 'rerun', title: t('run.rerun'), icon: 'rotate-ccw', payload: run.id }] : []),
        ...(finished ? [] : [{ action: 'cancel', title: t('run.cancel'), icon: 'stop', payload: run.id }]),
        { action: 'browser', title: t('run.open'), icon: 'external-link', payload: run.html_url },
      ],
      menu: [
        { action: 'browser', title: t('run.logs'), payload: run.html_url },
        ...(finished ? [{ action: 'rerun', title: t('run.rerun'), payload: run.id }] : []),
        ...(state === 'failure' ? [{ action: 'rerunFailed', title: t('run.rerunFailed'), payload: run.id }] : []),
        ...(finished ? [] : [{ action: 'cancel', title: t('run.cancel'), payload: run.id, danger: true }]),
      ],
    };
  }

  function render() {
    const blocked = gate(store, 'runs', t);
    const toolbar = [
      { action: 'repo', title: t('action.openRepo'), icon: 'github' },
      { action: 'refresh', title: t('action.refresh'), icon: 'refresh-cw' },
    ];
    if (blocked) {
      return { title: t('view.runs'), toolbar, nodes: blocked };
    }
    const { filter, items, loading, loaded } = store.state.runs;
    const branch = store.state.context?.branch;
    return {
      title: t('view.runs'),
      toolbar,
      nodes: [
        ...repoLine(store, t),
        {
          type: 'select',
          id: 'filter',
          value: filter,
          options: [
            { value: 'branch', label: t('filter.currentBranch', { branch: branch ?? 'HEAD' }) },
            { value: 'all', label: t('filter.allRuns') },
          ],
          change: { action: 'filter', title: t('filter.label') },
        },
        ...(loading ? [{ type: 'progress', label: t('busy.loading') }] : []),
        ...items.map(row),
        ...(!items.length && loaded && !loading ? [{ type: 'empty', title: t('empty.noRuns'), icon: 'workflow' }] : []),
      ],
    };
  }

  const handlers = {
    refresh: () => store.refreshAll(),
    signIn: () => actions.signIn(),
    repo: () => actions.openRepo(),
    filter: (_payload, inputs) => store.setFilter('runs', String(inputs.filter ?? 'branch')),
    browser: (url) => actions.openUrl(String(url)),
    rerun: (id) => actions.rerun(id, false),
    rerunFailed: (id) => actions.rerun(id, true),
    cancel: (id) => actions.cancelRun(id),
  };

  async function onAction(event) {
    const handler = handlers[event.action];
    if (handler) {
      await handler(event.payload, event.inputs ?? {});
    }
  }

  return { render, onAction };
}
