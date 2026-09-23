/**
 * Project detection: which project kinds (Maven, CMake, npm …) fit the opened
 * folder, and what tasks and metadata follow from them.
 *
 * The kinds themselves come from the add-ons (`Addon.projectKinds`).
 */

import type { ProjectContext, ProjectKind, ProjectMeta, ProjectModule, ProjectTask } from '@/core/types'

export interface DetectedKind {
  kind: ProjectKind
  /** Markers that were actually found. */
  markers: string[]
  tasks: ProjectTask[]
  meta: ProjectMeta
}

export interface ProjectInfo {
  root: string
  name: string
  /** Every matching kind, most important first. */
  kinds: DetectedKind[]
  primary: DetectedKind | null
  /** Tasks of every kind, excluding the custom ones from the project configuration. */
  tasks: ProjectTask[]
  meta: ProjectMeta
  /** Modules of a multi-module build (Maven reactor, Gradle includes), as a tree. */
  modules: ProjectModule[]
  /** Tasks found in the build files beyond the standard ones (Gradle tasks, plugin goals, profiles). */
  customTasks: ProjectTask[]
  /** Languages belonging to the recognised kinds. */
  languages: string[]
  detectedAt: number
}

function join(root: string, relative: string) {
  if (!relative) return root
  return `${root.replace(/[\\/]$/, '')}/${relative.replace(/^[\\/]/, '')}`
}

export function projectContext(root: string, platform: string): ProjectContext {
  const readCache = new Map<string, Promise<string | null>>()
  return {
    root,
    platform,
    readFile(relative) {
      const hit = readCache.get(relative)
      if (hit) return hit
      const read = window.lumen.fs.readFile(join(root, relative)).catch(() => null)
      readCache.set(relative, read)
      return read
    },
    exists(relative) {
      return window.lumen.fs.exists(join(root, relative)).catch(() => false)
    },
    list(relative) {
      return window.lumen.fs.list(join(root, relative)).catch(() => [])
    },
  }
}

/** Check a marker against file names — `*` stands for any run of characters. */
export function markerMatches(marker: string, name: string): boolean {
  if (!marker.includes('*')) return marker === name
  const source = marker.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp(`^${source}$`).test(name)
}

/** The first file in the root matching the pattern (`*.csproj`). */
export async function findFile(ctx: ProjectContext, pattern: string): Promise<string | null> {
  const entries = await ctx.list('')
  return entries.find((e) => !e.isDirectory && markerMatches(pattern, e.name))?.name ?? null
}

export async function detectProject(
  root: string,
  kinds: ProjectKind[],
  platform: string,
): Promise<ProjectInfo> {
  const ctx = projectContext(root, platform)
  const names = (await ctx.list('')).map((e) => e.name)

  // One entry per kind — Java and Kotlin both bring Gradle, for instance.
  const unique = [...new Map(kinds.map((k) => [k.id, k])).values()]
  const candidates = unique
    .map((kind) => ({
      kind,
      markers: kind.markers.filter((m) => names.some((n) => markerMatches(m, n))),
    }))
    .filter((m) => m.markers.length > 0)
  const confirmed = await Promise.all(
    candidates.map((m) => Promise.resolve(m.kind.detect ? m.kind.detect(ctx) : true).catch(() => false)),
  )
  const matched = candidates
    .filter((_, i) => confirmed[i])
    .sort((a, b) => (b.kind.priority ?? 0) - (a.kind.priority ?? 0))

  const detected: DetectedKind[] = await Promise.all(
    matched.map(async ({ kind, markers }) => {
      const [tasks, meta] = await Promise.all([
        Promise.resolve(kind.tasks(ctx)).catch(() => [] as ProjectTask[]),
        Promise.resolve(kind.inspect?.(ctx) ?? {}).catch(() => ({} as ProjectMeta)),
      ])
      return { kind, markers, tasks, meta }
    }),
  )

  // Build systems rank ahead of plain package managers as the primary kind.
  const primary = detected.find((d) => d.kind.role !== 'packages') ?? detected[0] ?? null
  const meta: ProjectMeta = {}
  // Metadata of the primary kind wins; the rest fills the gaps.
  const ordered = primary ? [primary, ...detected.filter((d) => d !== primary)] : detected
  for (const d of [...ordered].reverse()) Object.assign(meta, stripEmpty(d.meta))
  const facts = Object.assign({}, ...[...ordered].reverse().map((d) => d.meta.facts ?? {}))
  if (Object.keys(facts).length) meta.facts = facts
  const dependencies = ordered.flatMap((d) => d.meta.dependencies ?? [])
  if (dependencies.length) meta.dependencies = dependencies
  const sourceRoots = [...new Set(ordered.flatMap((d) => d.meta.sourceRoots ?? []))]
  if (sourceRoots.length) meta.sourceRoots = sourceRoots

  return {
    root,
    name: meta.name ?? root.split(/[\\/]/).filter(Boolean).pop() ?? root,
    kinds: ordered,
    primary,
    tasks: dedupe(ordered.flatMap((d) => d.tasks)),
    meta,
    modules: ordered.find((d) => d.meta.modules?.length)?.meta.modules ?? [],
    customTasks: dedupe(ordered.flatMap((d) => d.meta.customTasks ?? [])),
    languages: [...new Set(ordered.flatMap((d) => d.kind.languageIds ?? []))],
    detectedAt: Date.now(),
  }
}

