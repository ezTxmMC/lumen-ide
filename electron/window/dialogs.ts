/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions, type WebContents } from 'electron';

/** Dialogs sit on the window that asked for them. */
export function showOpen(contents: WebContents, options: OpenDialogOptions) {
  const parent = BrowserWindow.fromWebContents(contents);
  if (parent) {
    return dialog.showOpenDialog(parent, options);
  }
  return dialog.showOpenDialog(options);
}

export function showSave(contents: WebContents, options: SaveDialogOptions) {
  const parent = BrowserWindow.fromWebContents(contents);
  if (parent) {
    return dialog.showSaveDialog(parent, options);
  }
  return dialog.showSaveDialog(options);
}
