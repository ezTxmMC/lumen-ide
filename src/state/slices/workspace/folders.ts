/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Opening a folder and switching between workspaces. */

import { isProjectsWindow } from '@/lib/window-mode';
import { terminals } from '@/lib/project/terminals';
import { lsp } from '@/core/lsp/manager';
import { loadProjectConfig } from '@/core/project/config';
import { t } from '@/i18n';
import { baseName } from '../../helpers';
import { nextGroupId } from '../../editor-groups';
import { restoreSession } from '../../session';
import type { RecentProject, WorkspaceSlice } from '../../types';
import { emptyConfig, type Ctx } from './context';
import { startProjectServers, restoreOpenFiles } from './startup';

export function folderActions(ctx: Ctx): Pick<WorkspaceSlice, 'openFolder' | 'setWorkspace'> {
  const { get, set, remember } = ctx;
  return {
    async openFolder() {
      const root = await window.lumen.dialog.openFolder();
      if (!root) {
        return;
      }
      await get().setWorkspace(root);
    },

    async setWorkspace(root, options = {}) {
      // The project screen's own window opens nothing itself: the main window takes the project.
      if (isProjectsWindow) {
        await window.lumen.window.openProject(root);
        return;
      }
      const previous = get().workspace;
      if (previous && previous !== root && !options.keepTabs) {
        await remember(previous);
        get().closeAll();
        terminals.closeAll();
      }
      // A single folder outside the workspace leaves it.
      const ws = get().workspaces.find((w) => w.id === get().currentWorkspaceId);
      if (ws && !ws.folders.includes(root)) {
        set({ currentWorkspaceId: null, extraFolders: [] });
      }

      await window.lumen.workspace.set(root, get().extraFolders.filter((f) => f !== root));
      lsp.setWorkspace(root);

      // A folder opened as part of a workspace is not a recent project — the workspace is what is recent.
      const inWorkspace = Boolean(get().currentWorkspaceId);
      const recent: RecentProject[] = inWorkspace ? get().recentProjects : [
        { ...(get().recentProjects.find((p) => p.path === root) ?? { name: baseName(root) }), path: root, openedAt: Date.now() },
        ...get().recentProjects.filter((p) => p.path !== root),
      ].slice(0, 12);

      set({ workspace: root, recentProjects: recent, project: null, extraProjects: {}, moduleProjects: {}, projectConfig: emptyConfig(), references: null });
      get().persist();

      const config = await loadProjectConfig(root);
      if (get().workspace !== root) {
        return;
      }
      lsp.setPreferred(config.lsp);
      set({ projectConfig: config });

      await get().refreshProject();
      void startProjectServers(ctx, root);

      if (options.restoreFiles === false || !get().effects.restoreOpenFiles || get().tabs.length > 0) {
        return;
      }
      await restoreOpenFiles(ctx, root, config);
    },
  };
}

export function workspaceSwitchActions(ctx: Ctx): Pick<WorkspaceSlice, 'closeWorkspace' | 'openWorkspace'> {
  const { get, set, remember, capture } = ctx;
  return {
    async closeWorkspace() {
      const previous = get().workspace;
      const dirty = get().tabs.filter((tab) => tab.content !== tab.saved && !tab.readonly);
      if (dirty.length > 0 && !confirm(t('notify.closeUnsaved', { count: dirty.length, names: dirty.map((tab) => `• ${tab.name}`).join('\n') }))) {
        return;
      }
      if (previous) {
        await remember(previous);
      }
      capture();
      get().closeAll();
      terminals.closeAll();
      lsp.setWorkspace(null);
      set({
        workspace: null, extraFolders: [], currentWorkspaceId: null, project: null, extraProjects: {}, moduleProjects: {},
        projectConfig: emptyConfig(), references: null,
      });
      get().persist();
      // The window goes with the project; the project screen's window takes over.
      if (!isProjectsWindow) {
        await window.lumen.window.closeToProjects();
      }
    },

    async openWorkspace(id) {
      const target = get().workspaces.find((w) => w.id === id);
      if (!target) {
        return;
      }
      if (isProjectsWindow) {
        // The new window reads the workspace from the saved settings — a workspace made a moment ago must be there.
        await get().persist();
        await window.lumen.window.handOver({ workspace: id });
        return;
      }
      const previous = get().workspace;
      if (previous) {
        await remember(previous);
      }
      capture();
      get().closeAll();
      terminals.closeAll();

      const existing: string[] = [];
      for (const folder of target.folders) {
        if (await window.lumen.fs.exists(folder)) {
          existing.push(folder);
        }
      }
      if (!existing.length) {
        get().notify(t('workspaces.missingFolders', { name: target.name }), 'error');
        return;
      }
      const active = existing.includes(target.activeFolder) ? target.activeFolder : existing[0];
      set((s) => ({
        currentWorkspaceId: target.id,
        extraFolders: existing.filter((f) => f !== active),
        workspaces: s.workspaces.map((w) => (w.id === target.id ? { ...w, openedAt: Date.now(), activeFolder: active } : w)),
        // A folder change without closing: reset `workspace` so that setWorkspace reloads cleanly.
        workspace: null,
      }));
      await get().setWorkspace(active, { keepTabs: true, restoreFiles: !target.session });
      if (target.session) {
        await restoreSession(get, set, target.session, nextGroupId);
      }
      get().persist();
    },
  };
}
