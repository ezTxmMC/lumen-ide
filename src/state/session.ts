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
 * Remembering what was open: per project in its configuration (relative
 * paths), per workspace in the workspace record (absolute paths and the
 * split).
 */

import { loadProjectConfig, saveProjectConfig } from '@/core/project/config';
import type { State, Tab, WorkspaceDef } from './types';

/** Deferred writing of the open files into the project configuration. */
let openFilesTimer: ReturnType<typeof setTimeout> | null = null;

type Get = () => State;
type Set = (partial: Partial<State> | ((state: State) => Partial<State>)) => void;

/** Write the open files of the working folder (relative) into the project configuration. */
export async function rememberOpenFiles(get: Get, set: Set, root: string) {
  const s = get();
  if (!s.effects.restoreOpenFiles) {
    return;
  }
  const prefix = `${root.replace(/[\\/]$/, '')}/`;
  const relative = (ids: string[]) => ids
    .map((id) => s.tabs.find((tab) => tab.id === id))
    .filter((tab): tab is Tab => Boolean(tab?.path && !tab.virtual && !tab.preview && tab.path.startsWith(prefix)))
    .map((tab) => tab.path!.slice(prefix.length));
  const openFiles = relative(s.groups.flatMap((g) => g.tabIds)).filter((p, i, all) => all.indexOf(p) === i);
  const openGroups = s.groups.length > 1 ? s.groups.map((g) => relative(g.tabIds)) : undefined;
  const splitDirection = s.groups.length > 1 ? s.splitDirection : undefined;
  const config = s.workspace === root ? s.projectConfig : await loadProjectConfig(root);
  const same = JSON.stringify([config.openFiles ?? [], config.openGroups, config.splitDirection])
    === JSON.stringify([openFiles, openGroups, splitDirection]);
  if (same) {
    return;
  }
  const next = { ...config, openFiles, openGroups, splitDirection };
  if (s.workspace === root) {
    set({ projectConfig: next });
  }
  await saveProjectConfig(root, next).catch(() => {});
}

/** Remember the open files a moment after the last change — tabs change in bursts. */
export function scheduleOpenFilesSync(get: Get, set: Set) {
  if (openFilesTimer) {
    clearTimeout(openFilesTimer);
  }
  openFilesTimer = setTimeout(() => {
    openFilesTimer = null;
    const root = get().workspace;
    if (!root) {
      return;
    }
    void rememberOpenFiles(get, set, root);
  }, 1500);
}

/** Write the open files and the split into the current workspace. */
export function captureSession(get: Get, set: Set) {
  const s = get();
  const current = s.workspaces.find((w) => w.id === s.currentWorkspaceId);
  if (!current) {
    return;
  }
  const paths = (ids: string[]) => ids
    .map((id) => s.tabs.find((tab) => tab.id === id))
    .filter((tab): tab is Tab => Boolean(tab?.path && !tab.virtual && !tab.preview))
    .map((tab) => tab.path!);
  const session = {
    groups: s.groups.map((g) => paths(g.tabIds)),
    splitDirection: s.splitDirection,
    activeGroup: Math.max(0, s.groups.findIndex((g) => g.id === s.activeGroupId)),
  };
  set({
    workspaces: s.workspaces.map((w) => (w.id === current.id
      ? { ...w, session, folders: s.workspace ? [s.workspace, ...s.extraFolders] : w.folders, activeFolder: s.workspace ?? w.activeFolder }
      : w)),
  });
}

/** Open the files of a stored workspace session, into two groups where it was split. */
export async function restoreSession(get: Get, set: Set, session: NonNullable<WorkspaceDef['session']>, newGroupId: () => string) {
  const [first, second] = session.groups;
  for (const path of (first ?? []).slice(0, 24)) {
    await get().openFile(path).catch(() => {});
  }
  if (second?.length) {
    const extra = { id: newGroupId(), tabIds: [], activeTabId: null };
    set((st) => ({ groups: [...st.groups, extra], activeGroupId: extra.id, splitDirection: session.splitDirection }));
    for (const path of second.slice(0, 24)) {
      await get().openFile(path).catch(() => {});
    }
  }
  get().focusGroup(Math.min(session.activeGroup, get().groups.length - 1));
}
