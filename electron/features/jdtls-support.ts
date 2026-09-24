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
import fs from 'node:fs/promises'
import path from 'node:path'
import { javacBackendRange, zipEntry, type JavacBackend } from './javac-backend'
import { ensureJdtlsAgent } from './jdtls-agent'
import { cleanMetadata } from './jdtls-metadata'

/** Raise with every change to the script — workspaces imported with an older one are re-imported. */
export const INIT_SCRIPT_VERSION = 4

export const INIT_SCRIPT = `// lumen-jdtls-init v${INIT_SCRIPT_VERSION}
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

// Sources and javadoc of the dependencies for hover and go-to-definition, and
// the compiled classes of Buildship's model out of the project: without a
// directory of its own, every module gets a \`bin/\` next to its sources.
// Set before the build script runs, so a build that configures its own wins.
allprojects { p ->
  p.apply plugin: 'eclipse'
  p.eclipse.classpath {
    downloadSources = true
    downloadJavadoc = true
    try {
      def out = new File(p.layout.buildDirectory.get().asFile, 'eclipse')
      defaultOutputDir = new File(out, 'default')
      baseSourceOutputDir = out
    } catch (Throwable ignored) {}
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

export function registerJdtlsIpc() {
  ipcMain.handle('lsp:gradleInitScript', () => ensureInitScript())
  ipcMain.handle('lsp:javaImportState', (_e, dataDir: string) => importState(dataFolder(dataDir)).catch(() => 'current' as const))
  ipcMain.handle('lsp:javaImportDone', (_e, dataDir: string) => stampWorkspace(dataFolder(dataDir)))
  ipcMain.handle('lsp:javaCleanMetadata', (_e, root: string) => cleanMetadata(root))
  ipcMain.handle('lsp:jdtlsJavacBackend', (_e, command: string) => javacBackend(command).catch(() => null))
  ipcMain.handle('lsp:jdtlsJavacAgent', (_e, command: string, javaHome: string) => javacAgent(command, javaHome).catch(() => null))
}
