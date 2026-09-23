/**
 * Architectury's own table of supported versions (from its template
 * generator): which loaders, which API major, which Java per Minecraft
 * version. Fields read it synchronously (`when`), so the last loaded table is
 * kept here — the bundled copy until the live one arrives.
 */

import { ARCHITECTURY_GAMES } from './architectury-games'
import type { ArchitecturyGame, ArchitecturyList } from './sources'

let table: ArchitecturyList = ARCHITECTURY_GAMES

export function rememberArchitecturyGames(list: ArchitecturyList) {
  if (Array.isArray(list?.versions) && list.versions.length) table = list
}

export function architecturyGame(mc: string | undefined): ArchitecturyGame | undefined {
  if (!mc) return undefined
  return table.versions.find((game) => game.version === mc)
}

/** The Maven group and Java package of the API: `me.shedaniel` for 1.16.5, `dev.architectury` after. */
export function architecturyApiGroup(game: ArchitecturyGame | undefined): { group: string; pkg: string } {
  return {
    group: game?.architectury.maven_group ?? 'dev.architectury',
    pkg: game?.architectury.package ?? 'dev.architectury',
  }
}
