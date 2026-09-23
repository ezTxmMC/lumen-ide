/**
 * Multi-module JVM builds: the module tree of a Maven reactor (`<modules>`,
 * nested aggregators included) and of a Gradle build (`include` in the
 * settings script), each module with tasks scoped to it.
 *
 * The text parsers are pure and tested in `scripts/check-project.ts`; the
 * walkers read the module build files through a `ProjectContext`.
 */

import type { ProjectContext, ProjectDependency, ProjectModule, ProjectTask } from '@/core/types'
import { parseXml, xmlChild, xmlText } from '@/core/project/detect'
import {
  closingBrace, mavenGoal, parseGradleCustomTasks, parseMavenPlugins, parseMavenProfiles, stripComments,
} from './jvm-tasks'
import { appliedPlugins, impliedPlugins, inheritedPlugins, pluginTasks } from './gradle-plugins'

/** Deep reactors exist, endless ones should not hang detection. */
const MAX_DEPTH = 8
const MAX_MODULES = 400

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

/** Join and normalise a relative path (`a/b` + `../c` → `a/c`), always with `/`. */
export function joinRelative(base: string, relative: string): string {
  const parts: string[] = []
  for (const part of `${base}/${relative}`.split(/[\\/]+/)) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

const inFolder = (dir: string, file: string) => (dir ? `${dir}/${file}` : file)

/* ------------------------------------------------------------------ *
 * Maven
 * ------------------------------------------------------------------ */

export interface PomSummary {
  artifactId?: string
  groupId?: string
  name?: string
  version?: string
  packaging: string
  /** Module paths as written, `/pom.xml` stripped. */
  modules: string[]
  dependencies: ProjectDependency[]
}

/** The parts of a pom the module tree needs. */
export function readPom(text: string): PomSummary | null {
  const root = parseXml(text)
  if (!root) return null
  const parent = xmlChild(root, 'parent')
  const modules = Array.from(xmlChild(root, 'modules')?.children ?? [])
    .filter((child) => child.localName === 'module')
    .map((child) => child.textContent?.trim() ?? '')
    .filter(Boolean)
    .map((module) => module.replace(/[\\/]pom\.xml$/, ''))
  const dependencies = Array.from(xmlChild(root, 'dependencies')?.children ?? [])
    .filter((child) => child.localName === 'dependency')
    .map((dep) => ({
      name: `${xmlText(dep, 'groupId') ?? ''}:${xmlText(dep, 'artifactId') ?? ''}`,
      version: xmlText(dep, 'version'),
      scope: xmlText(dep, 'scope') ?? 'compile',
    }))
  return {
    artifactId: xmlText(root, 'artifactId'),
    groupId: xmlText(root, 'groupId') ?? xmlText(parent, 'groupId'),
    name: xmlText(root, 'name'),
    version: xmlText(root, 'version') ?? xmlText(parent, 'version'),
    packaging: xmlText(root, 'packaging') ?? 'jar',
    modules,
    dependencies,
  }
}

/** Custom tasks of one pom: plugin goals and profiles, scoped with `scope` (`-pl x`). */
export function mavenCustomTasks(pom: string, mvn: string, idPrefix: string, scope: string[] = []): ProjectTask[] {
  const tasks: ProjectTask[] = []
  for (const plugin of parseMavenPlugins(pom)) {
    for (const goal of plugin.goals) {
      const typed = mavenGoal(plugin, goal)
      tasks.push({
        id: `${idPrefix}:goal:${typed}`,
        label: typed,
        command: mvn,
        args: [...scope, typed],
        group: /(^|:)(run|dev|start|java|exec|devmode)(@|$)/.test(goal) ? 'run' : 'other',
        category: plugin.prefix ?? plugin.artifactId,
        detail: `mvn ${[...scope, typed].join(' ')}`,
      })
    }
  }
  for (const profile of parseMavenProfiles(pom)) {
    const args = [...scope, '-P', profile.id, 'package']
    tasks.push({
      id: `${idPrefix}:profile:${profile.id}`,
      label: `package -P ${profile.id}`,
      command: mvn,
      args,
      group: 'build',
      category: 'profiles',
      detail: `mvn ${args.join(' ')}`,
    })
  }
  return tasks
}

/** Runner plugins, in order of preference, and the goal that starts the module. */
const MAVEN_RUNNERS: [string, string][] = [
  ['spring-boot', 'spring-boot:run'],
  ['quarkus', 'quarkus:dev'],
  ['javafx', 'javafx:run'],
  ['jetty', 'jetty:run'],
  ['exec', 'exec:java'],
]

/** The standard tasks of a Maven module, reactor-scoped with `-pl <path> -am`. */
export function mavenModuleTasks(path: string, pom: PomSummary, pomText: string, mvn: string): ProjectTask[] {
  const id = `maven:${path}`
  const pl = ['-pl', path]
  const withDeps = [...pl, '-am']
  const task = (key: string, label: string, args: string[], group: ProjectTask['group']): ProjectTask =>
    ({ id: `${id}:${key}`, label, command: mvn, args, group, detail: `mvn ${args.join(' ')}` })
  const tasks: ProjectTask[] = [
    task('compile', 'templates.tasks.compile', ['-q', ...withDeps, 'compile'], 'build'),
    task('package', 'templates.tasks.buildPackage', ['-q', ...withDeps, 'package', '-DskipTests'], 'build'),
    task('install', 'templates.jvm.installLocal', ['-q', ...withDeps, 'install', '-DskipTests'], 'build'),
    task('test', 'templates.tasks.tests', [...withDeps, 'test', '-Dsurefire.failIfNoSpecifiedTests=false'], 'test'),
    task('clean', 'templates.tasks.clean', ['-q', ...pl, 'clean'], 'clean'),
    task('tree', 'templates.jvm.dependencyTree', [...pl, 'dependency:tree'], 'other'),
  ]
  const plugins = new Set(parseMavenPlugins(pomText).map((plugin) => plugin.prefix))
  const runner = MAVEN_RUNNERS.find(([prefix]) => plugins.has(prefix))
  if (runner && pom.packaging !== 'pom') tasks.splice(3, 0, task('run', 'templates.tasks.run', [...pl, runner[1]], 'run'))
  return [...tasks, ...mavenCustomTasks(pomText, mvn, id, pl)]
}

/** The module tree of a Maven reactor, starting at the root pom. */
export async function mavenModuleTree(ctx: ProjectContext, mvn: string): Promise<ProjectModule[]> {
  const root = await ctx.readFile('pom.xml')
  const summary = root ? readPom(root) : null
  if (!summary) return []
  const seen = new Set<string>([''])
  return mavenChildren(ctx, mvn, '', summary.modules, seen, 1)
}

async function mavenChildren(
  ctx: ProjectContext, mvn: string, dir: string, names: string[], seen: Set<string>, depth: number,
): Promise<ProjectModule[]> {
  if (depth > MAX_DEPTH) return []
  const out: ProjectModule[] = []
  for (const name of names) {
    const path = joinRelative(dir, name)
    if (!path || seen.has(path) || seen.size > MAX_MODULES) continue
    seen.add(path)
    const text = await ctx.readFile(inFolder(path, 'pom.xml'))
    const pom = text ? readPom(text) : null
    if (!text || !pom) {
      out.push({ id: path, name: name.split('/').pop() ?? name, path, kind: 'missing', tasks: [] })
      continue
    }
    const children = await mavenChildren(ctx, mvn, path, pom.modules, seen, depth + 1)
    out.push({
      id: path,
      name: pom.name ?? pom.artifactId ?? path,
      path,
      kind: pom.packaging,
      tasks: mavenModuleTasks(path, pom, text, mvn),
      facts: {
        ...(pom.artifactId ? { artifactId: pom.artifactId } : {}),
        ...(pom.version ? { version: pom.version } : {}),
      },
      dependencies: pom.dependencies,
      buildFile: inFolder(path, 'pom.xml'),
      ...(children.length ? { modules: children } : {}),
    })
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

export interface GradleSettings {
  rootName?: string
  /** Project paths in the order written, normalised to start with `:` (`:app:core`). */
  includes: string[]
  /** `project(':x').projectDir = file('…')` overrides. */
  dirs: Record<string, string>
  /** Composite builds (`includeBuild`). */
  includedBuilds: string[]
}

/** The strings of an argument list, quoted in either style. */
const stringsIn = (text: string) => Array.from(text.matchAll(/["']([^"'\n]+)["']/g)).map((m) => m[1])

/** Normalise a Gradle project path: `a:b` → `:a:b`. */
export const gradlePath = (raw: string) => (raw.startsWith(':') ? raw : `:${raw}`)

/**
 * Read a settings script: `include("a", ":b:c")`, `include 'a', 'b'`
 * (continued over lines), `project(':x').projectDir = file('lib/x')` and
 * `includeBuild('…')`.
 */
export function parseGradleSettings(source: string): GradleSettings {
  const text = stripComments(source)
  const includes: string[] = []
  // Either a parenthesised list (over several lines) or the rest of the line,
  // continued while a line ends in a comma.
  for (const match of text.matchAll(/\binclude\b(?=\s*[("'])\s*(?:\(([\s\S]*?)\)|((?:[^\n]*,[ \t]*\r?\n)*[^\n]*))/g)) {
    for (const value of stringsIn(match[1] ?? match[2] ?? '')) {
      const path = gradlePath(value.trim())
      if (!includes.includes(path)) includes.push(path)
    }
  }
  const dirs: Record<string, string> = {}
  const override = /project\(\s*["']([^"']+)["']\s*\)\s*\.\s*projectDir\s*=\s*(?:new\s+File\s*\(\s*(?:rootDir|settingsDir)\s*,\s*|(?:file|File)\s*\(\s*)["']([^"']+)["']/g
  for (const match of text.matchAll(override)) dirs[gradlePath(match[1])] = joinRelative('', match[2])
  const includedBuilds = Array.from(text.matchAll(/\bincludeBuild\s*\(?\s*["']([^"']+)["']/g)).map((m) => m[1])
  const rootName = /rootProject\s*\.\s*name\s*=\s*["']([^"']+)["']/.exec(text)?.[1]
  return { rootName, includes, dirs, includedBuilds }
}

/** The folder of a project path: the override, otherwise `:a:b` → `a/b`. */
export function gradleProjectDir(path: string, dirs: Record<string, string>): string {
  return dirs[path] ?? path.split(':').filter(Boolean).join('/')
}

/** Plugin ids a build script applies, from `plugins { … }` and `apply plugin:`. */
export function parseGradlePlugins(source: string): string[] {
  const text = stripComments(source)
  const found = new Set<string>()
  const block = /\bplugins\s*\{/.exec(text)
  const start = block ? block.index + block[0].length : -1
  const end = start === -1 ? -1 : closingBrace(text, start)
  const plugins = end === -1 ? '' : text.slice(start, end)
  for (const m of plugins.matchAll(/\bid\s*\(?\s*["']([^"']+)["']/g)) found.add(m[1])
  for (const m of plugins.matchAll(/\bkotlin\s*\(\s*["']([^"']+)["']\s*\)/g)) found.add(`org.jetbrains.kotlin.${m[1]}`)
  for (const m of plugins.matchAll(/`([\w-]+)`/g)) found.add(m[1])
  for (const m of plugins.matchAll(/\balias\s*\(\s*libs\.plugins\.([\w.]+)\s*\)/g)) found.add(m[1].replace(/\./g, '-'))
  for (const m of plugins.matchAll(/^[ \t]*([a-z][\w-]*)[ \t]*$/gm)) found.add(m[1])
  for (const m of text.matchAll(/\bapply\s*\(?\s*plugin\s*[:=]\s*["']([^"']+)["']/g)) found.add(m[1])
  return [...found]
}

/** Plugin → the module flavour it signals, strongest first. */
const GRADLE_FLAVOURS: [(plugins: string[]) => boolean, string][] = [
  [(p) => p.some((id) => /loom$|^net\.neoforged\.(moddev|gradle)|^net\.minecraftforge\.gradle|spongepowered\.gradle\.vanilla/.test(id)), 'minecraft-mod'],
  [(p) => p.some((id) => id === 'org.springframework.boot' || /spring-boot/.test(id)), 'spring-boot'],
  [(p) => p.includes('com.android.application') || p.some((id) => /android-application/.test(id)), 'android-app'],
  [(p) => p.includes('com.android.library') || p.some((id) => /android-library/.test(id)), 'android-library'],
  [(p) => p.includes('io.quarkus') || p.some((id) => /quarkus/.test(id)), 'quarkus'],
  [(p) => p.includes('application'), 'application'],
  [(p) => p.includes('java-platform'), 'platform'],
  [(p) => p.includes('java-library'), 'library'],
  [(p) => p.includes('war'), 'war'],
  [(p) => p.some((id) => id === 'java' || id.startsWith('org.jetbrains.kotlin') || /kotlin/.test(id)), 'jvm'],
]

export function gradleFlavour(plugins: string[]): string | undefined {
  return GRADLE_FLAVOURS.find(([test]) => test(plugins))?.[1]
}

/** The task that starts a module of this flavour. */
const GRADLE_RUN_TASK: Record<string, string> = {
  'spring-boot': 'bootRun',
  quarkus: 'quarkusDev',
  application: 'run',
}

/**
 * The tasks the module's plugins bring — `runClient`/`runServer` of a mod,
 * `bootRun`, `shadowJar` … Run tasks join the standard list; the rest are
 * listed under their plugin. `skip` holds the names already there.
 */
export function gradlePluginTasks(
  script: string, gradle: string, path: string, inherited: string[], skip: Set<string> = new Set(),
): ProjectTask[] {
  return pluginTasks(script, inherited)
    .filter((info) => !skip.has(info.name))
    .map((info) => {
      const target = path ? `${path}:${info.name}` : info.name
      const isRun = info.runGroup === 'run'
      return {
        id: `gradle${path}:plugin:${info.name}`,
        label: info.name,
        command: gradle,
        args: ['--console=plain', target],
        group: info.runGroup,
        ...(isRun ? {} : { category: info.group }),
        detail: info.description ?? `gradle ${target} · ${info.group}`,
      }
    })
}

/** Standard, plugin and custom tasks of one Gradle project. */
export function gradleModuleTasks(
  path: string, flavour: string | undefined, script: string, gradle: string, inherited: string[] = [],
): ProjectTask[] {
  const plain = ['--console=plain']
  const task = (name: string, label: string, group: ProjectTask['group'], quiet = true): ProjectTask => {
    const args = [...(quiet ? ['-q'] : []), ...plain, `${path}:${name}`]
    return { id: `gradle${path}:${name}`, label, command: gradle, args, group, detail: `gradle ${path}:${name}` }
  }
  const tasks: ProjectTask[] = [
    task('build', 'templates.tasks.build', 'build'),
    task('assemble', 'templates.jvm.assemble', 'build'),
    task('test', 'templates.tasks.tests', 'test', false),
    task('check', 'templates.tasks.check', 'test'),
    task('clean', 'templates.tasks.clean', 'clean'),
    task('dependencies', 'templates.tasks.dependencies', 'other', false),
  ]
  const run = flavour ? GRADLE_RUN_TASK[flavour] : undefined
  if (run) tasks.splice(2, 0, task(run, 'templates.tasks.run', 'run'))
  const standard = new Set(tasks.map((entry) => entry.args[entry.args.length - 1].split(':').pop() ?? ''))
  const fromPlugins = gradlePluginTasks(script, gradle, path, inherited, standard)
  const custom = gradleCustomTasks(script, gradle, path)
    .filter((entry) => !fromPlugins.some((plugin) => plugin.label === entry.label))
  return [...tasks, ...fromPlugins, ...custom]
}

/** Custom tasks of a script as runnable tasks; `path` is `''` for the root project. */
export function gradleCustomTasks(script: string, gradle: string, path = ''): ProjectTask[] {
  return parseGradleCustomTasks(script).map((info) => {
    const target = path ? `${path}:${info.name}` : info.name
    return {
      id: `gradle${path}:custom:${info.name}`,
      label: info.name,
      command: gradle,
      args: ['--console=plain', target],
      group: 'other' as const,
      category: info.group ?? 'custom',
      detail: info.description ?? `gradle ${target}`,
    }
  })
}

const GRADLE_DEPENDENCY = /^\s*(implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly)\s*\(?\s*(?:["']([^"']+)["']|project\s*\(\s*["']([^"']+)["']\s*\))/gm

/** Dependencies of a build script, project dependencies (`project(":core")`) included. */
export function gradleDependencies(script: string): ProjectDependency[] {
  return Array.from(stripComments(script).matchAll(GRADLE_DEPENDENCY)).map((m) => {
    if (m[3]) return { name: gradlePath(m[3]), scope: m[1] }
    const [group, artifact, version] = (m[2] ?? '').split(':')
    return { name: `${group}:${artifact ?? ''}`, version, scope: m[1] }
  })
}

/** The module tree of a Gradle build, from its settings script. */
export async function gradleModuleTree(ctx: ProjectContext, gradle: string): Promise<ProjectModule[]> {
  const settings = (await ctx.readFile('settings.gradle.kts')) ?? (await ctx.readFile('settings.gradle'))
  if (!settings) return []
  const parsed = parseGradleSettings(settings)
  if (!parsed.includes.length) return []
  const rootScript = (await ctx.readFile('build.gradle.kts')) ?? (await ctx.readFile('build.gradle')) ?? ''
  // Plugins the root applies to every subproject — Loom in Architectury builds, say.
  const inherited = inheritedPlugins(rootScript)

  // `include(":a:b")` implies `:a` as well — Gradle creates the parent projects.
  const paths: string[] = []
  for (const path of parsed.includes.slice(0, MAX_MODULES)) {
    const segments = path.split(':').filter(Boolean)
    for (let i = 1; i <= segments.length; i++) {
      const prefix = `:${segments.slice(0, i).join(':')}`
      if (!paths.includes(prefix)) paths.push(prefix)
    }
  }

  const modules = new Map<string, ProjectModule>()
  for (const path of paths) modules.set(path, await gradleModule(ctx, gradle, path, parsed.dirs, inherited))

  const roots: ProjectModule[] = []
  for (const path of paths) {
    const module = modules.get(path)!
    const parent = modules.get(path.slice(0, path.lastIndexOf(':')))
    if (!parent) {
      roots.push(module)
      continue
    }
    parent.modules = [...(parent.modules ?? []), module]
  }
  return roots
}

async function gradleModule(
  ctx: ProjectContext, gradle: string, path: string, dirs: Record<string, string>, inherited: string[],
): Promise<ProjectModule> {
  const dir = gradleProjectDir(path, dirs)
  const kts = await ctx.readFile(inFolder(dir, 'build.gradle.kts'))
  const script = kts ?? (await ctx.readFile(inFolder(dir, 'build.gradle')))
  const name = path.split(':').pop() ?? path
  if (script === null) return { id: path, name, path: dir, kind: 'container', tasks: [] }
  const plugins = [...new Set([...appliedPlugins(script), ...inherited, ...impliedPlugins(script)])]
  const flavour = gradleFlavour(plugins)
  return {
    id: path,
    name,
    path: dir,
    kind: flavour,
    tasks: gradleModuleTasks(path, flavour, script, gradle, inherited),
    facts: plugins.length ? { plugins: plugins.join(', ') } : undefined,
    dependencies: gradleDependencies(script),
    buildFile: inFolder(dir, kts !== null ? 'build.gradle.kts' : 'build.gradle'),
  }
}

/** Every module of a tree, depth first. */
export function flattenModules(modules: ProjectModule[]): ProjectModule[] {
  return modules.flatMap((module) => [module, ...flattenModules(module.modules ?? [])])
}
