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
 * The state of the repository in the open folder, refreshed on demand.
 *
 * Two depths: `refreshStatus` runs one `git status` (cheap, used for polling
 * and after saves); `refresh` also reads branches, tags, stashes, remotes and
 * the history. A refresh asked for while one runs is queued once, never
 * stacked.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  countConflictBlocks,
  emptyStatus,
  LOG_FORMAT,
  parseLog,
  parseRefList,
  parseRemotes,
  parseStashes,
  parseStatus,
  REF_FORMAT,
  STASH_FORMAT,
} from './parse.js';

/** Larger conflicted files are not scanned for their blocks. */
const MAX_SCAN_BYTES = 4 * 1024 * 1024;

/** Files in the git directory that mark an operation in progress. */
const OPERATIONS = [
  { marker: 'rebase-merge', kind: 'rebase' },
  { marker: 'rebase-apply', kind: 'rebase' },
  { marker: 'MERGE_HEAD', kind: 'merge' },
  { marker: 'CHERRY_PICK_HEAD', kind: 'cherryPick' },
  { marker: 'REVERT_HEAD', kind: 'revert' },
];

function createState() {
  return {
    folder: null,
    top: null,
    gitDir: null,
    isRepo: false,
    loaded: false,
    error: null,
    busy: null,
    operation: null,
    status: emptyStatus(),
    refs: { local: [], remote: [], tags: [] },
    stashes: [],
    remotes: [],
    log: [],
    logLimit: 0,
  };
}

const historyLimit = (ctx) => {
  const configured = Number(ctx.settings.get('historyLimit'));
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(configured, 2000);
  }
  return 200;
};

/** Find the repository around the open folder. */
async function locate({ ctx, git, state }) {
  const folder = ctx.workspace.root();
  state.folder = folder;
  if (!folder) {
    Object.assign(state, { isRepo: false, top: null, gitDir: null });
    return false;
  }
  const result = await git.run(['rev-parse', '--show-toplevel', '--absolute-git-dir'], { cwd: folder, allowFail: true, readOnly: true });
  if (result.code !== 0) {
    Object.assign(state, { isRepo: false, top: null, gitDir: null, status: emptyStatus() });
    return false;
  }
  const [top, gitDir] = result.stdout.trim().split('\n');
  Object.assign(state, { isRepo: true, top: top.trim(), gitDir: gitDir?.trim() ?? null });
  return true;
}

function readOperation(state) {
  if (!state.gitDir) {
    return null;
  }
  const found = OPERATIONS.find(({ marker }) => fs.existsSync(path.join(state.gitDir, marker)));
  return found?.kind ?? null;
}

/** The conflict blocks left in a file of the work tree; `null` when it cannot be read. */
function conflictBlocks(state, relative) {
  try {
    const file = path.join(state.top, relative);
    if (fs.statSync(file).size > MAX_SCAN_BYTES) {
      return null;
    }
    return countConflictBlocks(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

async function readStatus({ ctx, git, state }) {
  const args = ['status', '--porcelain=v2', '--branch', '--show-stash', '-z'];
  if (ctx.settings.get('showUntracked') === 'false') {
    args.push('--untracked-files=no');
  }
  if (ctx.settings.get('showUntracked') !== 'false') {
    args.push('--untracked-files=all');
  }
  const result = await git.run(args, { cwd: state.top, readOnly: true });
  state.status = parseStatus(result.stdout);
  for (const entry of state.status.conflicts) {
    entry.blocks = conflictBlocks(state, entry.path);
  }
  state.operation = readOperation(state);
}

async function readEverything({ ctx, git, state }) {
  state.logLimit = Math.max(state.logLimit, historyLimit(ctx));
  const [refs, stashes, remotes, log] = await Promise.all([
    git.run(['for-each-ref', '--sort=-committerdate', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes', 'refs/tags'], {
      cwd: state.top,
      readOnly: true,
    }),
    git.run(['stash', 'list', `--format=${STASH_FORMAT}`], { cwd: state.top, readOnly: true, allowFail: true }),
    git.run(['remote', '-v'], { cwd: state.top, readOnly: true, allowFail: true }),
    // A repository without commits has no history; `git log` fails there.
    git.run(['log', `--max-count=${state.logLimit}`, '--date-order', `--pretty=format:${LOG_FORMAT}`], {
      cwd: state.top,
      readOnly: true,
      allowFail: true,
    }),
  ]);
  state.refs = parseRefList(refs.stdout);
  state.stashes = parseStashes(stashes.stdout);
  state.remotes = parseRemotes(remotes.stdout);
  state.log = log.code === 0 ? parseLog(log.stdout) : [];
}

export function createRepo(ctx, git) {
  const state = createState();
  const env = { ctx, git, state };
  const listeners = new Set();
  let running = null;
  let queued = null;

  const emit = () => {
    for (const fn of listeners) {
      fn(state);
    }
  };

  async function perform(full) {
    try {
      const found = await locate(env);
      if (!found) {
        state.error = null;
        return;
      }
      const before = `${state.status.branch.head}:${state.status.branch.oid}`;
      await readStatus(env);
      const moved = before !== `${state.status.branch.head}:${state.status.branch.oid}`;
      if (full || moved || !state.loaded) {
        await readEverything(env);
      }
      state.error = null;
    } catch (err) {
      state.error = err.message;
    } finally {
      state.loaded = true;
      emit();
    }
  }

  /** Run a refresh, or queue one behind the running refresh. */
  function schedule(full) {
    if (running) {
      queued = queued === 'full' || full ? 'full' : 'status';
      return running;
    }
    running = perform(full).finally(() => {
      running = null;
      if (!queued) {
        return;
      }
      const next = queued;
      queued = null;
      void schedule(next === 'full');
    });
    return running;
  }

  /** A path relative to the repository, as git prints them, for an absolute one. */
  function relativeTo(file) {
    if (!state.top) {
      return null;
    }
    const relative = path.relative(state.top, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }
    return relative.split(path.sep).join('/');
  }

  return {
    state,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    refresh: () => schedule(true),
    refreshStatus: () => schedule(false),
    /** Run git in the repository's top level (or the open folder before there is one). */
    run: (args, options = {}) => git.run(args, { cwd: state.top ?? state.folder ?? undefined, ...options }),
    /** Show a busy note in the views while `task` runs. */
    async busy(label, task) {
      state.busy = label;
      emit();
      try {
        return await task();
      } finally {
        state.busy = null;
        emit();
      }
    },
    loadMoreHistory() {
      state.logLimit += historyLimit(ctx);
      return schedule(true);
    },
    relative: relativeTo,
    absolute: (relative) => path.join(state.top ?? '', relative),
  };
}
