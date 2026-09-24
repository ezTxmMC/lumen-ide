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
 * Dialogs close on Escape through a capturing window listener, which runs
 * before anything inside them. A popover that wants Escape for itself (the
 * combobox list) marks itself with `data-lm-escape-owner`; dialogs ask here
 * first and leave the key alone while one is open.
 */
export function escapeOwnedByPopover(): boolean {
  return document.querySelector('[data-lm-escape-owner]') !== null;
}
