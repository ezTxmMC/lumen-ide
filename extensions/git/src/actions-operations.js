/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { OPERATION_COMMANDS } from './actions-constants.js';

export function operationActions({ ctx, repo, t, notify, status, attempt }) {
  /* ---------------------------------------------------------------- *
   * Operations in progress
   * ---------------------------------------------------------------- */

  async function continueOperation() {
    const commands = OPERATION_COMMANDS[repo.state.operation];
    if (!commands) {
      return;
    }
    if (status().conflicts.length) {
      notify(t('operation.unresolved', { count: String(status().conflicts.length) }), 'warning');
      return;
    }
    await attempt(() => repo.run(commands.continue, { timeoutMs: 300_000 }));
  }

  async function abortOperation() {
    const commands = OPERATION_COMMANDS[repo.state.operation];
    if (!commands) {
      return;
    }
    if (
      !(await ctx.ui.confirm(t('operation.abortTitle'), t('operation.abortBody'), { confirmLabel: t('operation.abort'), danger: true }))
    ) {
      return;
    }
    await attempt(() => repo.run(commands.abort));
  }

  return { continueOperation, abortOperation };
}
