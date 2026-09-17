/**
 * The versions for the Minecraft templates: defaults that have been checked
 * (as of 15.09.2026) and a changeable catalogue that “Minecraft: update the
 * versions” replaces at runtime.
 *
 * Where the defaults come from:
 *  - Fabric: meta.fabricmc.net/v2, maven.fabricmc.net (Loom, Fabric API), fabric-example-mod
 *  - NeoForge: maven.neoforged.net/api/maven, NeoForgeMDKs (ModDevGradle)
 *  - Forge: files.minecraftforge.net/…/promotions_slim.json, the MDK zips
 *  - Paper/Velocity: fill.papermc.io/v3, repo.papermc.io (paper-api, velocity-api)
 *  - Spigot: hub.spigotmc.org/nexus (spigot-api), BungeeCord: Maven Central / the Sonatype snapshots
 *  - Leaf: github.com/Winds-Studio/Leaf (the README), maven.leafmc.one
 *  - Quilt: meta.quiltmc.org/v3, maven.quiltmc.org
 *  - Architectury: maven.architectury.dev, architectury/template-generator
 *  - run-paper/run-velocity: plugins.gradle.org
 */

export interface McCatalog {
  /** When it was last fetched (ms); absent for the values stored here. */
  fetchedAt?: number
  gradle: { fabric: string; quilt: string; neoforge: string; forge: string; plugin: string; architectury: string }
  fabric: { loom: string; loader: string; api: Record<string, string> }
  quilt: { loom: string; loader: string; minecraft: string[] }
  neoforge: { moddev: string; versions: Record<string, string> }
  forge: { gradle: string; eventbusValidator: string; versions: Record<string, string> }
  paper: Record<string, string>
  spigot: Record<string, string>
  leaf: Record<string, string>
  velocity: string[]
  bungee: string[]
  architectury: { plugin: string; loom: string; shadow: string; api: Record<string, string>; forge: Record<string, string> }
  runTask: string
}

export const DEFAULT_CATALOG: McCatalog = {
  gradle: {
    fabric: '9.5.1',
    quilt: '9.2.1',
    neoforge: '9.2.1',
    forge: '9.5.0',
    plugin: '9.5.1',
    architectury: '9.5.1',
  },
  fabric: {
    loom: '1.17.21',
    loader: '0.19.5',
    api: {
      '26.2': '0.160.0+26.2',
      '26.1.2': '0.155.3+26.1.2',
      '1.21.11': '0.141.6+1.21.11',
      '1.21.1': '0.116.17+1.21.1',
      '1.20.1': '0.92.12+1.20.1',
    },
  },
  quilt: { loom: '1.15.1', loader: '0.30.1', minecraft: ['1.21.11', '1.21.1'] },
  neoforge: {
    moddev: '2.0.147',
    versions: {
      '26.2': '26.2.0.88',
      '26.1.2': '26.1.2.109',
      '1.21.11': '21.11.45',
      '1.21.1': '21.1.250',
    },
  },
  forge: {
    gradle: '7.0.40',
    eventbusValidator: '7.0.5',
    versions: {
      '26.2': '65.1.3',
      '26.1.2': '64.1.3',
      '1.21.11': '61.2.1',
    },
  },
  paper: {
    '26.2': '26.2.build.123-stable',
    '26.1.2': '26.1.2.build.74-stable',
    '1.21.11': '1.21.11-R0.1-SNAPSHOT',
  },
  spigot: {
    '26.2': '26.2-R0.1-SNAPSHOT',
    '26.1.2': '26.1.2-R0.1-SNAPSHOT',
    '1.21.11': '1.21.11-R0.1-SNAPSHOT',
  },
  leaf: {
    '26.2': '26.2.local-SNAPSHOT',
    '26.1.2': '26.1.2.build.660-alpha',
    '1.21.11': '1.21.11-R0.1-SNAPSHOT',
  },
  velocity: ['4.2.0', '3.5.1'],
  bungee: ['1.21-R0.4', '26.1-R0.1-SNAPSHOT'],
  architectury: {
    plugin: '3.5.170',
    loom: '1.17.493',
    shadow: '9.4.3',
    api: {
      '26.2': '21.1.9',
      '26.1.2': '20.1.14',
      '1.21.11': '19.0.1',
      '1.21.1': '13.0.11',
      '1.20.1': '9.2.14',
    },
    forge: { '1.20.1': '47.4.23' },
  },
  runTask: '3.1.0',
}

