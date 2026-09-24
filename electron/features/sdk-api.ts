/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The preload bridge of the SDK management (detecting, installing and removing JDKs). */

import { invoke, subscribe } from './ipc';
import type { DetectedJdk, InstallProgress, InstallRequest, SdkEnvironment } from './sdk';

export const sdkApi = {
  /** PATH, platform and where things are stored — for the environment of tasks and terminals. */
  environment: (): Promise<SdkEnvironment> => invoke('sdk:environment'),
  loadSettings: (): Promise<Record<string, unknown>> => invoke('sdk:settings:load'),
  saveSettings: (data: Record<string, unknown>): Promise<void> => invoke('sdk:settings:save', data),
  detect: (kind: 'java'): Promise<DetectedJdk[]> => invoke('sdk:detect', kind),
  /** Runs until the installation is through; progress arrives through `onProgress`. */
  install: (request: InstallRequest): Promise<string> => invoke('sdk:install', request),
  cancel: (jobId: string): Promise<boolean> => invoke('sdk:cancel', jobId),
  /** Only installations under ~/.lumen/jdks. */
  remove: (home: string): Promise<boolean> => invoke('sdk:remove', home),
  onProgress: (cb: (progress: InstallProgress) => void) => subscribe('sdk:progress', cb),
};
