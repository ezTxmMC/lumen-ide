/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** What the workspace slice's action groups share: the store handles and the project-wide constants. */

import { EMPTY_PROJECT_CONFIG, type ProjectConfig } from '@/core/project/config';
import type { Slice, State, WorkspaceSlice } from '../../types';

/** Project kinds whose dependencies come from ~/.m2 or the Gradle cache. */
export const JVM_MANAGERS = new Set(['maven', 'gradle']);


export const emptyConfig = (): ProjectConfig => structuredClone(EMPTY_PROJECT_CONFIG);

export interface Ctx {
  get: () => State;
  set: Parameters<Slice<WorkspaceSlice>>[0];
  remember: (root: string) => Promise<void>;
  capture: () => void;
}
