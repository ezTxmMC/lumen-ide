/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { splitPath } from './parse.js';

export function fileActions({ ctx, repo, t, flag, notify, status, attempt }) {
  /* ---------------------------------------------------------------- *
   * Files
   * ---------------------------------------------------------------- */

  const openFile = (file) => ctx.ui.openFile(repo.absolute(file));

  async function openDiff(file, staged) {
    const entry = [...status().untracked, ...status().conflicts].find((candidate) => candidate.path === file);
    if (entry && !staged) {
      openFile(file);
      return;
    }
    const args = staged ? ['diff', '--cached', '--', file] : ['diff', '--', file];
    const result = await repo.run(args, { readOnly: true }).catch((err) => ({ stdout: '', error: err }));
    if (result.error) {
      notify(result.error.message, 'error');
      return;
    }
    if (!result.stdout.trim()) {
      openFile(file);
      return;
    }
    const label = staged ? t('diff.staged') : t('diff.worktree');
    ctx.ui.openDocument(`${splitPath(file).name} (${label}).diff`, result.stdout, 'diff');
  }

  const stage = (files) => attempt(() => repo.run(['add', '-A', '--', ...files]), { full: false });

  function unstage(files) {
    // Before the first commit there is no HEAD to reset to.
    if (status().branch.initial) {
      return attempt(() => repo.run(['rm', '--cached', '-r', '-q', '--', ...files]), { full: false });
    }
    return attempt(() => repo.run(['restore', '--staged', '--', ...files]), { full: false });
  }

  async function confirmDiscard(count) {
    if (!flag('confirmDiscard', true)) {
      return true;
    }
    return ctx.ui.confirm(t('discard.title'), t('discard.body', { count: String(count) }), {
      confirmLabel: t('discard.confirm'),
      danger: true,
    });
  }

  async function discard(files) {
    if (!files.length || !(await confirmDiscard(files.length))) {
      return;
    }
    const untracked = new Set(status().untracked.map((entry) => entry.path));
    const tracked = files.filter((file) => !untracked.has(file));
    const loose = files.filter((file) => untracked.has(file));
    await attempt(
      async () => {
        if (tracked.length) {
          await repo.run(['restore', '--worktree', '--', ...tracked]);
        }
        if (loose.length) {
          await repo.run(['clean', '-f', '-q', '--', ...loose]);
        }
      },
      { full: false },
    );
  }

  const stageAll = () => attempt(() => repo.run(['add', '-A']), { full: false });
  const unstageAll = () => unstage(status().staged.map((entry) => entry.path));
  const discardAll = () => discard([...status().unstaged.map((entry) => entry.path), ...status().untracked.map((entry) => entry.path)]);
  /** Stage conflicted files — after asking, when markers are still in them. */
  async function markResolved(files) {
    const pending = status().conflicts.filter((entry) => files.includes(entry.path) && entry.blocks > 0);
    if (pending.length) {
      const names = pending.map((entry) => splitPath(entry.path).name).join(', ');
      const sure = await ctx.ui.confirm(t('file.stillConflictedTitle'), t('file.stillConflictedBody', { files: names }), {
        confirmLabel: t('file.markResolved'),
        danger: true,
      });
      if (!sure) {
        return undefined;
      }
    }
    return stage(files);
  }

  return { openFile, openDiff, stage, unstage, discard, stageAll, unstageAll, discardAll, markResolved };
}
