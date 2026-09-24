/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The preload bridge of the closed language-server environment under ~/.lumen/lsp. */

import { invoke, subscribe } from './ipc';
import type { InstalledPackage, LspPackage } from './lsp-packages';

export const lspPackagesApi = {
  /** Installs and returns the launcher (named `command`); the output arrives through `onLog`. */
  install: (jobId: string, spec: LspPackage, command: string): Promise<string> =>
    invoke('lspPackages:install', jobId, spec, command),
  cancel: (jobId: string): Promise<boolean> => invoke('lspPackages:cancel', jobId),
  /** Removes the server that provides this launcher. */
  remove: (command: string): Promise<boolean> => invoke('lspPackages:remove', command),
  list: (): Promise<InstalledPackage[]> => invoke('lspPackages:list'),
  /** `linux-x64`, `darwin-arm64`, `win32-x64` … — the keys of `github` assets. */
  platform: (): Promise<string> => invoke('lspPackages:platform'),
  onLog: (cb: (entry: { jobId: string; text: string; }) => void) => subscribe('lspPackages:log', cb),
};
