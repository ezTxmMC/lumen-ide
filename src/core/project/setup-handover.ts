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
 * A project created for a new window: the window that created it hands the
 * setup (git init, installing dependencies) and the file to open over to the
 * window that opens it. Windows share `localStorage`, so the note is left
 * there; the new window picks it up once its workspace is that folder.
 */

import type { ProjectTask } from '@/core/types';

const KEY = 'lumen.newProject.handover';
/** A note older than this is left over from a window that never came up. */
const MAX_AGE_MS = 2 * 60 * 1000;

interface Handover {
  dir: string;
  tasks: ProjectTask[];
  open: string | null;
  at: number;
}

export function handOverSetup(dir: string, tasks: ProjectTask[], open: string | null) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ dir, tasks, open, at: Date.now() } satisfies Handover));
  } catch {
    // Storage unavailable — the new window simply opens without setup.
  }
}

/** The note for this folder, removed on reading; `null` when there is none. */
export function takeOverSetup(dir: string): Omit<Handover, 'at' | 'dir'> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const note = JSON.parse(raw) as Handover;
    if (note.dir !== dir) {
      return null;
    }
    localStorage.removeItem(KEY);
    if (Date.now() - note.at > MAX_AGE_MS) {
      return null;
    }
    return { tasks: Array.isArray(note.tasks) ? note.tasks : [], open: note.open };
  } catch {
    return null;
  }
}
