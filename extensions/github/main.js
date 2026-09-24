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
 * GitHub for Lumen: pull requests, issues and workflow runs of the
 * repository in the open folder, the CI state of the current branch in the
 * status bar, and commands to open things in the browser.
 *
 * Signing in uses a personal access token kept in the system's key store, or
 * the GitHub CLI's login when `gh` is installed. Requests go straight to the
 * REST API from Lumen's main process.
 */

import { createT } from './src/i18n.js';
import { createApi } from './src/api.js';
import { createRemote } from './src/remote.js';
import { createState } from './src/state.js';
import { createActions } from './src/actions.js';
import { createPullsView } from './src/views/pulls.js';
import { createIssuesView } from './src/views/issues.js';
import { createRunsView, RUN_LOOK, runState } from './src/views/runs.js';

/** View id → the list it shows. */
const VIEW_SLOTS = { pulls: 'pulls', issues: 'issues', actions: 'runs' };
const POLL_MS = 60_000;
const BRANCH_POLL_MS = 15_000;
const ACTIVE_MS = 10 * 60_000;
const FOCUS_REFRESH_MS = 60_000;

function registerViews({ ctx, store, views, touch }) {
  for (const [id, view] of Object.entries(views)) {
    ctx.views.register(id, {
      render: () => view.render(),
      onAction: (event) => {
        touch();
        return view.onAction(event);
      },
      onShow: () => {
        touch();
        void store.load(VIEW_SLOTS[id]);
      },
    });
  }
}

/* Status bar ------------------------------------------------------------ */

async function updateCiStatus({ ctx, api, store, t }) {
  const context = store.state.context;
  const base = store.repoPath();
  if (!base || !context?.branch || !store.state.user) {
    ctx.statusBar.set('ci', null);
    return;
  }
  const data = await api.get(`${base}/actions/runs?per_page=1&branch=${encodeURIComponent(context.branch)}`).catch(() => null);
  const run = data?.workflow_runs?.[0];
  if (!run) {
    ctx.statusBar.set('ci', null);
    return;
  }
  const state = runState(run);
  const look = RUN_LOOK[state];
  ctx.statusBar.set('ci', {
    text: `${look.symbol} CI`,
    icon: 'github',
    tone: look.tone,
    tooltip: t('status.ci', { name: run.name ?? '', state: t(`run.state.${state}`), branch: context.branch }),
    command: 'github.open-actions',
    side: 'right',
    priority: 50,
  });
}

async function refreshAll(env) {
  const { store, session } = env;
  session.lastFull = Date.now();
  await store.refreshAll();
  session.lastBranch = store.state.context?.branch ?? null;
  await updateCiStatus(env);
}

/** The branch changed outside (a checkout in the terminal, the Git view): reload what depends on it. */
async function checkBranch(env) {
  const { store, session } = env;
  await store.readContext();
  const branch = store.state.context?.branch ?? null;
  if (branch === session.lastBranch) {
    return;
  }
  session.lastBranch = branch;
  store.emit();
  await Promise.all([store.load('runs'), updateCiStatus(env)]);
}

/* Commands -------------------------------------------------------------- */

function registerCommands(env) {
  const { ctx, actions, session, touch } = env;
  const commands = {
    'github.refresh': () => refreshAll(env),
    'github.open-repo': () => actions.openRepo(),
    'github.open-file': () => actions.openFile(session.activeFile),
    'github.create-pr': () => actions.createPull(),
    'github.create-issue': () => actions.createIssue(),
    'github.sign-in': () => actions.signIn(),
    'github.sign-out': () => actions.signOut(),
    'github.open-pulls': () => ctx.ui.showView('pulls'),
    'github.open-issues': () => ctx.ui.showView('issues'),
    'github.open-actions': () => ctx.ui.showView('actions'),
  };
  for (const [id, run] of Object.entries(commands)) {
    ctx.commands.register(id, () => {
      touch();
      return run();
    });
  }
}

/* Refreshing ------------------------------------------------------------ */

function registerRefreshEvents(env) {
  const { ctx, api, store, views, session, touch } = env;
  ctx.events.on('activeFile', (event) => {
    session.activeFile = event.path;
  });
  ctx.events.on('windowFocus', () => {
    touch();
    if (Date.now() - session.lastFull > FOCUS_REFRESH_MS) {
      void refreshAll(env);
      return;
    }
    void checkBranch(env);
  });
  ctx.events.on('viewVisible', (event) => {
    if (event.extensionId !== ctx.id) {
      return;
    }
    touch();
    const slot = VIEW_SLOTS[event.viewId];
    if (slot) {
      void store.load(slot);
    }
  });
  ctx.events.on('locale', () => {
    for (const id of Object.keys(views)) {
      ctx.views.refresh(id);
    }
    void updateCiStatus(env);
  });
  ctx.workspace.onDidChange(() => void refreshAll(env));
  ctx.settings.onDidChange(() => {
    api.reset();
    void refreshAll(env);
  });
}

/** Polls while someone has worked with the views recently; returns the disposer. */
function startPolling(env) {
  const { store, session } = env;
  const branchTimer = setInterval(() => {
    if (Date.now() - session.lastActive > ACTIVE_MS) {
      return;
    }
    void checkBranch(env);
  }, BRANCH_POLL_MS);
  const pollTimer = setInterval(() => {
    if (Date.now() - session.lastActive > ACTIVE_MS) {
      return;
    }
    void Promise.all([store.load('runs'), updateCiStatus(env)]);
  }, POLL_MS);
  return () => {
    clearInterval(branchTimer);
    clearInterval(pollTimer);
  };
}

export function activate(ctx) {
  const t = createT(ctx);
  const api = createApi(ctx, t);
  const remote = createRemote(ctx);
  const store = createState(ctx, api, remote);
  const actions = createActions({ ctx, api, store, t });
  const deps = { ctx, store, actions, t };
  const views = {
    pulls: createPullsView(deps),
    issues: createIssuesView(deps),
    actions: createRunsView(deps),
  };

  const session = { activeFile: null, lastActive: Date.now(), lastFull: 0, lastBranch: null };
  const touch = () => {
    session.lastActive = Date.now();
  };
  const env = { ctx, api, store, actions, views, t, session, touch };

  registerViews(env);

  store.onChange(() => {
    for (const id of Object.keys(views)) {
      ctx.views.refresh(id);
    }
  });

  registerCommands(env);
  registerRefreshEvents(env);
  const stopPolling = startPolling(env);

  void refreshAll(env);

  return stopPolling;
}
