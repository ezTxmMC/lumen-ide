/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The preload bridge of the security scanner (see `security.ts`). */

import { invoke } from '../ipc';
import type { ScanReport } from '../../../extension-server/src/scanner/index.js';
import type { ProjectScan } from './security';

export const securityApi = {
  /** A command line, or a program with its arguments. */
  scanCommand: (input: string | { command: string; args?: string[]; }): Promise<ScanReport> => invoke('security:scan:command', input),
  /** An extension manifest as a server delivers it — code, pages and the add-on's node graphs. */
  scanManifest: (manifest: unknown): Promise<ScanReport> => invoke('security:scan:manifest', manifest),
  /** The manifests, scripts and hooks of a project folder, minus what the user acknowledged. */
  scanProject: (root: string): Promise<ProjectScan> => invoke('security:scan:project', root),
  /** Remember findings (by fingerprint) as acknowledged for a project, so they stay quiet next time. */
  acknowledge: (root: string, fingerprints: string[]): Promise<void> => invoke('security:acknowledge', root, fingerprints),
};
