/**
 * Help for the Java language server (jdtls) with Gradle builds.
 *
 * jdtls imports Gradle through Buildship, which reads Gradle's Eclipse model.
 * That model loses module dependencies in two common mod setups — Gradle
 * builds fine, but every class of the other module “cannot be resolved”:
 *
 *   common(project(path: ':common', configuration: 'namedElements'))   // Architectury:
 *                                          // “Unresolved dependency: project ':common'”
 *   compileOnly project(':common')         // ModDevGradle next to Loom: the reference
 *                                          // is silently missing
 *
 * Lumen hands jdtls an init script for its import that adds every module a
 * project depends on — and the model left out — to the Eclipse classpath as a
 * project reference. Only jdtls' import runs it; builds from the terminal or
 * the run panel never see it.
 *
 * jdtls re-imports a build only when one of its files changes — a workspace
 * imported before the script (or with an older version of it) would keep the
 * broken classpath. So each jdtls workspace carries a stamp with the script
 * version it was imported with; `lsp:javaImportState` tells the renderer
 * before the start whether the workspace is behind, and the renderer
 * re-imports once and stamps it (`lsp:javaImportDone`).
 */

import { app, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { javacBackendRange, zipEntry, type JavacBackend } from './javac-backend'
import { ensureJdtlsAgent } from './jdtls-agent'

/** Raise with every change to the script — workspaces imported with an older one are re-imported. */
export const INIT_SCRIPT_VERSION = 3

const INIT_SCRIPT = `// lumen-jdtls-init v${INIT_SCRIPT_VERSION}
// Written by Lumen for the Java language server's Gradle import — see
// electron/features/jdtls-support.ts. Modules a project depends on are added
// to its Eclipse classpath as project references where Gradle's model lacks them.

// jdtls runs with -Declipse.application, and the tooling API hands that to the
// build: ModDevGradle then believes it runs in Eclipse and writes
// .eclipse/configurations/*.launch into the project. Hide it — the IDE sync
// that makes the Minecraft jars is kept below.
System.clearProperty('eclipse.application')

allprojects { p ->
  ['net.neoforged.moddev', 'net.neoforged.moddev.legacyforge'].each { id ->
    p.plugins.withId(id) {
      p.apply plugin: 'eclipse'
      p.afterEvaluate {
        if (p.tasks.names.contains('neoForgeIdeSync')) p.eclipse.synchronizationTasks(p.tasks.named('neoForgeIdeSync'))
      }
    }
  }
}

allprojects { p ->
  p.apply plugin: 'eclipse'
  p.afterEvaluate {
    def pathOf = { d -> d.metaClass.respondsTo(d, 'getPath') ? d.path : d.dependencyProject.path }
    def excluded = p.eclipse.classpath.minusConfigurations.collectMany { c ->
      c.allDependencies.withType(ProjectDependency).collect { pathOf(it) }
    } as Set
    def targets = [] as LinkedHashSet
    // Every module on the classpaths the Eclipse model is made of…
    p.eclipse.classpath.plusConfigurations.each { c ->
      c.allDependencies.withType(ProjectDependency).each { d -> targets << pathOf(d) }
    }
    // …and those reached through a named configuration anywhere (Architectury's \`common\`).
    p.configurations.each { c ->
      c.dependencies.withType(ProjectDependency).each { d ->
        if (d.targetConfiguration != null) targets << pathOf(d)
      }
    }
    targets.remove(p.path)
    targets.removeAll(excluded)
    if (targets.isEmpty()) return
    p.eclipse.classpath.file.whenMerged { classpath ->
      // Gradle's stand-in for an edge it could not resolve (“unresolved dependency - project ' core'”) —
      // replaced by the project reference below, so it goes.
      def labels = targets.collect { "project '" + it.replace(':', ' ') + "'" }
      classpath.entries.removeAll { entry ->
        entry instanceof org.gradle.plugins.ide.eclipse.model.Library &&
          entry.path?.contains('unresolved dependency') && labels.any { label -> entry.path.endsWith(label) }
      }
      def present = classpath.entries.findAll { it instanceof org.gradle.plugins.ide.eclipse.model.ProjectDependency }*.path as Set
      targets.each { target ->
        def other = p.findProject(target)
        if (other == null) return
        other.apply plugin: 'eclipse'
        def reference = '/' + other.eclipse.project.name
        if (present.contains(reference)) return
        present << reference
        classpath.entries.add(new org.gradle.plugins.ide.eclipse.model.ProjectDependency(reference))
      }
    }
  }
}
`

const scriptFile = () => path.join(app.getPath('userData'), 'lsp', 'lumen-jdtls-init.gradle')

/** Write the init script (when missing or outdated) and return its path. */
async function ensureInitScript(): Promise<string> {
  const file = scriptFile()
  const current = await fs.readFile(file, 'utf8').catch(() => null)
  if (current === INIT_SCRIPT) return file
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, INIT_SCRIPT, 'utf8')
  return file
}

