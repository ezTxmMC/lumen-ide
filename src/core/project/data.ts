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
 * Where Lumen keeps its own files for a project.
 *
 * Not inside the project: the main process maps every project root to a
 * folder of its own under `~/.lumen/projects/` (moving an old `.lumen/` folder
 * over the first time), so Lumen never adds files to someone's repository.
 */

const dirs = new Map<string, Promise<string>>();

/** The data folder of a project root; asked for once per root and session. */
export function projectDataDir(root: string): Promise<string> {
  const known = dirs.get(root);
  if (known) {
    return known;
  }
  const pending = window.lumen.projectData.dir(root);
  dirs.set(root, pending);
  pending.catch(() => dirs.delete(root));
  return pending;
}

/** A file in the project's data folder (`project.json`, `breakpoints.json` …). */
export async function projectDataFile(root: string, name: string): Promise<string> {
  const dir = await projectDataDir(root);
  return `${dir.replace(/[\\/]$/, '')}/${name}`;
}

/** Does the path lie in Lumen's folder for project data? */
export function isProjectDataPath(path: string): boolean {
  return /[\\/]\.lumen[\\/]projects[\\/]/.test(path);
}
