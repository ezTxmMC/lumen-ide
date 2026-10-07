/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Refreshing the detected project and editing its configuration. */

import { registry } from '@/core/registry';
import { lsp } from '@/core/lsp/manager';
import { detectProject, type ProjectInfo } from '@/core/project/detect';
import { loadProjectConfig, projectConfigFile, saveProjectConfig, type ProjectConfig } from '@/core/project/config';
import { t, tr } from '@/i18n';
import type { WorkspaceSlice } from '../../types';
import type { Ctx } from './context';
import { detectModules } from './modules';

export function projectActions(ctx: Ctx): Pick<WorkspaceSlice, 'refreshProject' | 'reloadProjectConfig'> {
  const { get, set } = ctx;
  return {
    async refreshProject() {
      const root = get().workspace;
      if (!root) {
        return;
      }
      set({ projectLoading: true });
      try {
        const info = await detectProject(root, registry.projectKinds(), get().platform);
        if (get().workspace !== root) {
          return;
        }
        const name = get().projectConfig.name ?? info.name;
        // The other folders of a workspace are projects as well.
        const others = get().extraFolders.filter((folder) => folder !== root);
        const found = await Promise.all(others.map((folder) => detectProject(folder, registry.projectKinds(), get().platform).catch(() => null)));
        if (get().workspace !== root) {
          return;
        }
        const extraProjects: Record<string, ProjectInfo> = {};
        others.forEach((folder, index) => {
          const other = found[index];
          if (other) {
            extraProjects[folder] = other;
          }
        });
        // Each module of those projects is looked at on its own: what it builds for decides its icon.
        const moduleProjects = await detectModules([info, ...Object.values(extraProjects)], get().platform);
        if (get().workspace !== root) {
          return;
        }
        set((s) => ({
          extraProjects,
          moduleProjects,
          project: { ...info, name },
          projectLoading: false,
          recentProjects: s.recentProjects.map((p) => {
            if (p.path !== root) {
              return p;
            }
            // Project kinds may carry their name as a translation key.
            return { ...p, name, kind: tr(info.primary?.kind.name), color: info.primary?.kind.color, icon: info.primary?.kind.icon };
          }),
        }));
        get().persist();
      } catch (err) {
        set({ projectLoading: false });
        get().notify(t('notify.projectDetectFailed', { error: (err as Error).message }), 'warning');
      }
    },

    async reloadProjectConfig() {
      const root = get().workspace;
      if (!root) {
        return;
      }
      const config = await loadProjectConfig(root);
      if (get().workspace !== root) {
        return;
      }
      lsp.setPreferred(config.lsp);
      set((s) => ({
        projectConfig: config,
        project: s.project ? { ...s.project, name: config.name || s.project.name } : null,
      }));
    },

  };
}

export function projectConfigActions(ctx: Ctx): Pick<WorkspaceSlice, 'updateProjectConfig' | 'openProjectConfig' | 'setPreferredLsp'> {
  const { get, set } = ctx;
  return {
    async updateProjectConfig(patch) {
      const root = get().workspace;
      if (!root) {
        return;
      }
      const config: ProjectConfig = { ...get().projectConfig, ...patch };
      set({ projectConfig: config });
      if (patch.lsp) {
        lsp.setPreferred(config.lsp);
      }
      if (patch.name !== undefined && get().project) {
        set((s) => ({ project: s.project ? { ...s.project, name: patch.name || s.project.name } : null }));
      }
      try {
        await saveProjectConfig(root, config);
      } catch (err) {
        get().notify(t('notify.projectConfigNotSaved', { error: (err as Error).message }), 'error');
      }
    },

    async openProjectConfig() {
      const root = get().workspace;
      if (!root) {
        return;
      }
      const file = await projectConfigFile(root);
      if (!(await window.lumen.fs.exists(file))) {
        await saveProjectConfig(root, get().projectConfig);
      }
      await get().openFile(file);
    },

    async setPreferredLsp(languageId, label) {
      const next = { ...get().projectConfig.lsp };
      delete next[languageId];
      if (label) {
        next[languageId] = label;
      }
      await get().updateProjectConfig({ lsp: next });
      get().notify(label ? t('notify.lspPreferred', { name: label }) : t('notify.lspPreferenceRemoved'), 'info');
      // The new server takes over at once — for the open files and for the project itself.
      const spec = registry.languages().find((language) => language.id === languageId);
      const s = get();
      if (spec && s.effects.lsp) {
        await lsp.applyPreference(spec, s.project?.root ?? s.workspace);
      }
    },
  };
}
