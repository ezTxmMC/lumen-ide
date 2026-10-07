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
 * The opened folder, the workspace of several folders around it, and the
 * project detected in the active one — its kinds, tasks, configuration and
 * dependencies.
 */

import type { Slice, WorkspaceSlice } from '../../types';
import { captureSession, rememberOpenFiles } from '../../session';
import { emptyConfig, type Ctx } from './context';
import { folderActions, workspaceSwitchActions } from './folders';
import { workspaceListActions, workspaceFolderActions } from './lists';
import { projectActions, projectConfigActions } from './project';
import { createProjectAction } from './create';
import { dependencyActions } from './dependencies';

export const createWorkspaceSlice: Slice<WorkspaceSlice> = (set, get) => {
  const ctx: Ctx = {
    get,
    set,
    remember: (root) => rememberOpenFiles(get, set, root),
    capture: () => captureSession(get, set),
  };

  return {
    workspace: null,
    extraFolders: [],
    workspaces: [],
    currentWorkspaceId: null,
    recentProjects: [],
    localDependencies: [],
    project: null,
    extraProjects: {},
    moduleProjects: {},
    projectConfig: emptyConfig(),
    projectLoading: false,
    ...folderActions(ctx),
    ...workspaceSwitchActions(ctx),
    ...workspaceListActions(ctx),
    ...workspaceFolderActions(ctx),
    ...projectActions(ctx),
    ...projectConfigActions(ctx),
    ...createProjectAction(ctx),
    ...dependencyActions(ctx),
  };
};
