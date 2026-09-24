/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The preload bridge of the non-text viewers (see `media.ts`). */

import { invoke } from './ipc';
import type { MediaInfo } from './media';

export const mediaApi = {
  /** Size, modification time and the first `headBytes` bytes; also lets `lumen-file://` serve the file. */
  inspect: (file: string, headBytes?: number): Promise<MediaInfo> => invoke('media:inspect', file, headBytes),
  openWithSystem: (file: string): Promise<void> => invoke('media:openWithSystem', file),
};
