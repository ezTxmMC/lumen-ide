/**
 * The template catalogue of the project page: categories, search and the
 * recently used templates. Pure functions — the page renders what they
 * return, the check script tests them.
 */

import type { LanguageSpec, ProjectTemplate } from '@/core/types'

export interface TemplateCategory {
  /** Stable key: the category text as the template gives it, or `lang:<id>`. */
  id: string
  label: string
  count: number
  /** Glyph and colour of the first template's language, for the rail. */
  icon?: string
  color?: string
}

export interface CatalogOptions {
  /** Translates template texts (`tr`). */
  translate?: (text: string | undefined) => string
  /** Label for templates with neither a category nor a language. */
  otherLabel: string
  /** For sorting labels. */
  locale?: string
}

/** The pseudo categories on top of the rail. */
export const ALL_CATEGORY = '*all'
export const RECENT_CATEGORY = '*recent'
export const RECENT_LIMIT = 8

const identity = (text: string | undefined) => text ?? ''

function languageOf(template: ProjectTemplate, languages: LanguageSpec[]): LanguageSpec | undefined {
  if (!template.languageId) return undefined
  return languages.find((language) => language.id === template.languageId)
}

/** The category a template belongs to: its own, else its language, else “Other”. */
export function templateCategory(
  template: ProjectTemplate, languages: LanguageSpec[], options: CatalogOptions,
): { id: string; label: string } {
  const translate = options.translate ?? identity
  if (template.category?.trim()) return { id: `cat:${template.category.trim()}`, label: translate(template.category.trim()) }
  const language = languageOf(template, languages)
  if (language) return { id: `lang:${language.id}`, label: language.name }
  return { id: 'other', label: options.otherLabel }
}

/** Every category with its template count, sorted by label (“Other” last). */
export function templateCategories(
  templates: ProjectTemplate[], languages: LanguageSpec[], options: CatalogOptions,
): TemplateCategory[] {
  const map = new Map<string, TemplateCategory>()
  for (const template of templates) {
    const { id, label } = templateCategory(template, languages, options)
    const known = map.get(id)
    if (known) {
      known.count++
      continue
    }
    const language = languageOf(template, languages)
    map.set(id, {
      id, label, count: 1,
      icon: template.icon ?? language?.icon,
      color: template.color ?? language?.color,
    })
  }
  return [...map.values()].sort((a, b) => {
    if (a.id === 'other') return 1
    if (b.id === 'other') return -1
    return a.label.localeCompare(b.label, options.locale)
  })
}

/** All the text a template is found by. */
export function templateHaystack(template: ProjectTemplate, languages: LanguageSpec[], options: CatalogOptions): string {
  const translate = options.translate ?? identity
  const language = languageOf(template, languages)
  return [
    translate(template.name),
    translate(template.description),
    ...(template.keywords ?? []),
    templateCategory(template, languages, options).label,
    language?.name ?? '',
    template.id,
  ].join(' ').toLowerCase()
}

/**
 * The templates of a category that match the search. Every word of the query
 * has to appear somewhere; hits in the name rank first. Within the recent
 * category the order is the order of use.
 */
export function filterTemplates(
  templates: ProjectTemplate[],
  languages: LanguageSpec[],
  query: { text: string; category: string; recent?: string[] },
  options: CatalogOptions,
): ProjectTemplate[] {
  const translate = options.translate ?? identity
  const words = query.text.toLowerCase().split(/\s+/).filter(Boolean)
  const recent = query.recent ?? []
  const inCategory = (template: ProjectTemplate) => {
    if (query.category === ALL_CATEGORY) return true
    if (query.category === RECENT_CATEGORY) return recent.includes(template.id)
    return templateCategory(template, languages, options).id === query.category
  }
  const score = (template: ProjectTemplate) => {
    const name = translate(template.name).toLowerCase()
    if (!words.length) return 0
    if (words.every((word) => name.startsWith(word) || name.includes(` ${word}`))) return 2
    if (words.every((word) => name.includes(word))) return 1
    return 0
  }
  const hits = templates.filter((template) => {
    if (!inCategory(template)) return false
    const haystack = templateHaystack(template, languages, options)
    return words.every((word) => haystack.includes(word))
  })
  if (query.category === RECENT_CATEGORY && !words.length) {
    return hits.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id))
  }
  return hits
    .map((template) => ({ template, score: score(template) }))
    .sort((a, b) => b.score - a.score || translate(a.template.name).localeCompare(translate(b.template.name), options.locale))
    .map((entry) => entry.template)
}

/** The recent list after using `id`: it moves to the front, the list stays short. */
export function rememberRecent(recent: string[], id: string, limit = RECENT_LIMIT): string[] {
  return [id, ...recent.filter((entry) => entry !== id)].slice(0, limit)
}

/** Only recent ids that still name a template — add-ons come and go. */
export function knownRecent(recent: string[], templates: ProjectTemplate[]): string[] {
  const ids = new Set(templates.map((template) => template.id))
  return recent.filter((id) => ids.has(id))
}

/** Next index in a grid for an arrow key; `null` for keys that don't move. */
export function gridStep(key: string, index: number, count: number, columns: number): number | null {
  if (!count) return null
  const moves: Record<string, number> = {
    ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns,
  }
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const delta = moves[key]
  if (delta === undefined) return null
  const next = index + delta
  if (next < 0) return index
  if (next < count) return next
  if (delta === 1) return index
  // Down into a short last row lands on its last card; within the last row it stays.
  const lastRow = Math.floor((count - 1) / columns)
  return Math.floor(index / columns) === lastRow ? index : count - 1
}

/** A flat path list as a tree, folders first, each level sorted. */
export interface FileTreeNode {
  name: string
  path: string
  children?: FileTreeNode[]
}

export function fileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', children: [] }
  for (const raw of paths) {
    const parts = raw.replace(/^[\\/]+/, '').split(/[\\/]+/).filter(Boolean)
    let node = root
    parts.forEach((part, index) => {
      const leaf = index === parts.length - 1
      const path = parts.slice(0, index + 1).join('/')
      node.children ??= []
      let child = node.children.find((entry) => entry.name === part && Boolean(entry.children) === !leaf)
      if (!child) {
        child = leaf ? { name: part, path } : { name: part, path, children: [] }
        node.children.push(child)
      }
      node = child
    })
  }
  const sort = (nodes: FileTreeNode[]): FileTreeNode[] =>
    nodes
      .map((entry) => (entry.children ? { ...entry, children: sort(entry.children) } : entry))
      .sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children)) || a.name.localeCompare(b.name))
  return sort(root.children ?? [])
}
