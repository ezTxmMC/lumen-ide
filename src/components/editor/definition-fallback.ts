/**
 * Finding a definition when the language server finds none.
 *
 * A server answers “nothing” for a symbol it does know in several situations:
 * while it still imports the build (jdtls on a large Gradle project), when a
 * module is not part of what it imported, or when the request fails on its
 * side. Ctrl+click should still get somewhere, so two fallbacks follow:
 *
 *   1. the servers' workspace symbols — an exact name match, types first;
 *   2. a text search through the project for a declaration of the name
 *      (`class X`, `interface X`, `fun X`, `def X` …) in files of the language.
 *
 * Both only look for the plain name under the cursor; a hit is shown as a
 * list when there is more than one.
 */

import { pathToUri, type Location, type WorkspaceSymbol } from '@/core/lsp/protocol'

/** LSP SymbolKind values, most wanted first for a jump to a definition. */
const KIND_RANK: Record<number, number> = {
  5: 0, // Class
  11: 0, // Interface
  10: 0, // Enum
  23: 0, // Struct
  26: 1, // TypeParameter
  12: 2, // Function
  6: 2, // Method
  9: 2, // Constructor
  14: 3, // Constant
  8: 4, // Field
  7: 4, // Property
  13: 5, // Variable
}

const rankOf = (kind: number) => KIND_RANK[kind] ?? 9

/**
 * The workspace symbols that are the name itself — exact matches of the best
 * kind present (a class `Foo` wins over a field `foo`). Symbols without a
 * range stay out: there is nowhere to jump to.
 */
export function definitionSymbols(symbols: WorkspaceSymbol[], name: string): Location[] {
  const exact = symbols.filter((symbol) => symbol.name === name || symbol.name.replace(/\(.*$/, '') === name)
  const located = exact.filter((symbol): symbol is WorkspaceSymbol & { location: Location } => 'range' in symbol.location)
  if (!located.length) return []
  const best = Math.min(...located.map((symbol) => rankOf(symbol.kind)))
  const seen = new Set<string>()
  return located
    .filter((symbol) => rankOf(symbol.kind) === best)
    .map((symbol) => symbol.location)
    .filter((location) => {
      const key = `${location.uri}:${location.range.start.line}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Words that introduce a declaration, across the languages Lumen knows. */
const DECLARATION_WORDS = [
  'class', 'interface', 'enum', 'record', '@interface', 'object', 'struct', 'trait', 'typealias', 'type',
  'fun', 'def', 'func', 'fn', 'function', 'module', 'namespace', 'protocol', 'union',
]

/** A line that declares `name` — `public final class Name`, `data class Name(`, `fun name(`. */
export function declarationPattern(name: string): RegExp {
  const words = DECLARATION_WORDS.map(escape).join('|')
  return new RegExp(`(?:^|[\\s(])(?:${words})\\s+${escape(name)}\\b`)
}

/** Languages whose files may declare what another's code uses — Java and Kotlin share a classpath. */
const SIBLING_EXTENSIONS: Record<string, string[]> = {
  '.java': ['.kt', '.kts', '.groovy', '.scala'],
  '.kt': ['.java', '.kts'],
  '.ts': ['.tsx', '.d.ts', '.js', '.mjs', '.cjs'],
  '.tsx': ['.ts', '.d.ts'],
  '.js': ['.mjs', '.cjs', '.jsx', '.ts'],
  '.c': ['.h'],
  '.cpp': ['.h', '.hpp', '.hh', '.hxx', '.cc', '.cxx'],
}

/** The extensions a declaration may come from, given the languages' own. */
export function searchExtensions(extensions: string[]): Set<string> {
  return new Set([...extensions, ...extensions.flatMap((ext) => SIBLING_EXTENSIONS[ext] ?? [])])
}

export interface TextHit {
  path: string
  /** 1-based, as the search reports it. */
  line: number
  text: string
}

/** The search hits that declare `name` in files of the wanted extensions, as locations. */
export function declarationHits(hits: TextHit[], name: string, extensions: Set<string>): Location[] {
  const pattern = declarationPattern(name)
  return hits
    .filter((hit) => [...extensions].some((ext) => hit.path.endsWith(ext)))
    .filter((hit) => pattern.test(hit.text))
    .map((hit) => {
      const column = Math.max(0, hit.text.indexOf(name))
      const start = { line: hit.line - 1, character: column }
      return { uri: pathToUri(hit.path), range: { start, end: { line: start.line, character: column + name.length } } }
    })
}

/**
 * The project module a `jdt://` URI belongs to — jdtls puts it right after
 * `?=` (`…/Foo.java?=neoforge/%5C/home/…`); `null` for any other location.
 */
export function jdtModule(uri: string): string | null {
  if (!uri.startsWith('jdt://')) return null
  const query = uri.split('?=')[1]
  if (!query) return null
  return decodeURIComponent(query.split('/')[0]) || null
}

/**
 * A class that several modules of one build see (through their own copies of a
 * dependency) comes back once per module. Only the one of the module the
 * request came from is wanted; when no location fits, all stay.
 */
export function preferCurrentModule(locations: Location[], currentFile: string): Location[] {
  if (locations.length < 2) return locations
  const segments = new Set(currentFile.split(/[\\/]/))
  const own = locations.filter((location) => {
    const module = jdtModule(location.uri)
    return module !== null && segments.has(module)
  })
  return own.length ? own : locations
}
