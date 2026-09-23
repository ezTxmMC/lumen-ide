/**
 * The version fields: comboboxes whose lists load live from the catalogue —
 * the Minecraft version first, then every loader, API and plugin version for
 * the chosen Minecraft version (`dependsOn: ['mc']`).
 *
 * A field's default is the recommended or newest stable entry of the list it
 * loaded last; until a list arrives the form keeps the first choice.
 */

import type { FieldChoice, FormField, FormValues } from '../../../../src/core/types'
import type { ServerApi } from '../catalog'
import {
  fabricSupports, forgeToolchain, gradleChoicesFrom, javaFor, neoToolchain, quiltSupports,
} from '../eras'
import { t, versions } from '../lumen'
import { architecturyGame, rememberArchitecturyGames } from '../architectury'
import { mcAtLeast, releaseLine } from '../semver'
import { supportedReleases, type VersionEntry } from '../sources'
import { section } from './common'

/* ------------------------------------------------------------------ *
 * Defaults remembered per list
 * ------------------------------------------------------------------ */

const preferred = new Map<string, string>()

/** Recommended, else the newest stable (`latest`), else the first. */
export function pickDefault(entries: VersionEntry[]): string | undefined {
  return (entries.find((e) => e.badge === 'recommended') ?? entries.find((e) => e.badge === 'latest') ?? entries[0])?.version
}

const listKey = (scope: string, field: string, dependsOn: string[], values: FormValues) =>
  `${scope}|${field}|${dependsOn.map((id) => values[id] ?? '').join('|')}`

export function badgeLabel(badge: string | undefined): string | undefined {
  if (!badge) return undefined
  return t(`badge.${badge}`)
}

export function entryChoices(entries: VersionEntry[], group?: string): FieldChoice[] {
  return entries.map((entry) => ({
    value: entry.version,
    label: entry.version,
    badge: badgeLabel(entry.badge),
    ...(group ? { group } : {}),
  }))
}

export interface VersionFieldOptions {
  /** Unique per template, so two templates keep separate defaults. */
  scope: string
  id: string
  label: string
  hint?: string
  dependsOn?: string[]
  when?: (values: FormValues) => boolean
  load(values: FormValues): Promise<VersionEntry[]>
  /** Choices put before the loaded ones (the latest-build range, say). */
  lead?(values: FormValues, entries: VersionEntry[]): FieldChoice[]
  /** The default when the lead choices should win over the list's own pick. */
  preferLead?(values: FormValues): boolean
  /** Turns the loaded list into choices (grouping, labels); plain versions otherwise. */
  toChoices?(entries: VersionEntry[], values: FormValues): FieldChoice[]
}

export function versionField(options: VersionFieldOptions): FormField {
  const dependsOn = options.dependsOn ?? []
  return {
    id: options.id,
    label: options.label,
    type: 'combobox',
    mono: true,
    section: section.minecraft(),
    hint: options.hint,
    when: options.when,
    dependsOn,
    default: (values) => preferred.get(listKey(options.scope, options.id, dependsOn, values)) ?? '',
    async loadChoices(values) {
      const entries = await options.load(values)
      const lead = options.lead?.(values, entries) ?? []
      if (!entries.length && !lead.length) throw new Error(t('error.noVersions', { mc: values.mc ?? '' }))
      const chosen = options.preferLead?.(values) && lead.length ? lead[0].value : pickDefault(entries)
      if (chosen) preferred.set(listKey(options.scope, options.id, dependsOn, values), chosen)
      const rest = options.toChoices ? options.toChoices(entries, values) : entryChoices(entries)
      return [...lead, ...rest]
    },
  }
}

/* ------------------------------------------------------------------ *
 * The Minecraft version
 * ------------------------------------------------------------------ */

export type Platform =
  | 'fabric' | 'quilt' | 'neoforge' | 'forge' | 'architectury'
  | ServerApi

