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
 * The nearest folder from the file's own one upwards, up to the workspace
 * root, that holds one of the marker files — where a program of a sub-project
 * runs (`project.nv` for Novus). `null` when no folder has one.
 */

const parentOf = (path: string) => path.replace(/[\\/][^\\/]*$/, '');

export async function markerDir(
  file: string, markers: string[], workspace: string, exists: (path: string) => Promise<boolean>,
): Promise<string | null> {
  const root = workspace.replace(/[\\/]+$/, '');
  let dir = parentOf(file);
  while (dir.length >= root.length && dir.startsWith(root)) {
    for (const marker of markers) {
      if (await exists(`${dir}/${marker}`)) {
        return dir;
      }
    }
    const parent = parentOf(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
  return null;
}
