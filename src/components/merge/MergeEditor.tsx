/**
 * The merge editor: current and incoming side by side on top, the editable
 * result below. Each block has a checkbox per side; “Complete Merge” writes the
 * result and stages the file.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, GitMerge, RotateCcw, X } from 'lucide-react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view'
import { history, historyKeymap, indentWithTab, standardKeymap } from '@codemirror/commands'
import { useStore } from '@/state/store'
import { registry } from '@/core/registry'
import { editorTheme } from '@/core/theme'
import { editorExtensionFor, matchLanguage } from '@/core/language'
import { editorBridge } from '@/lib/editor-bridge'
import { useT } from '@/i18n'
import {
  parseConflicts, project, resolutionText, UNTOUCHED, type Choice, type Conflict,
} from '@/core/merge/conflicts'
import { mergeSession, useMergeSession, type MergeSession } from '@/core/merge/session'
import { completeMerge } from '@/core/merge/complete'
import { mergeTheme } from '@/core/merge/editor'
import { LAYER } from '../ui/layers'
import { Button } from '../ui'
import {
  applyChoices, mergePaneTheme, resultPane, resultStateOf, showChoices, sidePane, type Side,
} from './merge-views'

export function MergeEditor() {
  const session = useMergeSession()
  if (!session) return null
  return <MergeEditorView key={session.id} session={session} />
}

const themeComp = new Compartment()

const fillHeight = EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } })

type Panes = Partial<Record<Side | 'result', EditorView>>

function useEditorLook(session: MergeSession) {
  const themeId = useStore((s) => s.themeId)
  const effects = useStore((s) => s.effects)
  const registryVersion = useStore((s) => s.registryVersion)
  const themeExtension = useMemo<Extension>(() => {
    const theme = registry.themes().find((entry) => entry.id === themeId) ?? registry.themes()[0]
    return theme ? editorTheme(theme, effects) : []
  }, [themeId, effects, registryVersion])
  const language = useMemo<Extension>(() => {
    const state = useStore.getState()
    const tab = state.tabs.find((open) => open.id === session.tabId) ?? null
    const spec = tab ? state.languageFor(tab) : matchLanguage(session.path ?? session.name, registry.languages())
    return editorExtensionFor(spec)
  }, [session, registryVersion])
  return { themeExtension, language }
}

function MergeEditorView({ session }: { session: MergeSession }) {
  const t = useT()
  const conflicts = useMemo(() => parseConflicts(session.text), [session])
  const sides = useMemo(() => {
    const side = (resolution: Side) => project(session.text, conflicts, (conflict) => resolutionText(session.text, conflict, resolution))
    return { current: side('current'), incoming: side('incoming') }
  }, [session, conflicts])
  const { themeExtension, language } = useEditorLook(session)

  const hosts = { current: useRef<HTMLDivElement>(null), incoming: useRef<HTMLDivElement>(null), result: useRef<HTMLDivElement>(null) }
  const panes = useRef<Panes>({})
  const [choices, setChoices] = useState<Choice[]>(() => conflicts.map(() => UNTOUCHED))
  const [focus, setFocus] = useState(0)
  const [warning, setWarning] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  /* Build the three views once per session. */
  useEffect(() => {
    const previous = { view: editorBridge.view, tabId: editorBridge.tabId }
    const common = (): Extension[] => [
      lineNumbers(), highlightSpecialChars(), drawSelection(), themeComp.of(themeExtension), language,
      mergeTheme, mergePaneTheme, fillHeight,
    ]
    const toggle = (index: number, side: Side) => {
      const result = panes.current.result
      if (!result) return
      const choice = resultStateOf(result.state).choices[index] ?? UNTOUCHED
      applyChoices(result, session.text, conflicts, [{ index, choice: { ...choice, [side]: !choice[side], touched: true } }])
      setFocus(index)
    }
    const side = (name: Side) => new EditorView({
      parent: hosts[name].current ?? undefined,
      state: EditorState.create({ doc: sides[name].text, extensions: [...common(), sidePane(name, sides[name].ranges, toggle)] }),
    })
    const raw = project(session.text, conflicts, () => null)
    const result = new EditorView({
      parent: hosts.result.current ?? undefined,
      state: EditorState.create({
        doc: raw.text,
        extensions: [
          ...common(),
          history(),
          keymap.of([...standardKeymap, ...historyKeymap, indentWithTab]),
          resultPane(raw.ranges),
          EditorView.updateListener.of((update) => {
            const before = resultStateOf(update.startState).choices
            const after = resultStateOf(update.state).choices
            if (before !== after) setChoices(after)
            // The shortcuts (undo, find …) act on the editor behind the bridge.
            if (update.focusChanged && update.view.hasFocus) editorBridge.attach(update.view, null)
          }),
        ],
      }),
    })
    panes.current = { current: side('current'), incoming: side('incoming'), result }
    return () => {
      const mine = Object.values(panes.current)
      if (editorBridge.view && mine.includes(editorBridge.view)) editorBridge.attach(previous.view, previous.tabId)
      for (const view of mine) view?.destroy()
      panes.current = {}
    }
    // Built once per session (the component is keyed by it); theme changes are reconfigured below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    for (const view of Object.values(panes.current)) view?.dispatch({ effects: themeComp.reconfigure(themeExtension) })
  }, [themeExtension])

  useEffect(() => {
    for (const name of ['current', 'incoming'] as const) panes.current[name]?.dispatch({ effects: showChoices.of(choices) })
  }, [choices])

  const reveal = (index: number) => {
    const target = (conflicts.length + index) % conflicts.length
    setFocus(target)
    const scroll = (view: EditorView | undefined, pos: number | undefined) => {
      if (!view || pos === undefined) return
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 32 }) })
    }
    scroll(panes.current.current, sides.current.ranges[target]?.from)
    scroll(panes.current.incoming, sides.incoming.ranges[target]?.from)
    const result = panes.current.result
    if (result) scroll(result, resultStateOf(result.state).ranges[target]?.from)
  }

  const chooseAll = (choice: Choice) => {
    const result = panes.current.result
    if (!result) return
    applyChoices(result, session.text, conflicts, conflicts.map((_, index) => ({ index, choice })))
  }

  const complete = async (force: boolean) => {
    const result = panes.current.result
    if (!result || busy) return
    const text = result.state.doc.toString()
    const remaining = parseConflicts(text).length
    if (remaining && !force) {
      setWarning(remaining)
      return
    }
    setBusy(true)
    const done = await completeMerge(session, text)
    setBusy(false)
    if (done) mergeSession.close()
  }

  const resolved = choices.filter((choice) => choice.touched).length
  const first: Conflict | undefined = conflicts[0]

  return (
    <div className={`lm-anim-fade fixed inset-0 ${LAYER.dialog} flex bg-black/45 p-3`}>
      <div
        role="dialog"
        aria-label={t('merge.editor.title')}
        className="lm-glass lm-shadow lm-anim-dialog flex h-full w-full flex-col overflow-hidden rounded-lumen-lg border border-edge"
        data-merge-editor
      >
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge px-4 py-2">
          <GitMerge size={16} className="shrink-0 text-accent" />
          <h2 className="shrink-0 text-[14px] font-medium text-fg">{t('merge.editor.title')}</h2>
          <span className="min-w-0 truncate text-[12px] text-muted" title={session.path ?? session.name}>{session.name}</span>
          <span className="shrink-0 rounded-full bg-active px-2 text-[11px] tabular-nums text-muted" data-merge-progress>
            {t('merge.editor.progress', { done: resolved, total: conflicts.length })}
          </span>
          <Button size="sm" title={t('merge.editor.previous')} onClick={() => reveal(focus - 1)}><ChevronUp size={13} /></Button>
          <Button size="sm" title={t('merge.editor.next')} onClick={() => reveal(focus + 1)}><ChevronDown size={13} /></Button>
          <span className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => chooseAll({ current: true, incoming: false, touched: true })}>
            {t('merge.editor.acceptAllCurrent')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => chooseAll({ current: false, incoming: true, touched: true })}>
            {t('merge.editor.acceptAllIncoming')}
          </Button>
          <Button size="sm" title={t('merge.editor.reset')} onClick={() => chooseAll(UNTOUCHED)}><RotateCcw size={13} /></Button>
          <span className="mx-1 h-4 w-px bg-edge" />
          <Button size="sm" onClick={() => mergeSession.close()}>{t('merge.editor.cancel')}</Button>
          <Button size="sm" variant="solid" disabled={busy} onClick={() => void complete(false)}>
            <GitMerge size={12} /> {t('merge.editor.complete')}
          </Button>
        </header>

        {warning !== null && (
          <div className="lm-anim-fade flex shrink-0 items-center gap-2 border-b border-edge bg-warn/10 px-4 py-1.5 text-[12px] text-warn">
            <AlertTriangle size={13} className="shrink-0" />
            <span className="flex-1">{t('merge.editor.unresolved', { count: warning })}</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void complete(true)}>{t('merge.editor.completeAnyway')}</Button>
            <Button size="sm" title={t('merge.editor.cancel')} onClick={() => setWarning(null)}><X size={12} /></Button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-rows-2">
          <div className="grid min-h-0 grid-cols-2 border-b border-edge">
            <Pane title={t('merge.editor.current')} label={first?.currentLabel} tone="bg-ok" host={hosts.current} className="border-r border-edge" />
            <Pane title={t('merge.editor.incoming')} label={first?.incomingLabel} tone="bg-accent" host={hosts.incoming} />
          </div>
          <Pane title={t('merge.editor.result')} label={session.path ?? undefined} tone="bg-warn" host={hosts.result} />
        </div>
      </div>
    </div>
  )
}

function Pane({ title, label, tone, host, className = '' }: {
  title: string
  label?: string
  /** Tailwind class of the dot beside the title. */
  tone: string
  host: React.RefObject<HTMLDivElement>
  className?: string
}) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col ${className}`}>
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-edge bg-surface px-3 text-[11.5px]">
        <span className={`size-2 shrink-0 rounded-full ${tone}`} />
        <span className="font-medium text-fg">{title}</span>
        {label && <span className="min-w-0 truncate font-mono text-[11px] text-subtle" title={label}>{label}</span>}
      </div>
      <div ref={host} className="min-h-0 flex-1 overflow-hidden bg-bg" />
    </section>
  )
}
