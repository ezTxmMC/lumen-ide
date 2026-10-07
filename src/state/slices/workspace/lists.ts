/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The saved workspace list, its import and export, and the folders of one workspace. */

import { registry } from '@/core/registry';
import { findProjects } from '@/core/project/scan';
import { t } from '@/i18n';
import { baseName, isWorkspaceDef, WORKSPACE_COLORS } from '../../helpers';
import type { WorkspaceDef, WorkspaceSlice } from '../../types';
import type { Ctx } from './context';

export function workspaceListActions(ctx: Ctx): Pick<WorkspaceSlice, 'saveWorkspace' | 'updateWorkspace' | 'deleteWorkspace' | 'exportWorkspace' | 'importWorkspace' | 'importWorkspaceFolder' | 'removeRecent' | 'loadLocalDependencies'> {
  const { get, set, capture } = ctx;
  return {
    saveWorkspace(name) {
      const s = get();
      if (!s.workspace) {
        return null;
      }
      const folders = [s.workspace, ...s.extraFolders];
      const current = s.workspaces.find((w) => w.id === s.currentWorkspaceId);
      if (current && !name) {
        const updated = { ...current, folders, activeFolder: s.workspace };
        set({ workspaces: s.workspaces.map((w) => (w.id === current.id ? updated : w)) });
        capture();
        get().persist();
        return updated;
      }
      const def: WorkspaceDef = {
        id: `ws-${Date.now().toString(36)}`,
        name: name || baseName(s.workspace),
        color: WORKSPACE_COLORS[s.workspaces.length % WORKSPACE_COLORS.length],
        folders,
        activeFolder: s.workspace,
        openedAt: Date.now(),
      };
      set({ workspaces: [...s.workspaces, def], currentWorkspaceId: def.id });
      capture();
      get().persist();
      return def;
    },

    updateWorkspace(id, patch) {
      set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
      get().persist();
    },

    deleteWorkspace(id) {
      set((s) => ({
        workspaces: s.workspaces.filter((w) => w.id !== id),
        currentWorkspaceId: s.currentWorkspaceId === id ? null : s.currentWorkspaceId,
      }));
      get().persist();
    },

    async exportWorkspace(id) {
      const def = get().workspaces.find((w) => w.id === id);
      if (!def) {
        return;
      }
      const target = await window.lumen.dialog.saveFile(`${def.name.replace(/[^\w.-]+/g, '-')}.lumen-workspace.json`);
      if (!target) {
        return;
      }
      const { session: _session, ...portable } = def;
      void _session;
      await window.lumen.fs.writeFile(target, `${JSON.stringify({ schema: 1, ...portable }, null, 2)}\n`);
      get().notify(t('workspaces.exported', { name: def.name }), 'success');
    },

    async importWorkspace() {
      const picked = await window.lumen.dialog.openFile();
      if (!picked) {
        return;
      }
      try {
        const parsed = JSON.parse(picked.content) as Partial<WorkspaceDef>;
        const candidate = { ...parsed, id: `ws-${Date.now().toString(36)}`, openedAt: Date.now(), color: parsed.color ?? WORKSPACE_COLORS[0] };
        if (!isWorkspaceDef(candidate)) {
          throw new Error('invalid');
        }
        set((s) => ({ workspaces: [...s.workspaces, candidate] }));
        get().persist();
        get().notify(t('workspaces.imported', { name: candidate.name }), 'success');
      } catch {
        get().notify(t('workspaces.invalidFile'), 'error');
      }
    },

    async importWorkspaceFolder() {
      const dir = await window.lumen.dialog.chooseFolder(t('workspaces.importDirChoose'));
      if (!dir) {
        return;
      }
      const markers = registry.projectKinds().flatMap((kind) => kind.markers);
      const projects = await findProjects(dir, (path) => window.lumen.fs.list(path), markers);
      if (!projects.length) {
        get().notify(t('workspaces.noProjects', { path: dir }), 'warning');
        return;
      }
      // The folder the workspace is made from is a project of it too, even without a marker of its own.
      const folders = projects.includes(dir) ? projects : [dir, ...projects];
      const def: WorkspaceDef = {
        id: `ws-${Date.now().toString(36)}`,
        name: baseName(dir),
        color: WORKSPACE_COLORS[get().workspaces.length % WORKSPACE_COLORS.length],
        folders,
        activeFolder: folders[0],
        openedAt: Date.now(),
      };
      set((s) => ({ workspaces: [...s.workspaces, def] }));
      await get().persist();
      get().notify(t('workspaces.importedDir', { name: def.name, count: folders.length }), 'success');
      await get().openWorkspace(def.id);
    },

    removeRecent(path) {
      set((s) => ({ recentProjects: s.recentProjects.filter((p) => p.path !== path) }));
      get().persist();
    },

    async loadLocalDependencies() {
      if (get().localDependencies.length) {
        return;
      }
      const list = await window.lumen.deps.local().catch(() => []);
      set({ localDependencies: list });
    },
  };
}