/** Releases (and, where the platform has them, snapshots) a platform supports — newest first. */
export async function minecraftVersions(platform: Platform, snapshots = false): Promise<{ releases: string[]; snapshots: string[] }> {
  const catalog = versions()
  const mojang = (await catalog.games()).releases
  if (platform === 'fabric') {
    const fabric = await catalog.fabricGames()
    return { releases: supportedReleases(mojang, fabric.releases, fabricSupports), snapshots: snapshots ? fabric.snapshots : [] }
  }
  if (platform === 'quilt') return { releases: supportedReleases(mojang, (await catalog.quiltGames()).releases, quiltSupports), snapshots: [] }
  if (platform === 'neoforge') return { releases: supportedReleases(mojang, await catalog.neoforgeGames(), (mc) => neoToolchain(mc) !== null), snapshots: [] }
  if (platform === 'forge') return { releases: supportedReleases(mojang, await catalog.forgeGames(), (mc) => forgeToolchain(mc) !== null), snapshots: [] }
  if (platform === 'architectury') {
    const list = await catalog.architecturyGames()
    rememberArchitecturyGames(list)
    return { releases: supportedReleases(mojang, list.versions.map((g) => g.version)), snapshots: [] }
  }
  const games = await catalog.serverApiGames(platform)
  const oldest = platform === 'purpur' ? '1.16.5' : '1.7.10'
  return { releases: supportedReleases(mojang, games, (mc) => mcAtLeast(mc, oldest)), snapshots: [] }
}

/** Choices grouped by release line, each with its Java release as hint; snapshots in a group of their own. */
export function minecraftChoices(list: { releases: string[]; snapshots: string[] }): FieldChoice[] {
  const releases = list.releases.map((mc, i) => ({
    value: mc,
    label: mc,
    hint: `Java ${javaFor(mc)}`,
    group: t('group.line', { line: releaseLine(mc) }),
    ...(i === 0 ? { badge: t('badge.latest') } : {}),
  }))
  const snapshots = list.snapshots.map((mc) => ({
    value: mc,
    label: mc,
    hint: `Java ${javaFor(mc)}`,
    group: t('group.snapshots'),
    badge: t('badge.snapshot'),
  }))
  return [...snapshots, ...releases]
}

const newestRelease = new Map<Platform, string>()

export function mcField(platform: Platform, options: { snapshots?: boolean } = {}): FormField {
  return {
    id: 'mc',
    label: t('field.mc'),
    type: 'combobox',
    mono: true,
    section: section.minecraft(),
    hint: t(`hint.mc.${platform}`),
    dependsOn: options.snapshots ? ['snapshots'] : [],
    default: () => newestRelease.get(platform) ?? '',
    async loadChoices(values) {
      const list = await minecraftVersions(platform, options.snapshots && values.snapshots === 'true')
      if (list.releases[0]) newestRelease.set(platform, list.releases[0])
      if (!list.releases.length && !list.snapshots.length) throw new Error(t('error.noGames'))
      return minecraftChoices(list)
    },
  }
}

export function snapshotsField(fallback: boolean): FormField {
  return {
    id: 'snapshots',
    label: t('field.snapshots'),
    type: 'toggle',
    default: String(fallback),
    hint: t('hint.snapshots'),
    section: section.minecraft(),
  }
}

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

/** The Gradle version: the toolchain's recommended one and the newer releases of its major. */
export function gradleField(scope: string, recommended: (values: FormValues) => string | null, dependsOn: string[] = ['mc'], when?: (values: FormValues) => boolean): FormField {
  return versionField({
    scope,
    id: 'gradleVersion',
    label: t('field.gradle'),
    hint: t('hint.gradle'),
    dependsOn,
    when,
    async load(values) {
      const wanted = recommended(values)
      if (!wanted) return []
      const releases = await versions().gradleReleases()
      return gradleChoicesFrom(releases, wanted).map((version) => ({ version, badge: version === wanted ? 'recommended' : undefined }))
    },
  })
}

export { architecturyGame }
