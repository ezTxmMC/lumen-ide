/**
 * The node editor of the visual scripting — our own implementation, HTML for
 * the nodes and SVG for the connections.
 *
 * Controls: dragging on empty space selects with a rectangle, middle-click or
 * space plus drag pans, Ctrl plus the wheel zooms. Right-click or space opens
 * the node palette; so does a connection dragged into empty space, filtered by
 * the pin type. Del deletes, Ctrl+C/X/V/D copies, cuts, pastes and duplicates,
 * Ctrl+Z/Y undoes and redoes.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Map as MapIcon, Maximize2, MessageSquarePlus, Plus, Redo2, Undo2,
} from 'lucide-react'
import { useT } from '@/i18n'
import {
  NODE_CATALOG, PIN_COLORS, canConnect, categoryColor, choiceLabel, nodeTitle, pinLabel, settingLabel,
  type NodeDef, type PinDef,
} from '@/core/user-addons/catalog'
import {
  newId, type Graph, type GraphComment, type GraphEdge, type GraphNode,
} from '@/core/user-addons/schema'
import {
  BODY_PADDING, HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT, SETTING_HEIGHT, contains, edgePath, intersects,
  nodeHeight, normalizeRect, pinPosition, type Rect,
} from './geometry'
import { NodePalette, matchingPin, type PendingPin } from './NodePalette'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
const GRID = 20
const SNAP = 8
const HISTORY_LIMIT = 200
const HOT_MS = 700

interface View {
  x: number
  y: number
  zoom: number
}

type Drag =
  | { kind: 'pan'; startX: number; startY: number; view: View }
  | {
    kind: 'move'
    startX: number
    startY: number
    before: Graph
    nodes: Map<string, { x: number; y: number }>
    comments: Map<string, { x: number; y: number }>
    moved: boolean
  }
  | { kind: 'band'; x0: number; y0: number; additive: boolean; base: Set<string> }
  | { kind: 'resize'; id: string; startX: number; startY: number; w: number; h: number; before: Graph }
  | { kind: 'connect'; from: PendingPin }

interface Clipboard {
  nodes: GraphNode[]
  edges: GraphEdge[]
  comments: GraphComment[]
}

/** A clipboard for nodes — shared across every graph in the Studio. */
let clipboard: Clipboard | null = null

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
const snap = (value: number, free: boolean) => (free ? value : Math.round(value / SNAP) * SNAP)
const isField = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
}

export function nodeRect(node: GraphNode): Rect {
  return { x: node.x, y: node.y, w: NODE_WIDTH, h: nodeHeight(NODE_CATALOG.get(node.type)) }
}

/** Connects two pins, replacing an occupied single-input connection. */
export function connectPins(graph: Graph, a: PendingPin, b: PendingPin): Graph | null {
  if (a.side === b.side || a.node === b.node) return null
  const out = a.side === 'out' ? a : b
  const input = a.side === 'out' ? b : a
  if (!canConnect(out.type, input.type)) return null
  const edges = graph.edges.filter((edge) => {
    const sameInput = edge.to.node === input.node && edge.to.pin === input.pin
    const sameOutput = edge.from.node === out.node && edge.from.pin === out.pin
    if (input.type !== 'exec' && sameInput) return false
    if (out.type === 'exec' && sameOutput) return false
    return !(sameInput && sameOutput)
  })
  edges.push({ id: newId('e'), from: { node: out.node, pin: out.pin }, to: { node: input.node, pin: input.pin } })
  return { ...graph, edges }
}