/** The stamp file in a jdtls data folder. */
const stampFile = (dataDir: string) => path.join(dataDir, 'lumen-import.json')

/** A data folder below userData/lsp — the renderer names it, so it is checked. */
function dataFolder(dir: string): string {
  const base = path.join(app.getPath('userData'), 'lsp')
  const target = path.resolve(String(dir))
  const relative = path.relative(base, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Not a language server data folder')
  return target
}

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false)
}

async function stampWorkspace(dataDir: string) {
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(stampFile(dataDir), `${JSON.stringify({ gradleInitScript: INIT_SCRIPT_VERSION })}\n`, 'utf8')
}

/**
 * Whether a jdtls workspace was imported with the current init script. A
 * workspace that does not exist yet will be — it is stamped right away.
 */
async function importState(dataDir: string): Promise<'current' | 'stale'> {
  if (!(await exists(path.join(dataDir, '.metadata')))) {
    await stampWorkspace(dataDir)
    return 'current'
  }
  const raw = await fs.readFile(stampFile(dataDir), 'utf8').catch(() => null)
  const stamp = raw ? (JSON.parse(raw) as { gradleInitScript?: number }) : null
  if (stamp?.gradleInitScript === INIT_SCRIPT_VERSION) return 'current'
  return 'stale'
}

/** A program's path — as given when it names one, otherwise the first hit on the PATH. */
async function locate(command: string): Promise<string | null> {
  if (command.includes('/') || command.includes('\\')) return command
  const suffixes = process.platform === 'win32' ? ['', '.bat', '.cmd', '.exe'] : ['']
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  for (const dir of dirs) {
    for (const suffix of suffixes) {
      const candidate = path.join(dir, command + suffix)
      if (await exists(candidate)) return candidate
    }
  }
  return null
}

/** The `plugins/` folder of the jdtls behind a launcher — the launcher sits in `bin/` next to it. */
async function pluginsOf(command: string): Promise<string | null> {
  const located = await locate(String(command))
  const launcher = located ? await fs.realpath(located).catch(() => null) : null
  if (!launcher) return null
  const plugins = path.join(path.dirname(path.dirname(launcher)), 'plugins')
  if (!(await exists(plugins))) return null
  return plugins
}

/**
 * The agent that repairs the javac backend (`jdtls-agent.ts`), built with the
 * JDK at `javaHome` against the ASM bundle of this jdtls.
 */
async function javacAgent(command: string, javaHome: string): Promise<string | null> {
  const plugins = await pluginsOf(command)
  if (!plugins) return null
  const bundles = await fs.readdir(plugins).catch(() => [] as string[])
  const asm = bundles.find((name) => /^org\.objectweb\.asm_[\d.]+.*\.jar$/.test(name))
  if (!asm) return null
  return ensureJdtlsAgent(path.join(app.getPath('userData'), 'lsp', 'javac-agent'), String(javaHome), path.join(plugins, asm))
}

/**
 * The javac backend of the jdtls behind a launcher — the launcher sits in
 * `bin/`, the bundles next to it in `plugins/`. The backend reaches into
 * javac's internals, so it only runs on the JDKs its manifest names: on a
 * newer one, compiling fails with `NoSuchFieldError`.
 */
async function javacBackend(command: string): Promise<JavacBackend | null> {
  const plugins = await pluginsOf(command)
  if (!plugins) return null
  const bundles = await fs.readdir(plugins).catch(() => [] as string[])
  const bundle = bundles.find((name) => name.startsWith('org.eclipse.jdt.core.javac_') && name.endsWith('.jar'))
  if (!bundle) return null
  const archive = await fs.readFile(path.join(plugins, bundle)).catch(() => null)
  const manifest = archive ? zipEntry(archive, 'META-INF/MANIFEST.MF') : null
  if (!manifest) return null
  return javacBackendRange(manifest.toString('utf8'))
}

/* ------------------------------------------------------------------ *
 * Eclipse metadata in the project
 * ------------------------------------------------------------------ */

/** Folders never searched for module metadata. */
const METADATA_SKIP = new Set(['.git', '.gradle', '.idea', 'build', 'bin', 'out', 'target', 'node_modules', 'run', 'src'])

