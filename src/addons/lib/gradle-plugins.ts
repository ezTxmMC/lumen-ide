/**
 * Tasks that Gradle plugins add — without starting Gradle.
 *
 * `runClient` and `runServer` of a Fabric or NeoForge mod, `bootRun` of Spring
 * Boot, `shadowJar`, `runIde`: none of them stands in the build script, the
 * plugin creates them. This module knows what the common plugins bring and
 * finds the plugins of a module wherever they are applied:
 *
 *   • its own `plugins { }` block and `apply plugin:` lines (not `apply false`),
 *   • `subprojects { }` / `allprojects { }` of the root script (Architectury
 *     and many multi-loader templates apply Loom that way),
 *   • blocks that give a plugin away (`loom { }`, `neoForge { }`,
 *     `architectury { fabric() }`, a `minecraft "com.mojang:minecraft:…"`
 *     dependency).
 *
 * Run configurations declared in a `runs { }` block (`client`, `server`,
 * `data`, `gameTestServer` …) become `run<Name>` tasks, as the Minecraft
 * plugins create them. Everything else a build defines still comes from
 * `gradle tasks --all`, which Lumen runs in the background and caches.
 *
 * Pure text functions; tested in `scripts/check-project.ts`.
 */

import { closingBrace, stripComments, type GradleTaskInfo } from './jvm-tasks'
import { parseGradlePlugins } from './jvm-modules'

type Group = 'build' | 'run' | 'test' | 'other'

interface PluginTask {
  name: string
  group: Group
  description?: string
}

interface PluginEntry {
  /** A readable name, the category the tasks are listed under. */
  category: string
  match: (id: string) => boolean
  tasks: PluginTask[]
  /** The run configurations the plugin creates when the script declares none. */
  defaultRuns?: string[]
  /** Only runs declared in `runs { }` exist — ModDevGradle, NeoGradle, ForgeGradle. */
  declaredRuns?: boolean
}

const id = (...ids: string[]) => (candidate: string) => ids.includes(candidate)
const pattern = (re: RegExp) => (candidate: string) => re.test(candidate)

const run = (name: string, description?: string): PluginTask => ({ name, group: 'run', description })
const build = (name: string, description?: string): PluginTask => ({ name, group: 'build', description })
const other = (name: string, description?: string): PluginTask => ({ name, group: 'other', description })
const test = (name: string, description?: string): PluginTask => ({ name, group: 'test', description })

