/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { type ChildProcess } from 'node:child_process';

export interface DetectedJdk {
  /** The resolved path (realpath) — it serves as the id. */
  home: string;
  version: string;
  major: number;
  implementor: string;
  implementorVersion: string;
  arch: string;
  /** Where the find came from: JAVA_HOME, PATH, /usr/lib/jvm … */
  sources: string[];
  /** Installed by Lumen (lies under ~/.lumen/jdks) — only these may be removed. */
  managed: boolean;
  /** A runtime only, without javac. */
  jreOnly: boolean;
  /** The distribution from Lumen's marker, where there is one. */
  distribution?: string;
}

export type InstallPhase = 'resolve' | 'download' | 'verify' | 'extract' | 'done' | 'error' | 'cancelled';

export interface InstallProgress {
  jobId: string;
  phase: InstallPhase;
  received: number;
  total: number;
  /** Bytes per second (smoothed). */
  speed: number;
  error?: string;
  home?: string;
  /** The checksum has been compared. */
  verified?: boolean;
}

export interface InstallRequest {
  jobId: string;
  kind: 'java';
  packageId: string;
  distribution: string;
  version: string;
}

export interface SdkEnvironment {
  platform: string;
  arch: string;
  home: string;
  /** The key of the PATH variable (often `Path` under Windows). */
  pathKey: string;
  path: string;
  delimiter: string;
  jdkRoot: string;
}

export interface Job {
  controller: AbortController;
  child: ChildProcess | null;
  cancelled: boolean;
}
