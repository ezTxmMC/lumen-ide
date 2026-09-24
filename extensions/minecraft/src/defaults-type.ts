/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The shape of the generated offline defaults (`defaults.ts`). */

import type { ServerApi } from './catalog';
import type { ForgePromotions, GameVersions, VersionEntry } from './sources';

export interface Defaults {
  games: GameVersions;
  fabricLoaders: VersionEntry[];
  /** Per Minecraft version. */
  fabricApi: Record<string, VersionEntry[]>;
  loom: VersionEntry[];
  quiltLoaders: VersionEntry[];
  quiltLoom: VersionEntry[];
  neoforge: { all: string[]; legacy: string[]; };
  moddev: VersionEntry[];
  forge: { all: string[]; promos: ForgePromotions; };
  eventbusValidator: VersionEntry[];
  rfg: VersionEntry[];
  architecturyApi: string[];
  architecturyLoom: VersionEntry[];
  architecturyLoomNoRemap: VersionEntry[];
  architecturyPlugin: VersionEntry[];
  serverApis: Record<ServerApi, string[]>;
  purpurGames: string[];
  velocity: VersionEntry[];
  bungee: VersionEntry[];
  runPaper: VersionEntry[];
  gradle: string[];
}
