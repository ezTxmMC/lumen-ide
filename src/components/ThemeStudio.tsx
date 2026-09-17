import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, Contrast, Download, FlipHorizontal2, Moon, Palette, Redo2, RotateCcw, Save, Search, Sun, Trash2,
  Undo2, X,
} from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { invertTheme, syntaxMinContrast, UI_MIN_CONTRAST } from '@/core/theme-colors'
import type { Theme, TokenKind, UIColorKey } from '@/core/types'
import { Button, Kbd } from './ui'
import { ColorField, StyleToggle } from './theme-studio/ColorField'
import { useThemeHistory } from './theme-studio/history'
import {
  colorOf, CONTRAST_AGAINST, readStorage, splitKey, STORAGE, SYNTAX_GROUPS, syntaxStyle, TOKEN_SAMPLE,
  UI_GROUPS, withColor, withSyntaxStyle, writeStorage, type ColorKey,
} from './theme-studio/keys'
import { PreviewStage } from './theme-studio/preview/PreviewStage'
import { pushRecentColor } from './theme-studio/recent'
import { ContrastTools, PaletteTools } from './theme-studio/tools'
import './theme-studio/studio.css'

type Tab = 'ui' | 'syntax' | 'contrast' | 'palette'
type Confirm = 'discard' | 'delete' | null

const TABS: { id: Tab; icon?: typeof Palette }[] = [
  { id: 'ui' },
  { id: 'syntax' },
  { id: 'contrast', icon: Contrast },
  { id: 'palette', icon: Palette },
]

/** Shortcuts that belong to a text field while typing in it, such as undo. */
const isTextInput = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && ['text', 'search', ''].includes((el as HTMLInputElement).type)
}

const sameTheme = (a: Theme | null, b: Theme | null) => JSON.stringify(a) === JSON.stringify(b)