export function workspaceFolderActions(ctx: Ctx): Pick<WorkspaceSlice, 'addFolderToWorkspace' | 'removeFolderFromWorkspace' | 'setActiveFolder'> {
  const { get, set } = ctx;
  return {
    async addFolderToWorkspace(path) {
      const folder = path ?? await window.lumen.dialog.chooseFolder(t('workspaces.chooseFolder'));
      if (!folder) {
        return;
      }
      const s = get();
      if (!s.workspace) {
        await get().setWorkspace(folder);
        return;
      }
      if (folder === s.workspace || s.extraFolders.includes(folder)) {
        return;
      }
      const extraFolders = [...s.extraFolders, folder];
      set({ extraFolders });
      await window.lumen.workspace.set(s.workspace, extraFolders);
      void get().refreshProject();
      if (!get().currentWorkspaceId) {
        get().saveWorkspace(baseName(s.workspace));
      }
      const current = get().workspaces.find((w) => w.id === get().currentWorkspaceId);
      if (current) {
        set((st) => ({
          workspaces: st.workspaces.map((w) => (w.id === current.id ? { ...w, folders: [st.workspace!, ...extraFolders] } : w)),
        }));
      }
      get().persist();
      get().notify(t('workspaces.folderAdded', { name: baseName(folder) }), 'success');
    },

    async removeFolderFromWorkspace(path) {
      const s = get();
      if (path === s.workspace) {
        const next = s.extraFolders[0];
        if (!next) {
          return;
        }
        await get().setActiveFolder(next);
      }
      const extraFolders = get().extraFolders.filter((f) => f !== path);
      set({ extraFolders });
      if (get().workspace) {
        await window.lumen.workspace.set(get().workspace!, extraFolders);
        void get().refreshProject();
      }
      const prefix = `${path}/`;
      for (const tab of get().tabs.filter((tb) => tb.path && !tb.virtual && tb.path.startsWith(prefix) && tb.content === tb.saved)) {
        get().closeTabEverywhere(tab.id);
      }
      set((st) => ({
        workspaces: st.workspaces.map((w) => (w.id === st.currentWorkspaceId
          ? { ...w, folders: w.folders.filter((f) => f !== path), activeFolder: st.workspace ?? w.activeFolder }
          : w)),
      }));
      get().persist();
    },

    async setActiveFolder(path) {
      const s = get();
      if (path === s.workspace) {
        return;
      }
      const folders = [s.workspace, ...s.extraFolders].filter((f): f is string => Boolean(f));
      if (!folders.includes(path)) {
        return;
      }
      set({ extraFolders: folders.filter((f) => f !== path) });
      await get().setWorkspace(path, { keepTabs: true, restoreFiles: false });
      set((st) => ({
        workspaces: st.workspaces.map((w) => (w.id === st.currentWorkspaceId ? { ...w, activeFolder: path } : w)),
      }));
      get().persist();
    },
  };
}