export function NodeEditor({
  graph, onChange, allow, resetKey, highlight, pinValues, errorNode, focusNode,
}: {
  graph: Graph
  onChange: (graph: Graph) => void
  /** The nodes the palette offers. */
  allow?: (def: NodeDef) => boolean
  /** When the key changes, the history restarts and the view adjusts. */
  resetKey: string
  /** Node id → when it was last visited in a test run. */
  highlight?: Record<string, number>
  /** `node:pin` → the value as text, for the tooltip. */
  pinValues?: Record<string, string>
  errorNode?: string | null
  focusNode?: { id: string; token: number } | null
}) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 })
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [band, setBand] = useState<Rect | null>(null)
  const [pending, setPending] = useState<{ from: PendingPin; x: number; y: number } | null>(null)
  const [palette, setPalette] = useState<{ x: number; y: number; wx: number; wy: number; from: PendingPin | null } | null>(null)
  const [editingComment, setEditingComment] = useState<string | null>(null)
  const [minimap, setMinimap] = useState(true)
  const [, setTick] = useState(0)

  const graphRef = useRef(graph)
  graphRef.current = graph
  const viewRef = useRef(view)
  viewRef.current = view
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const dragRef = useRef<Drag | null>(null)
  const spaceRef = useRef({ down: false, used: false })
  const mouseRef = useRef({ x: 0, y: 0, inside: false })
  const undoRef = useRef<Graph[]>([])
  const redoRef = useRef<Graph[]>([])
  const mergeRef = useRef<{ key: string; at: number } | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)

  const defs = useMemo(() => new Map(graph.nodes.map((n) => [n.id, NODE_CATALOG.get(n.type)])), [graph.nodes])

  /* ---------------------------------------------------------------- *
   * History
   * ---------------------------------------------------------------- */

  const record = useCallback((before: Graph) => {
    undoRef.current = [...undoRef.current, before].slice(-HISTORY_LIMIT)
    redoRef.current = []
    mergeRef.current = null
    setHistoryVersion((v) => v + 1)
  }, [])

  /** Apply a change; the same `mergeKey` in quick succession makes one step. */
  const commit = useCallback((next: Graph, mergeKey?: string) => {
    const now = Date.now()
    const last = mergeRef.current
    const merge = Boolean(mergeKey && last && last.key === mergeKey && now - last.at < 1200)
    if (!merge) {
      undoRef.current = [...undoRef.current, graphRef.current].slice(-HISTORY_LIMIT)
      setHistoryVersion((v) => v + 1)
    }
    redoRef.current = []
    mergeRef.current = mergeKey ? { key: mergeKey, at: now } : null
    onChange(next)
  }, [onChange])

  const undo = useCallback(() => {
    const previous = undoRef.current.at(-1)
    if (!previous) return
    undoRef.current = undoRef.current.slice(0, -1)
    redoRef.current = [...redoRef.current, graphRef.current]
    mergeRef.current = null
    setHistoryVersion((v) => v + 1)
    onChange(previous)
  }, [onChange])

  const redo = useCallback(() => {
    const next = redoRef.current.at(-1)
    if (!next) return
    redoRef.current = redoRef.current.slice(0, -1)
    undoRef.current = [...undoRef.current, graphRef.current]
    mergeRef.current = null
    setHistoryVersion((v) => v + 1)
    onChange(next)
  }, [onChange])

  /* ---------------------------------------------------------------- *
   * The view
   * ---------------------------------------------------------------- */

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    const v = viewRef.current
    return {
      x: (clientX - (rect?.left ?? 0) - v.x) / v.zoom,
      y: (clientY - (rect?.top ?? 0) - v.y) / v.zoom,
    }
  }, [])

  const fit = useCallback((onlySelection = false) => {
    const current = graphRef.current
    const chosen = onlySelection ? current.nodes.filter((n) => selectionRef.current.has(n.id)) : current.nodes
    const rects = chosen.map(nodeRect)
    const el = containerRef.current
    if (!el) return
    const w = el.clientWidth
    const h = el.clientHeight
    if (!rects.length) {
      setView({ x: 40, y: 40, zoom: 1 })
      return
    }
    const minX = Math.min(...rects.map((r) => r.x))
    const minY = Math.min(...rects.map((r) => r.y))
    const maxX = Math.max(...rects.map((r) => r.x + r.w))
    const maxY = Math.max(...rects.map((r) => r.y + r.h))
    const zoom = clampZoom(Math.min(1, (w - 80) / (maxX - minX || 1), (h - 80) / (maxY - minY || 1)))
    setView({
      zoom,
      x: (w - (maxX - minX) * zoom) / 2 - minX * zoom,
      y: (h - (maxY - minY) * zoom) / 2 - minY * zoom,
    })
  }, [])

  useLayoutEffect(() => {
    undoRef.current = []
    redoRef.current = []
    mergeRef.current = null
    setSelection(new Set())
    setPalette(null)
    setHistoryVersion((v) => v + 1)
    fit()
  }, [resetKey, fit])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!focusNode) return
    const node = graphRef.current.nodes.find((n) => n.id === focusNode.id)
    const el = containerRef.current
    if (!node || !el) return
    const zoom = viewRef.current.zoom
    setView({ zoom, x: el.clientWidth / 2 - (node.x + NODE_WIDTH / 2) * zoom, y: el.clientHeight / 2 - (node.y + 40) * zoom })
    setSelection(new Set([node.id]))
  }, [focusNode])

  // The wheel: Ctrl zooms around the pointer, otherwise it pans (non-passive, for preventDefault).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('[data-no-wheel]')) return
      event.preventDefault()
      const v = viewRef.current
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect()
        const px = event.clientX - rect.left
        const py = event.clientY - rect.top
        const zoom = clampZoom(v.zoom * Math.exp(-event.deltaY * 0.0015))
        setView({ zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom })
        return
      }
      const dx = event.shiftKey ? event.deltaY : event.deltaX
      const dy = event.shiftKey ? 0 : event.deltaY
      setView({ ...v, x: v.x - dx, y: v.y - dy })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Fade the test-run glow out again after a moment.
  useEffect(() => {
    if (!highlight) return
    const now = Date.now()
    const recent = Object.values(highlight).some((ts) => now - ts < HOT_MS)
    if (!recent) return
    const timer = setTimeout(() => setTick((n) => n + 1), HOT_MS)
    return () => clearTimeout(timer)
  }, [highlight])

  /* ---------------------------------------------------------------- *
   * Dragging
   * ---------------------------------------------------------------- */

  const onDragMove = useCallback((event: MouseEvent) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.kind === 'pan') {
      setView({ ...drag.view, x: drag.view.x + event.clientX - drag.startX, y: drag.view.y + event.clientY - drag.startY })
      spaceRef.current.used = true
      return
    }
    const world = toWorld(event.clientX, event.clientY)
    if (drag.kind === 'move') {
      const dx = world.x - drag.startX
      const dy = world.y - drag.startY
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return
      drag.moved = true
      const free = event.altKey
      onChange({
        ...drag.before,
        nodes: drag.before.nodes.map((n) => {
          const start = drag.nodes.get(n.id)
          return start ? { ...n, x: snap(start.x + dx, free), y: snap(start.y + dy, free) } : n
        }),
        comments: (drag.before.comments ?? []).map((c) => {
          const start = drag.comments.get(c.id)
          return start ? { ...c, x: snap(start.x + dx, free), y: snap(start.y + dy, free) } : c
        }),
      })
      return
    }
    if (drag.kind === 'resize') {
      onChange({
        ...drag.before,
        comments: (drag.before.comments ?? []).map((c) => (c.id === drag.id
          ? { ...c, w: Math.max(160, snap(drag.w + world.x - drag.startX, false)), h: Math.max(80, snap(drag.h + world.y - drag.startY, false)) }
          : c)),
      })
      return
    }
    if (drag.kind === 'band') {
      const rect = normalizeRect(drag.x0, drag.y0, world.x, world.y)
      setBand(rect)
      const next = new Set(drag.base)
      for (const node of graphRef.current.nodes) {
        if (intersects(rect, nodeRect(node))) next.add(node.id)
      }
      for (const comment of graphRef.current.comments ?? []) {
        if (contains(rect, comment)) next.add(comment.id)
      }
      setSelection(next)
      return
    }
    setPending({ from: drag.from, x: world.x, y: world.y })
  }, [onChange, toWorld])

  const onDragEnd = useCallback((event: MouseEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.kind === 'move' && drag.moved) record(drag.before)
    if (drag.kind === 'resize') record(drag.before)
    if (drag.kind === 'band') setBand(null)
    if (drag.kind !== 'connect') return

    setPending(null)
    const target = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-pin]')
    if (target) {
      const to: PendingPin = {
        node: target.dataset.node ?? '',
        pin: target.dataset.pinId ?? '',
        type: target.dataset.type as PendingPin['type'],
        side: target.dataset.side as PendingPin['side'],
      }
      const next = connectPins(graphRef.current, drag.from, to)
      if (next) commit(next)
      return
    }
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    if (!inside) return
    const world = toWorld(event.clientX, event.clientY)
    setPalette({ x: event.clientX - rect.left, y: event.clientY - rect.top, wx: world.x, wy: world.y, from: drag.from })
  }, [commit, record, toWorld])

  const beginDrag = useCallback((drag: Drag) => {
    dragRef.current = drag
    const move = (e: MouseEvent) => onDragMove(e)
    const up = (e: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      onDragEnd(e)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [onDragEnd, onDragMove])

  const startPan = (event: React.MouseEvent) => {
    event.preventDefault()
    beginDrag({ kind: 'pan', startX: event.clientX, startY: event.clientY, view: viewRef.current })
  }

  const onBackgroundDown = (event: React.MouseEvent) => {
    setPalette(null)
    containerRef.current?.focus()
    if (event.button === 1 || (event.button === 0 && spaceRef.current.down)) {
      startPan(event)
      return
    }
    if (event.button !== 0) return
    const world = toWorld(event.clientX, event.clientY)
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    const base = additive ? new Set(selectionRef.current) : new Set<string>()
    if (!additive) setSelection(base)
    setEditingComment(null)
    beginDrag({ kind: 'band', x0: world.x, y0: world.y, additive, base })
  }

  const startMove = (event: React.MouseEvent, id: string) => {
    if (event.button === 1 || (event.button === 0 && spaceRef.current.down)) {
      startPan(event)
      return
    }
    if (event.button !== 0) return
    event.stopPropagation()
    containerRef.current?.focus()
    setPalette(null)
    let chosen = selectionRef.current
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      chosen = new Set(chosen)
      if (chosen.has(id)) chosen.delete(id)
      if (!selectionRef.current.has(id)) chosen.add(id)
      setSelection(chosen)
    }
    if (!chosen.has(id) && !(event.shiftKey || event.ctrlKey || event.metaKey)) {
      chosen = new Set([id])
      setSelection(chosen)
    }
    const current = graphRef.current
    const nodes = new Map<string, { x: number; y: number }>()
    const comments = new Map<string, { x: number; y: number }>()
    for (const node of current.nodes) {
      if (chosen.has(node.id)) nodes.set(node.id, { x: node.x, y: node.y })
    }
    for (const comment of current.comments ?? []) {
      if (!chosen.has(comment.id)) continue
      comments.set(comment.id, { x: comment.x, y: comment.y })
      // Frames carry the nodes lying inside them along.
      for (const node of current.nodes) {
        if (contains(comment, nodeRect(node))) nodes.set(node.id, { x: node.x, y: node.y })
      }
    }
    const world = toWorld(event.clientX, event.clientY)
    beginDrag({ kind: 'move', startX: world.x, startY: world.y, before: current, nodes, comments, moved: false })
  }

  const startConnect = (event: React.MouseEvent, node: GraphNode, pin: PinDef, side: 'in' | 'out') => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    const current = graphRef.current
    // Detach an occupied data input and keep dragging from its origin.
    const existing = side === 'in' && pin.type !== 'exec'
      ? current.edges.find((e) => e.to.node === node.id && e.to.pin === pin.id)
      : undefined
    const world = toWorld(event.clientX, event.clientY)
    if (existing) {
      const source = current.nodes.find((n) => n.id === existing.from.node)
      const sourcePin = source ? NODE_CATALOG.get(source.type)?.outputs.find((p) => p.id === existing.from.pin) : undefined
      commit({ ...current, edges: current.edges.filter((e) => e.id !== existing.id) })
      if (source && sourcePin) {
        const from: PendingPin = { node: source.id, pin: sourcePin.id, type: sourcePin.type, side: 'out' }
        setPending({ from, x: world.x, y: world.y })
        beginDrag({ kind: 'connect', from })
        return
      }
    }
    const from: PendingPin = { node: node.id, pin: pin.id, type: pin.type, side }
    setPending({ from, x: world.x, y: world.y })
    beginDrag({ kind: 'connect', from })
  }

  /* ---------------------------------------------------------------- *
   * Editing
   * ---------------------------------------------------------------- */

  const addNode = (def: NodeDef, wx: number, wy: number, from: PendingPin | null) => {
    const node: GraphNode = { id: newId('n'), type: def.type, x: snap(wx, false), y: snap(wy - HEADER_HEIGHT / 2, false) }
    let next: Graph = { ...graphRef.current, nodes: [...graphRef.current.nodes, node] }
    const target = matchingPin(def, from)
    if (from && target) {
      const side = from.side === 'out' ? 'in' : 'out'
      if (side === 'out') next = { ...next, nodes: next.nodes.map((n) => (n.id === node.id ? { ...n, x: n.x - NODE_WIDTH } : n)) }
      next = connectPins(next, from, { node: node.id, pin: target.id, type: target.type, side }) ?? next
    }
    commit(next)
    setSelection(new Set([node.id]))
    setPalette(null)
    containerRef.current?.focus()
  }

  const setValue = (nodeId: string, key: string, value: string | number | boolean) => {
    const current = graphRef.current
    commit({
      ...current,
      nodes: current.nodes.map((n) => (n.id === nodeId ? { ...n, values: { ...(n.values ?? {}), [key]: value } } : n)),
    }, `value:${nodeId}:${key}`)
  }

  const deleteSelection = () => {
    const chosen = selectionRef.current
    if (!chosen.size) return
    const current = graphRef.current
    commit({
      nodes: current.nodes.filter((n) => !chosen.has(n.id)),
      edges: current.edges.filter((e) => !chosen.has(e.id) && !chosen.has(e.from.node) && !chosen.has(e.to.node)),
      comments: (current.comments ?? []).filter((c) => !chosen.has(c.id)),
    })
    setSelection(new Set())
  }

  const copySelection = () => {
    const chosen = selectionRef.current
    const current = graphRef.current
    const nodes = current.nodes.filter((n) => chosen.has(n.id))
    if (!nodes.length && !(current.comments ?? []).some((c) => chosen.has(c.id))) return
    clipboard = structuredClone({
      nodes,
      edges: current.edges.filter((e) => chosen.has(e.from.node) && chosen.has(e.to.node)),
      comments: (current.comments ?? []).filter((c) => chosen.has(c.id)),
    })
  }

  const paste = (source: Clipboard | null, at?: { x: number; y: number }) => {
    if (!source) return
    const items = [...source.nodes, ...source.comments]
    if (!items.length) return
    const minX = Math.min(...items.map((i) => i.x))
    const minY = Math.min(...items.map((i) => i.y))
    const target = at ?? { x: minX + 32, y: minY + 32 }
    const dx = snap(target.x - minX, false)
    const dy = snap(target.y - minY, false)
    const ids = new Map<string, string>()
    const nodes = source.nodes.map((n) => {
      const id = newId('n')
      ids.set(n.id, id)
      return { ...structuredClone(n), id, x: n.x + dx, y: n.y + dy }
    })
    const edges = source.edges.map((e) => ({
      id: newId('e'),
      from: { node: ids.get(e.from.node) ?? e.from.node, pin: e.from.pin },
      to: { node: ids.get(e.to.node) ?? e.to.node, pin: e.to.pin },
    }))
    const comments = source.comments.map((c) => ({ ...c, id: newId('c'), x: c.x + dx, y: c.y + dy }))
    const current = graphRef.current
    commit({
      nodes: [...current.nodes, ...nodes],
      edges: [...current.edges, ...edges],
      comments: [...(current.comments ?? []), ...comments],
    })
    setSelection(new Set([...nodes.map((n) => n.id), ...comments.map((c) => c.id)]))
  }

  const addComment = () => {
    const current = graphRef.current
    const chosen = current.nodes.filter((n) => selectionRef.current.has(n.id)).map(nodeRect)
    const el = containerRef.current
    const v = viewRef.current
    const center = { x: ((el?.clientWidth ?? 600) / 2 - v.x) / v.zoom, y: ((el?.clientHeight ?? 400) / 2 - v.y) / v.zoom }
    const box: Rect = chosen.length
      ? {
        x: Math.min(...chosen.map((r) => r.x)) - 24,
        y: Math.min(...chosen.map((r) => r.y)) - 44,
        w: Math.max(...chosen.map((r) => r.x + r.w)) - Math.min(...chosen.map((r) => r.x)) + 48,
        h: Math.max(...chosen.map((r) => r.y + r.h)) - Math.min(...chosen.map((r) => r.y)) + 68,
      }
      : { x: center.x - 160, y: center.y - 90, w: 320, h: 180 }
    const comment: GraphComment = { id: newId('c'), ...box, text: t('addonStudio.graph.commentDefault') }
    commit({ ...current, comments: [...(current.comments ?? []), comment] })
    setSelection(new Set([comment.id]))
    setEditingComment(comment.id)
  }

  const openPaletteAtMouse = () => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const inside = mouseRef.current.inside
    const x = inside ? mouseRef.current.x - rect.left : rect.width / 2 - 130
    const y = inside ? mouseRef.current.y - rect.top : rect.height / 3
    const world = toWorld(x + rect.left, y + rect.top)
    setPalette({ x, y, wx: world.x, wy: world.y, from: null })
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isField(event.target)) return
    const mod = event.ctrlKey || event.metaKey
    const k = event.key.toLowerCase()
    const handlers: Record<string, () => void> = {
      delete: deleteSelection,
      backspace: deleteSelection,
      'mod+c': copySelection,
      'mod+x': () => { copySelection(); deleteSelection() },
      'mod+v': () => paste(clipboard, mouseRef.current.inside ? toWorld(mouseRef.current.x, mouseRef.current.y) : undefined),
      'mod+d': () => {
        copySelection()
        paste(clipboard)
      },
      'mod+z': undo,
      'mod+shift+z': redo,
      'mod+y': redo,
      'mod+a': () => setSelection(new Set([...graphRef.current.nodes.map((n) => n.id), ...(graphRef.current.comments ?? []).map((c) => c.id)])),
      f: () => fit(selectionRef.current.size > 0),
      escape: () => {
        if (!selectionRef.current.size) return
        setSelection(new Set())
      },
    }
    const combo = `${mod ? 'mod+' : ''}${mod && event.shiftKey ? 'shift+' : ''}${k}`
    if (k === ' ') {
      event.preventDefault()
      if (!event.repeat) spaceRef.current = { down: true, used: false }
      return
    }
    const handler = handlers[combo]
    if (!handler) return
    // Esc with nothing selected belongs to the Studio, which closes.
    if (combo === 'escape' && !selectionRef.current.size) return
    event.preventDefault()
    event.stopPropagation()
    handler()
  }

  const onKeyUp = (event: React.KeyboardEvent) => {
    if (event.key !== ' ' || isField(event.target)) return
    const { used } = spaceRef.current
    spaceRef.current = { down: false, used: false }
    if (!used) openPaletteAtMouse()
  }

  /* ---------------------------------------------------------------- *
   * Presentation
   * ---------------------------------------------------------------- */

  const connected = useMemo(() => {
    const set = new Set<string>()
    for (const e of graph.edges) {
      set.add(`${e.from.node}:out:${e.from.pin}`)
      set.add(`${e.to.node}:in:${e.to.pin}`)
    }
    return set
  }, [graph.edges])

  const now = Date.now()
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))

  const edgeElements = graph.edges.map((edge) => {
    const fromNode = nodeById.get(edge.from.node)
    const toNode = nodeById.get(edge.to.node)
    if (!fromNode || !toNode) return null
    const fromDef = defs.get(fromNode.id)
    const pinType = fromDef?.outputs.find((p) => p.id === edge.from.pin)?.type ?? 'any'
    const a = pinPosition(fromNode, fromDef, 'out', edge.from.pin)
    const b = pinPosition(toNode, defs.get(toNode.id), 'in', edge.to.pin)
    const d = edgePath(a.x, a.y, b.x, b.y)
    const selected = selection.has(edge.id)
    const hot = highlight && now - (highlight[toNode.id] ?? 0) < HOT_MS && pinType === 'exec'
    return (
      <g key={edge.id}>
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={12}
          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
          onMouseDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            containerRef.current?.focus()
            if (e.altKey) {
              commit({ ...graphRef.current, edges: graphRef.current.edges.filter((x) => x.id !== edge.id) })
              return
            }
            setSelection(new Set([edge.id]))
          }}
        />
        <path
          d={d}
          fill="none"
          stroke={selected ? 'var(--c-accent)' : PIN_COLORS[pinType]}
          strokeOpacity={selected || hot ? 1 : 0.75}
          strokeWidth={(pinType === 'exec' ? 2.6 : 2) + (selected || hot ? 1 : 0)}
          style={{ pointerEvents: 'none', filter: hot ? 'drop-shadow(0 0 4px var(--c-accent))' : undefined }}
        />
      </g>
    )
  })

  let pendingPath: string | null = null
  if (pending) {
    const node = nodeById.get(pending.from.node)
    if (node) {
      const p = pinPosition(node, defs.get(node.id), pending.from.side, pending.from.pin)
      pendingPath = pending.from.side === 'out' ? edgePath(p.x, p.y, pending.x, pending.y) : edgePath(pending.x, pending.y, p.x, p.y)
    }
  }

  const gridSize = GRID * view.zoom

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative h-full w-full overflow-hidden bg-bg outline-none select-none"
      style={{
        backgroundImage: 'radial-gradient(circle, var(--c-border-strong) 1px, transparent 1.2px)',
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        cursor: spaceRef.current.down ? 'grab' : undefined,
      }}
      onMouseDown={onBackgroundDown}
      onMouseMove={(e) => { mouseRef.current = { x: e.clientX, y: e.clientY, inside: true } }}
      onMouseLeave={() => { mouseRef.current.inside = false }}
      onContextMenu={(e) => {
        if (isField(e.target)) return
        e.preventDefault()
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const world = toWorld(e.clientX, e.clientY)
        setPalette({ x: e.clientX - rect.left, y: e.clientY - rect.top, wx: world.x, wy: world.y, from: null })
      }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => { spaceRef.current = { down: false, used: false } }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        {/* Kommentarrahmen */}
        {(graph.comments ?? []).map((comment) => {
          const selected = selection.has(comment.id)
          return (
            <div
              key={comment.id}
              className="absolute rounded-lumen border-2"
              style={{
                left: comment.x,
                top: comment.y,
                width: comment.w,
                height: comment.h,
                borderColor: selected ? 'var(--c-accent)' : `${comment.color ?? '#8b939f'}66`,
                background: `${comment.color ?? '#8b939f'}14`,
                pointerEvents: 'none',
              }}
            >
              <div
                className="flex h-7 cursor-move items-center px-2 text-[12px] font-medium text-muted"
                style={{ pointerEvents: 'auto', background: `${comment.color ?? '#8b939f'}26` }}
                onMouseDown={(e) => startMove(e, comment.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setEditingComment(comment.id)
                }}
              >
                {editingComment === comment.id && (
                  <input
                    autoFocus
                    value={comment.text}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => commit({
                      ...graphRef.current,
                      comments: (graphRef.current.comments ?? []).map((c) => (c.id === comment.id ? { ...c, text: e.target.value } : c)),
                    }, `comment:${comment.id}`)}
                    onBlur={() => setEditingComment(null)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== 'Escape') return
                      e.stopPropagation()
                      setEditingComment(null)
                      containerRef.current?.focus()
                    }}
                    className="w-full bg-transparent text-[12px] text-fg outline-none"
                  />
                )}
                {editingComment !== comment.id && <span className="truncate">{comment.text || t('addonStudio.graph.commentDefault')}</span>}
              </div>
              <div
                className="absolute right-0 bottom-0 size-3 cursor-nwse-resize"
                style={{ pointerEvents: 'auto', background: `linear-gradient(135deg, transparent 50%, ${selected ? 'var(--c-accent)' : '#8b939f88'} 50%)` }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  const world = toWorld(e.clientX, e.clientY)
                  beginDrag({ kind: 'resize', id: comment.id, startX: world.x, startY: world.y, w: comment.w, h: comment.h, before: graphRef.current })
                }}
              />
            </div>
          )
        })}

        {/* Verbindungen */}
        <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} style={{ pointerEvents: 'none' }}>
          {edgeElements}
          {pendingPath && (
            <path
              d={pendingPath}
              fill="none"
              stroke={PIN_COLORS[pending?.from.type ?? 'any']}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
        </svg>

        {/* Knoten */}
        {graph.nodes.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            def={defs.get(node.id)}
            selected={selection.has(node.id)}
            hot={Boolean(highlight && now - (highlight[node.id] ?? 0) < HOT_MS)}
            error={errorNode === node.id}
            connected={connected}
            pinValues={pinValues}
            pending={pending?.from ?? null}
            onHeaderDown={(e) => startMove(e, node.id)}
            onPinDown={(e, pin, side) => startConnect(e, node, pin, side)}
            onValue={(key, value) => setValue(node.id, key, value)}
          />
        ))}

        {band && (
          <div
            className="absolute rounded-sm border border-accent bg-accent/10"
            style={{ left: band.x, top: band.y, width: band.w, height: band.h }}
          />
        )}
      </div>

      {/* Werkzeugleiste */}
      <div
        className="lm-glass absolute top-2 left-2 z-10 flex items-center gap-0.5 rounded-lumen-sm border border-edge p-0.5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <ToolButton title={t('addonStudio.graph.addNode')} onClick={openPaletteAtMouse}><Plus size={13} /></ToolButton>
        <ToolButton title={t('addonStudio.graph.addComment')} onClick={addComment}><MessageSquarePlus size={13} /></ToolButton>
        <span className="mx-0.5 h-4 w-px bg-edge" />
        <ToolButton title={t('addonStudio.graph.undo')} disabled={!undoRef.current.length} onClick={undo} version={historyVersion}><Undo2 size={13} /></ToolButton>
        <ToolButton title={t('addonStudio.graph.redo')} disabled={!redoRef.current.length} onClick={redo} version={historyVersion}><Redo2 size={13} /></ToolButton>
        <span className="mx-0.5 h-4 w-px bg-edge" />
        <ToolButton title={t('addonStudio.graph.fit')} onClick={() => fit(false)}><Maximize2 size={13} /></ToolButton>
        <ToolButton title={t('addonStudio.graph.minimap')} active={minimap} onClick={() => setMinimap((m) => !m)}><MapIcon size={13} /></ToolButton>
        <button
          title={t('addonStudio.graph.resetZoom')}
          onClick={() => setView((v) => ({ ...v, zoom: 1 }))}
          className="lm-transition h-6 rounded-[4px] px-1.5 font-mono text-[10.5px] text-muted hover:bg-hover"
        >
          {Math.round(view.zoom * 100)}%
        </button>
      </div>

      {graph.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-[340px] text-center text-[12px] leading-relaxed text-subtle">{t('addonStudio.graph.emptyHint')}</p>
        </div>
      )}

      {minimap && graph.nodes.length > 0 && (
        <Minimap graph={graph} view={view} size={size} onCenter={(x, y) => setView((v) => ({ ...v, x: size.w / 2 - x * v.zoom, y: size.h / 2 - y * v.zoom }))} />
      )}

      {palette && (
        <NodePalette
          x={Math.min(palette.x, size.w - 270)}
          y={Math.min(palette.y, size.h - 370)}
          from={palette.from}
          allow={allow}
          onPick={(def) => addNode(def, palette.wx, palette.wy, palette.from)}
          onClose={() => {
            setPalette(null)
            containerRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Building blocks
 * ------------------------------------------------------------------ */

function ToolButton({
  title, onClick, children, disabled, active,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  active?: boolean
/** Only for redrawing after history changes. */
  version?: number
}) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'lm-transition flex size-6 items-center justify-center rounded-[4px] disabled:opacity-35',
        active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function nodeBorder(error: boolean, selected: boolean) {
  if (error) return 'var(--c-danger)'
  if (selected) return 'var(--c-accent)'
  return 'var(--c-border-strong)'
}

function nodeShadow(hot: boolean, selected: boolean) {
  if (hot) return '0 0 0 2px var(--c-accent), 0 0 18px rgb(var(--c-accent-rgb) / 55%)'
  if (selected) return '0 0 0 1px var(--c-accent)'
  return undefined
}

const inlineClass = 'h-[18px] min-w-0 flex-1 rounded-[3px] border border-edge bg-input px-1 font-mono text-[10.5px] text-fg outline-none focus:border-accent'

function NodeView({
  node, def, selected, hot, error, connected, pinValues, pending, onHeaderDown, onPinDown, onValue,
}: {
  node: GraphNode
  def: NodeDef | undefined
  selected: boolean
  hot: boolean
  error: boolean
  connected: Set<string>
  pinValues?: Record<string, string>
  pending: PendingPin | null
  onHeaderDown: (event: React.MouseEvent) => void
  onPinDown: (event: React.MouseEvent, pin: PinDef, side: 'in' | 'out') => void
  onValue: (key: string, value: string | number | boolean) => void
}) {
  const t = useT()
  const color = def ? categoryColor(def.category) : '#e2554f'
  const rows = Math.max(def?.inputs.length ?? 0, def?.outputs.length ?? 0, 1)
  const borderColor = nodeBorder(error, selected)

  const pinHandle = (pin: PinDef, side: 'in' | 'out') => {
    const isConnected = connected.has(`${node.id}:${side}:${pin.id}`)
    const value = pinValues?.[`${node.id}:${pin.id}`]
    const compatible = !pending || (pending.node !== node.id && pending.side !== side
      && (pending.side === 'out' ? canConnect(pending.type, pin.type) : canConnect(pin.type, pending.type)))
    const pinColor = PIN_COLORS[pin.type]
    return (
      <span
        data-pin
        data-node={node.id}
        data-pin-id={pin.id}
        data-type={pin.type}
        data-side={side}
        title={value === undefined ? `${pinLabel(pin)} · ${t(`addonStudio.pinType.${pin.type}`)}` : `${pinLabel(pin)} = ${value}`}
        onMouseDown={(e) => onPinDown(e, pin, side)}
        className="absolute top-1/2 z-10 flex size-4 -translate-y-1/2 cursor-crosshair items-center justify-center"
        style={{ [side === 'in' ? 'left' : 'right']: -8, opacity: compatible ? 1 : 0.25 }}
      >
        {pin.type === 'exec' && (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1 H5 L9 5 L5 9 H1 Z" fill={isConnected ? pinColor : 'var(--c-bg-overlay)'} stroke={pinColor} strokeWidth="1.4" />
          </svg>
        )}
        {pin.type !== 'exec' && (
          <span
            className="block size-[9px] rounded-full border-2"
            style={{ borderColor: pinColor, background: isConnected ? pinColor : 'var(--c-bg-overlay)' }}
          />
        )}
      </span>
    )
  }

  const inlineEditor = (pin: PinDef) => {
    if (pin.type === 'exec' || connected.has(`${node.id}:in:${pin.id}`)) return null
    const raw = node.values?.[pin.id] ?? pin.default ?? ''
    if (pin.type === 'boolean') {
      return (
        <input
          type="checkbox"
          checked={raw === true || raw === 'true'}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onValue(pin.id, e.target.checked)}
          className="accent-[var(--c-accent)]"
        />
      )
    }
    return (
      <input
        value={String(raw)}
        spellCheck={false}
        placeholder={pin.type === 'list' ? 'a, b, c' : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => onValue(pin.id, pin.type === 'number' && e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value)}
        className={inlineClass}
      />
    )
  }

  // The palette's middle pin: input pins go unlabelled when there is only one exec pin.
  const showLabel = (pin: PinDef) => !(pin.type === 'exec' && (pin.id === 'in' || pin.id === 'then'))

  return (
    <div
      data-graph-node={node.id}
      className="lm-shadow absolute rounded-lumen border bg-overlay"
      style={{
        left: node.x,
        top: node.y,
        width: NODE_WIDTH,
        borderColor,
        boxShadow: nodeShadow(hot, selected),
        transition: 'box-shadow 200ms ease-out',
      }}
      onMouseDown={onHeaderDown}
    >
      <div
        className="flex cursor-move items-center gap-1.5 rounded-t-[inherit] border-b border-edge px-2"
        style={{ height: HEADER_HEIGHT, background: `linear-gradient(90deg, ${color}55, ${color}10)` }}
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-fg">
          {def ? nodeTitle(def.type) : t('addonStudio.graph.unknownNode', { type: node.type })}
        </span>
      </div>

      <div style={{ paddingTop: BODY_PADDING, paddingBottom: BODY_PADDING }}>
        {def?.settings?.map((setting) => {
          const value = String(node.values?.[setting.id] ?? setting.default)
          return (
            <div key={setting.id} className="flex items-center gap-1.5 px-2.5" style={{ height: SETTING_HEIGHT }}>
              <span className="w-[64px] shrink-0 truncate text-[10.5px] text-subtle">{settingLabel(setting)}</span>
              {setting.kind === 'select' && (
                <select
                  value={value}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => onValue(setting.id, e.target.value)}
                  className="h-[20px] min-w-0 flex-1 rounded-[3px] border border-edge bg-input px-1 text-[11px] outline-none focus:border-accent"
                >
                  {setting.choices?.map((choice) => (
                    <option key={choice.value} value={choice.value}>{choiceLabel(choice)}</option>
                  ))}
                </select>
              )}
              {setting.kind === 'text' && (
                <input
                  value={value}
                  spellCheck={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => onValue(setting.id, e.target.value)}
                  className={`${inlineClass} h-[20px]`}
                />
              )}
            </div>
          )
        })}

        {Array.from({ length: rows }, (_, index) => {
          const input = def?.inputs[index]
          const output = def?.outputs[index]
          return (
            <div key={index} className="relative flex items-center gap-1" style={{ height: ROW_HEIGHT }}>
              <div className="relative flex h-full min-w-0 flex-1 items-center gap-1 pl-2.5">
                {input && pinHandle(input, 'in')}
                {input && showLabel(input) && (
                  <span className="max-w-[72px] shrink-0 truncate text-[11px] text-muted">{pinLabel(input)}</span>
                )}
                {input && inlineEditor(input)}
              </div>
              {output && (
                <div className="relative flex h-full max-w-[50%] shrink-0 items-center justify-end pr-2.5">
                  {showLabel(output) && <span className="truncate text-[11px] text-muted">{pinLabel(output)}</span>}
                  {pinHandle(output, 'out')}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Minimap({
  graph, view, size, onCenter,
}: {
  graph: Graph
  view: View
  size: { w: number; h: number }
  onCenter: (x: number, y: number) => void
}) {
  const t = useT()
  const W = 180
  const H = 116
  const rects = graph.nodes.map(nodeRect)
  const viewport: Rect = { x: -view.x / view.zoom, y: -view.y / view.zoom, w: size.w / view.zoom, h: size.h / view.zoom }
  const all = [...rects, viewport]
  const minX = Math.min(...all.map((r) => r.x)) - 20
  const minY = Math.min(...all.map((r) => r.y)) - 20
  const maxX = Math.max(...all.map((r) => r.x + r.w)) + 20
  const maxY = Math.max(...all.map((r) => r.y + r.h)) + 20
  const scale = Math.min(W / (maxX - minX), H / (maxY - minY))

  const center = (box: DOMRect, clientX: number, clientY: number) =>
    onCenter((clientX - box.left) / scale + minX, (clientY - box.top) / scale + minY)

  return (
    <div
      data-no-wheel
      title={t('addonStudio.graph.minimap')}
      className="lm-glass absolute right-2 bottom-2 z-10 overflow-hidden rounded-lumen-sm border border-edge"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <svg
        width={W}
        height={H}
        className="block cursor-pointer"
        onMouseDown={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          center(box, e.clientX, e.clientY)
          const move = (m: MouseEvent) => center(box, m.clientX, m.clientY)
          const up = () => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      >
        {(graph.comments ?? []).map((c) => (
          <rect key={c.id} x={(c.x - minX) * scale} y={(c.y - minY) * scale} width={c.w * scale} height={c.h * scale} fill="#8b939f22" />
        ))}
        {graph.nodes.map((node, i) => {
          const def = NODE_CATALOG.get(node.type)
          const r = rects[i]
          return (
            <rect
              key={node.id}
              x={(r.x - minX) * scale}
              y={(r.y - minY) * scale}
              width={Math.max(2, r.w * scale)}
              height={Math.max(2, r.h * scale)}
              rx={1.5}
              fill={def ? categoryColor(def.category) : '#e2554f'}
              fillOpacity={0.75}
            />
          )
        })}
        <rect
          x={(viewport.x - minX) * scale}
          y={(viewport.y - minY) * scale}
          width={viewport.w * scale}
          height={viewport.h * scale}
          fill="none"
          stroke="var(--c-accent)"
          strokeWidth={1.2}
        />
      </svg>
    </div>
  )
}
