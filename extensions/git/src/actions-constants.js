/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export const PULL_ARGS = {
  merge: ['--no-rebase'],
  rebase: ['--rebase'],
  'ff-only': ['--ff-only'],
};

/** How an operation in progress is continued and aborted. */
export const OPERATION_COMMANDS = {
  merge: { continue: ['commit', '--no-edit'], abort: ['merge', '--abort'] },
  rebase: { continue: ['rebase', '--continue'], abort: ['rebase', '--abort'] },
  cherryPick: { continue: ['cherry-pick', '--continue'], abort: ['cherry-pick', '--abort'] },
  revert: { continue: ['revert', '--continue'], abort: ['revert', '--abort'] },
};
