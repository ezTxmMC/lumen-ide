/**
 * The node editor with a test run: visited nodes light up, pin values appear
 * in the tooltip, and the transcript lists steps and errors — a click jumps to
 * the node.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Play, Square, Trash2 } from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { NODE_CATALOG, nodeTitle, type NodeDef } from '@/core/user-addons/catalog'
import { GraphError } from '@/core/user-addons/interpreter'
import { previewValue, runEntry } from '@/core/user-addons/runtime'
import type { Graph, UserAddonModel } from '@/core/user-addons/schema'
import { Button } from '../ui'
import { NodeEditor } from './NodeEditor'

interface LogEntry {
  id: number
  time: number
  kind: 'visit' | 'error' | 'done' | 'info'
  nodeId?: string
  text: string
}

const LOG_LIMIT = 400
const SLOW_MS = 280

export function GraphWorkspace({
  model, graph, onChange, resetKey, allow, entryFilter,
}: {
  model: UserAddonModel
  graph: Graph
  onChange: (graph: Graph) => void
  resetKey: string
  allow?: (def: NodeDef) => boolean
  /** Which event nodes work as the starting point of a test run. */
  entryFilter: (def: NodeDef) => boolean
}) {
  const t = useT()
  const [highlight, setHighlight] = useState<Record<string, number>>({})
  const [pinValues, setPinValues] = useState<Record<string, string>>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [errorNode, setErrorNode] = useState<string | null>(null)
  const [focusNode, setFocusNode] = useState<{ id: string; token: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [slow, setSlow] = useState(false)
  const [logOpen, setLogOpen] = useState(true)
  const [entry, setEntry] = useState<string>('')
  const controller = useRef<AbortController | null>(null)
  const buffer = useRef<{ visits: Record<string, number>; values: Record<string, string>; log: LogEntry[] }>({ visits: {}, values: {}, log: [] })
  const frame = useRef<number | null>(null)
  const counter = useRef(0)

  const entries = graph.nodes.filter((node) => {
    const def = NODE_CATALOG.get(node.type)
    return Boolean(def?.event && entryFilter(def))
  })
  const chosenEntry = entries.find((n) => n.id === entry) ?? entries[0]

  useEffect(() => {
    setHighlight({})
    setPinValues({})
    setLog([])
    setErrorNode(null)
    controller.current?.abort()
  }, [resetKey])

  useEffect(() => () => controller.current?.abort(), [])

  /** Take the collected trace data once per frame. */
  const flush = () => {
    frame.current = null
    const { visits, values, log: lines } = buffer.current
    buffer.current = { visits: {}, values: {}, log: [] }
    if (Object.keys(visits).length) setHighlight((h) => ({ ...h, ...visits }))
    if (Object.keys(values).length) setPinValues((v) => ({ ...v, ...values }))
    if (lines.length) setLog((l) => [...l, ...lines].slice(-LOG_LIMIT))
  }
  const schedule = () => {
    if (frame.current === null) frame.current = requestAnimationFrame(flush)
  }
  const push = (kind: LogEntry['kind'], text: string, nodeId?: string) => {
    buffer.current.log.push({ id: ++counter.current, time: Date.now(), kind, text, nodeId })
    schedule()
  }

  const nodeName = (id: string) => {
    const node = graph.nodes.find((n) => n.id === id)
    return node ? nodeTitle(node.type) : id
  }

  const start = async () => {
    if (!chosenEntry) {
      useStore.getState().notify(t('addonStudio.test.noEntry'), 'warning')
      return
    }
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setRunning(true)
    setErrorNode(null)
    setPinValues({})
    setLog([])
    const tab = useStore.getState().activeTab()
    const began = Date.now()
    let steps = 0
    push('info', t('addonStudio.test.started', { name: nodeTitle(chosenEntry.type) }))
    try {
      await runEntry(model, graph, chosenEntry.id, t('addonStudio.test.title'), {
        signal: abort.signal,
        rethrow: true,
        payload: { path: tab?.path ?? '', language: tab?.languageId ?? '' },
        trace: {
          visit: (nodeId) => {
            steps++
            buffer.current.visits[nodeId] = Date.now()
            if (steps <= LOG_LIMIT) push('visit', nodeName(nodeId), nodeId)
            schedule()
          },
          value: (nodeId, pin, value) => {
            buffer.current.values[`${nodeId}:${pin}`] = previewValue(value)
            schedule()
          },
          step: slow ? () => new Promise((resolve) => setTimeout(resolve, SLOW_MS)) : undefined,
        },
      })
      push('done', t('addonStudio.test.done', { count: steps, ms: Date.now() - began }))
    } catch (err) {
      const nodeId = err instanceof GraphError ? err.nodeId : undefined
      push('error', `${nodeId ? `${nodeName(nodeId)}: ` : ''}${(err as Error).message}`, nodeId)
      if (nodeId) {
        setErrorNode(nodeId)
        setFocusNode({ id: nodeId, token: Date.now() })
      }
    } finally {
      if (controller.current === abort) controller.current = null
      setRunning(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge px-3 py-1.5">
        {!running && (
          <Button size="sm" variant="solid" onClick={() => void start()} title={t('addonStudio.test.runHint')}>
            <Play size={11} /> {t('addonStudio.test.run')}
          </Button>
        )}
        {running && (
          <Button size="sm" variant="danger" onClick={() => controller.current?.abort()}>
            <Square size={11} /> {t('addonStudio.test.stop')}
          </Button>
        )}
        {entries.length > 1 && (
          <select
            value={chosenEntry?.id ?? ''}
            onChange={(e) => setEntry(e.target.value)}
            className="h-6 rounded-lumen-sm border border-edge bg-input px-1.5 text-[11.5px]"
            title={t('addonStudio.test.entry')}
          >
            {entries.map((node) => <option key={node.id} value={node.id}>{nodeTitle(node.type)} · {node.id.slice(-4)}</option>)}
          </select>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted">
          <input type="checkbox" className="accent-[var(--c-accent)]" checked={slow} onChange={(e) => setSlow(e.target.checked)} />
          {t('addonStudio.test.slow')}
        </label>
        <span className="flex-1" />
        <span className="hidden text-[11px] text-subtle lg:inline">{t('addonStudio.graph.shortcuts')}</span>
      </div>

      <div className="min-h-0 flex-1">
        <NodeEditor
          graph={graph}
          onChange={onChange}
          allow={allow}
          resetKey={resetKey}
          highlight={highlight}
          pinValues={pinValues}
          errorNode={errorNode}
          focusNode={focusNode}
        />
      </div>

      <div className="shrink-0 border-t border-edge">
        <div className="flex items-center gap-2 px-3 py-1">
          <button onClick={() => setLogOpen((o) => !o)} className="flex flex-1 items-center gap-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
            {logOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
            {t('addonStudio.test.log')} ({log.length})
          </button>
          <Button size="sm" title={t('addonStudio.test.clear')} onClick={() => { setLog([]); setPinValues({}); setErrorNode(null) }}>
            <Trash2 size={11} />
          </Button>
        </div>
        {logOpen && (
          <LogList log={log} onFocus={(nodeId) => setFocusNode({ id: nodeId, token: Date.now() })} />
        )}
      </div>
    </div>
  )
}

const LOG_COLORS: Record<LogEntry['kind'], string> = {
  visit: 'text-muted',
  info: 'text-subtle',
  done: 'text-ok',
  error: 'text-bad',
}

function LogList({ log, onFocus }: { log: LogEntry[]; onFocus: (nodeId: string) => void }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [log])
  return (
    <div ref={ref} className="h-[120px] overflow-y-auto px-3 pb-2 font-mono text-[11px]">
      {log.length === 0 && <div className="py-2 text-subtle">{t('addonStudio.test.empty')}</div>}
      {log.map((entry) => (
        <button
          key={entry.id}
          disabled={!entry.nodeId}
          onClick={() => entry.nodeId && onFocus(entry.nodeId)}
          className={`block w-full truncate text-left enabled:hover:bg-hover ${LOG_COLORS[entry.kind]}`}
        >
          <span className="mr-2 text-subtle">{new Date(entry.time).toLocaleTimeString()}</span>
          {entry.kind === 'visit' ? '→ ' : ''}{entry.text}
        </button>
      ))}
    </div>
  )
}