/** The Forge pack formats of the resources (pack.mcmeta) per Minecraft version. */
export const FORGE_PACK_FORMAT: Record<string, number> = {
  '26.2': 107,
  '26.1.2': 101,
  '1.21.11': 94,
  '1.20.1': 15,
}

let catalog: McCatalog = DEFAULT_CATALOG
let revision = 0

export function currentCatalog(): McCatalog {
  return catalog
}

/** A counter that rises with every change of catalogue (the cache key of the fields). */
export function catalogRevision(): number {
  return revision
}

export function setCatalog(next: McCatalog) {
  catalog = next
  revision++
}

/* ------------------------------------------------------------------ *
 * The version logic
 * ------------------------------------------------------------------ */

/** `1.21.11` → [1, 21, 11]; pre- and in-between versions are zeros. */
function parts(version: string): number[] {
  return version.split(/[.+-]/).map((p) => Number.parseInt(p, 10)).map((n) => (Number.isNaN(n) ? 0 : n))
}

export function compareVersions(a: string, b: string): number {
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Newest first. */
export function sortVersions(versions: string[]): string[] {
  return [...new Set(versions)].sort((a, b) => compareVersions(b, a))
}

/** From 26.1 Mojang ships Minecraft without obfuscation. */
export function isUnobfuscated(mc: string): boolean {
  return parts(mc)[0] >= 26
}

/** The Java version Mojang ships for this Minecraft version. */
export function javaFor(mc: string): string {
  const [major, minor, patch] = parts(mc)
  if (major >= 26) return '25'
  if (minor > 20 || (minor === 20 && patch >= 5)) return '21'
  return '17'
}

/** The mixin compatibility level matching the Java version. */
export function mixinLevel(mc: string): string {
  return `JAVA_${javaFor(mc)}`
}

/** `26.2` → `[26.2,26.3)`, `1.21.11` → `[1.21.11,1.21.12)` */
export function mcRange(mc: string): string {
  const p = parts(mc)
  const last = p.length - 1
  const next = [...p.slice(0, last), p[last] + 1].join('.')
  return `[${mc},${next})`
}

/* ------------------------------------------------------------------ *
 * Fetching at runtime
 * ------------------------------------------------------------------ */

interface FabricGame { version: string; stable: boolean }
interface FabricLoader { version: string; stable: boolean }
interface QuiltLoader { version: string }

const fetchJson = <T>(url: string) => window.lumen.net.fetchJson<T>(url)
const fetchText = (url: string) => window.lumen.net.fetchText(url)

/** Every `<version>` entry of a maven-metadata.xml. */
function mavenVersions(xml: string): string[] {
  return Array.from(xml.matchAll(/<version>([^<]+)<\/version>/g)).map((m) => m[1].trim())
}

const stableRelease = (v: string) => !/alpha|beta|snapshot|rc|pre/i.test(v)

/** The newest version from a list, filtered where asked. */
function newest(versions: string[], filter: (v: string) => boolean = stableRelease): string | undefined {
  return sortVersions(versions.filter(filter))[0]
}

/** The result of one partial fetch: on an error the old value stays. */
async function attempt<T>(label: string, errors: string[], run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run()
  } catch (err) {
    errors.push(`${label}: ${(err as Error).message}`)
    return undefined
  }
}