export function ThemeStudio() {
  const t = useT()
  const editingId = useStore((s) => s.editingThemeId)
  const effects = useStore((s) => s.effects)
  const previewTheme = useStore((s) => s.previewTheme)
  const closeStudio = useStore((s) => s.closeThemeStudio)
  const saveTheme = useStore((s) => s.saveCustomTheme)
  const deleteTheme = useStore((s) => s.deleteCustomTheme)
  const exportTheme = useStore((s) => s.exportTheme)
  const setTheme = useStore((s) => s.setTheme)

  const history = useThemeHistory(previewTheme)
  const draft = history.draft
  const original = useRef<Theme | null>(null)
  /** Was the theme already saved before the Studio opened? Discarding must then not delete it. */
  const existed = useRef(false)
  /** The theme active before opening — restored after discarding a fresh copy. */
  const previousThemeId = useRef<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const recentTimer = useRef<number>(0)

  const [tab, setTab] = useState<Tab>('ui')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ColorKey | null>(null)
  const [flash, setFlash] = useState(0)
  const [hovered, setHovered] = useState<ColorKey | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [invertOnSwitch, setInvertOnSwitch] = useState(() => readStorage(STORAGE.invertOnSwitch, true))

  // Notes on opening whether the theme was freshly copied.
  useEffect(() => useStore.subscribe((state, prev) => {
    if (!state.editingThemeId || state.editingThemeId === prev.editingThemeId) return
    existed.current = prev.customThemes.some((theme) => theme.id === state.editingThemeId)
    previousThemeId.current = prev.themeId
  }), [])

  useEffect(() => {
    if (!editingId) {
      history.reset(null)
      original.current = null
      return
    }
    const current = useStore.getState().customThemes.find((theme) => theme.id === editingId) ?? null
    original.current = current ? structuredClone(current) : null
    history.reset(current)
    setSelected(null)
    setConfirm(null)
    setQuery('')
    requestAnimationFrame(() => container.current?.focus())
  }, [editingId])

  const dirty = Boolean(draft && original.current && !sameTheme(draft, original.current))

  const labelOf = useCallback((key: ColorKey) => {
    const [scope, name] = splitKey(key)
    return t(scope === 'ui' ? `themeStudio.ui.${name}` : `themeStudio.token.${name}`)
  }, [t])

  /* -------------------------------------------------------------- */

  const setColor = (key: ColorKey, color: string, mark: string) => {
    if (!draft) return
    history.change(withColor(draft, key, color), mark)
    window.clearTimeout(recentTimer.current)
    recentTimer.current = window.setTimeout(() => pushRecentColor(color), 900)
  }

  const switchType = (type: Theme['type']) => {
    if (!draft || draft.type === type) return
    if (invertOnSwitch) {
      history.change({ ...invertTheme(draft), type }, 'invert')
      return
    }
    history.change({ ...draft, type }, 'type')
  }

  const toggleInvert = () => {
    const next = !invertOnSwitch
    setInvertOnSwitch(next)
    writeStorage(STORAGE.invertOnSwitch, next)
  }

  const resetKeys = (keys: ColorKey[]) => {
    const base = original.current
    if (!draft || !base) return
    let next = draft
    for (const key of keys) {
      const [scope, name] = splitKey(key)
      if (scope === 'ui') next = withColor(next, key, base.ui[name as UIColorKey])
      if (scope === 'syntax') next = { ...next, syntax: { ...next.syntax, [name]: base.syntax[name as TokenKind] } }
    }
    history.change(next, `reset:${keys.join()}`)
  }

  const pickFromPreview = (key: ColorKey) => {
    const [scope] = splitKey(key)
    setTab(scope === 'ui' ? 'ui' : 'syntax')
    setQuery('')
    setSelected(key)
    setFlash((n) => n + 1)
  }

  const save = () => closeStudio(false)

  /** Save without closing (Ctrl+S). */
  const saveKeepOpen = () => {
    if (!draft) return
    saveTheme(draft)
    original.current = structuredClone(draft)
    existed.current = true
    useStore.getState().notify(t('common.saved', { name: draft.name }), 'success')
  }

  const discard = () => {
    setConfirm(null)
    if (existed.current && original.current) {
      previewTheme(original.current)
      saveTheme(original.current)
      useStore.setState({ editingThemeId: null })
      return
    }
    const previous = previousThemeId.current
    closeStudio(true)
    if (previous && previous !== editingId) setTheme(previous)
  }

  const requestDiscard = () => {
    if (dirty) {
      setConfirm('discard')
      return
    }
    discard()
  }

  const remove = () => {
    setConfirm(null)
    if (!draft) return
    const id = draft.id
    useStore.setState({ editingThemeId: null })
    deleteTheme(id)
  }

  /* -------------------------------------------------------------- */

  useEffect(() => {
    if (!editingId) return
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (confirm) {
          setConfirm(null)
          return
        }
        requestDiscard()
        return
      }
      if (confirm && event.key === 'Enter') {
        event.preventDefault()
        if (confirm === 'discard') discard()
        if (confirm === 'delete') remove()
        return
      }
      if (mod && event.key === 'Enter') {
        event.preventDefault()
        save()
        return
      }
      if (mod && key === 's') {
        event.preventDefault()
        saveKeepOpen()
        return
      }
      if (!mod || isTextInput(event.target)) return
      const redo = (key === 'z' && event.shiftKey) || key === 'y'
      if (redo) {
        event.preventDefault()
        history.redo()
        return
      }
      if (key === 'z') {
        event.preventDefault()
        history.undo()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (key: ColorKey) => {
      if (!needle || !draft) return true
      return [key, labelOf(key), colorOf(draft, key)].some((text) => text.toLowerCase().includes(needle))
    }
  }, [query, draft, labelOf])

  if (!editingId || !draft || !original.current) return null
  const base = original.current

  const fieldProps = (key: ColorKey) => ({
    colorKey: key,
    label: labelOf(key),
    value: colorOf(draft, key),
    onChange: (color: string, mark: string) => setColor(key, color, mark),
    selected: selected === key,
    flash: selected === key ? flash : 0,
    onSelect: () => setSelected(key),
    onHover: setHovered,
  })

  const groupHeader = (title: string, hint: string, keys: ColorKey[]) => {
    const changed = keys.some((key) => colorOf(draft, key) !== colorOf(base, key))
    return (
      <div className="mb-1 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-[10.5px] font-semibold tracking-[0.09em] text-subtle uppercase">{title}</h4>
          <p className="text-[11px] text-subtle">{hint}</p>
        </div>
        {changed && (
          <button
            onClick={() => resetKeys(keys)}
            title={t('themeStudio.studio.resetGroup')}
            className="lm-transition lm-anim-fade flex h-5 shrink-0 items-center gap-1 rounded-[4px] px-1.5 text-[10.5px] text-muted hover:bg-hover hover:text-fg"
          >
            <RotateCcw size={10} /> {t('common.reset')}
          </button>
        )}
      </div>
    )
  }

  const uiList = UI_GROUPS.map((group) => {
    const keys = group.keys.map((k) => `ui:${k}` as ColorKey).filter(matches)
    if (!keys.length) return null
    return (
      <section key={group.id} className="mb-3">
        {groupHeader(t(`themeStudio.groups.${group.id}`), t(`themeStudio.groups.${group.id}Hint`), keys)}
        {keys.map((key) => {
          const name = splitKey(key)[1] as UIColorKey
          const against = CONTRAST_AGAINST[name]
          const contrast = against ? { against: draft.ui[against], min: UI_MIN_CONTRAST[name] ?? 4.5 } : undefined
          return <ColorField key={key} {...fieldProps(key)} contrast={contrast} />
        })}
      </section>
    )
  })

  const syntaxList = SYNTAX_GROUPS.map((group) => {
    const keys = group.kinds.map((k) => `syntax:${k}` as ColorKey).filter(matches)
    if (!keys.length) return null
    return (
      <section key={group.id} className="mb-3">
        {groupHeader(t(`themeStudio.syntaxGroups.${group.id}`), t(`themeStudio.syntaxGroups.${group.id}Hint`), keys)}
        {keys.map((key) => {
          const kind = splitKey(key)[1] as TokenKind
          const style = syntaxStyle(draft, kind)
          return (
            <ColorField
              key={key}
              {...fieldProps(key)}
              contrast={{ against: draft.ui.bg, min: syntaxMinContrast(kind) }}
              extra={
                <span className="flex shrink-0 items-center gap-0.5">
                  <span
                    className="mr-1 max-w-[70px] truncate rounded-[3px] px-1 font-mono text-[10.5px]"
                    style={{
                      background: draft.ui.bg,
                      color: style.color,
                      fontStyle: style.italic ? 'italic' : undefined,
                      fontWeight: style.bold ? 600 : undefined,
                      textDecoration: style.underline ? 'underline' : undefined,
                    }}
                  >
                    {TOKEN_SAMPLE[kind]}
                  </span>
                  <StyleToggle active={!!style.italic} title={t('themeStudio.studio.italic')} onClick={() => history.change(withSyntaxStyle(draft, kind, { italic: !style.italic }))}>
                    <em>I</em>
                  </StyleToggle>
                  <StyleToggle active={!!style.bold} title={t('themeStudio.studio.bold')} onClick={() => history.change(withSyntaxStyle(draft, kind, { bold: !style.bold }))}>
                    <strong>B</strong>
                  </StyleToggle>
                  <StyleToggle active={!!style.underline} title={t('themeStudio.studio.underline')} onClick={() => history.change(withSyntaxStyle(draft, kind, { underline: !style.underline }))}>
                    <u>U</u>
                  </StyleToggle>
                </span>
              }
            />
          )
        })}
      </section>
    )
  })

  const emptySearch = (tab === 'ui' || tab === 'syntax') && (tab === 'ui' ? uiList : syntaxList).every((entry) => entry === null)

  return (
    <div className="lm-anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        ref={container}
        tabIndex={-1}
        data-keybinding-recorder
        role="dialog"
        aria-label={t('themeStudio.studio.title')}
        className="lm-glass lm-shadow lm-anim-dialog relative flex h-full max-h-[920px] w-full max-w-[1480px] flex-col overflow-hidden rounded-lumen-lg border border-edge outline-none"
      >
        {/* Kopf */}
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge px-4 py-2.5">
          <Palette size={16} className="shrink-0 text-accent" />
          <input
            value={draft.name}
            onChange={(e) => history.change({ ...draft, name: e.target.value }, 'name')}
            placeholder={t('themeStudio.studio.namePlaceholder')}
            aria-label={t('themeStudio.studio.namePlaceholder')}
            className="lm-transition min-w-[160px] flex-1 rounded-lumen-sm border border-transparent bg-transparent px-2 py-1 text-[15px] font-medium outline-none hover:border-edge focus:border-accent"
          />
          {dirty && <span className="lm-anim-fade shrink-0 rounded-full bg-warn/15 px-2 py-0.5 text-[10.5px] text-warn">{t('themeStudio.studio.unsaved')}</span>}

          <div className="flex shrink-0 items-center rounded-lumen-sm border border-edge p-0.5">
            {(['dark', 'light'] as const).map((type) => (
              <button
                key={type}
                onClick={() => switchType(type)}
                className={[
                  'lm-transition flex h-6 items-center gap-1 rounded-[4px] px-2 text-[11.5px]',
                  draft.type === type ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover',
                ].join(' ')}
              >
                {type === 'dark' ? <Moon size={11} /> : <Sun size={11} />}
                {t(`common.${type}`)}
              </button>
            ))}
          </div>
          <button
            onClick={toggleInvert}
            role="switch"
            aria-checked={invertOnSwitch}
            title={t('themeStudio.studio.invertHint')}
            className={[
              'lm-transition flex h-7 shrink-0 items-center gap-1.5 rounded-lumen-sm border px-2 text-[11.5px]',
              invertOnSwitch ? 'border-accent/60 text-fg' : 'border-edge text-subtle hover:text-fg',
            ].join(' ')}
          >
            <FlipHorizontal2 size={12} className={invertOnSwitch ? 'text-accent' : ''} />
            {t('themeStudio.studio.invert')}
            <span className={`lm-transition relative h-3 w-5 rounded-full ${invertOnSwitch ? 'bg-accent' : 'bg-active'}`}>
              <span className="lm-transition absolute top-[2px] size-2 rounded-full bg-white" style={{ left: invertOnSwitch ? 10 : 2 }} />
            </span>
          </button>

          <span className="mx-1 h-5 w-px bg-edge" />

          <Button size="sm" title={`${t('themeStudio.studio.undo')} (Ctrl+Z)`} disabled={!history.canUndo} onClick={() => history.undo()}>
            <Undo2 size={13} />
          </Button>
          <Button size="sm" title={`${t('themeStudio.studio.redo')} (Ctrl+Shift+Z)`} disabled={!history.canRedo} onClick={() => history.redo()}>
            <Redo2 size={13} />
          </Button>
          <Button size="sm" title={t('themeStudio.studio.resetAll')} disabled={!dirty} onClick={() => history.change(structuredClone(base), 'reset-all')}>
            <RotateCcw size={12} />
          </Button>
          <Button size="sm" title={t('themeStudio.studio.export')} onClick={() => void exportTheme(draft.id)}>
            <Download size={12} />
          </Button>
          <Button size="sm" title={`${t('themeStudio.studio.saveKeepOpen')} (Ctrl+S)`} disabled={!dirty} onClick={saveKeepOpen}>
            <Save size={12} />
          </Button>
          {existed.current && (
            <Button size="sm" variant="danger" title={t('themeStudio.studio.delete')} onClick={() => setConfirm('delete')}>
              <Trash2 size={12} />
            </Button>
          )}

          <Button size="sm" variant="outline" onClick={requestDiscard}>
            <X size={12} /> {t('common.discard')}
          </Button>
          <Button size="sm" variant="solid" onClick={save}>
            <Check size={12} /> {t('common.done')}
          </Button>
        </header>

        {/* Körper */}
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[400px] shrink-0 flex-col border-r border-edge">
            <div className="flex shrink-0 gap-0.5 border-b border-edge p-1.5">
              {TABS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={[
                    'lm-transition flex flex-1 items-center justify-center gap-1 rounded-lumen-sm px-2 py-1 text-[12px]',
                    tab === id ? 'bg-active text-fg' : 'text-muted hover:bg-hover',
                  ].join(' ')}
                >
                  {Icon && <Icon size={11} />}
                  {t(`themeStudio.tabs.${id}`)}
                </button>
              ))}
            </div>

            {(tab === 'ui' || tab === 'syntax') && (
              <label className="lm-transition mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-lumen-sm border border-edge bg-input px-2 py-1 focus-within:border-accent">
                <Search size={12} className="shrink-0 text-subtle" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('themeStudio.studio.searchColors')}
                  className="w-full bg-transparent text-[12px] outline-none placeholder:text-subtle"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-subtle hover:text-fg" aria-label={t('common.close')}>
                    <X size={11} />
                  </button>
                )}
              </label>
            )}

            <div key={tab} className="lm-anim-fade min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {tab === 'ui' && uiList}
              {tab === 'syntax' && syntaxList}
              {emptySearch && <p className="px-2 py-6 text-center text-[12px] text-subtle">{t('common.nothingFound')}</p>}
              {tab === 'contrast' && (
                <ContrastTools draft={draft} change={history.change} labelOf={labelOf} onSelect={pickFromPreview} />
              )}
              {tab === 'palette' && <PaletteTools draft={draft} change={history.change} />}
            </div>
          </aside>

          <PreviewStage
            draft={draft}
            original={base}
            effects={effects}
            highlight={hovered}
            onPick={pickFromPreview}
            labelOf={labelOf}
          />
        </div>

        {/* Fuß mit Kürzeln */}
        <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge px-4 py-1.5 text-[11px] text-subtle">
          <span><Kbd>Esc</Kbd> {t('common.discard')}</span>
          <span><Kbd>Ctrl+Enter</Kbd> {t('common.done')}</span>
          <span><Kbd>Ctrl+S</Kbd> {t('themeStudio.studio.saveKeepOpen')}</span>
          <span><Kbd>Ctrl+Z</Kbd> / <Kbd>Ctrl+Shift+Z</Kbd> {t('themeStudio.studio.undoRedo')}</span>
          <span className="flex-1" />
          <span className="truncate">{t('themeStudio.studio.liveHint')}</span>
        </footer>

        {/* Rückfrage */}
        {confirm && (
          <div className="lm-anim-fade absolute inset-0 z-20 flex items-center justify-center bg-black/35" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(null) }}>
            <div className="lm-glass lm-shadow lm-anim-pop w-[380px] rounded-lumen-lg border border-edge p-4">
              <h3 className="text-[14px] font-medium text-fg">
                {confirm === 'discard' ? t('themeStudio.studio.discardTitle') : t('common.confirmDelete', { name: draft.name })}
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                {confirm === 'discard' ? t('themeStudio.studio.discardBody') : t('themeStudio.studio.deleteBody')}
              </p>
              <div className="mt-4 flex justify-end gap-1.5">
                <Button variant="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
                <Button variant="danger" onClick={confirm === 'discard' ? discard : remove}>
                  {confirm === 'discard' ? t('common.discard') : t('common.delete')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
