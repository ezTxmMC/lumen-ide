/**
 * The interpreter for node graphs.
 *
 * The renderer's CSP forbids `eval`, so user add-ons are not run as JavaScript
 * but interpreted here, node by node:
 *
 * - Execution follows the exec edges, starting from an event node.
 * - Data pins are read only when needed. Pure nodes, the ones without exec
 *   pins, compute at most once per executed exec node (memoised).
 * - A step limit and an AbortSignal prevent endless loops.
 * - Errors carry the id of the node they arose in.
 *
 * Everything touching the IDE goes through `GraphHost`; the tests put a stand-in
 * there (scripts/check-addons.ts).
 */

import { t } from '@/i18n'
import type { Graph, GraphEdge, GraphNode } from './schema'
import { NODE_CATALOG, type NodeDef, type PinDef } from './catalog'
import { coerce, GraphError, StopSignal } from './values'

export { coerce, GraphError, StopSignal, toText } from './values'

/* ------------------------------------------------------------------ *
 * Host
 * ------------------------------------------------------------------ */

export interface ShellResult {
  code: number
  stdout: string
  stderr: string
}

/** The interface to the IDE — `runtime.ts` in the renderer, a stand-in in tests. */
export interface GraphHost {
  selection(): string
  replaceSelection(text: string): void
  insert(text: string): void
  documentText(): string
  currentLine(): { text: string; number: number }
  filePath(): string
  languageId(): string
  cursor(): { line: number; column: number }
  gotoLine(line: number): void

  notify(message: string, kind: 'info' | 'success' | 'warning' | 'error'): void
  prompt(title: string, label: string, initial: string): Promise<string | null>
  pick(title: string, items: string[]): Promise<string | null>
  output(text: string): void

  openFile(path: string): Promise<void>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  shell(addonId: string, command: string): Promise<ShellResult>
  runTask(id: string): Promise<boolean>

  runCommand(id: string): boolean
  setTheme(id: string): void
  toggleSetting(key: string, mode: string): void
}

/* ------------------------------------------------------------------ *
 * Context for a node
 * ------------------------------------------------------------------ */

export interface NodeContext {
  node: GraphNode
  host: GraphHost
  addonId: string
  /** Graph-local variables of this run. */
  vars: Map<string, unknown>
  /** Data of the triggering event (a path, and so on). */
  payload: Record<string, unknown>
  signal: AbortSignal
  /** An input's value, already coerced to the pin's type. */
  input(pin: string): Promise<unknown>
  /** A setting's value (a choice, a variable name …). */
  setting(id: string): string
}

export interface ExecContext extends NodeContext {
  /** Set an output value, readable by the nodes that follow. */
  output(pin: string, value: unknown): void
  /** Run the flow hanging off an exec output and wait for it. */
  follow(pin: string): Promise<void>
}

