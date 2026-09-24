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
 * Git for Lumen: a source-control view, the history, branches with tags and
 * stashes, a status-bar entry and commands for the palette.
 *
 * Everything runs the installed `git` without a shell. The state is read with
 * `git status --porcelain=v2` and friends and refreshed when files are saved,
 * when the window gets focus, when a view is shown — and every few seconds
 * while someone is working with the views.
 */

import { createT } from './src/i18n.js';
import { createGit } from './src/git.js';
import { createRepo } from './src/repo.js';
import { createActions } from './src/actions.js';
import { createChangesView } from './src/views/changes.js';
import { createHistoryView } from './src/views/history.js';
import { createBranchesView } from './src/views/branches.js';

const VIEWS = ['changes', 'history', 'branches'];
/** How often the status is read while the views are in use. */
const POLL_MS = 10_000;
/** How long after the last interaction polling continues. */
const ACTIVE_MS = 120_000;

/** The status-bar entries: the branch and the sync state. */
function updateStatusBar({ ctx, repo, t }) {
  const { state } = repo;
  if (!state.isRepo) {
    ctx.statusBar.set('branch', null);
    ctx.statusBar.set('sync', null);
    return;
  }
  const { branch, staged, unstaged, untracked, conflicts } = state.status;
  const dirty = staged.length + unstaged.length + untracked.length + conflicts.length > 0;
  const name = branch.head ?? branch.oid?.slice(0, 8) ?? t('branch.none');
  ctx.statusBar.set('branch', {
    text: `${name}${dirty ? '*' : ''}`,
    icon: 'git-branch',
    tooltip: t(branch.detached ? 'status.detached' : 'status.branchTooltip', { branch: name }),
    command: 'git.checkout',
    tone: conflicts.length ? 'danger' : 'default',
    priority: 100,
  });
  if (!branch.head) {
    ctx.statusBar.set('sync', null);
    return;
  }
  if (!branch.upstream) {
    ctx.statusBar.set('sync', { text: '', icon: 'cloud-upload', tooltip: t('status.publishTooltip'), command: 'git.push', priority: 99 });
    return;
  }
  ctx.statusBar.set('sync', {
    text: `${branch.behind}↓ ${branch.ahead}↑`,
    icon: 'refresh-cw',
    tooltip: t('status.syncTooltip', { upstream: branch.upstream, ahead: String(branch.ahead), behind: String(branch.behind) }),
    command: 'git.sync',
    priority: 99,
  });
}

function registerViews({ ctx, repo, views, touch }) {
  for (const id of VIEWS) {
    ctx.views.register(id, {
      render: () => views[id].render(),
      onAction: (event) => {
        touch();
        return views[id].onAction(event);
      },
      onShow: () => {
        touch();
        void repo.refreshStatus();
      },
    });
  }
}

function registerCommands({ ctx, repo, actions, views, touch, session }) {
  const commands = {
    'git.refresh': () => repo.refresh(),
    'git.open-changes': () => ctx.ui.showView('changes'),
    'git.open-history': () => ctx.ui.showView('history'),
    'git.open-branches': () => ctx.ui.showView('branches'),
    'git.commit': () => actions.commit(views.changes.currentDraft()),
    'git.commit-amend': () => actions.commit(views.changes.currentDraft(), { amend: true }),
    'git.stage-all': () => actions.stageAll(),
    'git.unstage-all': () => actions.unstageAll(),
    'git.discard-all': () => actions.discardAll(),
    'git.push': () => actions.push(),
    'git.force-push': () => actions.push({ force: true }),
    'git.pull': () => actions.pull(),
    'git.fetch': () => actions.fetch(),
    'git.sync': () => actions.sync(),
    'git.checkout': () => actions.checkout(),
    'git.create-branch': () => actions.createBranch(),
    'git.merge': () => actions.merge(),
    'git.rebase': () => actions.rebase(),
    'git.create-tag': () => actions.createTag(),
    'git.stash': () => actions.stash(),
    'git.stash-pop': () => actions.stashPop(),
    'git.init': () => actions.init(),
    'git.clone': () => actions.clone(),
    'git.file-history': () => actions.fileHistory(session.activeFile),
    'git.blame': () => actions.blame(session.activeFile),
    'git.open-terminal': () => ctx.ui.runInTerminal('git status', { cwd: repo.state.top ?? undefined, title: 'git' }),
  };
  for (const [id, run] of Object.entries(commands)) {
    ctx.commands.register(id, () => {
      touch();
      return run();
    });
  }
}

/** The events that make the state stale: saves, focus, a shown view, locale, folder changes. */
function registerRefreshEvents({ ctx, repo, touch, session, refreshViews }) {
  const afterSave = () => {
    if (session.saveTimer) {
      clearTimeout(session.saveTimer);
    }
    session.saveTimer = setTimeout(() => void repo.refreshStatus(), 400);
  };

  ctx.events.on('fileSaved', afterSave);
  ctx.events.on('activeFile', (event) => {
    session.activeFile = event.path;
  });
  ctx.events.on('windowFocus', () => {
    touch();
    void repo.refreshStatus();
  });
  ctx.events.on('viewVisible', (event) => {
    if (event.extensionId !== ctx.id) {
      return;
    }
    touch();
    void repo.refreshStatus();
  });
  ctx.events.on('locale', refreshViews);
  ctx.workspace.onDidChange(() => void repo.refresh());
}

/** Fetch in the background every few minutes, when the setting asks for it. */
function scheduleAutoFetch({ ctx, actions, session }) {
  if (session.fetchTimer) {
    clearInterval(session.fetchTimer);
  }
  session.fetchTimer = null;
  const minutes = Number(ctx.settings.get('autoFetchMinutes'));
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return;
  }
  session.fetchTimer = setInterval(() => void actions.fetch({ quiet: true }), Math.max(1, minutes) * 60_000);
}

export function activate(ctx) {
  const t = createT(ctx);
  const git = createGit(ctx, t);
  const repo = createRepo(ctx, git);
  const actions = createActions({ ctx, repo, t });
  const deps = { ctx, repo, actions, t };
  const views = {
    changes: createChangesView(deps),
    history: createHistoryView(deps),
    branches: createBranchesView(deps),
  };

  let lastActive = Date.now();
  const session = { activeFile: null, saveTimer: null, fetchTimer: null };
  const touch = () => {
    lastActive = Date.now();
  };
  const refreshViews = () => {
    for (const id of VIEWS) {
      ctx.views.refresh(id);
    }
    updateStatusBar(deps);
  };

  registerViews({ ctx, repo, views, touch });
  repo.onChange(refreshViews);
  registerCommands({ ctx, repo, actions, views, touch, session });
  registerRefreshEvents({ ctx, repo, touch, session, refreshViews });

  const poll = setInterval(() => {
    if (Date.now() - lastActive > ACTIVE_MS) {
      return;
    }
    void repo.refreshStatus();
  }, POLL_MS);

  ctx.settings.onDidChange(() => {
    scheduleAutoFetch({ ctx, actions, session });
    void repo.refresh();
  });
  scheduleAutoFetch({ ctx, actions, session });
  void repo.refresh();

  return () => {
    clearInterval(poll);
    if (session.fetchTimer) {
      clearInterval(session.fetchTimer);
    }
    if (session.saveTimer) {
      clearTimeout(session.saveTimer);
    }
  };
}