/** The plugins Lumen knows the tasks of. The first match per plugin id wins. */
export const PLUGIN_CATALOG: PluginEntry[] = [
  {
    category: 'Fabric Loom',
    match: pattern(/^(fabric-loom|net\.fabricmc\.fabric-loom(-remap)?|org\.quiltmc\.loom|dev\.architectury\.loom|gg\.essential\.loom|quiet-fabric-loom)$/),
    defaultRuns: ['client', 'server'],
    tasks: [
      other('genSources', 'Decompile Minecraft for browsing'),
      build('remapJar', 'Build the jar with production mappings'),
      other('downloadAssets'),
      other('vscode', 'Generate launch configurations'),
    ],
  },
  {
    category: 'NeoForge (ModDevGradle)',
    match: pattern(/^net\.neoforged\.moddev(\.legacyforge)?$/),
    declaredRuns: true,
    tasks: [other('neoForgeIdeSync'), other('createMinecraftArtifacts')],
  },
  {
    category: 'NeoForge (NeoGradle)',
    match: pattern(/^net\.neoforged\.gradle\.(userdev|platform|vanilla)$/),
    declaredRuns: true,
    tasks: [],
  },
  {
    category: 'Forge (ForgeGradle)',
    match: pattern(/^net\.minecraftforge\.gradle(\.forge)?$/),
    declaredRuns: true,
    tasks: [other('genIntellijRuns'), other('genEclipseRuns'), other('genVSCodeRuns'), build('reobfJar')],
  },
  {
    category: 'VanillaGradle',
    match: id('org.spongepowered.gradle.vanilla'),
    tasks: [run('runClient'), run('runServer'), other('decompile')],
  },
  {
    category: 'Architectury',
    match: pattern(/^architectury-plugin$|^dev\.architectury\.architectury-plugin$/),
    tasks: [],
  },
  {
    category: 'Paper',
    match: pattern(/^xyz\.jpenilla\.run-paper$/),
    tasks: [run('runServer', 'Start a Paper server with the plugin'), run('runDevBundleServer')],
  },
  { category: 'Velocity', match: id('xyz.jpenilla.run-velocity'), tasks: [run('runVelocity')] },
  { category: 'Waterfall', match: id('xyz.jpenilla.run-waterfall'), tasks: [run('runWaterfall')] },
  { category: 'paperweight', match: pattern(/^io\.papermc\.paperweight\.userdev$/), tasks: [build('reobfJar')] },
  {
    category: 'Spring Boot',
    match: id('org.springframework.boot'),
    tasks: [run('bootRun'), build('bootJar'), build('bootBuildImage'), run('bootTestRun')],
  },
  { category: 'Quarkus', match: id('io.quarkus'), tasks: [run('quarkusDev'), build('quarkusBuild'), test('quarkusTest')] },
  { category: 'Micronaut', match: pattern(/^io\.micronaut\.application$/), tasks: [run('run'), build('optimizedJitJar')] },
  { category: 'Application', match: id('application'), tasks: [run('run'), build('installDist'), build('distZip')] },
  { category: 'Shadow', match: pattern(/^(com\.github\.johnrengelman\.shadow|com\.gradleup\.shadow|io\.github\.goooler\.shadow)$/), tasks: [build('shadowJar'), run('runShadow')] },
  {
    category: 'IntelliJ Platform',
    match: pattern(/^org\.jetbrains\.intellij(\.platform)?$/),
    tasks: [run('runIde'), build('buildPlugin'), test('verifyPlugin'), other('publishPlugin')],
  },
  { category: 'Jib', match: id('com.google.cloud.tools.jib'), tasks: [build('jib'), build('jibDockerBuild'), build('jibBuildTar')] },
  { category: 'JavaFX', match: id('org.openjfx.javafxplugin'), tasks: [] },
  { category: 'jlink', match: pattern(/^org\.beryx\.(jlink|runtime)$/), tasks: [build('jlink'), build('jpackage')] },
  { category: 'GraalVM Native', match: id('org.graalvm.buildtools.native'), tasks: [build('nativeCompile'), run('nativeRun'), test('nativeTest')] },
  { category: 'Publishing', match: id('maven-publish'), tasks: [other('publish'), other('publishToMavenLocal')] },
  { category: 'Mod publishing', match: id('me.modmuss50.mod-publish-plugin'), tasks: [other('publishMods')] },
  { category: 'Modrinth', match: id('com.modrinth.minotaur'), tasks: [other('modrinth')] },
  { category: 'CurseForge', match: pattern(/^(net\.darkhax\.curseforgegradle|com\.matthewprenger\.cursegradle)$/), tasks: [other('curseforge')] },
  { category: 'Spotless', match: id('com.diffplug.spotless'), tasks: [other('spotlessApply'), test('spotlessCheck')] },
  { category: 'ktlint', match: id('org.jlleitschuh.gradle.ktlint'), tasks: [other('ktlintFormat'), test('ktlintCheck')] },
  { category: 'detekt', match: id('io.gitlab.arturbosch.detekt'), tasks: [test('detekt')] },
  { category: 'Dokka', match: id('org.jetbrains.dokka'), tasks: [other('dokkaHtml'), other('dokkaGenerate')] },
  { category: 'JaCoCo', match: id('jacoco'), tasks: [test('jacocoTestReport')] },
  { category: 'Checkstyle', match: id('checkstyle'), tasks: [test('checkstyleMain')] },
  { category: 'Kotlin Multiplatform', match: id('org.jetbrains.kotlin.multiplatform'), tasks: [test('allTests')] },
  { category: 'Android', match: pattern(/^com\.android\.application$/), tasks: [build('assembleDebug'), build('assembleRelease'), run('installDebug'), test('connectedAndroidTest')] },
  { category: 'Versions', match: id('com.github.ben-manes.versions'), tasks: [other('dependencyUpdates')] },
]

/* ------------------------------------------------------------------ *
 * Reading scripts
 * ------------------------------------------------------------------ */

/** The contents of every `name { … }` block of a script (top level or nested). */
export function blocksNamed(text: string, name: string): string[] {
  const out: string[] = []
  const re = new RegExp(`(?:^|[\\s;{(])${name}\\s*(?:\\([^)]*\\)\\s*)?\\{`, 'g')
  for (const match of text.matchAll(re)) {
    const start = (match.index ?? 0) + match[0].length
    const end = closingBrace(text, start)
    if (end !== -1) out.push(text.slice(start, end))
  }
  return out
}

