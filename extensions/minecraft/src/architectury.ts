/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * Architectury's own table of supported versions (from its template
 * generator): which loaders, which API major, which Java per Minecraft
 * version. Fields read it synchronously (`when`), so the last loaded table is
 * kept here — the bundled copy until the live one arrives.
 */

import { ARCHITECTURY_GAMES } from './architectury-games';
import type { ArchitecturyGame, ArchitecturyList } from './sources';

let table: ArchitecturyList = ARCHITECTURY_GAMES;

export function rememberArchitecturyGames(list: ArchitecturyList) {
  if (Array.isArray(list?.versions) && list.versions.length) { table = list; }
}

export function architecturyGame(mc: string | undefined): ArchitecturyGame | undefined {
  if (!mc) { return undefined; }
  return table.versions.find((game) => game.version === mc);
}

/** The Maven group and Java package of the API: `me.shedaniel` for 1.16.5, `dev.architectury` after. */
export function architecturyApiGroup(game: ArchitecturyGame | undefined): { group: string; pkg: string; } {
  return {
    group: game?.architectury.maven_group ?? 'dev.architectury',
    pkg: game?.architectury.package ?? 'dev.architectury',
  };
}
