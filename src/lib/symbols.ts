/**
 * A cache of document symbols (the outline) per file. The editor keeps it
 * current; the outline panel and the status bar only read.
 */

import {
  rangeContains,
  type DocumentSymbol, type Position, type SymbolInformation,
} from '@/core/lsp/protocol'

/** A unified shape — hierarchical, even when the server delivers a flat list. */
export interface OutlineNode {
  name: string
  detail?: string
  kind: number
  deprecated?: boolean
  range: { start: Position; end: Position }
  selectionRange: { start: Position; end: Position }
  children: OutlineNode[]
}

const cache = new Map<string, OutlineNode[]>()
const listeners = new Set<() => void>()
let version = 0

export const symbolStore = {
  get(path: string | null): OutlineNode[] {
    return (path && cache.get(path)) || []
  },
  set(path: string, symbols: (DocumentSymbol | SymbolInformation)[]) {
    cache.set(path, normalize(symbols))
    version++
    for (const fn of listeners) fn()
  },
  clear(path: string) {
    if (cache.delete(path)) {
      version++
      for (const fn of listeners) fn()
    }
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
  getVersion: () => version,
}

function normalize(symbols: (DocumentSymbol | SymbolInformation)[]): OutlineNode[] {
  if (!symbols.length) return []
  if ('location' in symbols[0]) {
    // A flat SymbolInformation list: nest it through containerName.
    const flat = symbols as SymbolInformation[]
    const nodes = flat.map<OutlineNode>((s) => ({
      name: s.name,
      kind: s.kind,
      deprecated: s.deprecated,
      range: s.location.range,
      selectionRange: s.location.range,
      children: [],
    }))
    const roots: OutlineNode[] = []
    flat.forEach((s, i) => {
      const parent = s.containerName
        ? nodes.find((n, j) => j !== i && n.name === s.containerName && rangeContains(n.range, nodes[i].range.start))
        : undefined
      ;(parent?.children ?? roots).push(nodes[i])
    })
    return sortNodes(roots)
  }
  const tree = (symbols as DocumentSymbol[]).map<OutlineNode>((s) => ({
    name: s.name,
    detail: s.detail,
    kind: s.kind,
    deprecated: s.deprecated || s.tags?.includes(1),
    range: s.range,
    selectionRange: s.selectionRange,
    children: normalize(s.children ?? []),
  }))
  return sortNodes(tree)
}

function sortNodes(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.sort((a, b) =>
    a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character)
}

/** The path of symbols enclosing the position — for the breadcrumbs. */
export function symbolPathAt(nodes: OutlineNode[], pos: Position): OutlineNode[] {
  const path: OutlineNode[] = []
  let level = nodes
  for (;;) {
    const hit = level.find((n) => rangeContains(n.range, pos))
    if (!hit) break
    path.push(hit)
    level = hit.children
  }
  return path
}

/** Every node flat, with its depth — for the palettes. */
export function flattenSymbols(nodes: OutlineNode[], depth = 0): { node: OutlineNode; depth: number }[] {
  return nodes.flatMap((node) => [{ node, depth }, ...flattenSymbols(node.children, depth + 1)])
}
