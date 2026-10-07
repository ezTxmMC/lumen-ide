/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { LspPackage, SystemPackages } from './language';

/**
 * A program a language needs besides its server — the compiler `novusc`, say.
 * Lumen looks for `command` (its own managed folder, `candidates`, the PATH),
 * lists it as missing in the language-server panel and installs `package`
 * with the same installer language servers use. What gets installed lands on
 * the PATH of run tasks, terminals and debug launches.
 */
export interface ToolSpec {
  /** Stable id, unique among the tools (`novusc`). */
  id: string;
  label: string;
  /** The program's name — also the name of its launcher. */
  command: string;
  /** Installs the tool into Lumen's own environment; the same specification as `LspConfig.package`. */
  package?: LspPackage;
  systemPackages?: SystemPackages;
  /** Further places the program may live (absolute paths, `~`, `${home}`). */
  candidates?: string[];
  /** Arguments that make the program exit with 0 (`['--version']`) — a found program that fails this counts as broken. */
  check?: string[];
  /** Link to the documentation. */
  docs?: string;
  /** How to install the tool, in prose, where no package is given. */
  install?: string;
}
