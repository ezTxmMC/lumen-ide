/**
 * User add-on (the data model) → an ordinary `Addon` object.
 *
 * The runnable parts — commands and events — are wired in through
 * `CompileDeps`, which keeps `compile` testable without a renderer.
 */

import type {
  Addon, DependencyAction, DependencySpec, DependencySupport, FormField, FormValues, LanguageSpec,
  ProjectContext, ProjectKind, ProjectMeta, ProjectTask, ProjectTemplate, TemplateContext, Theme,
} from '@/core/types'
import { resolveDebugAdapters } from '@/core/debug/builtin-adapters'
import { resolveTokenizer } from './tokenizers'
import { tr } from '@/i18n'
import type {
  UserAddonModel, UserCommand, UserCondition, UserDependencyEdit, UserDependencySupport,
  UserKindDependencyScan, UserKindTask, UserLanguage, UserProjectKind, UserTemplate, UserTemplateField,
} from './schema'

export interface CompileDeps {
  /** Runs a command's graph. */
  runCommand?(model: UserAddonModel, command: UserCommand): void | Promise<void>
  /** Starts the event graphs; the return value cleans up on deactivation. */
  startEvents?(model: UserAddonModel): () => void
  /** Loaded choices of a field with `choicesUrl`, or `undefined` while none have arrived. */
  remoteChoices?(field: UserTemplateField): { value: string; label: string }[] | undefined
  /** Resolves references to themes from the Theme Studio. */
  resolveTheme?(id: string): Theme | undefined
}

/** Regex source → RegExp; invalid ones fall away, and validation reports them. */
function regex(source: string | undefined, anchored: boolean): RegExp | undefined {
  if (!source) return undefined
  const pattern = anchored && !source.startsWith('^') ? `^(?:${source})` : source
  try {
    return new RegExp(pattern)
  } catch {
    return undefined
  }
}

const nonEmpty = <T,>(list: T[] | undefined): T[] | undefined => (list?.length ? list : undefined)

export function compileLanguage(lang: UserLanguage): LanguageSpec {
  const spec: LanguageSpec = {
    id: lang.id,
    name: lang.name,
    extensions: lang.extensions.map((e) => e.toLowerCase()),
    filenames: nonEmpty(lang.filenames),
    icon: lang.icon || undefined,
    color: lang.color || undefined,
    comments: lang.comments?.line || lang.comments?.block ? lang.comments : undefined,
    keywords: nonEmpty(lang.keywords),
    controls: nonEmpty(lang.controls),
    types: nonEmpty(lang.types),
    builtins: nonEmpty(lang.builtins),
    constants: nonEmpty(lang.constants),
    strings: nonEmpty(lang.strings),
    numbers: regex(lang.numbers, true),
    identifier: regex(lang.identifier, true),
    operators: regex(lang.operators, true),
    meta: regex(lang.meta, true),
    caseInsensitive: lang.caseInsensitive || undefined,
    capitalizedAsType: lang.capitalizedAsType || undefined,
    indentOpen: regex(lang.indentOpen, false),
    indentClose: regex(lang.indentClose, false),
    indentUnit: lang.indentUnit,
    completions: nonEmpty(lang.completions),
    snippets: nonEmpty(lang.snippets),
    run: nonEmpty(lang.run),
    lsp: nonEmpty(lang.lsp),
    debug: nonEmpty(resolveDebugAdapters(lang.debug)),
    priority: lang.priority,
  }
  // After the spec is whole: `jsx` wraps the language's own highlighting.
  const tokenizer = resolveTokenizer(lang.tokenizer, spec)
  if (tokenizer) spec.tokenizer = tokenizer
  // Drop undefined fields: parts of the tokenizer test with `in` and `??`.
  for (const key of Object.keys(spec) as (keyof LanguageSpec)[]) {
    if (spec[key] === undefined) delete spec[key]
  }
  return spec
}

