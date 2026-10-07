/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The preload bridge for files on the clipboard and files dropped from the OS (see `file-clipboard.ts`). */

import { webUtils } from 'electron';
import { invoke } from '../ipc';

export const fileClipboardApi = {
  /** Put these paths on the system clipboard as files (a file manager can paste them). */
  write: (paths: string[], mode: 'copy' | 'cut'): Promise<boolean> => invoke('clipboardFiles:write', paths, mode),
  /** The files on the system clipboard, if any. */
  read: (): Promise<string[]> => invoke('clipboardFiles:read'),
  /** The disk paths of files dropped into the window from the OS. */
  pathsOf: (files: File[]): string[] => files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
};
