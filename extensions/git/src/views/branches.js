/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The branches view: local and remote branches, tags, stashes and remotes. */

import { relativeTime } from '../i18n.js';

function tracking(branch, t) {
  if (branch.gone) {
    return t('branch.gone');
  }
  if (!branch.upstream) {
    return t('branch.noUpstream');
  }
  const parts = [branch.upstream];
  if (branch.ahead) {
    parts.push(`↑${branch.ahead}`);
  }
  if (branch.behind) {
    parts.push(`↓${branch.behind}`);
  }
  return parts.join(' ');
}

function localRow(branch, { ctx, t }) {
  const menu = [
    ...(branch.current ? [] : [{ action: 'checkout', title: t('branch.checkout'), payload: branch.name }]),
    ...(branch.current ? [] : [{ action: 'merge', title: t('branch.mergeInto'), payload: branch.name }]),
    ...(branch.current ? [] : [{ action: 'rebase', title: t('branch.rebaseOnto'), payload: branch.name }]),
    { action: 'branchFrom', title: t('branch.createFrom'), payload: branch.name },
    { action: 'rename', title: t('branch.rename'), payload: branch.name },
    ...(branch.current ? [] : [{ action: 'delete', title: t('branch.delete'), payload: branch.name, danger: true }]),
  ];
  return {
    type: 'item',
    id: `local:${branch.name}`,
    label: branch.name,
    description: tracking(branch, t),
    tooltip: `${branch.name}\n${branch.oid} ${branch.subject}\n${relativeTime(ctx, branch.time)}`,
    icon: branch.current ? 'check' : 'git-branch',
    iconTone: branch.current ? 'accent' : 'muted',
    tone: branch.current ? 'accent' : 'default',
    badge: branch.current ? t('branch.current') : undefined,
    badgeTone: 'accent',
    onClick: branch.current ? undefined : { action: 'checkout', title: t('branch.checkout'), payload: branch.name },
    actions: branch.current ? [] : [{ action: 'checkout', title: t('branch.checkout'), icon: 'log-in', payload: branch.name }],
    menu,
  };
}

function remoteRow(branch, { ctx, t }) {
  return {
    type: 'item',
    id: `remote:${branch.name}`,
    label: branch.name,
    description: `${branch.oid} · ${relativeTime(ctx, branch.time)}`,
    tooltip: `${branch.name}\n${branch.subject}`,
    icon: 'cloud',
    iconTone: 'muted',
    onClick: { action: 'checkoutRemote', title: t('branch.checkout'), payload: branch.name },
    actions: [{ action: 'checkoutRemote', title: t('branch.checkout'), icon: 'log-in', payload: branch.name }],
    menu: [
      { action: 'checkoutRemote', title: t('branch.checkout'), payload: branch.name },
      { action: 'merge', title: t('branch.mergeInto'), payload: branch.name },
      { action: 'rebase', title: t('branch.rebaseOnto'), payload: branch.name },
      { action: 'branchFrom', title: t('branch.createFrom'), payload: branch.name },
    ],
  };
}

function tagRow(tag, { t }) {
  return {
    type: 'item',
    id: `tag:${tag.name}`,
    label: tag.name,
    description: tag.subject,
    icon: 'tag',
    iconTone: 'warning',
    onClick: { action: 'showCommit', title: t('history.show'), payload: tag.name },
    menu: [
      { action: 'showCommit', title: t('history.show'), payload: tag.name },
      { action: 'checkoutTag', title: t('branch.checkout'), payload: tag.name },
      { action: 'branchFrom', title: t('branch.createFrom'), payload: tag.name },
      { action: 'pushTag', title: t('tag.push'), payload: tag.name },
      { action: 'deleteTag', title: t('tag.delete'), payload: tag.name, danger: true },
    ],
  };
}

function stashRow(stash, { ctx, t }) {
  return {
    type: 'item',
    id: `stash:${stash.ref}`,
    label: stash.message,
    description: `${stash.ref} · ${relativeTime(ctx, stash.time)}`,
    icon: 'archive',
    iconTone: 'muted',
    onClick: { action: 'stashShow', title: t('stash.show'), payload: stash.ref },
    actions: [
      { action: 'stashApply', title: t('stash.apply'), icon: 'check', payload: stash.ref },
      { action: 'stashPop', title: t('stash.pop'), icon: 'arrow-up', payload: stash.ref },
    ],
    menu: [
      { action: 'stashShow', title: t('stash.show'), payload: stash.ref },
      { action: 'stashApply', title: t('stash.apply'), payload: stash.ref },
      { action: 'stashPop', title: t('stash.pop'), payload: stash.ref },
      { action: 'stashDrop', title: t('stash.drop'), payload: stash.ref, danger: true },
    ],
  };
}

