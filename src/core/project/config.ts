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
 * The project configuration: custom tasks, default tasks, environment
 * variables, the preferred language server per language and the files that
 * were open. It lives in Lumen's data folder for the project
 * (`~/.lumen/projects/<name>-<hash>/project.json`), not in the project.
 */

import type { ProjectTask } from '@/core/types';
import { isProjectDataPath, projectDataFile } from './data';

export interface ProjectConfig {
  /** Display name, overriding the detected one. */
  name?: string;
  /** Custom tasks, on top of the detected ones. */
  tasks: ProjectTask[];
  /** Task ids for build, run and test (the function keys and the toolbar). */
  defaults: { build?: string; run?: string; test?: string; };
  /** Environment variables for every task and runner. */
  env: Record<string, string>;
  /** Language → label of the preferred language server. */
  lsp: Record<string, string>;
  /** Recently open files (relative), restored when the project opens. */
  openFiles?: string[];
  /** How the open files are spread across editor groups in a split view, relative. */
  openGroups?: string[][];
  /** Direction of the split. */
  splitDirection?: 'right' | 'down';
  /** The project's JDK: a path, a major version (`21`) or `distribution-major` — otherwise the default JDK applies. */
  jdk?: string;
}

export const EMPTY_PROJECT_CONFIG: ProjectConfig = {
  tasks: [],
  defaults: {},
  env: {},
  lsp: {},
};

const FILE = 'project.json';

/** The configuration file of a project root. */
export function projectConfigFile(root: string): Promise<string> {
  return projectDataFile(root, FILE);
}

/** Is this the configuration file of some project — edited in a tab, say? */
export function isProjectConfigPath(path: string): boolean {
  return isProjectDataPath(path) && /[\\/]project\.json$/.test(path);
}

export async function loadProjectConfig(root: string): Promise<ProjectConfig> {
  try {
    const raw = await window.lumen.fs.readFile(await projectConfigFile(root));
    const parsed = JSON.parse(raw) as Partial<ProjectConfig>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter(isTask) : [],
      defaults: parsed.defaults && typeof parsed.defaults === 'object' ? parsed.defaults : {},
      env: parsed.env && typeof parsed.env === 'object' ? parsed.env : {},
      lsp: parsed.lsp && typeof parsed.lsp === 'object' ? parsed.lsp : {},
      openFiles: Array.isArray(parsed.openFiles) ? parsed.openFiles.filter((f) => typeof f === 'string') : undefined,
      openGroups: Array.isArray(parsed.openGroups)
        ? parsed.openGroups.filter(Array.isArray).map((g) => g.filter((f) => typeof f === 'string'))
        : undefined,
      splitDirection: parsed.splitDirection === 'down' ? 'down' : undefined,
      jdk: typeof parsed.jdk === 'string' && parsed.jdk ? parsed.jdk : undefined,
    };
  } catch {
    return structuredClone(EMPTY_PROJECT_CONFIG);
  }
}

export async function saveProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const clean: ProjectConfig = {
    ...(config.name ? { name: config.name } : {}),
    tasks: config.tasks,
    defaults: config.defaults,
    env: config.env,
    lsp: config.lsp,
    ...(config.openFiles?.length ? { openFiles: config.openFiles } : {}),
    ...((config.openGroups?.length ?? 0) > 1 ? { openGroups: config.openGroups } : {}),
    ...(config.splitDirection === 'down' ? { splitDirection: 'down' as const } : {}),
    ...(config.jdk ? { jdk: config.jdk } : {}),
  };
  await window.lumen.fs.writeFile(await projectConfigFile(root), `${JSON.stringify(clean, null, 2)}\n`);
}

function isTask(value: unknown): value is ProjectTask {
  const t = value as ProjectTask | null;
  return Boolean(
    t && typeof t.id === 'string' && typeof t.label === 'string' &&
    typeof t.command === 'string' && Array.isArray(t.args),
  );
}
