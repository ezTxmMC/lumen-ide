/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


/** `<platform>-<arch>` as Node names them: `linux-x64`, `darwin-arm64`, `win32-x64` … */
export type PlatformKey = string;

export type LspPackage =
  | { type: 'npm'; packages: string[]; bin?: string; }
  | { type: 'pypi'; package: string; python?: string; with?: string[]; bin?: string; }
  | { type: 'go'; module: string; bin?: string; }
  | { type: 'dotnet'; package: string; bin?: string; }
  | { type: 'github'; repo: string; assets: Record<PlatformKey, string>; bin?: string; version?: string; runtime?: 'python' | 'node'; }
  | { type: 'archive'; url: string | Record<PlatformKey, string>; bin?: string; runtime?: 'python' | 'node'; executables?: string[]; };

export interface InstalledPackage {
  id: string;
  type: LspPackage['type'];
  /** The launcher names under `bin/`. */
  bins: string[];
  installedAt: string;
  version?: string;
}
