/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export function runActions({ ctx, api, store, t, notify, attempt, requireRepo }) {
  /* ---------------------------------------------------------------- *
   * Workflow runs
   * ---------------------------------------------------------------- */

  async function rerun(id, failedOnly) {
    if (!requireRepo()) {
      return;
    }
    const route = failedOnly ? 'rerun-failed-jobs' : 'rerun';
    const done = await attempt(() => api.post(`${store.repoPath()}/actions/runs/${id}/${route}`).then(() => true));
    if (done) {
      notify(t('run.restarted'), 'success');
    }
    await store.load('runs');
  }

  async function cancelRun(id) {
    if (!requireRepo()) {
      return;
    }
    const sure = await ctx.ui.confirm(t('run.cancelTitle'), t('run.cancelBody'), { confirmLabel: t('run.cancel'), danger: true });
    if (!sure) {
      return;
    }
    await attempt(() => api.post(`${store.repoPath()}/actions/runs/${id}/cancel`));
    await store.load('runs');
  }

  return { rerun, cancelRun };
}