/** Do all conditions hold? An empty list always does. */
export function conditionsHold(
  conditions: UserCondition | UserCondition[] | undefined, values: FormValues,
): boolean {
  if (!conditions) return true
  if (!Array.isArray(conditions)) return conditionHolds(conditions, values)
  return conditions.every((condition) => conditionHolds(condition, values))
}

/** Does the condition hold for these values? Without a comparison: set and not `false`. */
export function conditionHolds(condition: UserCondition | undefined, values: FormValues): boolean {
  if (!condition?.field) return true
  const value = values[condition.field] ?? ''
  if (condition.equals !== undefined) return value === condition.equals
  if (condition.notEquals !== undefined) return value !== condition.notEquals
  return value !== '' && value !== 'false'
}

/** `field`, `field=value` or `field!=value` from a block's head. */
function blockCondition(head: string): UserCondition {
  const unequal = /^([\w.-]+)\s*!=\s*(.*)$/.exec(head)
  if (unequal) return { field: unequal[1], notEquals: unequal[2].trim() }
  const equal = /^([\w.-]+)\s*=\s*(.*)$/.exec(head)
  if (equal) return { field: equal[1], equals: equal[2].trim() }
  return { field: head.trim() }
}

const BLOCK = /\{\{#(if|unless)\s+([^}]+?)\s*\}\}((?:(?!\{\{#(?:if|unless)\s)[\s\S])*?)\{\{\/\1\}\}/

/** Resolve blocks innermost first, so nesting works. */
function resolveBlocks(text: string, values: FormValues): string {
  let out = text
  for (let guard = 0; guard < 500; guard++) {
    const match = BLOCK.exec(out)
    if (!match) return out
    const holds = conditionHolds(blockCondition(match[2]), values)
    const keep = match[1] === 'if' ? holds : !holds
    out = out.slice(0, match.index) + (keep ? match[3] : '') + out.slice(match.index + match[0].length)
  }
  return out
}

/** Words of a value (`my-project`, `MyProject`, `my_project` → my, project). */
function words(value: string): string[] {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean)
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()

/** Filters after `|`: packages as paths, class names, spellings. */
export const PLACEHOLDER_FILTERS: Record<string, (value: string) => string> = {
  path: (value) => value.replace(/\./g, '/'),
  lower: (value) => value.toLowerCase(),
  upper: (value) => value.toUpperCase(),
  pascal: (value) => words(value).map(capitalize).join(''),
  camel: (value) => words(value).map((word, i) => (i === 0 ? word.toLowerCase() : capitalize(word))).join(''),
  snake: (value) => words(value).map((word) => word.toLowerCase()).join('_'),
  // Letters and digits only, lower case — for identifiers that tolerate no
  // separators; a Go package name may not contain an underscore.
  alnum: (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ''),
  kebab: (value) => words(value).map((word) => word.toLowerCase()).join('-'),
  // For values that end up inside a JSON string: a PHP namespace such as
  // `Acme\\Demo` has to appear there with doubled backslashes, or the file is
  // broken. The surrounding quotes are dropped — the template already has them.
  json: (value) => JSON.stringify(value).slice(1, -1),
}

/**
 * Replaces `{{name}}`, `{{slug}}`, `{{dir}}` and `{{field}}` — filters included,
 * as in `{{group|path}}` or `{{name|pascal}}` — and resolves `{{#if}}` and
 * `{{#unless}}` blocks.
 */
export function fillPlaceholders(text: string, ctx: TemplateContext): string {
  const values: FormValues = { ...ctx.values, name: ctx.name, slug: ctx.slug, dir: ctx.dir }
  return resolveBlocks(text, values).replace(/\{\{\s*([\w.-]+)\s*(?:\|\s*(\w+)\s*)?\}\}/g, (match, key: string, filter?: string) => {
    const value = values[key]
    if (value === undefined) return match
    const apply = filter ? PLACEHOLDER_FILTERS[filter] : undefined
    if (filter && !apply) return match
    return apply ? apply(value) : value
  })
}

/** A list from a JSON response, following `choicesPath` and the value/label field names. */
export function extractChoices(data: unknown, field: UserTemplateField): { value: string; label: string }[] {
  let node: unknown = data
  for (const key of (field.choicesPath ?? '').split('.').filter(Boolean)) {
    node = (node as Record<string, unknown> | null)?.[key]
  }
  if (!Array.isArray(node)) return []
  const pick = (item: unknown, path: string | undefined): string => {
    if (typeof item === 'string' || typeof item === 'number') return String(item)
    if (!path || !item || typeof item !== 'object') return ''
    let value: unknown = item
    for (const key of path.split('.')) value = (value as Record<string, unknown> | null)?.[key]
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    return ''
  }
  const match = field.choicesMatch ? safeRegex(field.choicesMatch) : null
  const list = node
    .map((item) => {
      const value = pick(item, field.choicesValue)
      return { value, label: pick(item, field.choicesLabel) || value }
    })
    .filter((choice) => choice.value && (!match || match.test(choice.value)))
  if (field.choicesReverse) list.reverse()
  if (field.choicesLimit && field.choicesLimit > 0) return list.slice(0, field.choicesLimit)
  return list
}

/** The add-on's own project kind (a local id) or an existing one (`maven`, `tool.x`). */
function qualifiedKindId(kindId: string | undefined, addonId: string, localKinds: ReadonlySet<string>): string | undefined {
  if (!kindId) return undefined
  if (!localKinds.has(kindId)) return kindId
  return `${addonId}.${kindId}`
}

/**
 * A default may name other values: `github.com/user/{{slug}}`.
 *
 * Without this a field like a Go module path or a PHP namespace could not have
 * a sensible default at all — the built-in add-ons wrote those as functions,
 * and a manifest has only text. Placeholders are resolved against the values
 * worked out so far, which `resolveValues` settles over several rounds.
 */
function compileDefault(value: string | undefined) {
  if (value === undefined || !value.includes('{{')) return value
  return (values: FormValues) => fillPlaceholders(value, {
    values,
    name: values.name ?? '',
    slug: values.slug ?? '',
    dir: values.dir ?? '',
  } as TemplateContext)
}

export function compileTemplate(
  template: UserTemplate, addonId: string, deps: CompileDeps = {}, localKinds: ReadonlySet<string> = new Set(),
): ProjectTemplate {
  const kindId = template.kindId
  const fields: FormField[] = template.fields.map((field) => ({
    id: field.id,
    label: field.label || field.id,
    type: field.type ?? 'text',
    default: compileDefault(field.default),
    placeholder: field.placeholder || undefined,
    hint: field.hint || undefined,
    choices: (field.choicesUrl && deps.remoteChoices?.(field)) || field.choices,
    // Preselect the first loaded entry when no fixed default is given.
    ...(field.choicesUrl && !field.default ? { default: deps.remoteChoices?.(field)?.[0]?.value } : {}),
    pattern: field.pattern || undefined,
    required: field.required,
    section: field.section || undefined,
    mono: field.mono,
    when: field.when?.field ? (values: FormValues) => conditionHolds(field.when, values) : undefined,
  }))
  return {
    id: `${addonId}.${template.id}`,
    name: template.name,
    description: template.description || undefined,
    languageId: template.languageId || undefined,
    icon: template.icon || undefined,
    color: template.color || undefined,
    fields,
    // When the project kind hangs on a condition it becomes a function, which
    // the core calls with whatever was entered.
    kindId: template.kindWhen
      ? (values: FormValues) => (conditionHolds(template.kindWhen, values)
        ? qualifiedKindId(kindId, addonId, localKinds)
        : undefined)
      : qualifiedKindId(kindId, addonId, localKinds),
    files: (ctx) => Object.fromEntries(
      template.files
        .filter((file) => file.path.trim() && conditionsHold(file.when, ctx.values))
        .map((file) => [fillPlaceholders(file.path.trim(), ctx), fillPlaceholders(file.content, ctx)]),
    ),
    open: template.open ? (ctx) => fillPlaceholders(template.open ?? '', ctx) : undefined,
    next: template.next ? (ctx) => fillPlaceholders(template.next ?? '', ctx) : undefined,
    // Placeholders in the program and the label too: which package manager
    // installs is a field of the template (`{{pm}} install`).
    setup: template.setup?.length
      ? (ctx) => (template.setup ?? []).map((step, i) => ({
        id: `${addonId}.${template.id}.setup${i}`,
        label: fillPlaceholders(step.label || step.command, ctx),
        command: fillPlaceholders(step.command, ctx),
        args: step.args.map((arg) => fillPlaceholders(arg, ctx)),
      }))
      : undefined,
  }
}

async function ruleHolds(ctx: ProjectContext, rule: { file: string; pattern?: string }): Promise<boolean> {
  const text = await ctx.readFile(rule.file)
  if (text === null) return false
  if (!rule.pattern) return true
  const regex = safeRegex(rule.pattern, 'm')
  return Boolean(regex?.test(text))
}

function safeRegex(source: string, flags = ''): RegExp | null {
  try {
    return new RegExp(source, flags)
  } catch {
    return null
  }
}

async function taskCommand(ctx: ProjectContext, command: string, wrapper: string | undefined): Promise<string> {
  if (!wrapper) return command
  const name = ctx.platform === 'win32' ? `${wrapper}.bat` : wrapper
  if (!(await ctx.exists(name))) return command
  if (ctx.platform === 'win32') return name
  return `./${name}`
}

/**
 * Fill in a dependency's placeholders.
 *
 * `{short}` is the last part of the name: for `kemalcr/kemal` the entry in
 * `shard.yml` is called `kemal`, not the whole path.
 *
 * Without a scope the first declared one applies, as the dialog preselects it.
 * `{scope}` names a section in the build file (`dependencies:`), and an empty
 * one would write a heading called `:`.
 */
function dependencyFiller(dep: DependencySpec, separator: string, fallbackScope = '') {
  const [first, ...rest] = dep.name.trim().split(/\s+/)
  const name = first ?? dep.name
  const spec = dep.version ? `${name}${separator}${dep.version}` : name
  const values: Record<string, string> = {
    name,
    version: dep.version ?? '',
    scope: dep.scope || fallbackScope,
    spec,
    short: name.split('/').pop() ?? name,
  }
  const fill = (text: string) => text.replace(/\{(name|version|scope|spec|short)\}/g, (_all, key: string) => values[key])
  /** Does the line contain a placeholder that stays empty? */
  const incomplete = (text: string) => /\{(name|version|scope|spec|short)\}/.test(text)
    && [...text.matchAll(/\{(name|version|scope|spec|short)\}/g)].some((match) => !values[match[1]])
  return { name, spec, rest, fill, incomplete }
}

/**
 * Write the entry into the build file.
 *
 * Two cases: with the section present the lines go straight after its
 * heading; without it, the section is appended at the end of the file.
 */
async function editDependency(
  ctx: ProjectContext, edit: UserDependencyEdit, dep: DependencySpec, separator: string, fallbackScope: string,
): Promise<DependencyAction> {
  const { fill, incomplete } = dependencyFiller(dep, separator, fallbackScope)
  const text = await ctx.readFile(edit.file)
  if (text === null) throw new Error(`${edit.file} fehlt`)

  const indent = edit.indent ?? '  '
  const block = edit.lines
    .filter((line) => !incomplete(line))
    .map((line) => `${indent}${fill(line)}`)
    .join('\n')

  const then = edit.then
    ? {
      id: edit.then.id ?? `${edit.then.command}:after-add`,
      label: fill(edit.then.label),
      command: edit.then.command,
      args: edit.then.args.map(fill),
    }
    : undefined

  const header = safeRegex(fill(edit.sectionPattern), 'm')?.exec(text)
  if (!header) {
    const head = text.replace(/\s*$/, '')
    return { type: 'edit', file: edit.file, content: `${head}\n\n${fill(edit.sectionHeader)}\n${block}\n`, then }
  }
  const at = header.index + header[0].length
  return { type: 'edit', file: edit.file, content: `${text.slice(0, at)}\n${block}${text.slice(at)}`, then }
}

function compileDependencies(support: UserDependencySupport | undefined): DependencySupport | undefined {
  const runsCommand = Boolean(support?.command?.trim())
  if (!support || (!runsCommand && !support.edit)) return undefined
  const separator = support.specSeparator ?? '@'
  const fallbackScope = support.scopes?.[0]?.value ?? ''
  return {
    manager: support.manager || support.command || support.edit?.file || '',
    placeholder: support.placeholder || '',
    hint: support.hint || undefined,
    scopes: support.scopes?.length ? support.scopes : undefined,
    versionRequired: support.versionRequired,
    add: async (ctx, dep) => {
      if (support.edit) return editDependency(ctx, support.edit, dep, separator, fallbackScope)

      // Anything after the name (`serde --features derive`) is kept and moved
      // to the end — the package manager gets it unchanged.
      const { rest, fill } = dependencyFiller(dep, separator, fallbackScope)
      const command = support.command ?? ''
      // Empty arguments fall away: `{version}` without a version should not
      // hand the package manager a stray empty argument.
      const scopeArgs = support.scopeArgs?.[dep.scope ?? ''] ?? []
      const args = (support.args ?? [])
        .flatMap((arg) => {
          if (arg === '{scopeArgs}') return scopeArgs
          if (arg === '{rest}') return rest
          return [fill(arg)]
        })
        .filter((arg) => arg !== '')
      return {
        type: 'task',
        task: {
          id: support.id ?? `${command}:add`,
          label: support.label ? fill(support.label) : `${command} ${args.join(' ')}`,
          command,
          args,
        },
      }
    },
  }
}


/** Extra arguments, chosen by the first of these files the project has. */
async function extraArgs(ctx: ProjectContext, task: UserKindTask): Promise<string[]> {
  for (const rule of task.argsWhenFile ?? []) {
    const files = Array.isArray(rule.file) ? rule.file : [rule.file]
    for (const file of files) {
      if (await ctx.exists(file).catch(() => false)) return rule.args
    }
  }
  return []
}

/** Does the task disappear when its pattern yields nothing? */
function omitsWhenEmpty(task: UserKindTask): boolean {
  return Boolean(task.forEachDir?.omitWhenEmpty || task.forEachMatch?.omitWhenEmpty)
}

/** Pull a fact out of the file — through a JSON path or a pattern. */
function factValue(text: string, fact: { pattern?: string; json?: string; section?: string }): string | undefined {
  if (fact.json !== undefined) {
    const node = jsonAt(text, fact.json)
    if (node === null || typeof node === 'object') return undefined
    return String(node).trim() || undefined
  }
  if (!fact.pattern?.trim()) return undefined
  const haystack = fact.section ? section(text, fact.section) : text
  if (!haystack) return undefined
  return safeRegex(fact.pattern, 'm')?.exec(haystack)?.[1]?.trim() || undefined
}

/** Value under a dotted path in a JSON text — `null` when anything is missing. */
function jsonAt(text: string, path: string): unknown {
  let node: unknown
  try {
    node = JSON.parse(text)
  } catch {
    return null
  }
  for (const step of path.split('.').filter(Boolean)) {
    if (!node || typeof node !== 'object') return null
    node = (node as Record<string, unknown>)[step]
  }
  return node ?? null
}

/**
 * A section of a TOML/INI file — from its heading to the next one.
 *
 * Same rule as `core/project/detect.ts`; repeated here because `compile` has
 * to run without the rest of the application, as the check scripts do.
 */
function section(text: string, name: string): string {
  const escaped = name.replace(/[.[\]\\]/g, '\\$&')
  const head = new RegExp(`^\\[${escaped}\\]\\s*$`, 'm').exec(text)
  if (!head) return ''
  const rest = text.slice(head.index + head[0].length)
  const next = /^\[/m.exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

/**
 * An indented block under a heading — `targets:` in a `shard.yml`.
 *
 * Starts with the line after the heading and ends as soon as a line sits at
 * the left margin again.
 */
function block(text: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}:\\s*\\n((?:[ \\t]+.*\\n?)*)`, 'm').exec(text)?.[1] ?? ''
}

/**
 * Unfold one task per subfolder.
 *
 * An empty list means there is nothing to unfold — the caller then uses the
 * task carrying `forEachDir` as the fallback.
 */
async function expandPerDir(
  ctx: ProjectContext, task: UserKindTask,
): Promise<{ dir: string; label: string; args: string[]; group?: ProjectTask['group'] }[]> {
  const spec = task.forEachDir
  if (!spec?.dir.trim()) return []
  const entries = await ctx.list(spec.dir).catch(() => [])
  const dirs = entries.filter((entry) => entry.isDirectory).map((entry) => entry.name)
  if (!dirs.length) return []
  return dirs.slice(0, spec.limit ?? 4).map((dir) => ({
    dir,
    // `tr` with parameters: the label may be a translation key
    // (`templates.tasks.runTarget`), which then knows `{target}`.
    label: tr(spec.label, { target: dir, dir }),
    args: spec.args.map((arg) => arg.replaceAll('{dir}', dir)),
  }))
}

/**
 * Unfold one task per match in a file.
 *
 * An empty list means the same as for `expandPerDir`: nothing to unfold, so
 * the task itself applies.
 */
async function expandPerMatch(
  ctx: ProjectContext, task: UserKindTask,
): Promise<{ dir: string; label: string; args: string[]; group?: ProjectTask['group'] }[]> {
  const spec = task.forEachMatch
  const files = (Array.isArray(spec?.file) ? spec.file : [spec?.file]).filter((file): file is string => Boolean(file?.trim()))
  // Either a pattern or a JSON path — with neither there is nothing to do.
  if (!spec || !files.length) return []
  if (spec.json === undefined && !spec.pattern?.trim()) return []
  let text: string | null = null
  for (const file of files) {
    text = await ctx.readFile(file).catch(() => null)
    if (text !== null) break
  }
  if (text === null) return []

  // Two routes to the matches: keys from a JSON path, or a pattern over the
  // text. The JSON knows its own nesting; the pattern does not.
  const found: string[] = []
  /** Label per match, when the JSON carries a field of its own for it. */
  const labels = new Map<string, string>()
  if (spec.json !== undefined) {
    const node = jsonAt(text, spec.json)
    if (!node || typeof node !== 'object') return []
    // A list of objects (CMake presets) or a plain object (scripts).
    if (Array.isArray(node)) {
      for (const entry of node) {
        if (!entry || typeof entry !== 'object') continue
        const row = entry as Record<string, unknown>
        if (spec.jsonSkipWhen && row[spec.jsonSkipWhen]) continue
        const name = String(row[spec.jsonName ?? 'name'] ?? '')
        if (!name) continue
        found.push(name)
        const label = spec.jsonLabel ? row[spec.jsonLabel] : undefined
        if (typeof label === 'string' && label) labels.set(name, label)
      }
    }
    if (!Array.isArray(node)) found.push(...Object.keys(node as Record<string, unknown>))
  }
  if (spec.json === undefined) {
    const haystack = spec.block ? block(text, spec.block) : spec.section ? section(text, spec.section) : text
    if (!haystack) return []
    const pattern = safeRegex(spec.pattern ?? '', 'gm')
    if (!pattern) return []
    for (const hit of haystack.matchAll(pattern)) found.push(hit[1] ?? '')
  }

  const skip = new Set(spec.skip ?? [])
  const skipPattern = spec.skipPattern ? safeRegex(spec.skipPattern) : null
  const seen = new Set<string>()
  const groupOf = (match: string): ProjectTask['group'] | undefined => {
    for (const rule of spec.groups ?? []) {
      if (safeRegex(rule.pattern)?.test(match)) return rule.group
    }
    return undefined
  }
  const out: { dir: string; label: string; args: string[]; group?: ProjectTask['group'] }[] = []
  for (const raw of found) {
    const match = raw.trim()
    if (!match || skip.has(match) || seen.has(match)) continue
    if (skipPattern?.test(match)) continue
    seen.add(match)
    out.push({
      dir: match,
      label: tr(found.length === 1 && spec.singleLabel ? spec.singleLabel : spec.label, {
        target: labels.get(match) ?? match,
        match: labels.get(match) ?? match,
      }),
      args: spec.args.map((arg) => arg.replaceAll('{match}', match)),
      group: groupOf(match),
    })
    if (out.length >= (spec.limit ?? 12)) break
  }
  return out
}

/** Read dependencies out of the build file — one pass per entry. */
async function scanDependencies(
  ctx: ProjectContext, scans: UserKindDependencyScan | UserKindDependencyScan[] | undefined,
): Promise<ProjectMeta['dependencies']> {
  const list = Array.isArray(scans) ? scans : scans ? [scans] : []
  if (!list.length) return undefined
  const out: NonNullable<ProjectMeta['dependencies']> = []
  const cache = new Map<string, string | null>()

  for (const scan of list) {
    if (!scan.file.trim()) continue
    if (!cache.has(scan.file)) cache.set(scan.file, await ctx.readFile(scan.file))
    const text = cache.get(scan.file)
    if (text === null || text === undefined) continue
    const skip = scan.skipPattern ? safeRegex(scan.skipPattern) : null

    // JSON: an object of name → version, the way Composer and npm keep it.
    if (scan.json !== undefined) {
      const node = jsonAt(text, scan.json)
      if (!node || typeof node !== 'object') continue
      for (const [name, version] of Object.entries(node as Record<string, unknown>)) {
        if (!name || skip?.test(name)) continue
        out.push({ name, version: typeof version === 'string' ? version : undefined, scope: scan.scope ?? 'direct' })
      }
      continue
    }

    if (!scan.pattern?.trim()) continue
    const haystack = scan.block ? block(text, scan.block) : scan.section ? section(text, scan.section) : text
    if (!haystack) continue
    const pattern = safeRegex(scan.pattern, 'gm')
    if (!pattern) continue
    for (const match of haystack.matchAll(pattern)) {
      const name = match[1]?.trim()
      if (!name || skip?.test(name)) continue
      // When the version is not in the second group it comes from a second
      // pattern applied to the whole match.
      const fromPattern = scan.versionPattern
        ? safeRegex(scan.versionPattern)?.exec(match[0])?.[1]?.trim()
        : undefined
      out.push({
        name,
        version: fromPattern ?? (match[2] ?? match[3])?.trim(),
        scope: match[3] && !match[2]
          ? scan.scope ?? scan.directScope ?? 'direct'
          : scan.scope ?? (match[3] ? scan.indirectScope ?? 'indirect' : scan.directScope ?? 'direct'),
      })
    }
  }
  return out.length ? out : undefined
}

export function compileProjectKind(kind: UserProjectKind, addonId: string): ProjectKind {
  const id = `${addonId}.${kind.id}`
  const rules = kind.rules ?? []
  return {
    id,
    name: kind.name || kind.id,
    icon: kind.icon || undefined,
    color: kind.color || undefined,
    markers: kind.markers,
    priority: kind.priority,
    languageIds: kind.languageIds?.length ? kind.languageIds : undefined,
    role: 'build',
    dependencies: compileDependencies(kind.dependencies),
    async detect(ctx) {
      // Markers with `*` are checked by the core; a rule without a file cannot exist.
      for (const rule of rules) {
        if (!(await ruleHolds(ctx, rule))) return false
      }
      return true
    },
    async tasks(ctx): Promise<ProjectTask[]> {
      const out: ProjectTask[] = []
      // Tasks can unfold, drop out or pull in replacements — hence a loop of
      // its own rather than a `map`.
      const emit = async (task: UserKindTask) => {
        const command = await taskCommand(ctx, task.command, task.wrapper)
        const extra = await extraArgs(ctx, task)
        const fill = (args: string[]) => args.flatMap((arg) => (arg === '{extraArgs}' ? extra : [arg]))
        const expanded: { dir: string; label: string; args: string[]; group?: ProjectTask['group'] }[] =
          [...await expandPerDir(ctx, task), ...await expandPerMatch(ctx, task)]

        if (expanded.length) {
          for (const { dir, label, args, group } of expanded) {
            const filled = fill(args)
            out.push({
              id: `${id}:${task.id}:${dir}`,
              label,
              command,
              args: filled,
              group: group ?? task.group,
              then: task.then,
              detail: [task.command, ...filled].join(' '),
            })
          }
          return
        }
        if (!omitsWhenEmpty(task)) {
          const filled = fill(task.args)
          out.push({
            id: `${id}:${task.id}`,
            label: task.label || task.id,
            command,
            args: filled,
            group: task.group,
            then: task.then,
            detail: task.detail || [task.command, ...filled].join(' '),
          })
        }
        for (const extraTask of task.alsoWhenEmpty ?? []) await emit(extraTask)
      }
      for (const task of kind.tasks) await emit(task)
      return out
    },
    async inspect(ctx): Promise<ProjectMeta> {
      const meta: ProjectMeta = { facts: {}, buildFile: kind.buildFile, sourceRoots: kind.sourceRoots }
      meta.dependencies = await scanDependencies(ctx, kind.dependencyScan)
      for (const fact of kind.facts ?? []) {
        const text = await ctx.readFile(fact.file)
        const value = text === null ? undefined : factValue(text, fact)
        if (!value) continue
        if (fact.role === 'name') {
          meta.name = value
          continue
        }
        if (fact.role === 'version') {
          meta.version = value
          continue
        }
        if (fact.role === 'description') {
          meta.description = value
          continue
        }
        meta.facts![fact.label || fact.file] = value
      }
      // No facts, no empty field: a project kind without `facts` should have
      // the same shape as a hand-written one.
      if (!Object.keys(meta.facts ?? {}).length) delete meta.facts
      return meta
    },
  }
}

export function compileAddon(model: UserAddonModel, deps: CompileDeps = {}): Addon {
  const themes: Theme[] = []
  for (const entry of model.themes) {
    if ('theme' in entry) {
      themes.push(entry.theme)
      continue
    }
    const resolved = deps.resolveTheme?.(entry.ref)
    if (resolved) themes.push(resolved)
  }

  const addon: Addon = {
    id: model.id,
    name: model.name || model.id,
    version: model.version,
    description: model.description || undefined,
    author: model.author || undefined,
    icon: model.icon || undefined,
    category: model.category,
    user: true,
    languages: model.languages.map(compileLanguage),
    themes,
    commands: model.commands.map((command) => ({
      id: `${model.id}.${command.id}`,
      title: command.title,
      category: command.category || model.name,
      keybinding: command.keybinding || undefined,
      run: () => deps.runCommand?.(model, command),
    })),
    projectTemplates: model.templates.map((template) =>
      compileTemplate(template, model.id, deps, new Set((model.projectKinds ?? []).map((kind) => kind.id)))),
    projectKinds: (model.projectKinds ?? []).map((kind) => compileProjectKind(kind, model.id)),
    snippets: (model.snippets ?? [])
      .filter((snippet) => snippet.languageId && snippet.label && snippet.body)
      .map((snippet) => ({ languageId: snippet.languageId, label: snippet.label, detail: snippet.detail || undefined, body: snippet.body })),
  }
  const startEvents = deps.startEvents
  if (model.events.length && startEvents) addon.activate = () => startEvents(model)
  // Leave out empty lists so a compiled add-on has the same shape as a
  // hand-written one. `addon.snippets?.length` behaves the same either way,
  // but comparisons and dumps get noisy with empty fields.
  for (const key of ['languages', 'themes', 'commands', 'projectTemplates', 'projectKinds', 'snippets'] as const) {
    if (addon[key]?.length === 0) delete addon[key]
  }
  return addon
}
