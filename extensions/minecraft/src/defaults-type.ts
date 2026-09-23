/** The shape of the generated offline defaults (`defaults.ts`). */

import type { ServerApi } from './catalog'
import type { ForgePromotions, GameVersions, VersionEntry } from './sources'

export interface Defaults {
  games: GameVersions
  fabricLoaders: VersionEntry[]
  /** Per Minecraft version. */
  fabricApi: Record<string, VersionEntry[]>
  loom: VersionEntry[]
  quiltLoaders: VersionEntry[]
  quiltLoom: VersionEntry[]
  neoforge: { all: string[]; legacy: string[] }
  moddev: VersionEntry[]
  forge: { all: string[]; promos: ForgePromotions }
  eventbusValidator: VersionEntry[]
  rfg: VersionEntry[]
  architecturyApi: string[]
  architecturyLoom: VersionEntry[]
  architecturyLoomNoRemap: VersionEntry[]
  architecturyPlugin: VersionEntry[]
  serverApis: Record<ServerApi, string[]>
  purpurGames: string[]
  velocity: VersionEntry[]
  bungee: VersionEntry[]
  runPaper: VersionEntry[]
  gradle: string[]
}
