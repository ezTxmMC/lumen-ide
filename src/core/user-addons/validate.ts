/**
 * Validating user add-ons, with messages people can act on.
 *
 * Every message names the area of the Studio (`section`) and, where it helps,
 * the index of the entry — which is how the Studio jumps straight to it.
 */

import { t } from '@/i18n'
import { NODE_CATALOG } from './catalog'
import { BUILTIN_DEBUG_ADAPTERS, BUILTIN_DEBUG_ADAPTER_NAMES } from '@/core/debug/builtin-adapters'
import { isTokenizerName, tokenizerNames } from './tokenizers'
import { USER_ADDON_PREFIX, type Graph, type UserAddonModel } from './schema'

export type StudioSection = 'general' | 'languages' | 'commands' | 'events' | 'templates' | 'kinds' | 'snippets' | 'themes' | 'json'

export interface ValidationIssue {
  section: StudioSection
  index?: number
  /** Field within the entry, such as `numbers`. */
  field?: string
  message: string
  /** Warnings do not prevent saving. */
  warning?: boolean
}

const v = (key: string, params?: Record<string, string | number>) => t(`addonStudio.validate.${key}`, params)
/** Messages about project kinds, snippets and the richer templates. */
const p = (key: string, params?: Record<string, string | number>) => t(`studioProject.validate.${key}`, params)

/**
 * `user.` comes out of the Add-on Studio, `ext.` from an extension server.
 * Both go through the same validation and live in the same folder — the prefix
 * only records who built them.
 */
export const ADDON_ID_PATTERN = /^(?:user|ext)\.[a-z0-9][a-z0-9._-]*$/
const LANGUAGE_ID_PATTERN = /^[a-z0-9][a-z0-9_+-]*$/
const LOCAL_ID_PATTERN = /^[A-Za-z0-9][\w.-]*$/
const FIELD_ID_PATTERN = /^[A-Za-z_]\w*$/
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+.][\w.-]+)?$/
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** The error message of a regex source, or `null` when it is valid. */
export function checkRegex(source: string | undefined, flags = ''): string | null {
  if (!source) return null
  try {
    new RegExp(source, flags)
    return null
  } catch (err) {
    return (err as Error).message
  }
}

/** Finds duplicate values, returning the index of the second occurrence. */
function duplicates(values: string[]): number[] {
  const seen = new Set<string>()
  const out: number[] = []
  values.forEach((value, index) => {
    if (seen.has(value)) out.push(index)
    seen.add(value)
  })
  return out
}

/** Checks a graph's nodes and edges. */
export function validateGraph(graph: Graph): string[] {
  const problems: string[] = []
  const ids = new Set(graph.nodes.map((n) => n.id))
  for (const node of graph.nodes) {
    if (!NODE_CATALOG.has(node.type)) problems.push(v('unknownNode', { type: node.type }))
  }
  for (const edge of graph.edges) {
    if (ids.has(edge.from.node) && ids.has(edge.to.node)) continue
    problems.push(v('danglingEdge'))
  }
  return problems
}