/** Plugin ids named in `plugins { }` with `apply false` — declared for subprojects, not applied here. */
export function notAppliedPlugins(script: string): Set<string> {
  const text = stripComments(script)
  const found = new Set<string>()
  for (const m of text.matchAll(/\bid\s*\(?\s*["']([^"']+)["']\s*\)?[^\n]*\bapply\s*\(?\s*false/g)) found.add(m[1])
  for (const m of text.matchAll(/\balias\s*\(\s*libs\.plugins\.([\w.]+)\s*\)[^\n]*\bapply\s*\(?\s*false/g)) found.add(m[1].replace(/\./g, '-'))
  return found
}

/** Plugin ids a script applies to itself. */
export function appliedPlugins(script: string): string[] {
  const skipped = notAppliedPlugins(script)
  return parseGradlePlugins(script).filter((plugin) => !skipped.has(plugin))
}

/** Plugins applied through `apply plugin: 'x'`, `apply(plugin = "x")` or `plugins.apply("x")` inside a text. */
function applyCalls(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/\bapply\s*\(?\s*plugin\s*[:=]\s*["']([^"']+)["']/g)) out.add(m[1])
  for (const m of text.matchAll(/\bplugins\s*\.\s*(?:apply|id)\s*\(\s*["']([^"']+)["']/g)) out.add(m[1])
  for (const m of text.matchAll(/\bpluginManager\s*\.\s*apply\s*\(\s*["']([^"']+)["']/g)) out.add(m[1])
  return [...out]
}

/** What the root script applies to its subprojects (`subprojects { }`, `allprojects { }`). */
export function inheritedPlugins(rootScript: string): string[] {
  const text = stripComments(rootScript)
  const blocks = [...blocksNamed(text, 'subprojects'), ...blocksNamed(text, 'allprojects'), ...blocksNamed(text, 'configure')]
  return [...new Set(blocks.flatMap(applyCalls))]
}

/** Plugins a script does not name but gives away through what it configures. */
export function impliedPlugins(script: string): string[] {
  const text = stripComments(script)
  const out: string[] = []
  const architectury = blocksNamed(text, 'architectury').join('\n')
  if (/\b(fabric|forge|neoForge|quilt|platformSetupLoomIde)\s*\(/.test(architectury)) out.push('dev.architectury.loom')
  if (blocksNamed(text, 'loom').length) out.push('fabric-loom')
  if (/\bminecraft\s*\(?\s*["']com\.mojang:minecraft:/.test(text) && /\bmappings\b/.test(text)) out.push('fabric-loom')
  if (/\bmod(Implementation|Api|CompileOnly|RuntimeOnly)\b/.test(text)) out.push('fabric-loom')
  if (blocksNamed(text, 'neoForge').length || /\bneoForge\s*\.\s*version\b/.test(text)) out.push('net.neoforged.moddev')
  if (blocksNamed(text, 'minecraft').some((block) => /\bmappings\s+channel\b|\bmappings\s*\(\s*channel/.test(block))) out.push('net.minecraftforge.gradle')
  return out
}

/**
 * The names of the run configurations in a script's `runs { }` blocks:
 * `client { }`, `server { … }`, `create("data")`, `register("gameTestServer")`,
 * `"name" { }`. Configuration inside (`client()`, `ideName = …`) is ignored.
 */
export function parseRuns(script: string): string[] {
  const text = stripComments(script)
  const names: string[] = []
  const add = (name: string) => {
    if (!names.includes(name)) names.push(name)
  }
  for (const block of blocksNamed(text, 'runs')) {
    let depth = 0
    let line = ''
    for (let i = 0; i < block.length; i++) {
      const ch = block[i]
      if (ch === '{' && depth === 0) {
        const head = line.trim()
        const named = /(?:create|register|named|maybeCreate)\s*\(\s*["']([\w-]+)["']\s*\)$/.exec(head)
          ?? /^["']?([A-Za-z][\w-]*)["']?$/.exec(head)
        if (named && !/^(configureEach|all|each|named|withType)$/.test(named[1])) add(named[1])
      }
      if (ch === '{') depth++
      if (ch === '}') depth--
      if (ch === '\n' || ch === ';' || ch === '{' || ch === '}') line = ''
      if (ch !== '\n' && ch !== ';' && ch !== '{' && ch !== '}') line += ch
    }
  }
  return names
}

/** `client` → `runClient`, `gameTestServer` → `runGameTestServer`. */
export const runTaskName = (run: string) => `run${run.charAt(0).toUpperCase()}${run.slice(1).replace(/[-_](\w)/g, (_m, c: string) => c.toUpperCase())}`

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

export interface PluginTaskInfo extends GradleTaskInfo {
  runGroup: Group
}

/**
 * The tasks the plugins of one script bring. `inherited` are the plugins its
 * root script applies to every subproject.
 */
export function pluginTasks(script: string, inherited: string[] = []): PluginTaskInfo[] {
  const plugins = [...new Set([...appliedPlugins(script), ...inherited, ...impliedPlugins(script)])]
  const runs = parseRuns(script)
  const out: PluginTaskInfo[] = []
  const seen = new Set<string>()
  const push = (task: PluginTask, category: string) => {
    if (seen.has(task.name)) return
    seen.add(task.name)
    out.push({ name: task.name, group: category, runGroup: task.group, ...(task.description ? { description: task.description } : {}) })
  }
  const entries = PLUGIN_CATALOG.filter((entry) => plugins.some((plugin) => entry.match(plugin)))
  for (const entry of entries) {
    const declared = runs.length ? runs : entry.defaultRuns ?? []
    const names = entry.declaredRuns ? runs : declared
    for (const name of names) push(run(runTaskName(name)), entry.category)
    for (const task of entry.tasks) push(task, entry.category)
  }
  return out
}