/** A `.project` that Buildship, m2e or jdtls wrote — not one somebody keeps for Eclipse on purpose. */
const GENERATED_PROJECT = /buildship|__CREATED_BY_JAVA_LANGUAGE_SERVER__|org\.eclipse\.m2e\.core/

async function isGeneratedSettings(dir: string): Promise<boolean> {
  const names = await fs.readdir(dir).catch(() => null)
  if (!names?.length) return false
  return names.every((name) => /^org\.eclipse\.[\w.]+\.prefs$/.test(name))
}

/** ModDevGradle's `.eclipse/configurations/*.launch` — the launch files it writes when it thinks it runs in Eclipse. */
async function isGeneratedLaunches(dir: string): Promise<boolean> {
  const names = await fs.readdir(dir).catch(() => null)
  if (!names || names.some((name) => name !== 'configurations')) return false
  const launches = await fs.readdir(path.join(dir, 'configurations')).catch(() => [] as string[])
  return launches.every((name) => name.endsWith('.launch'))
}

/**
 * The metadata jdtls and its Gradle/Maven import left in a module folder:
 * `.project` (when generated), with it `.classpath`, `.factorypath` and a
 * `.settings` of Eclipse preferences only, and ModDevGradle's `.eclipse`.
 */
async function moduleMetadata(dir: string): Promise<string[]> {
  const found: string[] = []
  const project = await fs.readFile(path.join(dir, '.project'), 'utf8').catch(() => null)
  if (project !== null && GENERATED_PROJECT.test(project)) {
    found.push(path.join(dir, '.project'))
    for (const name of ['.classpath', '.factorypath']) {
      if (await exists(path.join(dir, name))) found.push(path.join(dir, name))
    }
    if (await isGeneratedSettings(path.join(dir, '.settings'))) found.push(path.join(dir, '.settings'))
  }
  if (await isGeneratedLaunches(path.join(dir, '.eclipse'))) found.push(path.join(dir, '.eclipse'))
  return found
}

/** Generated metadata in the root and in module folders up to three levels down. */
async function findMetadata(root: string, depth = 0): Promise<string[]> {
  const found = await moduleMetadata(root)
  if (depth >= 3) return found
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || METADATA_SKIP.has(entry.name)) continue
    found.push(...await findMetadata(path.join(root, entry.name), depth + 1))
  }
  return found
}

/** Of `files`, those git tracks — they are part of the project and stay. */
async function trackedByGit(root: string, files: string[]): Promise<Set<string>> {
  if (!files.length) return new Set()
  const relative = files.map((file) => path.relative(root, file))
  const result = await promisify(execFile)('git', ['-C', root, 'ls-files', '-z', '--', ...relative], { timeout: 10_000 })
    .catch(() => ({ stdout: '' }))
  const listed = String(result.stdout).split('\0').filter(Boolean)
  return new Set(files.filter((_file, index) => listed.some((entry) => entry === relative[index] || entry.startsWith(`${relative[index]}/`))))
}

/**
 * Remove what jdtls generated in the project, before it starts. jdtls now
 * keeps these files in its own workspace
 * (`-Djava.import.generatesMetadataFilesAtProjectRoot=false`), but files
 * already on disk win over that — so the old ones have to go once. Files git
 * tracks stay, and are reported.
 */
async function cleanMetadata(root: string): Promise<{ removed: string[]; kept: string[] }> {
  const found = await findMetadata(path.resolve(String(root)))
  const tracked = await trackedByGit(root, found)
  const removed: string[] = []
  for (const file of found) {
    if (tracked.has(file)) continue
    await fs.rm(file, { recursive: true, force: true })
    removed.push(file)
  }
  return { removed, kept: [...tracked] }
}

export function registerJdtlsIpc() {
  ipcMain.handle('lsp:gradleInitScript', () => ensureInitScript())
  ipcMain.handle('lsp:javaImportState', (_e, dataDir: string) => importState(dataFolder(dataDir)).catch(() => 'current' as const))
  ipcMain.handle('lsp:javaImportDone', (_e, dataDir: string) => stampWorkspace(dataFolder(dataDir)))
  ipcMain.handle('lsp:javaCleanMetadata', (_e, root: string) => cleanMetadata(root))
  ipcMain.handle('lsp:jdtlsJavacBackend', (_e, command: string) => javacBackend(command).catch(() => null))
  ipcMain.handle('lsp:jdtlsJavacAgent', (_e, command: string, javaHome: string) => javacAgent(command, javaHome).catch(() => null))
}
