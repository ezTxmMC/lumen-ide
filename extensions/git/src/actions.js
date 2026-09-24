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
 * Everything the Git views and commands can do. Each operation asks what it
 * needs to ask, runs git, reports failures as a notice and refreshes the
 * repository afterwards.
 */

import { activeFileActions } from './actions-active-file.js';
import { branchOpActions } from './actions-branch-ops.js';
import { branchActions } from './actions-branches.js';
import { commitActions } from './actions-committing.js';
import { fileActions } from './actions-files.js';
import { historyActions } from './actions-history.js';
import { operationActions } from './actions-operations.js';
import { remoteActions } from './actions-remotes.js';
import { repoActions } from './actions-repos.js';
import { stashActions } from './actions-stashes.js';
import { tagActions } from './actions-tags.js';

export function createActions({ ctx, repo, t }) {
  const setting = (key) => ctx.settings.get(key);
  const flag = (key, fallback) => {
    const value = setting(key);
    if (value === undefined || value === '') {
      return fallback;
    }
    return value === 'true';
  };
  const notify = (message, tone = 'info') => ctx.ui.notify(message, tone);
  const status = () => repo.state.status;
  const branchName = () => status().branch.head;

  /** Run `task`, show what went wrong, refresh either way. */
  async function attempt(task, { full = true } = {}) {
    try {
      return await task();
    } catch (err) {
      notify(err.message, 'error');
      return undefined;
    } finally {
      await (full ? repo.refresh() : repo.refreshStatus());
    }
  }

  const requireRepo = () => {
    if (repo.state.isRepo) {
      return true;
    }
    notify(t('error.noRepo'), 'warning');
    return false;
  };

  const kit = { ctx, repo, t, setting, flag, notify, status, branchName, attempt, requireRepo };
  const remotes = remoteActions(kit);
  const committing = commitActions({ ...kit, push: remotes.push });
  const files = fileActions(kit);
  const branches = branchActions(kit);
  const remoteApi = { ...remotes };
  delete remoteApi.pickRemote;
  const branchApi = { ...branches };
  delete branchApi.validBranchName;

  return {
    ...files,
    ...committing,
    ...remoteApi,
    ...branchApi,
    ...branchOpActions({ ...kit, validBranchName: branches.validBranchName }),
    ...tagActions({ ...kit, pickRemote: remotes.pickRemote }),
    ...stashActions(kit),
    ...historyActions(kit),
    ...operationActions(kit),
    ...repoActions(kit),
    ...activeFileActions(kit),
  };
}
