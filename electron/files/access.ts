/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { isProjectDataPath } from '../features/documents/project-data';
import { openRoots } from '../window/roots';
import { isInside } from './paths';

/**
 * Keeps IPC calls from the renderer from writing to arbitrary paths. Allowed
 * are the folder opened and paths the user picked in a file dialog
 * themselves.
 */
export const grantedPaths = new Set<string>();

export function assertWritable(target: string) {
  if (grantedPaths.has(target)) {
    return;
  }
  // Lumen's own project files (~/.lumen/projects) — opened and saved like any other file.
  if (isProjectDataPath(target)) {
    return;
  }
  // The folders of every window: each one writes only through its own tree anyway.
  for (const root of openRoots()) {
    if (isInside(root, target)) {
      return;
    }
  }
  for (const granted of grantedPaths) {
    if (isInside(granted, target)) {
      return;
    }
  }
  throw new Error('Path lies outside the workspace folder');
}
