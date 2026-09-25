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
 * Finding the projects below a folder — for importing it as a workspace.
 *
 * A folder is a project when it holds a marker file of a known project kind
 * (`build.gradle`, `package.json` …), a `project.json` or a `.git` entry. The
 * search does not go into a project it has found: its modules belong to it.
 */

import { markerMatches } from './detect';

export interface ScanEntry {
  name: string;
  isDirectory: boolean;
}

/** Folders that never hold projects of their own. */
const SKIPPED = new Set(['node_modules', 'build', 'dist', 'out', 'target', 'venv', '__pycache__']);

const MAX_DEPTH = 3;
const MAX_PROJECTS = 60;

const join = (dir: string, name: string) => `${dir.replace(/[\\/]+$/, '')}/${name}`;

/**
 * The project folders at or below `root`, root first when it is one itself.
 * `list` reads a folder; `markers` are the file names (or patterns) that make one.
 */
export async function findProjects(
  root: string,
  list: (dir: string) => Promise<ScanEntry[]>,
  markers: string[],
): Promise<string[]> {
  const found: string[] = [];
  const isProject = (entries: ScanEntry[]) => entries.some((entry) =>
    entry.name === '.git' || entry.name === 'project.json' || markers.some((marker) => markerMatches(marker, entry.name)));

  const visit = async (dir: string, depth: number) => {
    if (found.length >= MAX_PROJECTS) {
      return;
    }
    const entries = await list(dir).catch(() => [] as ScanEntry[]);
    if (isProject(entries)) {
      found.push(dir);
      // Below the chosen folder a project's own modules are not listed again.
      if (depth > 0) {
        return;
      }
    }
    if (depth >= MAX_DEPTH) {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory && !entry.name.startsWith('.') && !SKIPPED.has(entry.name)) {
        await visit(join(dir, entry.name), depth + 1);
      }
    }
  };

  await visit(root, 0);
  return found;
}
