/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * The source-control view: the commit box and the changed files, grouped
 * into merge conflicts, staged, changed and untracked.
 */

import { splitPath } from '../parse.js';

/** Status letters of git → the letter shown on a row. */
const LETTER = { M: 'M', T: 'T', A: 'A', D: 'D', R: 'R', C: 'C', U: '!', '?': 'U' };

/** The inline buttons of a file row, per group. */
function rowActions(group, entry, t) {
  const open = { action: 'open', title: t('file.open'), icon: 'file', payload: entry.path };
  const byGroup = {
    staged: [open, { action: 'unstage', title: t('file.unstage'), icon: 'minus', payload: entry.path }],
    changes: [
      open,
      { action: 'discard', title: t('file.discard'), icon: 'undo', payload: entry.path },
      { action: 'stage', title: t('file.stage'), icon: 'plus', payload: entry.path },
    ],
    untracked: [
      open,
      { action: 'discard', title: t('file.delete'), icon: 'trash-2', payload: entry.path },
      { action: 'stage', title: t('file.stage'), icon: 'plus', payload: entry.path },
    ],
    conflicts: [open, { action: 'resolve', title: t('file.markResolved'), icon: 'check', payload: entry.path }],
  };
  return byGroup[group];
}

/** The context menu of a file row. */
function rowMenu(group, entry, t) {
  const staged = group === 'staged';
  return [
    { action: 'open', title: t('file.open'), payload: entry.path },
    { action: 'diff', title: t('file.diff'), payload: { path: entry.path, staged } },
    ...(group === 'changes' || group === 'untracked' ? [{ action: 'stage', title: t('file.stage'), payload: entry.path }] : []),
    ...(staged ? [{ action: 'unstage', title: t('file.unstage'), payload: entry.path }] : []),
    ...(group === 'changes' ? [{ action: 'discard', title: t('file.discard'), payload: entry.path, danger: true }] : []),
    ...(group === 'untracked' ? [{ action: 'discard', title: t('file.delete'), payload: entry.path, danger: true }] : []),
    { action: 'history', title: t('file.history'), payload: entry.path },
  ];
}

function fileRow(entry, group, t) {
  const { name, dir } = splitPath(entry.path);
  const staged = group === 'staged';
  const renamed = entry.orig ? `${entry.orig} → ` : '';
  const blocks = group === 'conflicts' && entry.blocks ? t('file.conflictCount', { count: String(entry.blocks) }) : '';
  return {
    type: 'item',
    id: `${group}:${entry.path}`,
    label: name,
    description: [blocks, dir].filter(Boolean).join(' · '),
    tooltip: `${renamed}${entry.path}\n${t(`kind.${entry.conflict ?? entry.kind}`)}`,
    fileIcon: name,
    tone: entry.kind,
    badge: LETTER[entry.status] ?? entry.status,
    badgeTone: entry.kind,
    strike: entry.kind === 'deleted',
    onClick:
      group === 'conflicts'
        ? { action: 'open', title: t('file.open'), payload: entry.path }
        : { action: 'diff', title: t('file.diff'), payload: { path: entry.path, staged } },
    actions: rowActions(group, entry, t),
    menu: rowMenu(group, entry, t),
  };
}

function section(id, title, entries, sectionActions, t) {
  if (!entries.length) {
    return [];
  }
  return [
    {
      type: 'section',
      id,
      title,
      badge: entries.length,
      actions: sectionActions,
      children: entries.map((entry) => fileRow(entry, id, t)),
    },
  ];
}

function operationBanner(operation, t) {
  if (!operation) {
    return [];
  }
  return [
    { type: 'text', text: t(`operation.${operation}`), tone: 'warning' },
    {
      type: 'buttons',
      buttons: [
        { action: 'continue', title: t('operation.continue'), icon: 'check', variant: 'primary' },
        { action: 'abort', title: t('operation.abort'), icon: 'x', variant: 'danger' },
      ],
    },
    { type: 'divider' },
  ];
}

function notARepo(ctx, t) {
  const folder = ctx.workspace.root();
  if (!folder) {
    return { nodes: [{ type: 'empty', title: t('empty.noFolder'), hint: t('empty.noFolderHint'), icon: 'folder' }] };
  }
  return {
    title: t('view.changes'),
    nodes: [
      {
        type: 'empty',
        title: t('empty.noRepo'),
        hint: t('empty.noRepoHint'),
        icon: 'git-branch',
        action: { action: 'init', title: t('repo.init'), icon: 'plus', variant: 'primary' },
      },
      { type: 'buttons', buttons: [{ action: 'clone', title: t('clone.title'), icon: 'download', variant: 'secondary' }] },
    ],
  };
}

/** The commit box and its buttons. */
function commitBox({ id, draft, branch, state, status, t }) {
  const busy = Boolean(state.busy);
  return [
    {
      type: 'input',
      id,
      placeholder: t('commit.placeholder', { branch }),
      value: draft,
      multiline: true,
      rows: 3,
      submit: { action: 'commit', title: t('commit.submit') },
    },
    {
      type: 'buttons',
      buttons: [
        { action: 'commit', title: t('commit.submit'), icon: 'check', variant: 'primary', disabled: busy },
        { action: 'commitPush', title: t('commit.andPush'), icon: 'cloud-upload', variant: 'secondary', disabled: busy },
        { action: 'amend', title: t('commit.amend'), icon: 'pencil', variant: 'secondary', disabled: busy || status.branch.initial },
      ],
    },
  ];
}

