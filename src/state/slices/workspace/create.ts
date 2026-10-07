/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Creating a new project from a template and opening it. */

import { scaffoldProject } from '@/core/project/create/scaffold';
import { t, tr } from '@/i18n';
import type { WorkspaceSlice } from '../../types';
import type { Ctx } from './context';

export function createProjectAction(ctx: Ctx): Pick<WorkspaceSlice, 'createProject'> {
  const { get, set } = ctx;
  return {
    async createProject(template, parentDir, name, values, options = {}) {
      const result = await scaffoldProject(template, parentDir, name, values, options.onProgress);
      set({ newProjectOpen: false });
      const tasks = [
        ...(options.git ? [{ id: 'setup:git', label: 'git init', command: 'git', args: ['init', '-q'] }] : []),
        ...(options.setup ? result.setup : []),
      ];
      // A window of its own: that window runs the setup when the project arrives there.
      if (options.window === 'new' && get().workspace) {
        const { handOverSetup } = await import('@/core/project/create/setup-handover');
        handOverSetup(result.dir, tasks, result.open);
        await window.lumen.window.openProject(result.dir);
        get().notify(t('notify.projectCreated', { name }), 'success');
        return;
      }
      await get().setWorkspace(result.dir);
      if (result.open) {
        await get().openFile(result.open).catch(() => {});
      }
      get().showView('project');
      get().notify(result.next ? t('notify.projectCreatedNext', { next: tr(result.next) }) : t('notify.projectCreated', { name }), 'success');

      if (!tasks.length) {
        return;
      }
      const { runTasks } = await import('@/lib/project/run');
      await runTasks(tasks, result.dir, () => void get().refreshProject());
    },
  };
}