function remoteEntry(remote, { t }) {
  return {
    type: 'item',
    id: `remote-entry:${remote.name}`,
    label: remote.name,
    description: remote.fetch,
    tooltip: `fetch: ${remote.fetch}\npush: ${remote.push}`,
    icon: 'globe',
    iconTone: 'muted',
    actions: [{ action: 'fetch', title: t('toolbar.fetch'), icon: 'cloud-download' }],
  };
}

function section(id, title, rows, sectionActions = [], collapsed = false) {
  if (!rows.length) {
    return [];
  }
  return [{ type: 'section', id, title, badge: rows.length, collapsed, actions: sectionActions, children: rows }];
}

function toolbar(t) {
  return [
    { action: 'create', title: t('branch.createTitle'), icon: 'git-branch-plus' },
    { action: 'createTag', title: t('tag.createTitle'), icon: 'tag' },
    { action: 'stash', title: t('toolbar.stash'), icon: 'archive' },
    { action: 'fetch', title: t('toolbar.fetch'), icon: 'cloud-download' },
    { action: 'refresh', title: t('toolbar.refresh'), icon: 'refresh-cw' },
  ];
}

/** The five sections: local, remote, tags, stashes and remotes. */
function sections(state, env) {
  const { t } = env;
  const { refs, stashes, remotes } = state;
  return [
    ...section('local', t('group.local'), refs.local.map((b) => localRow(b, env)), [
      { action: 'create', title: t('branch.createTitle'), icon: 'plus' },
    ]),
    ...section('remote', t('group.remote'), refs.remote.map((b) => remoteRow(b, env)), [], refs.remote.length > 30),
    ...section(
      'tags',
      t('group.tags'),
      refs.tags.map((tag) => tagRow(tag, env)),
      [{ action: 'createTag', title: t('tag.createTitle'), icon: 'plus' }],
      true,
    ),
    ...section(
      'stashes',
      t('group.stashes'),
      stashes.map((stash) => stashRow(stash, env)),
      [{ action: 'stash', title: t('toolbar.stash'), icon: 'plus' }],
    ),
    ...section('remotes', t('group.remotes'), remotes.map((remote) => remoteEntry(remote, env)), [], true),
  ];
}

/** Action id → handler(name or ref). */
function createHandlers(repo, actions) {
  return {
    refresh: () => repo.refresh(),
    fetch: () => actions.fetch(),
    create: () => actions.createBranch(),
    createTag: () => actions.createTag(),
    stash: () => actions.stash(),
    checkout: (name) => actions.checkoutRef(name),
    checkoutRemote: (name) => actions.checkoutRef(name, true),
    checkoutTag: (name) => actions.checkoutCommit(name),
    merge: (name) => actions.merge(name),
    rebase: (name) => actions.rebase(name),
    branchFrom: (name) => actions.createBranch(name),
    rename: (name) => actions.renameBranch(name),
    delete: (name) => actions.deleteBranch(name),
    showCommit: (name) => actions.showCommit(name),
    pushTag: (name) => actions.pushTag(name),
    deleteTag: (name) => actions.deleteTag(name),
    stashShow: (ref) => actions.stashShow(ref),
    stashApply: (ref) => actions.stashApply(ref),
    stashPop: (ref) => actions.stashPop(ref),
    stashDrop: (ref) => actions.stashDrop(ref),
  };
}

export function createBranchesView({ ctx, repo, actions, t }) {
  const env = { ctx, t };

  function render() {
    const { state } = repo;
    if (!state.loaded) {
      return { title: t('view.branches'), nodes: [{ type: 'progress', label: t('busy.loading') }] };
    }
    if (!state.isRepo) {
      return { title: t('view.branches'), nodes: [{ type: 'empty', title: t('empty.noRepo'), icon: 'git-branch' }] };
    }
    return {
      title: t('view.branches'),
      toolbar: toolbar(t),
      nodes: [...(state.busy ? [{ type: 'progress', label: state.busy }] : []), ...sections(state, env)],
    };
  }

  const handlers = createHandlers(repo, actions);

  async function onAction(event) {
    const handler = handlers[event.action];
    if (handler) {
      await handler(String(event.payload ?? ''));
    }
  }

  return { render, onAction };
}
