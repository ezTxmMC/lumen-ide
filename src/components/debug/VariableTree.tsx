import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useT } from '@/i18n'
import { debug } from '@/core/debug/manager'
import type { Scope, Variable } from '@/core/debug/protocol'
import { valueTone } from './shared'

/** Nodes left expanded across steps, keyed by a path of names. */
const expanded = new Set<string>()

function useChildren(sessionId: string, reference: number, open: boolean, generation: number) {
  const [children, setChildren] = useState<Variable[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open || !reference) return
    let cancelled = false
    const session = debug.sessionById(sessionId)
    if (!session) return
    session.variables(reference).then(
      (list) => {
        if (cancelled) return
        setChildren(list)
        setError(null)
      },
      (err: Error) => {
        if (!cancelled) setError(err.message)
      },
    )
    return () => { cancelled = true }
  }, [sessionId, reference, open, generation])
  return { children, error }
}

function ValueEditor({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initial)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onDone(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value)
        if (e.key === 'Escape') onDone(null)
        e.stopPropagation()
      }}
      className="min-w-0 flex-1 rounded-lumen-sm border border-accent bg-input px-1 font-mono text-[11.5px] text-fg outline-none"
    />
  )
}

export function VariableNode({
  sessionId, variable, parentReference, depth, path, generation,
}: {
  sessionId: string
  variable: Variable
  parentReference: number
  depth: number
  path: string
  generation: number
}) {
  const t = useT()
  const key = `${path}/${variable.name}`
  const [open, setOpen] = useState(expanded.has(key))
  const [editing, setEditing] = useState(false)
  const expandable = variable.variablesReference > 0
  const { children, error } = useChildren(sessionId, variable.variablesReference, open && expandable, generation)
  const canEdit = Boolean(debug.sessionById(sessionId)?.canSetVariables) && parentReference > 0

  const toggle = () => {
    if (!expandable) return
    if (open) expanded.delete(key)
    if (!open) expanded.add(key)
    setOpen(!open)
  }

  return (
    <>
      <div
        className="lm-row lm-transition group mx-1 flex items-center gap-1 font-mono text-[11.5px] text-muted hover:bg-hover"
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={toggle}
        onDoubleClick={() => { if (canEdit) setEditing(true) }}
        title={[variable.type, variable.evaluateName].filter(Boolean).join(' · ') || undefined}
      >
        <ChevronRight
          size={11}
          className={`lm-transition shrink-0 opacity-70 ${expandable ? '' : 'invisible'}`}
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        />
        <span className="shrink-0 text-accent">{variable.name}</span>
        <span className="shrink-0 text-subtle">=</span>
        {editing && (
          <ValueEditor
            initial={variable.value}
            onDone={(value) => {
              setEditing(false)
              if (value === null || value === variable.value) return
              void debug.setVariable(sessionId, parentReference, variable, value)
            }}
          />
        )}
        {!editing && (
          <span className={`min-w-0 flex-1 truncate ${valueTone(variable.value, variable.type)}`} title={canEdit ? t('debug.variables.editHint') : variable.value}>
            {variable.value}
          </span>
        )}
      </div>
      {open && expandable && !children && !error && (
        <div className="flex items-center gap-1 py-0.5 text-[11px] text-subtle" style={{ paddingLeft: 20 + depth * 12 }}>
          <Loader2 size={10} className="lm-anim-spin" /> {t('debug.loading')}
        </div>
      )}
      {open && error && (
        <div className="truncate py-0.5 text-[11px] text-bad" style={{ paddingLeft: 20 + depth * 12 }}>{error}</div>
      )}
      {open && children?.map((child, index) => (
        <VariableNode
          key={`${child.name}:${index}`}
          sessionId={sessionId}
          variable={child}
          parentReference={variable.variablesReference}
          depth={depth + 1}
          path={key}
          generation={generation}
        />
      ))}
    </>
  )
}

/** Children of a reference with no header of its own (scopes, console results). */
export function VariableChildren({ sessionId, reference, depth, path, generation }: {
  sessionId: string
  reference: number
  depth: number
  path: string
  generation: number
}) {
  const t = useT()
  const { children, error } = useChildren(sessionId, reference, true, generation)
  if (error) return <div className="truncate px-3 py-0.5 text-[11px] text-bad">{error}</div>
  if (!children) return <div className="px-3 py-0.5 text-[11px] text-subtle">{t('debug.loading')}</div>
  return (
    <>
      {children.map((child, index) => (
        <VariableNode
          key={`${child.name}:${index}`}
          sessionId={sessionId}
          variable={child}
          parentReference={reference}
          depth={depth}
          path={path}
          generation={generation}
        />
      ))}
    </>
  )
}

/** Scopes of the focused frame. */
export function ScopeList({ sessionId, frameId, generation }: { sessionId: string; frameId: number; generation: number }) {
  const t = useT()
  const [scopes, setScopes] = useState<Scope[] | null>(null)
  useEffect(() => {
    let cancelled = false
    const session = debug.sessionById(sessionId)
    if (!session) return
    void session.scopes(frameId).then((list) => { if (!cancelled) setScopes(list) })
    return () => { cancelled = true }
  }, [sessionId, frameId, generation])

  if (!scopes) return <div className="px-3 py-1 text-[11.5px] text-subtle">{t('debug.loading')}</div>
  if (!scopes.length) return <div className="px-3 py-1 text-[11.5px] text-subtle">{t('debug.variables.none')}</div>
  return (
    <>
      {scopes.map((scope, index) => (
        <ScopeNode key={`${scope.name}:${index}`} sessionId={sessionId} scope={scope} generation={generation} initiallyOpen={!scope.expensive && index === 0} />
      ))}
    </>
  )
}

const openScopes = new Map<string, boolean>()

function ScopeNode({ sessionId, scope, generation, initiallyOpen }: { sessionId: string; scope: Scope; generation: number; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(openScopes.get(scope.name) ?? initiallyOpen)
  const toggle = () => {
    openScopes.set(scope.name, !open)
    setOpen(!open)
  }
  return (
    <>
      <div className="lm-row lm-transition mx-1 flex items-center gap-1 text-[12px] text-fg hover:bg-hover" style={{ paddingLeft: 4 }} onClick={toggle}>
        <ChevronRight size={11} className="lm-transition shrink-0 opacity-70" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
        <span className="truncate">{scope.name}</span>
      </div>
      {open && <VariableChildren sessionId={sessionId} reference={scope.variablesReference} depth={1} path={scope.name} generation={generation} />}
    </>
  )
}
