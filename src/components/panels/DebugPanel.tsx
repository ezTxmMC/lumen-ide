import { useEffect, useRef, useState } from 'react'
import { ChevronRight, CornerDownLeft, Trash2 } from 'lucide-react'
import { useT } from '@/i18n'
import { debug, type ConsoleEntry, type ConsoleKind } from '@/core/debug/manager'
import { useDebugVersion } from '../debug/shared'
import { VariableChildren } from '../debug/VariableTree'
import { MissingAdapters } from '../debug/MissingAdapters'
import { Button } from '../ui'

const TONE: Record<ConsoleKind, string> = {
  stdout: 'text-fg',
  stderr: 'text-bad',
  console: 'text-muted',
  important: 'text-warn',
  input: 'text-accent',
  result: 'text-fg',
  error: 'text-bad',
  adapter: 'text-subtle',
  system: 'text-subtle italic',
}

const HISTORY_KEY = 'lumen.debug.replHistory'
const MAX_HISTORY = 100

function loadHistory(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === 'string') : []
  } catch {
    return []
  }
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)))
  } catch {
    // The history then only lasts until a restart.
  }
}

function Entry({ entry, showAdapter }: { entry: ConsoleEntry; showAdapter: boolean }) {
  const [open, setOpen] = useState(false)
  if (entry.kind === 'adapter' && !showAdapter) return null
  const expandable = Boolean(entry.variablesReference && debug.sessionById(entry.sessionId))
  const text = entry.text.replace(/\n$/, '')
  return (
    <div className={`${TONE[entry.kind]} border-b border-transparent`}>
      <div
        className={`flex items-start gap-1 px-3 ${expandable ? 'cursor-pointer hover:bg-hover' : ''}`}
        onClick={() => { if (expandable) setOpen(!open) }}
      >
        {entry.kind === 'input' && <span className="shrink-0 select-none text-subtle">›</span>}
        {expandable && <ChevronRight size={11} className="lm-transition mt-[3px] shrink-0 opacity-70" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />}
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{text}</span>
      </div>
      {open && expandable && (
        <div className="pb-1">
          <VariableChildren sessionId={entry.sessionId!} reference={entry.variablesReference!} depth={1} path={`console:${entry.id}`} generation={debug.generation} />
        </div>
      )}
    </div>
  )
}

/** The bottom “Debug” panel: a console with output and a REPL. */
export function DebugPanel() {
  const t = useT()
  useDebugVersion()
  const [input, setInput] = useState('')
  const [showAdapter, setShowAdapter] = useState(false)
  const history = useRef<string[]>(loadHistory())
  const cursor = useRef<number>(history.current.length)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const entries = debug.console

  useEffect(() => {
    const el = scroller.current
    if (!el || !stick.current) return
    el.scrollTop = el.scrollHeight
  }, [entries])

  const submit = () => {
    const value = input.trim()
    if (!value) return
    history.current = [...history.current.filter((h) => h !== value), value].slice(-MAX_HISTORY)
    cursor.current = history.current.length
    saveHistory(history.current)
    setInput('')
    stick.current = true
    void debug.evaluateRepl(value)
  }

  const browse = (delta: number) => {
    const next = Math.min(Math.max(cursor.current + delta, 0), history.current.length)
    cursor.current = next
    setInput(history.current[next] ?? '')
  }

  return (
    <div className="flex h-full flex-col">
      <MissingAdapters />
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-edge px-2 text-[11px] text-subtle">
        <span className="flex-1 truncate">
          {debug.hasSessions ? t('debug.console.sessions', { count: debug.sessions.length }) : t('debug.console.title')}
        </span>
        <label className="flex cursor-pointer items-center gap-1 px-1">
          <input type="checkbox" checked={showAdapter} onChange={() => setShowAdapter(!showAdapter)} className="accent-[var(--c-accent)]" />
          {t('debug.console.adapterLog')}
        </label>
        <Button size="sm" title={t('debug.console.clear')} onClick={() => debug.clearConsole()}>
          <Trash2 size={11} />
        </Button>
      </div>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto py-1 font-mono text-[12px] leading-[1.55]"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {!entries.length && <p className="px-3 py-2 font-sans text-[11.5px] text-subtle">{t('debug.console.empty')}</p>}
        {entries.map((entry) => <Entry key={entry.id} entry={entry} showAdapter={showAdapter} />)}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-edge px-3 py-1">
        <span className="select-none font-mono text-[12px] text-accent">›</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              browse(-1)
              return
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              browse(1)
            }
          }}
          placeholder={debug.hasSessions ? t('debug.console.placeholder') : t('debug.console.placeholderIdle')}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-1 font-mono text-[12px] text-fg outline-none placeholder:text-subtle"
        />
        <Button size="sm" title={t('debug.console.evaluate')} onClick={submit} disabled={!input.trim()}>
          <CornerDownLeft size={11} />
        </Button>
      </div>
    </div>
  )
}