function stripEmpty(meta: ProjectMeta): Partial<ProjectMeta> {
  const out: Partial<ProjectMeta> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    ;(out as Record<string, unknown>)[key] = value
  }
  return out
}

function dedupe(tasks: ProjectTask[]): ProjectTask[] {
  const seen = new Set<string>()
  return tasks.filter((t) => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })
}

/* ------------------------------------------------------------------ *
 * Helpers for add-ons
 * ------------------------------------------------------------------ */

/** `./gradlew` when present, otherwise `gradle` — likewise `mvnw`/`mvn`. */
export async function wrapperOr(ctx: ProjectContext, wrapper: string, fallback: string): Promise<string> {
  const name = ctx.platform === 'win32' ? `${wrapper}.bat` : wrapper
  if (!(await ctx.exists(name))) return fallback
  return ctx.platform === 'win32' ? name : `./${name}`
}

/** First XML element of this name directly under `parent`, ignoring namespaces. */
export function xmlChild(parent: Element | null, name: string): Element | null {
  if (!parent) return null
  for (const child of Array.from(parent.children)) {
    if (child.localName === name) return child
  }
  return null
}

export function xmlText(parent: Element | null, name: string): string | undefined {
  return xmlChild(parent, name)?.textContent?.trim() || undefined
}

export function parseXml(text: string): Element | null {
  try {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    if (doc.querySelector('parsererror')) return null
    return doc.documentElement
  } catch {
    return null
  }
}

/** Reads `key = "value"` or `key = value` out of Gradle/TOML-like text. */
export function grepValue(text: string, key: string): string | undefined {
  const m = new RegExp(`^\\s*${key}\\s*[=:]\\s*["']?([^"'\\n]+)["']?`, 'm').exec(text)
  return m?.[1]?.trim()
}

/** Indentation of the line that `index` falls in. */
export function indentAt(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1
  return /^[ \t]*/.exec(text.slice(lineStart))![0]
}

/**
 * Inserts `block` before the closing counterpart of `open` — before the `}` of
 * a `dependencies {` block, say, or before `</dependencies>`. Returns `null`
 * when the block is missing.
 */
export function insertIntoBlock(
  text: string, open: RegExp, close: string, line: string, unit = '    ',
): string | null {
  const match = open.exec(text)
  if (!match) return null
  const start = match.index + match[0].length
  const end = close === '}' ? matchingBrace(text, start) : text.indexOf(close, start)
  if (end === -1) return null
  const inner = `${indentAt(text, end)}${unit}`
  const lineStart = text.lastIndexOf('\n', end - 1) + 1
  const indented = line.split('\n').map((l) => `${inner}${l}`).join('\n')
  // The closing counterpart sits on the same line as the content: break it.
  if (lineStart <= start) {
    return `${text.slice(0, end)}\n${indented}\n${indentAt(text, end)}${text.slice(end)}`
  }
  return `${text.slice(0, lineStart)}${indented}\n${text.slice(lineStart)}`
}

/** Position of the `}` closing an already-open brace, searching from `start`. */
function matchingBrace(text: string, start: number): number {
  let depth = 1
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    if (text[i] === '}') depth--
    if (depth === 0) return i
  }
  return -1
}

/** Guess a file's indentation unit (tab, 2 or 4 spaces). */
export function indentUnitOf(text: string, fallback = '    '): string {
  if (/^\t/m.test(text)) return '\t'
  const sizes = Array.from(text.matchAll(/^( +)\S/gm)).map((m) => m[1].length)
  if (!sizes.length) return fallback
  return ' '.repeat(Math.min(...sizes))
}

/** Every line belonging to a TOML section (`[dependencies]`). */
export function tomlSection(text: string, section: string): string {
  const escaped = section.replace(/[.[\]]/g, '\\$&')
  const m = new RegExp(`^\\[${escaped}\\]\\s*$`, 'm').exec(text)
  if (!m) return ''
  const rest = text.slice(m.index + m[0].length)
  const next = /^\[/m.exec(rest)
  return next ? rest.slice(0, next.index) : rest
}