/** Inline value of an unconnected pin; lists arrive as comma-separated text. */
function inlineValue(node: GraphNode, pin: PinDef): unknown {
  const raw = node.values?.[pin.id] ?? pin.default
  if (pin.type !== 'list') return coerce(raw ?? '', pin.type)
  if (Array.isArray(raw)) return raw
  return String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/* ------------------------------------------------------------------ *
 * Running
 * ------------------------------------------------------------------ */

export interface GraphTrace {
  /** A node is being executed or computed. */
  visit?(nodeId: string): void
  /** A pin has received a value. */
  value?(nodeId: string, pin: string, value: unknown): void
  /** Awaited before every exec node (slow motion in a test run). */
  step?(nodeId: string): Promise<void> | void
}

export interface RunOptions {
  /** Id of the starting node, usually an event node. */
  entry: string
  host: GraphHost
  addonId: string
  payload?: Record<string, unknown>
  signal?: AbortSignal
  /** Maximum number of nodes executed or computed. Defaults to 10,000. */
  maxSteps?: number
  trace?: GraphTrace
  catalog?: Map<string, NodeDef>
}

export interface RunResult {
  steps: number
  /** Ended by a stop node. */
  stopped: boolean
}

export const DEFAULT_MAX_STEPS = 10_000

const key = (node: string, pin: string) => `${node}:${pin}`

export const isExecNode = (def: NodeDef) =>
  def.inputs.some((p) => p.type === 'exec') || def.outputs.some((p) => p.type === 'exec')

export async function runGraph(graph: Graph, options: RunOptions): Promise<RunResult> {
  const catalog = options.catalog ?? NODE_CATALOG
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  const signal = options.signal ?? new AbortController().signal
  const trace = options.trace ?? {}
  const payload = options.payload ?? {}
  const vars = new Map<string, unknown>()

  const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, GraphEdge>()
  const outgoing = new Map<string, GraphEdge[]>()
  for (const edge of graph.edges) {
    incoming.set(key(edge.to.node, edge.to.pin), edge)
    const list = outgoing.get(key(edge.from.node, edge.from.pin)) ?? []
    list.push(edge)
    outgoing.set(key(edge.from.node, edge.from.pin), list)
  }

  /** Outputs of exec nodes that have already run. */
  const outputs = new Map<string, unknown>()
  /** Results of pure nodes — valid for the exec node currently running. */
  let pureCache = new Map<string, Record<string, unknown>>()
  const evaluating = new Set<string>()
  let steps = 0

  const defOf = (node: GraphNode): NodeDef => {
    const def = catalog.get(node.type)
    if (!def) throw new GraphError(t('addonStudio.run.unknownNode', { type: node.type }), node.id)
    return def
  }

  const tick = (nodeId: string) => {
    if (signal.aborted) throw new GraphError(t('addonStudio.run.aborted'), nodeId)
    steps++
    if (steps > maxSteps) throw new GraphError(t('addonStudio.run.stepLimit', { count: maxSteps }), nodeId)
    trace.visit?.(nodeId)
  }

  const wrap = (err: unknown, nodeId: string): Error => {
    if (err instanceof GraphError || err instanceof StopSignal) return err
    return new GraphError((err as Error)?.message ?? String(err), nodeId)
  }

  async function readInput(node: GraphNode, pinId: string): Promise<unknown> {
    const def = defOf(node)
    const pin = def.inputs.find((p) => p.id === pinId)
    if (!pin) throw new GraphError(t('addonStudio.run.unknownPin', { pin: pinId }), node.id)
    const edge = incoming.get(key(node.id, pinId))
    if (!edge) return inlineValue(node, pin)

    const source = nodes.get(edge.from.node)
    if (!source) return inlineValue(node, pin)
    const sourceDef = defOf(source)
    if (isExecNode(sourceDef)) return coerce(outputs.get(key(source.id, edge.from.pin)), pin.type)

    const computed = await computePure(source, sourceDef)
    return coerce(computed[edge.from.pin], pin.type)
  }

  async function computePure(node: GraphNode, def: NodeDef): Promise<Record<string, unknown>> {
    const cached = pureCache.get(node.id)
    if (cached) return cached
    if (evaluating.has(node.id)) throw new GraphError(t('addonStudio.run.cycle'), node.id)
    if (!def.compute) return {}
    evaluating.add(node.id)
    tick(node.id)
    try {
      const result = await def.compute(baseContext(node))
      pureCache.set(node.id, result)
      for (const [pin, value] of Object.entries(result)) trace.value?.(node.id, pin, value)
      return result
    } catch (err) {
      throw wrap(err, node.id)
    } finally {
      evaluating.delete(node.id)
    }
  }

  function baseContext(node: GraphNode): NodeContext {
    return {
      node,
      host: options.host,
      addonId: options.addonId,
      vars,
      payload,
      signal,
      input: (pin) => readInput(node, pin),
      setting: (id) => {
        const def = catalog.get(node.type)
        const fallback = def?.settings?.find((s) => s.id === id)?.default ?? ''
        return String(node.values?.[id] ?? fallback)
      },
    }
  }

  const nextNode = (nodeId: string, pin: string) => outgoing.get(key(nodeId, pin))?.[0]?.to.node ?? null

  async function execute(startId: string): Promise<void> {
    let current: string | null = startId
    while (current) {
      const node = nodes.get(current)
      if (!node) return
      const def = defOf(node)
      if (!def.run) throw new GraphError(t('addonStudio.run.notExecutable'), node.id)
      tick(node.id)
      if (trace.step) await trace.step(node.id)
      pureCache = new Map()
      const ctx: ExecContext = {
        ...baseContext(node),
        output: (pin, value) => {
          outputs.set(key(node.id, pin), value)
          trace.value?.(node.id, pin, value)
        },
        follow: async (pin) => {
          const target = nextNode(node.id, pin)
          if (target) await execute(target)
        },
      }
      let next: string | null | void
      try {
        next = await def.run(ctx)
      } catch (err) {
        throw wrap(err, node.id)
      }
      if (!next) return
      current = nextNode(node.id, next)
    }
  }

  if (!nodes.has(options.entry)) throw new GraphError(t('addonStudio.run.noEntry'))
  try {
    await execute(options.entry)
  } catch (err) {
    if (err instanceof StopSignal) return { steps, stopped: true }
    throw err
  }
  return { steps, stopped: false }
}

/** Event nodes of a graph, optionally of one kind only. */
export function eventNodes(graph: Graph, event?: string, catalog = NODE_CATALOG): GraphNode[] {
  return graph.nodes.filter((node) => {
    const def = catalog.get(node.type)
    if (!def?.event) return false
    return !event || def.event === event
  })
}
