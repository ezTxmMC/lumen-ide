/**
 * The project kinds for Minecraft projects: the Bukkit family, Velocity,
 * BungeeCord, Fabric, Quilt, NeoForge, Forge and Architectury.
 *
 * Detection
 * ---------
 * Minecraft projects have no files of their own in the root — only
 * `build.gradle(.kts)` or `pom.xml`, as any other JVM project does. The
 * markers are therefore the build files, and every kind brings a finer check
 * `detect` that reads the build files and manifests (the Loom plugin,
 * paper-api, fabric.mod.json …), so ordinary Gradle and Maven projects are not
 * taken for Minecraft.
 */

import type { ProjectContext, ProjectKind, ProjectMeta, ProjectTask } from '../../../src/core/types'
import { lumen, t } from './lumen'

const grepValue = (text: string, key: string) => lumen().project.grepValue(text, key)
const wrapperOr = (ctx: ProjectContext, wrapper: string, fallback: string) => lumen().project.wrapperOr(ctx, wrapper, fallback)

export interface MinecraftKind extends ProjectKind {
  /** The finer check after a marker has hit; `false` discards the kind. */
  detect(ctx: ProjectContext): Promise<boolean>
}

const GRADLE_MARKERS = ['build.gradle.kts', 'build.gradle', 'settings.gradle.kts', 'settings.gradle']
const MAVEN_MARKERS = ['pom.xml']

/* ------------------------------------------------------------------ *
 * Reading the build files
 * ------------------------------------------------------------------ */

interface BuildInfo {
  /** The contents of build.gradle(.kts) or pom.xml, empty where there is none. */
  build: string
  settings: string
  properties: string
  maven: boolean
  buildFile: string
}

async function readBuild(ctx: ProjectContext): Promise<BuildInfo> {
  const kts = await ctx.readFile('build.gradle.kts')
  const groovy = kts === null ? await ctx.readFile('build.gradle') : null
  const pom = kts === null && groovy === null ? await ctx.readFile('pom.xml') : null
  const settings = (await ctx.readFile('settings.gradle.kts')) ?? (await ctx.readFile('settings.gradle')) ?? ''
  const properties = (await ctx.readFile('gradle.properties')) ?? ''
  const buildFile = buildFileName(kts, groovy, pom)
  return { build: kts ?? groovy ?? pom ?? '', settings, properties, maven: pom !== null, buildFile }
}

function buildFileName(kts: string | null, groovy: string | null, pom: string | null): string {
  if (kts !== null) return 'build.gradle.kts'
  if (groovy !== null) return 'build.gradle'
  if (pom !== null) return 'pom.xml'
  return ''
}

/** The first file from a list that is present. */
async function firstFile(ctx: ProjectContext, candidates: string[]): Promise<{ path: string; text: string } | null> {
  for (const path of candidates) {
    const text = await ctx.readFile(path)
    if (text !== null) return { path, text }
  }
  return null
}

const prop = (info: BuildInfo, key: string) => grepValue(info.properties, key)

/** `mod_id=x` or `archives_base_name=x` → the jar path under build/libs. */
function gradleJar(info: BuildInfo, base: string | undefined, sub = ''): string {
  const version = prop(info, 'mod_version') ?? prop(info, 'version') ?? grepValue(info.build, 'version') ?? '*'
  return `${sub}build/libs/${base ?? '*'}-${version}.jar`
}

function yamlValue(text: string, key: string): string | undefined {
  const m = new RegExp(`^${key}\\s*:\\s*['"]?([^'"\\n#]+)['"]?`, 'm').exec(text)
  return m?.[1]?.trim()
}

function tomlValue(text: string, key: string): string | undefined {
  const m = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"'\\n]+)["']`, 'm').exec(text)
  return m?.[1]?.trim()
}

function jsonValue(text: string, path: string[]): string | undefined {
  try {
    let node: unknown = JSON.parse(text)
    for (const key of path) node = (node as Record<string, unknown> | null)?.[key]
    return typeof node === 'string' ? node : undefined
  } catch {
    return undefined
  }
}

