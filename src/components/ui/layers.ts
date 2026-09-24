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
 * The stacking order of everything that floats, in one place.
 *
 * Floating elements render into `document.body` (see `ContextMenu`), so these
 * values compare against each other only — not against whatever panel the
 * element was opened from.
 */
export const LAYER = {
  /** Drop zones shown while a panel is dragged. */
  dropZones: 'z-[40]',
  /** Large dialogs and their backdrop. */
  dialog: 'z-50',
  /** The click catcher behind a menu. */
  menuBackdrop: 'z-[9000]',
  /** Context menus and dropdowns — above dialogs, so a dialog can open one. */
  menu: 'z-[9001]',
} as const;
