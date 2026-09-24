/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The updater's preload bridge (check, download, install). */

import { invoke, subscribe } from './ipc';
import type { UpdateState } from './updater';

export const updaterApi = {
  state: (): Promise<UpdateState> => invoke('updater:state'),
  check: (): Promise<UpdateState> => invoke('updater:check'),
  /** Runs until the download is through; progress arrives through `onState`. */
  download: (): Promise<UpdateState> => invoke('updater:download'),
  /** Quits Lumen, installs the update and starts afresh. */
  install: (): Promise<boolean> => invoke('updater:install'),
  openDownload: (): Promise<void> => invoke('updater:openDownload'),
  onState: (cb: (state: UpdateState) => void) => subscribe('updater:state', cb),
};
