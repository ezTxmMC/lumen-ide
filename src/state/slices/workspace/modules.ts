/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Detection of the module folders below the opened projects. */

import { registry } from '@/core/registry';
import { detectProject, type ProjectInfo } from '@/core/project/detect';

export const MAX_MODULES = 40;

/** The detection result of every module folder below the given projects, by absolute path. */
export async function detectModules(projects: ProjectInfo[], platform: string): Promise<Record<string, ProjectInfo>> {
  const flat = (modules: ProjectInfo['modules']): ProjectInfo['modules'] => modules.flatMap((module) => [module, ...flat(module.modules ?? [])]);
  const folders = projects
    .flatMap((project) => flat(project.modules).map((module) => `${project.root.replace(/[\\/]+$/, '')}/${module.path}`))
    .slice(0, MAX_MODULES);
  const found = await Promise.all(folders.map((folder) => detectProject(folder, registry.projectKinds(), platform).catch(() => null)));
  const out: Record<string, ProjectInfo> = {};
  folders.forEach((folder, index) => {
    const result = found[index];
    if (result && result.kinds.length > 0) {
      out[folder] = result;
    }
  });
  return out;
}