/** The four file groups, each only when it has entries. */
function fileGroups(status, t) {
  return [
    ...section('conflicts', t('group.conflicts'), status.conflicts, [
      { action: 'resolveAll', title: t('group.markAllResolved'), icon: 'check-check' },
    ], t),
    ...section('staged', t('group.staged'), status.staged, [{ action: 'unstageAll', title: t('group.unstageAll'), icon: 'minus' }], t),
    ...section('changes', t('group.changes'), status.unstaged, [
      { action: 'discardAll', title: t('group.discardAll'), icon: 'undo', danger: true },
      { action: 'stageAll', title: t('group.stageAll'), icon: 'plus' },
    ], t),
    ...section('untracked', t('group.untracked'), status.untracked, [
      { action: 'stageUntracked', title: t('group.stageAll'), icon: 'plus' },
    ], t),
  ];
}

function toolbar(t) {
  return [
    { action: 'refresh', title: t('toolbar.refresh'), icon: 'refresh-cw' },
    { action: 'fetch', title: t('toolbar.fetch'), icon: 'cloud-download' },
    { action: 'pull', title: t('toolbar.pull'), icon: 'pull' },
    { action: 'push', title: t('toolbar.push'), icon: 'push' },
    { action: 'sync', title: t('toolbar.sync'), icon: 'arrow-up-down' },
    { action: 'branch', title: t('toolbar.checkout'), icon: 'git-branch' },
    { action: 'stash', title: t('toolbar.stash'), icon: 'archive' },
  ];
}

const paths = (group) => group.map((entry) => entry.path);

/** Action id → handler(payload) for everything but the commit buttons. */
function createHandlers(repo, actions) {
  return {
    refresh: () => repo.refresh(),
    fetch: () => actions.fetch(),
    pull: () => actions.pull(),
    push: () => actions.push(),
    sync: () => actions.sync(),
    branch: () => actions.checkout(),
    stash: () => actions.stash(),
    init: () => actions.init(),
    clone: () => actions.clone(),
    open: (payload) => actions.openFile(String(payload)),
    diff: (payload) => actions.openDiff(payload.path, payload.staged),
    history: (payload) => actions.fileHistory(repo.absolute(String(payload))),
    stage: (payload) => actions.stage([String(payload)]),
    unstage: (payload) => actions.unstage([String(payload)]),
    discard: (payload) => actions.discard([String(payload)]),
    resolve: (payload) => actions.markResolved([String(payload)]),
    resolveAll: () => actions.markResolved(paths(repo.state.status.conflicts)),
    stageAll: () => actions.stage(paths(repo.state.status.unstaged)),
    stageUntracked: () => actions.stage(paths(repo.state.status.untracked)),
    unstageAll: () => actions.unstageAll(),
    discardAll: () => actions.discard(paths(repo.state.status.unstaged)),
    continue: () => actions.continueOperation(),
    abort: () => actions.abortOperation(),
  };
}

/** The commit buttons: on success the box empties; otherwise the draft stays. */
const COMMIT_HANDLERS = {
  commit: {},
  commitPush: { push: true },
  amend: { amend: true },
};

export function createChangesView({ ctx, repo, actions, t }) {
  /** The last text of the commit box, as the latest action reported it. */
  let draft = '';
  /** Bumped after a commit, so the box comes back empty under a new id. */
  let round = 0;
  const messageId = () => `message-${round}`;

  function render() {
    const { state } = repo;
    if (!state.loaded) {
      return { title: t('view.changes'), nodes: [{ type: 'progress', label: t('busy.loading') }] };
    }
    if (!state.isRepo) {
      return notARepo(ctx, t);
    }
    const { status } = state;
    const total = status.staged.length + status.unstaged.length + status.untracked.length + status.conflicts.length;
    const branch = status.branch.head ?? status.branch.oid?.slice(0, 8) ?? t('branch.none');
    const nodes = [
      ...(state.busy ? [{ type: 'progress', label: state.busy }] : []),
      ...(state.error ? [{ type: 'text', text: state.error, tone: 'danger', small: true }] : []),
      ...operationBanner(state.operation, t),
      ...commitBox({ id: messageId(), draft, branch, state, status, t }),
      ...fileGroups(status, t),
      ...(total ? [] : [{ type: 'empty', title: t('empty.clean'), hint: t('empty.cleanHint', { branch }), icon: 'circle-check' }]),
    ];
    return { title: t('view.changes'), badge: total || undefined, toolbar: toolbar(t), nodes };
  }

  const handlers = createHandlers(repo, actions);

  async function onAction(event) {
    draft = String(event.inputs?.[messageId()] ?? draft);
    const commit = COMMIT_HANDLERS[event.action];
    if (commit) {
      const done = await actions.commit(draft, commit);
      if (!done) {
        return;
      }
      draft = '';
      round++;
      ctx.views.refresh('changes');
      return;
    }
    const handler = handlers[event.action];
    if (handler) {
      await handler(event.payload);
    }
  }

  return { render, onAction, currentDraft: () => draft };
}