/** A Gradle task with the wrapper, quiet and without colours. */
async function gradleTask(ctx: ProjectContext, id: string, label: string, args: string[], group: ProjectTask['group'], detail?: string): Promise<ProjectTask> {
  const gradle = await wrapperOr(ctx, 'gradlew', 'gradle')
  return { id, label, command: gradle, args: ['--console=plain', ...args], group, detail: detail ?? `gradle ${args.join(' ')}` }
}

async function mavenTask(ctx: ProjectContext, id: string, label: string, args: string[], group: ProjectTask['group']): Promise<ProjectTask> {
  const mvn = await wrapperOr(ctx, 'mvnw', 'mvn')
  return { id, label, command: mvn, args, group, detail: `mvn ${args.join(' ')}` }
}

/** The task that lists the jars built. */
function listJars(ctx: ProjectContext, id: string, dir: string): ProjectTask {
  if (ctx.platform === 'win32') {
    return { id, label: t('task.jars'), command: 'cmd', args: ['/c', 'dir', '/b', dir.replace(/\//g, '\\')], group: 'other', detail: dir }
  }
  return { id, label: t('task.jars'), command: 'ls', args: ['-1', dir], group: 'other', detail: dir }
}

/* ------------------------------------------------------------------ *
 * The Bukkit family
 * ------------------------------------------------------------------ */

const BUKKIT_API = /(io\.papermc\.paper|com\.destroystokyo\.paper|org\.spigotmc|org\.bukkit|cn\.dreeam\.leaf|org\.purpurmc\.purpur|dev\.folia)[:"'\s<>/a-z-]*?(paper-api|spigot-api|bukkit|leaf-api|purpur-api|folia-api)/

function bukkitPlatform(build: string): string {
  const table: [RegExp, string][] = [
    [/folia-api/, 'Folia'],
    [/leaf-api/, 'Leaf'],
    [/purpur-api/, 'Purpur'],
    [/paper-api/, 'Paper'],
    [/spigot-api/, 'Spigot'],
  ]
  return table.find(([re]) => re.test(build))?.[1] ?? 'Bukkit'
}

const BUKKIT_MANIFESTS = ['src/main/resources/paper-plugin.yml', 'src/main/resources/plugin.yml']

export const bukkitKind: MinecraftKind = {
  id: 'minecraft-bukkit',
  name: 'Minecraft Plugin (Bukkit/Paper)',
  icon: 'MC',
  color: '#62b47a',
  markers: [...GRADLE_MARKERS, ...MAVEN_MARKERS],
  priority: 30,
  languageIds: ['java', 'kotlin'],
  async detect(ctx) {
    const info = await readBuild(ctx)
    if (BUKKIT_API.test(info.build)) return true
    const manifest = await firstFile(ctx, BUKKIT_MANIFESTS)
    return Boolean(manifest && /^main\s*:/m.test(manifest.text) && !/velocity|bungeecord|waterfall/i.test(info.build))
  },
  async tasks(ctx) {
    const info = await readBuild(ctx)
    if (info.maven) {
      return [
        await mavenTask(ctx, 'mc:package', t('task.build'), ['-q', 'package'], 'build'),
        await mavenTask(ctx, 'mc:clean', t('task.clean'), ['-q', 'clean'], 'clean'),
        listJars(ctx, 'mc:jars', 'target'),
      ]
    }
    const tasks = [
      await gradleTask(ctx, 'mc:build', t('task.build'), ['build'], 'build'),
      await gradleTask(ctx, 'mc:clean', t('task.clean'), ['clean'], 'clean'),
    ]
    if (/run-paper/.test(info.build)) tasks.push(await gradleTask(ctx, 'mc:runServer', t('task.runServer'), ['runServer'], 'run'))
    tasks.push(listJars(ctx, 'mc:jars', 'build/libs'))
    return tasks
  },
  async inspect(ctx) {
    const info = await readBuild(ctx)
    const manifest = await firstFile(ctx, BUKKIT_MANIFESTS)
    const facts: Record<string, string> = { [t('fact.platform')]: bukkitPlatform(info.build) }
    const api = yamlValue(manifest?.text ?? '', 'api-version')
    if (api) facts['API-Version'] = api
    const name = yamlValue(manifest?.text ?? '', 'name')
    if (name) facts.Plugin = name
    facts.Jar = info.maven ? 'target/*.jar' : 'build/libs/*.jar'
    return meta(info, facts, ['src/main/java', 'src/main/resources'], manifest?.path)
  },
}

/* ------------------------------------------------------------------ *
 * Velocity and BungeeCord
 * ------------------------------------------------------------------ */

export const velocityKind: MinecraftKind = {
  id: 'minecraft-velocity',
  name: 'Velocity Plugin',
  icon: 'MC',
  color: '#1f8bd6',
  markers: [...GRADLE_MARKERS, ...MAVEN_MARKERS],
  priority: 30,
  languageIds: ['java', 'kotlin'],
  async detect(ctx) {
    return /velocity-api/.test((await readBuild(ctx)).build)
  },
  async tasks(ctx) {
    const info = await readBuild(ctx)
    if (info.maven) {
      return [
        await mavenTask(ctx, 'mc:package', t('task.build'), ['-q', 'package'], 'build'),
        listJars(ctx, 'mc:jars', 'target'),
      ]
    }
    const tasks = [await gradleTask(ctx, 'mc:build', t('task.build'), ['build'], 'build')]
    if (/run-velocity/.test(info.build)) tasks.push(await gradleTask(ctx, 'mc:runVelocity', t('task.runProxy'), ['runVelocity'], 'run'))
    tasks.push(listJars(ctx, 'mc:jars', 'build/libs'))
    return tasks
  },
  async inspect(ctx) {
    const info = await readBuild(ctx)
    const facts: Record<string, string> = { [t('fact.platform')]: 'Velocity' }
    const api = /velocity-api:([^"'\s)]+)/.exec(info.build)?.[1] ?? /<artifactId>velocity-api<\/artifactId>\s*<version>([^<]+)/.exec(info.build)?.[1]
    if (api) facts['Velocity-API'] = api
    facts.Jar = info.maven ? 'target/*.jar' : 'build/libs/*.jar'
    return meta(info, facts, ['src/main/java', 'src/main/resources'])
  },
}

export const bungeeKind: MinecraftKind = {
  id: 'minecraft-bungeecord',
  name: 'BungeeCord Plugin',
  icon: 'MC',
  color: '#e0a526',
  markers: [...GRADLE_MARKERS, ...MAVEN_MARKERS],
  priority: 30,
  languageIds: ['java', 'kotlin'],
  async detect(ctx) {
    const info = await readBuild(ctx)
    if (/bungeecord-api|waterfall-api/.test(info.build)) return true
    return (await ctx.exists('src/main/resources/bungee.yml')) && !BUKKIT_API.test(info.build)
  },
  async tasks(ctx) {
    const info = await readBuild(ctx)
    if (info.maven) {
      return [
        await mavenTask(ctx, 'mc:package', t('task.build'), ['-q', 'package'], 'build'),
        listJars(ctx, 'mc:jars', 'target'),
      ]
    }
    const tasks = [await gradleTask(ctx, 'mc:build', t('task.build'), ['build'], 'build')]
    if (/run-waterfall/.test(info.build)) tasks.push(await gradleTask(ctx, 'mc:runWaterfall', t('task.runProxy'), ['runWaterfall'], 'run'))
    tasks.push(listJars(ctx, 'mc:jars', 'build/libs'))
    return tasks
  },
  async inspect(ctx) {
    const info = await readBuild(ctx)
    const manifest = await firstFile(ctx, ['src/main/resources/bungee.yml'])
    const facts: Record<string, string> = { [t('fact.platform')]: /waterfall-api/.test(info.build) ? 'Waterfall' : 'BungeeCord' }
    const name = yamlValue(manifest?.text ?? '', 'name')
    if (name) facts.Plugin = name
    facts.Jar = info.maven ? 'target/*.jar' : 'build/libs/*.jar'
    return meta(info, facts, ['src/main/java', 'src/main/resources'], manifest?.path)
  },
}

/* ------------------------------------------------------------------ *
 * Mods
 * ------------------------------------------------------------------ */

const isArchitectury = (info: BuildInfo) => /architectury-plugin/.test(info.build)

async function loomTasks(ctx: ProjectContext, info: BuildInfo): Promise<ProjectTask[]> {
  const tasks = [
    await gradleTask(ctx, 'mc:build', t('task.build'), ['build'], 'build'),
    await gradleTask(ctx, 'mc:runClient', t('task.runClient'), ['runClient'], 'run'),
    await gradleTask(ctx, 'mc:runServer', t('task.runServer'), ['runServer'], 'run'),
  ]
  if (/configureDataGeneration|fabric-datagen/.test(info.build)) {
    tasks.push(await gradleTask(ctx, 'mc:runDatagen', t('task.runData'), ['runDatagen'], 'other'))
  }
  // Without remapping (from 26.1, the plugin `net.fabricmc.fabric-loom`) there is no genSources.
  if (!/net\.fabricmc\.fabric-loom['"]/.test(info.build)) {
    tasks.push(await gradleTask(ctx, 'mc:genSources', t('task.genSources'), ['genSources'], 'other'))
  }
  tasks.push(
    await gradleTask(ctx, 'mc:clean', t('task.clean'), ['clean'], 'clean'),
    listJars(ctx, 'mc:jars', 'build/libs'),
  )
  return tasks
}

const FABRIC_JSON = ['src/main/resources/fabric.mod.json']

export const fabricKind: MinecraftKind = {
  id: 'minecraft-fabric',
  name: 'Fabric Mod',
  icon: 'MC',
  color: '#dbd0b4',
  markers: GRADLE_MARKERS,
  priority: 32,
  languageIds: ['java', 'kotlin'],
  async detect(ctx) {
    const info = await readBuild(ctx)
    if (isArchitectury(info)) return false
    return /fabric-loom/.test(info.build) || (await ctx.exists(FABRIC_JSON[0]))
  },
  tasks: async (ctx) => loomTasks(ctx, await readBuild(ctx)),
  async inspect(ctx) {
    const info = await readBuild(ctx)
    const manifest = await firstFile(ctx, FABRIC_JSON)
    const modId = jsonValue(manifest?.text ?? '', ['id']) ?? prop(info, 'archives_base_name')
    const facts: Record<string, string> = {
      Loader: 'Fabric',
      ...optional('Minecraft', prop(info, 'minecraft_version')),
      ...optional('Fabric Loader', prop(info, 'loader_version')),
      ...optional('Fabric API', prop(info, 'fabric_api_version')),
      ...optional('Mod-ID', modId),
      Jar: gradleJar(info, prop(info, 'archives_base_name') ?? modId),
    }
    return meta(info, facts, ['src/main/java', 'src/client/java', 'src/main/resources'], manifest?.path)
  },
}

export const quiltKind: MinecraftKind = {
  id: 'minecraft-quilt',
  name: 'Quilt Mod',
  icon: 'MC',
  color: '#8b5fc6',
  markers: GRADLE_MARKERS,
  priority: 33,
  languageIds: ['java', 'kotlin'],
  async detect(ctx) {
    const info = await readBuild(ctx)
    return /org\.quiltmc\.loom|quilt\.loom/.test(info.build) || (await ctx.exists('src/main/resources/quilt.mod.json'))
  },
  tasks: async (ctx) => loomTasks(ctx, await readBuild(ctx)),
  async inspect(ctx) {
    const info = await readBuild(ctx)
    const manifest = await firstFile(ctx, ['src/main/resources/quilt.mod.json'])
    const modId = jsonValue(manifest?.text ?? '', ['quilt_loader', 'id'])
    const facts: Record<string, string> = {
      Loader: 'Quilt',
      ...optional('Minecraft', prop(info, 'minecraft_version')),
      ...optional('Quilt Loader', prop(info, 'loader_version')),
      ...optional('Mod-ID', modId),
      Jar: gradleJar(info, prop(info, 'archives_base_name') ?? modId),
    }
    return meta(info, facts, ['src/main/java', 'src/main/resources'], manifest?.path)
  },
}

export const neoforgeKind: MinecraftKind = {
  id: 'minecraft-neoforge',
  name: 'NeoForge Mod',
  icon: 'MC',
  color: '#e68c37',
  markers: GRADLE_MARKERS,
  priority: 32,
  languageIds: ['java', 'kotlin'],
  async detect(ctx) {
    const info = await readBuild(ctx)
    if (isArchitectury(info)) return false
    return /net\.neoforged\.(moddev|gradle)/.test(info.build)
  },
  async tasks(ctx) {
    const info = await readBuild(ctx)
    const tasks = [
      await gradleTask(ctx, 'mc:build', t('task.build'), ['build'], 'build'),
      await gradleTask(ctx, 'mc:runClient', t('task.runClient'), ['runClient'], 'run'),
      await gradleTask(ctx, 'mc:runServer', t('task.runServer'), ['runServer'], 'run'),
    ]
    if (/register\(\s*["']data["']|^\s*data\s*\{/m.test(info.build)) tasks.push(await gradleTask(ctx, 'mc:runData', t('task.runData'), ['runData'], 'other'))
    tasks.push(
      await gradleTask(ctx, 'mc:clean', t('task.clean'), ['clean'], 'clean'),
      listJars(ctx, 'mc:jars', 'build/libs'),
    )
    return tasks
  },
  async inspect(ctx) {
    const info = await readBuild(ctx)
    const manifest = await firstFile(ctx, ['src/main/resources/META-INF/neoforge.mods.toml', 'src/main/templates/META-INF/neoforge.mods.toml'])
    const modId = prop(info, 'mod_id') ?? tomlValue(manifest?.text ?? '', 'modId')
    const facts: Record<string, string> = {
      Loader: 'NeoForge',
      ...optional('Minecraft', prop(info, 'minecraft_version')),
      ...optional('NeoForge', prop(info, 'neo_version')),
      ...optional('Mod-ID', modId),
      Jar: gradleJar(info, modId),
    }
    return meta(info, facts, ['src/main/java', 'src/main/resources', 'src/generated/resources'], manifest?.path)
  },
}

export const forgeKind: MinecraftKind = {
  id: 'minecraft-forge',
  name: 'Forge Mod',
  icon: 'MC',
  color: '#1e2d44',
  markers: GRADLE_MARKERS,
  priority: 32,
  languageIds: ['java', 'kotlin'],
  async detect(ctx) {
    const info = await readBuild(ctx)
    if (isArchitectury(info)) return false
    return /net\.minecraftforge\.gradle|com\.gtnewhorizons\.retrofuturagradle/.test(info.build)
  },
  async tasks(ctx) {
    const info = await readBuild(ctx)
    const tasks = [
      await gradleTask(ctx, 'mc:build', t('task.build'), ['build'], 'build'),
      await gradleTask(ctx, 'mc:runClient', t('task.runClient'), ['runClient'], 'run'),
      await gradleTask(ctx, 'mc:runServer', t('task.runServer'), ['runServer'], 'run'),
    ]
    if (/register\(\s*['"]data['"]/.test(info.build)) tasks.push(await gradleTask(ctx, 'mc:runData', t('task.runData'), ['runData'], 'other'))
    tasks.push(
      await gradleTask(ctx, 'mc:clean', t('task.clean'), ['clean'], 'clean'),
      listJars(ctx, 'mc:jars', 'build/libs'),
    )
    return tasks
  },
  async inspect(ctx) {
    const info = await readBuild(ctx)
    const manifest = await firstFile(ctx, ['src/main/resources/META-INF/mods.toml'])
    const modId = prop(info, 'mod_id') ?? tomlValue(manifest?.text ?? '', 'modId')
    const forge = prop(info, 'forge_version') ?? /net\.minecraftforge:forge:([^'")]+)/.exec(info.build)?.[1]
    const facts: Record<string, string> = {
      Loader: 'Forge',
      ...optional('Minecraft', prop(info, 'minecraft_version')),
      ...optional('Forge', forge),
      ...optional('Mod-ID', modId),
      Jar: gradleJar(info, modId),
    }
    return meta(info, facts, ['src/main/java', 'src/main/resources', 'src/generated/resources'], manifest?.path)
  },
}

export const architecturyKind: MinecraftKind = {
  id: 'minecraft-architectury',
  name: 'Architectury Mod',
  icon: 'MC',
  color: '#b86ef0',
  markers: GRADLE_MARKERS,
  priority: 34,
  languageIds: ['java', 'kotlin'],
  async detect(ctx) {
    const info = await readBuild(ctx)
    if (isArchitectury(info)) return true
    return /include\s*\(?\s*['"]:?common['"]/.test(info.settings) && /architectury/.test(info.settings)
  },
  async tasks(ctx) {
    const info = await readBuild(ctx)
    const platforms = (prop(info, 'enabled_platforms') ?? 'fabric,neoforge').split(',').map((p) => p.trim()).filter(Boolean)
    const tasks = [await gradleTask(ctx, 'mc:build', t('task.build'), ['build'], 'build')]
    for (const platform of platforms) {
      tasks.push(
        await gradleTask(ctx, `mc:${platform}:runClient`, `${t('task.runClient')} (${platform})`, [`:${platform}:runClient`], 'run'),
        await gradleTask(ctx, `mc:${platform}:runServer`, `${t('task.runServer')} (${platform})`, [`:${platform}:runServer`], 'run'),
      )
    }
    tasks.push(await gradleTask(ctx, 'mc:clean', t('task.clean'), ['clean'], 'clean'))
    for (const platform of platforms) tasks.push(listJars(ctx, `mc:${platform}:jars`, `${platform}/build/libs`))
    return tasks
  },
  async inspect(ctx) {
    const info = await readBuild(ctx)
    const modId = prop(info, 'archives_name')
    const facts: Record<string, string> = {
      Loader: `Architectury (${prop(info, 'enabled_platforms') ?? 'fabric, neoforge'})`,
      ...optional('Minecraft', prop(info, 'minecraft_version')),
      ...optional('Architectury API', prop(info, 'architectury_api_version')),
      ...optional('NeoForge', prop(info, 'neoforge_version')),
      ...optional('Fabric Loader', prop(info, 'fabric_loader_version')),
      ...optional('Mod-ID', modId),
      Jar: gradleJar(info, modId ? `${modId}-fabric` : undefined, 'fabric/'),
    }
    return meta(info, facts, ['common/src/main/java', 'fabric/src/main/java', 'neoforge/src/main/java', 'forge/src/main/java'])
  },
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function optional(key: string, value: string | undefined): Record<string, string> {
  if (!value) return {}
  return { [key]: value }
}

function meta(info: BuildInfo, facts: Record<string, string>, sourceRoots: string[], manifest?: string): ProjectMeta {
  const java = /JavaLanguageVersion\.of\((\d+)\)/.exec(info.build)?.[1] ?? /<maven\.compiler\.release>(\d+)/.exec(info.build)?.[1]
  if (java) facts.Java = java
  if (manifest) facts[t('fact.manifest')] = manifest
  return {
    name: grepValue(info.settings, 'rootProject\\.name'),
    facts,
    sourceRoots,
    buildFile: info.buildFile || undefined,
  }
}

export const MINECRAFT_KINDS: MinecraftKind[] = [
  architecturyKind, quiltKind, fabricKind, neoforgeKind, forgeKind, velocityKind, bungeeKind, bukkitKind,
]