export function validateAddon(model: UserAddonModel): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const push = (issue: ValidationIssue) => issues.push(issue)

  /* General */
  if (!ADDON_ID_PATTERN.test(model.id)) push({ section: 'general', field: 'id', message: v('addonId', { prefix: USER_ADDON_PREFIX }) })
  if (!model.name.trim()) push({ section: 'general', field: 'name', message: v('nameRequired') })
  if (!VERSION_PATTERN.test(model.version)) push({ section: 'general', field: 'version', message: v('version') })
  if (model.color && !COLOR_PATTERN.test(model.color)) push({ section: 'general', field: 'color', message: v('color') })

  /* Languages */
  for (const index of duplicates(model.languages.map((l) => l.id))) {
    push({ section: 'languages', index, field: 'id', message: v('duplicateId', { id: model.languages[index].id }) })
  }
  model.languages.forEach((lang, index) => {
    const at = (field: string, message: string, warning = false) =>
      push({ section: 'languages', index, field, message: `${lang.name || lang.id}: ${message}`, warning })
    if (!LANGUAGE_ID_PATTERN.test(lang.id)) at('id', v('languageId'))
    if (!lang.name.trim()) at('name', v('nameRequired'))
    if (!lang.extensions.length && !lang.filenames?.length) at('extensions', v('extensionsRequired'))
    for (const ext of lang.extensions) {
      if (!/^\.[^\s/\\]+$/.test(ext)) at('extensions', v('extension', { ext }))
    }
    for (const field of ['numbers', 'identifier', 'operators', 'meta', 'indentOpen', 'indentClose'] as const) {
      const error = checkRegex(lang[field])
      if (error) at(field, v('regex', { field, error }))
    }
    if (lang.indentUnit !== undefined && (!Number.isInteger(lang.indentUnit) || lang.indentUnit < 1 || lang.indentUnit > 16)) {
      at('indentUnit', v('indentUnit'))
    }
    const block = lang.comments?.block
    if (block && (!block[0] || !block[1])) at('comments', v('blockComment'))
    lang.strings?.forEach((rule) => {
      if (!rule.start) at('strings', v('stringStart'))
    })
    lang.snippets?.forEach((snippet) => {
      if (!snippet.label.trim() || !snippet.body) at('snippets', v('snippet'))
    })
    lang.run?.forEach((run) => {
      if (!run.label.trim() || !run.command.trim()) at('run', v('runConfig'))
    })
    lang.lsp?.forEach((server) => {
      if (!server.label.trim() || !server.command.trim()) at('lsp', v('lspConfig'))
    })
    // Debug adapters are pulled in by name; a typo would otherwise stay
    // silent, because an unknown name simply falls away.
    for (const name of lang.debug ?? []) {
      if (BUILTIN_DEBUG_ADAPTERS[name]) continue
      at('debug', v('debugAdapter', { name, known: BUILTIN_DEBUG_ADAPTER_NAMES.join(', ') }))
    }
    // The same for a named tokenizer: an unknown name would cost the language
    // its colours without a word.
    if (lang.tokenizer && !isTokenizerName(lang.tokenizer)) {
      at('tokenizer', v('tokenizer', { name: lang.tokenizer, known: tokenizerNames().join(', ') }))
    }
  })

  /* Commands */
  for (const index of duplicates(model.commands.map((c) => c.id))) {
    push({ section: 'commands', index, field: 'id', message: v('duplicateId', { id: model.commands[index].id }) })
  }
  model.commands.forEach((command, index) => {
    const at = (message: string, field?: string, warning = false) =>
      push({ section: 'commands', index, field, message: `${command.title || command.id}: ${message}`, warning })
    if (!LOCAL_ID_PATTERN.test(command.id)) at(v('localId'), 'id')
    if (!command.title.trim()) at(v('titleRequired'), 'title')
    const entries = command.graph.nodes.filter((n) => n.type === 'event.command').length
    if (entries === 0) at(v('commandEntry'))
    if (entries > 1) at(v('commandEntryOnce'))
    if (command.keybinding && !/^[^\s+]+(?:\+[^\s+]+)*(?: [^\s+]+(?:\+[^\s+]+)*)?$/.test(command.keybinding)) {
      at(v('keybinding'), 'keybinding')
    }
    for (const problem of validateGraph(command.graph)) at(problem)
  })

  /* Events */
  model.events.forEach((event, index) => {
    const at = (message: string, warning = false) =>
      push({ section: 'events', index, message: `${event.name || event.id}: ${message}`, warning })
    if (!event.name.trim()) at(v('nameRequired'))
    const entries = event.graph.nodes.filter((n) => {
      const def = NODE_CATALOG.get(n.type)
      return Boolean(def?.event && def.event !== 'command')
    })
    if (!entries.length) at(v('eventEntry'), true)
    for (const problem of validateGraph(event.graph)) at(problem)
  })

  /* Templates */
  for (const index of duplicates(model.templates.map((tpl) => tpl.id))) {
    push({ section: 'templates', index, field: 'id', message: v('duplicateId', { id: model.templates[index].id }) })
  }
  model.templates.forEach((template, index) => {
    const at = (message: string, field?: string) =>
      push({ section: 'templates', index, field, message: `${template.name || template.id}: ${message}` })
    if (!LOCAL_ID_PATTERN.test(template.id)) at(v('localId'), 'id')
    if (!template.name.trim()) at(v('nameRequired'), 'name')
    if (!template.files.length) at(v('templateFiles'), 'files')
    for (const file of template.files) {
      const path = file.path.trim()
      if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split(/[\\/]/).includes('..')) {
        at(v('templatePath', { path: file.path }), 'files')
      }
    }
    for (const fieldIndex of duplicates(template.fields.map((f) => f.id))) {
      at(v('duplicateId', { id: template.fields[fieldIndex].id }), 'fields')
    }
    for (const field of template.fields) {
      if (!FIELD_ID_PATTERN.test(field.id)) at(v('fieldId', { id: field.id }), 'fields')
      if (['name', 'slug', 'dir'].includes(field.id)) at(v('fieldReserved', { id: field.id }), 'fields')
      const error = checkRegex(field.pattern)
      if (error) at(v('regex', { field: field.label || field.id, error }), 'fields')
      if (field.type === 'select' && !field.choices?.length && !field.choicesUrl) at(v('fieldChoices', { id: field.id }), 'fields')
      if (field.choicesUrl && !/^https:\/\/\S+$/.test(field.choicesUrl)) at(p('choicesUrl', { id: field.id }), 'fields')
      const matchError = checkRegex(field.choicesMatch)
      if (matchError) at(v('regex', { field: field.label || field.id, error: matchError }), 'fields')
      if (field.when?.field && !template.fields.some((other) => other.id === field.when?.field)) {
        at(p('conditionField', { field: field.when.field }), 'fields')
      }
    }
    for (const file of template.files) {
      // A file may hang on several conditions at once.
      const conditions = Array.isArray(file.when) ? file.when : file.when ? [file.when] : []
      for (const condition of conditions) {
        if (!condition.field) continue
        if (template.fields.some((other) => other.id === condition.field)) continue
        at(p('conditionField', { field: condition.field }), 'files')
      }
    }
  })

  /* Project kinds */
  const kinds = model.projectKinds ?? []
  for (const index of duplicates(kinds.map((kind) => kind.id))) {
    push({ section: 'kinds', index, field: 'id', message: v('duplicateId', { id: kinds[index].id }) })
  }
  kinds.forEach((kind, index) => {
    const at = (message: string, field?: string) =>
      push({ section: 'kinds', index, field, message: `${kind.name || kind.id}: ${message}` })
    if (!LOCAL_ID_PATTERN.test(kind.id)) at(v('localId'), 'id')
    if (!kind.name.trim()) at(v('nameRequired'), 'name')
    if (!kind.markers.some((marker) => marker.trim())) at(p('kindMarkers'), 'markers')
    for (const rule of kind.rules ?? []) {
      if (!rule.file.trim()) at(p('ruleFile'), 'rules')
      const error = checkRegex(rule.pattern, 'm')
      if (error) at(v('regex', { field: rule.file, error }), 'rules')
    }
    for (const taskIndex of duplicates(kind.tasks.map((task) => task.id))) {
      at(v('duplicateId', { id: kind.tasks[taskIndex].id }), 'tasks')
    }
    for (const task of kind.tasks) {
      if (!task.label.trim() || !task.command.trim()) at(p('taskIncomplete'), 'tasks')
    }
    // Either a command or an entry written into the build file — with neither
    // there would be nothing for “add” to do.
    const deps = kind.dependencies
    if (deps && (!deps.manager.trim() || !(deps.command?.trim() || deps.edit?.file.trim()))) {
      at(v('kindDependencies'), 'dependencies')
    }
    for (const fact of kind.facts ?? []) {
      // Facts from a JSON path need no pattern.
      if (fact.json !== undefined) {
        if (!fact.file.trim()) at(p('factPattern', { label: fact.label || fact.file }), 'facts')
        continue
      }
      const error = checkRegex(fact.pattern ?? '', 'm')
      if (error) {
        at(v('regex', { field: fact.label || fact.file, error }), 'facts')
        continue
      }
      if (!fact.file.trim() || !/\((?!\?[:=!<])/.test(fact.pattern ?? '')) at(p('factPattern', { label: fact.label || fact.file }), 'facts')
    }
  })

  /* Snippets */
  ;(model.snippets ?? []).forEach((snippet, index) => {
    if (!snippet.languageId) push({ section: 'snippets', index, field: 'languageId', message: p('snippetLanguage', { label: snippet.label || String(index + 1) }) })
    if (!snippet.label.trim() || !snippet.body) push({ section: 'snippets', index, message: v('snippet') })
  })

  /* Themes */
  model.themes.forEach((entry, index) => {
    if ('ref' in entry) {
      if (!entry.ref) push({ section: 'themes', index, message: v('themeRef') })
      return
    }
    const theme = entry.theme
    const valid = theme && typeof theme.id === 'string' && typeof theme.name === 'string'
      && (theme.type === 'dark' || theme.type === 'light') && theme.ui && typeof theme.ui === 'object'
    if (!valid) push({ section: 'themes', index, message: v('themeInvalid') })
  })

  return issues
}

/** Errors only, leaving out warnings. */
export const blockingIssues = (issues: ValidationIssue[]) => issues.filter((i) => !i.warning)
