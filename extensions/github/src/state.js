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
 * What the GitHub views show: the repository of the open folder, the signed-in
 * account, and per view the list it loaded — with a filter, a loading flag and
 * the last error.
 */

const CHECK_LIMIT = 25;

/** Several check runs → one tone: failed beats running beats passed. */
export function summarizeChecks(runs) {
  if (!runs.length) {
    return null;
  }
  if (runs.some((run) => ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(run.conclusion))) {
    return 'failure';
  }
  if (runs.some((run) => run.status !== 'completed')) {
    return 'pending';
  }
  return 'success';
}

function initialState() {
  return {
    context: null,
    user: null,
    authError: null,
    pulls: { filter: 'all', items: [], checks: {}, loading: false, error: null, loaded: false },
    issues: { filter: 'all', items: [], loading: false, error: null, loaded: false },
    runs: { filter: 'branch', items: [], loading: false, error: null, loaded: false },
  };
}

function repoPathOf(state) {
  const repo = state.context?.repo;
  if (!repo) {
    return null;
  }
  return `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}

function pullFilter(state, pulls) {
  const me = state.user?.login;
  const filters = {
    all: () => pulls,
    mine: () => pulls.filter((pull) => pull.user?.login === me),
    review: () => pulls.filter((pull) => (pull.requested_reviewers ?? []).some((reviewer) => reviewer.login === me)),
  };
  return (filters[state.pulls.filter] ?? filters.all)();
}

function issueQuery(state) {
  const me = state.user?.login;
  if (state.issues.filter === 'assigned' && me) {
    return `&assignee=${encodeURIComponent(me)}`;
  }
  if (state.issues.filter === 'created' && me) {
    return `&creator=${encodeURIComponent(me)}`;
  }
  return '';
}

function runQuery(state) {
  const branch = state.context?.branch;
  if (state.runs.filter === 'branch' && branch) {
    return `&branch=${encodeURIComponent(branch)}`;
  }
  return '';
}

/** Load a list into `slot`, keeping the previous items while it loads. */
async function load({ state, emit, repoPath }, slot, fetchItems) {
  const entry = state[slot];
  if (!repoPath()) {
    entry.loaded = true;
    emit();
    return;
  }
  entry.loading = true;
  emit();
  try {
    entry.items = await fetchItems(repoPath());
    entry.error = null;
  } catch (err) {
    entry.error = err;
  } finally {
    entry.loading = false;
    entry.loaded = true;
    emit();
  }
}

async function loadChecks({ state, api, emit }, base, pulls) {
  const next = {};
  await Promise.all(
    pulls.slice(0, CHECK_LIMIT).map(async (pull) => {
      const data = await api.get(`${base}/commits/${pull.head.sha}/check-runs?per_page=100`).catch(() => null);
      next[pull.number] = summarizeChecks(data?.check_runs ?? []);
    }),
  );
  state.pulls.checks = next;
  emit();
}

/** Slot → function that (re)loads that list. */
function createLoaders(env) {
  const { state, api } = env;
  return {
    pulls: () =>
      load(env, 'pulls', async (base) => {
        const pulls = await api.get(`${base}/pulls?state=open&per_page=50&sort=updated&direction=desc`);
        void loadChecks(env, base, pulls);
        return pulls;
      }),
    issues: () =>
      load(env, 'issues', async (base) => {
        const issues = await api.get(`${base}/issues?state=open&per_page=50&sort=updated${issueQuery(state)}`);
        return issues.filter((issue) => !issue.pull_request);
      }),
    runs: () =>
      load(env, 'runs', async (base) => {
        const data = await api.get(`${base}/actions/runs?per_page=30${runQuery(state)}`);
        return data?.workflow_runs ?? [];
      }),
  };
}

export function createState(ctx, api, remote) {
  const state = initialState();
  const listeners = new Set();
  const emit = () => {
    for (const fn of listeners) {
      fn(state);
    }
  };
  const repoPath = () => repoPathOf(state);

  async function readContext() {
    state.context = await remote.detect(api.hosts().host).catch((err) => ({ reason: 'error', message: err.message }));
    state.authError = null;
    state.user = await api.user().catch((err) => {
      state.authError = err;
      return null;
    });
  }

  const loaders = createLoaders({ state, api, emit, repoPath });

  return {
    state,
    repoPath,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit,
    readContext,
    load: (slot) => loaders[slot](),
    async refreshAll() {
      await readContext();
      emit();
      await Promise.all(Object.keys(loaders).map((slot) => loaders[slot]()));
    },
    visiblePulls: () => pullFilter(state, state.pulls.items),
    setFilter(slot, value) {
      if (state[slot].filter === value) {
        return Promise.resolve();
      }
      state[slot].filter = value;
      return loaders[slot]();
    },
  };
}
