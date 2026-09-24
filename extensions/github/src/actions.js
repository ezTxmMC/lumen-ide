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
 * What the GitHub views and commands can do: signing in, pull requests,
 * issues and workflow runs. Every write asks first; every failure becomes a
 * notice.
 */

import { accountActions } from './actions-account.js';
import { browserActions } from './actions-browser.js';
import { issueActions } from './actions-issues.js';
import { pullWriteActions } from './actions-pull-writes.js';
import { pullActions } from './actions-pulls.js';
import { runActions } from './actions-runs.js';

export function createActions({ ctx, api, store, t }) {
  const notify = (message, tone = 'info') => ctx.ui.notify(message, tone);
  const context = () => store.state.context;

  async function attempt(task) {
    try {
      return await task();
    } catch (err) {
      notify(err.message, 'error');
      return undefined;
    }
  }

  function requireRepo() {
    if (store.repoPath()) {
      return true;
    }
    notify(t('error.noRepo'), 'warning');
    return false;
  }

  const openUrl = (url) => {
    if (!url) {
      return;
    }
    void ctx.openExternal(url);
  };

  const kit = { ctx, api, store, t, notify, context, attempt, requireRepo, openUrl };

  return {
    openUrl,
    ...accountActions(kit),
    ...browserActions(kit),
    ...pullActions(kit),
    ...pullWriteActions(kit),
    ...issueActions(kit),
    ...runActions(kit),
  };
}
