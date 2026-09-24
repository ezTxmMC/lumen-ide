/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The history view: recent commits with their branches and tags. */

import { relativeTime } from '../i18n.js';

const REF_TONE = { head: 'accent', branch: 'success', remote: 'muted', tag: 'warning' };

/** The first branch or tag of a commit, and how many more there are. */
function refBadge(refs) {
  if (!refs.length) {
    return undefined;
  }
  if (refs.length === 1) {
    return refs[0].name;
  }
  return `${refs[0].name} +${refs.length - 1}`;
}

export function createHistoryView({ ctx, repo, actions, t }) {
  function commitRow(commit) {
    const merge = commit.parents.length > 1;
    const refs = commit.refs.filter((ref) => ref.name !== 'HEAD');
    const first = refs[0];
    const when = relativeTime(ctx, commit.time);
    return {
      type: 'item',
      id: commit.hash,
      label: commit.subject || commit.short,
      description: `${commit.short} · ${commit.author} · ${when}`,
      tooltip: [
        commit.subject,
        `${commit.hash}`,
        `${commit.author} <${commit.email}>`,
        new Date(commit.time).toLocaleString(ctx.locale()),
        ...refs.map((ref) => `${t(`ref.${ref.kind}`)}: ${ref.name}`),
      ].join('\n'),
      icon: merge ? 'git-merge' : 'git-commit',
      iconTone: first?.kind === 'head' ? 'accent' : 'muted',
      badge: refBadge(refs),
      badgeTone: first ? REF_TONE[first.kind] : undefined,
      onClick: { action: 'show', title: t('history.show'), payload: commit.hash },
      actions: [{ action: 'show', title: t('history.show'), icon: 'file-diff', payload: commit.hash }],
      menu: [
        { action: 'show', title: t('history.show'), payload: commit.hash },
        { action: 'branch', title: t('history.branchHere'), payload: commit.hash },
        { action: 'tag', title: t('history.tagHere'), payload: commit.hash },
        { action: 'checkout', title: t('history.checkout'), payload: commit.hash },
        { action: 'cherryPick', title: t('history.cherryPick'), payload: commit.hash },
        { action: 'revert', title: t('history.revert'), payload: commit.hash },
        { action: 'resetSoft', title: t('history.resetSoft'), payload: commit.hash },
        { action: 'resetMixed', title: t('history.resetMixed'), payload: commit.hash },
        { action: 'resetHard', title: t('history.resetHard'), payload: commit.hash, danger: true },
      ],
    };
  }

  function render() {
    const { state } = repo;
    if (!state.loaded) {
      return { title: t('view.history'), nodes: [{ type: 'progress', label: t('busy.loading') }] };
    }
    if (!state.isRepo) {
      return { title: t('view.history'), nodes: [{ type: 'empty', title: t('empty.noRepo'), icon: 'history' }] };
    }
    if (!state.log.length) {
      return {
        title: t('view.history'),
        nodes: [{ type: 'empty', title: t('empty.noCommits'), hint: t('empty.noCommitsHint'), icon: 'git-commit' }],
      };
    }
    const more = state.log.length >= state.logLimit;
    return {
      title: t('view.history'),
      toolbar: [{ action: 'refresh', title: t('toolbar.refresh'), icon: 'refresh-cw' }],
      nodes: [
        ...state.log.map(commitRow),
        ...(more
          ? [{ type: 'buttons', buttons: [{ action: 'more', title: t('history.more'), icon: 'chevron-down', variant: 'secondary' }] }]
          : []),
      ],
    };
  }

  const handlers = {
    refresh: () => repo.refresh(),
    more: () => repo.loadMoreHistory(),
    show: (hash) => actions.showCommit(hash),
    branch: (hash) => actions.createBranch(hash),
    tag: (hash) => actions.createTag(hash),
    checkout: (hash) => actions.checkoutCommit(hash),
    cherryPick: (hash) => actions.cherryPick(hash),
    revert: (hash) => actions.revert(hash),
    resetSoft: (hash) => actions.reset(hash, 'soft'),
    resetMixed: (hash) => actions.reset(hash, 'mixed'),
    resetHard: (hash) => actions.reset(hash, 'hard'),
  };

  async function onAction(event) {
    const handler = handlers[event.action];
    if (handler) {
      await handler(String(event.payload ?? ''));
    }
  }

  return { render, onAction };
}