/** Take on only the values actually found. */
function mergeRecord(base: Record<string, string>, found: Record<string, string | undefined>): Record<string, string> {
  const out = { ...base }
  for (const [key, value] of Object.entries(found)) {
    if (value) out[key] = value
  }
  return out
}

/**
 * Loads the newest versions from the official sources. Partial failures are
 * gathered; what is missing stays as it was.
 */
export async function fetchCatalog(base: McCatalog): Promise<{ catalog: McCatalog; errors: string[] }> {
  const errors: string[] = []
  const next: McCatalog = structuredClone(base)

  const games = await attempt('Fabric Meta', errors, () => fetchJson<FabricGame[]>('https://meta.fabricmc.net/v2/versions/game'))
  const stableGames = (games ?? []).filter((g) => g.stable).map((g) => g.version)
  // The versions known, plus the two newest stable releases.
  const wanted = (known: Record<string, string>) => sortVersions([...Object.keys(known), ...stableGames.slice(0, 2)])

  await Promise.all([
    attempt('Fabric Loader', errors, async () => {
      const loaders = await fetchJson<FabricLoader[]>('https://meta.fabricmc.net/v2/versions/loader')
      const stable = loaders.find((l) => l.stable)
      if (stable) next.fabric.loader = stable.version
    }),
    attempt('Fabric Loom', errors, async () => {
      const xml = await fetchText('https://maven.fabricmc.net/net/fabricmc/fabric-loom/net.fabricmc.fabric-loom.gradle.plugin/maven-metadata.xml')
      const loom = newest(mavenVersions(xml))
      if (loom) next.fabric.loom = loom
    }),
    attempt('Fabric API', errors, async () => {
      const all = mavenVersions(await fetchText('https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml'))
      const found: Record<string, string | undefined> = {}
      for (const mc of wanted(base.fabric.api)) found[mc] = newest(all, (v) => v.endsWith(`+${mc}`))
      next.fabric.api = mergeRecord(base.fabric.api, found)
    }),
    attempt('NeoForge', errors, async () => {
      const data = await fetchJson<{ versions: string[] }>('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge')
      const releases = data.versions.filter(stableRelease)
      const found: Record<string, string | undefined> = {}
      for (const mc of wanted(base.neoforge.versions)) {
        const prefix = neoforgePrefix(mc)
        found[mc] = newest(releases, (v) => v.startsWith(prefix) && v.split('.').length === prefix.split('.').length)
      }
      next.neoforge.versions = mergeRecord(base.neoforge.versions, found)
    }),
    attempt('ModDevGradle', errors, async () => {
      const data = await fetchJson<{ version: string }>('https://maven.neoforged.net/api/maven/latest/version/releases/net/neoforged/moddev/net.neoforged.moddev.gradle.plugin')
      if (data.version) next.neoforge.moddev = data.version
    }),
    attempt('Forge', errors, async () => {
      const data = await fetchJson<{ promos: Record<string, string> }>('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')
      const found: Record<string, string | undefined> = {}
      for (const mc of Object.keys(base.forge.versions)) found[mc] = data.promos[`${mc}-latest`]
      next.forge.versions = mergeRecord(base.forge.versions, found)
      const legacy: Record<string, string | undefined> = {}
      for (const mc of Object.keys(base.architectury.forge)) legacy[mc] = data.promos[`${mc}-latest`]
      next.architectury.forge = mergeRecord(base.architectury.forge, legacy)
    }),
    attempt('Paper', errors, async () => {
      const all = mavenVersions(await fetchText('https://repo.papermc.io/repository/maven-public/io/papermc/paper/paper-api/maven-metadata.xml'))
      const found: Record<string, string | undefined> = {}
      for (const mc of wanted(base.paper)) {
        found[mc] = newest(all, (v) => v.startsWith(`${mc}.build.`) && v.endsWith('-stable'))
          ?? all.find((v) => v === `${mc}-R0.1-SNAPSHOT`)
      }
      next.paper = mergeRecord(base.paper, found)
    }),
    attempt('Spigot', errors, async () => {
      const all = mavenVersions(await fetchText('https://hub.spigotmc.org/nexus/content/repositories/snapshots/org/spigotmc/spigot-api/maven-metadata.xml'))
      const found: Record<string, string | undefined> = {}
      for (const mc of wanted(base.spigot)) found[mc] = all.find((v) => v === `${mc}-R0.1-SNAPSHOT`)
      next.spigot = mergeRecord(base.spigot, found)
    }),
    attempt('Leaf', errors, async () => {
      const all = mavenVersions(await fetchText('https://maven.leafmc.one/snapshots/cn/dreeam/leaf/leaf-api/maven-metadata.xml'))
      const found: Record<string, string | undefined> = {}
      for (const mc of wanted(base.leaf)) {
        found[mc] = all.find((v) => v === `${mc}.local-SNAPSHOT`)
          ?? newest(all, (v) => v.startsWith(`${mc}.build.`))
          ?? all.find((v) => v === `${mc}-R0.1-SNAPSHOT`)
      }
      next.leaf = mergeRecord(base.leaf, found)
    }),
    attempt('Velocity', errors, async () => {
      const all = mavenVersions(await fetchText('https://repo.papermc.io/repository/maven-public/com/velocitypowered/velocity-api/maven-metadata.xml'))
      const releases = sortVersions(all.filter(stableRelease))
      const latest3 = releases.find((v) => v.startsWith('3.'))
      next.velocity = sortVersions([releases[0], latest3].filter((v): v is string => Boolean(v)))
    }),
    attempt('Quilt', errors, async () => {
      const loaders = await fetchJson<QuiltLoader[]>('https://meta.quiltmc.org/v3/versions/loader')
      const stable = loaders.map((l) => l.version).find(stableRelease)
      if (stable) next.quilt.loader = stable
      const loom = newest(mavenVersions(await fetchText('https://maven.quiltmc.org/repository/release/org/quiltmc/loom/maven-metadata.xml')))
      if (loom) next.quilt.loom = loom
    }),
    attempt('Architectury', errors, async () => {
      const api = mavenVersions(await fetchText('https://maven.architectury.dev/dev/architectury/architectury/maven-metadata.xml'))
      const found: Record<string, string | undefined> = {}
      for (const [mc, current] of Object.entries(base.architectury.api)) {
        const major = current.split('.')[0]
        found[mc] = newest(api, (v) => v.startsWith(`${major}.`))
      }
      next.architectury.api = mergeRecord(base.architectury.api, found)
      const plugin = newest(mavenVersions(await fetchText('https://maven.architectury.dev/architectury-plugin/architectury-plugin.gradle.plugin/maven-metadata.xml')))
      if (plugin) next.architectury.plugin = plugin
      const loom = newest(mavenVersions(await fetchText('https://maven.architectury.dev/dev/architectury/loom/dev.architectury.loom.gradle.plugin/maven-metadata.xml')))
      if (loom) next.architectury.loom = loom
    }),
    attempt('run-paper', errors, async () => {
      const xml = await fetchText('https://plugins.gradle.org/m2/xyz/jpenilla/run-paper/xyz.jpenilla.run-paper.gradle.plugin/maven-metadata.xml')
      const run = newest(mavenVersions(xml))
      if (run) next.runTask = run
    }),
  ])

  next.fetchedAt = Date.now()
  return { catalog: next, errors }
}

/** The NeoForge version scheme: 1.21.1 → `21.1.`, 26.2 → `26.2.0.`, 26.1.2 → `26.1.2.` */
export function neoforgePrefix(mc: string): string {
  const p = parts(mc)
  if (p[0] >= 26) return `${p[0]}.${p[1]}.${p[2] ?? 0}.`
  return `${p[1]}.${p[2] ?? 0}.`
}
