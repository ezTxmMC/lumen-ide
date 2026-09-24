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
 * Finishing a merge: the result goes into the file — through its tab when one
 * is open, so the change can be undone there — and, inside a git repository,
 * `git add` marks the conflict resolved.
 */

import { useStore } from '@/state/store';
import { t } from '@/i18n';
import type { MergeSession } from './session';

const GIT_TIMEOUT_MS = 20_000;

const dirnameOf = (file: string) => file.replace(/[\\/][^\\/]*$/, '') || file;

/** Write the result into the tab and save it. False when saving did not go through. */
async function saveThroughTab(tabId: string, result: string): Promise<boolean> {
  const store = useStore.getState();
  store.updateContent(tabId, result);
  await store.saveTab(tabId);
  const tab = useStore.getState().tabs.find((open) => open.id === tabId);
  return Boolean(tab && tab.saved === result);
}

type StageOutcome = { kind: 'staged'; } | { kind: 'noRepo'; } | { kind: 'failed'; error: string; };

/** `git add` the file, if it lies in a work tree. */
async function stage(file: string): Promise<StageOutcome> {
  const cwd = dirnameOf(file);
  const capture = window.lumen.run.capture;
  const probe = await capture('git', ['rev-parse', '--is-inside-work-tree'], cwd, undefined, GIT_TIMEOUT_MS).catch(() => null);
  if (!probe || probe.code !== 0 || probe.stdout.trim() !== 'true') {
    return { kind: 'noRepo' };
  }
  const add = await capture('git', ['add', '--', file], cwd, undefined, GIT_TIMEOUT_MS)
    .catch((err: unknown) => ({ code: -1, stdout: '', stderr: String(err), timedOut: false }));
  if (add.code === 0) {
    return { kind: 'staged' };
  }
  return { kind: 'failed', error: (add.stderr || add.stdout).trim() || `exit ${add.code}` };
}

/** Write `result` and stage it. Returns false when the file could not be written. */
export async function completeMerge(session: MergeSession, result: string): Promise<boolean> {
  const store = useStore.getState();
  const tab = store.tabs.find((open) => open.id === session.tabId)
    ?? store.tabs.find((open) => Boolean(session.path) && open.path === session.path);
  if (tab) {
    const saved = await saveThroughTab(tab.id, result);
    if (!saved) {
      return false;
    }
  }
  if (!tab && !session.path) {
    return false;
  }
  if (!tab && session.path) {
    const written = await window.lumen.fs.writeFile(session.path, result).catch(() => false);
    if (!written) {
      return false;
    }
  }

  const file = tab?.path ?? session.path;
  if (!file) {
    return true;
  }
  const outcome = await stage(file);
  if (outcome.kind === 'staged') {
    store.notify(t('merge.notify.staged', { name: session.name }), 'success');
    return true;
  }
  if (outcome.kind === 'failed') {
    store.notify(t('merge.notify.stageFailed', { name: session.name, error: outcome.error }), 'warning');
    return true;
  }
  store.notify(t('merge.notify.merged', { name: session.name }), 'success');
  return true;
}
