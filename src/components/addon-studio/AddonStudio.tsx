/**
 * The Add-on Studio — building add-ons of your own inside Lumen: metadata,
 * languages with a live preview, commands and events as node graphs, project
 * templates, themes, and an editable raw JSON view.
 *
 * Keys: Ctrl+S saves, Esc closes (asking first when there are changes). The
 * overlay carries `data-keybinding-recorder` so the global keyboard dispatcher
 * fires nothing here — otherwise Ctrl+S would save the file instead.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  AlertTriangle, Blocks, Braces, Check, Code2, Download, FolderTree, Hammer, Palette, Scissors, Settings2, Trash2, Workflow, X, Zap, PanelsTopLeft,
} from 'lucide-react'
import { useStore } from '@/state/store'
import { t, useT } from '@/i18n'
import { userAddons } from '@/core/user-addons/manager'
import { createUserAddon, type UserAddonModel } from '@/core/user-addons/schema'
import { createToolkitStarter } from '@/core/user-addons/starter'
import {
  blockingIssues, validateAddon, type StudioSection, type ValidationIssue,
} from '@/core/user-addons/validate'
import { Button } from '../ui'
import { LanguagesPage } from './LanguagesPage'
import { CommandsPage, EventsPage } from './GraphPages'
import { TemplatesPage } from './TemplatesPage'
import { KindsPage } from './KindsPage'
import { SnippetsPage } from './SnippetsPage'
import { PanelsPage } from './PanelsPage'
import { GeneralPage, JsonPage, ThemesPage } from './MetaPages'

const NAV: { id: StudioSection; icon: typeof X }[] = [
  { id: 'general', icon: Settings2 },
  { id: 'languages', icon: Code2 },
  { id: 'commands', icon: Zap },
  { id: 'events', icon: Workflow },
  { id: 'templates', icon: FolderTree },
  { id: 'kinds', icon: Hammer },
  { id: 'snippets', icon: Scissors },
  { id: 'panels', icon: PanelsTopLeft },
  { id: 'themes', icon: Palette },
  { id: 'json', icon: Braces },
]

const COUNTS: Partial<Record<StudioSection, (m: UserAddonModel) => number>> = {
  languages: (m) => m.languages.length,
  commands: (m) => m.commands.length,
  events: (m) => m.events.length,
  templates: (m) => m.templates.length,
  kinds: (m) => m.projectKinds.length,
  snippets: (m) => m.snippets.length,
  panels: (m) => m.panels?.length ?? 0,
  themes: (m) => m.themes.length,
}

/** An empty add-on, or an example as a starting point. */
function newModel(starter: 'toolkit' | undefined, ids: string[]): UserAddonModel {
  if (starter === 'toolkit') return createToolkitStarter(ids)
  return createUserAddon(t('addonStudio.studio.newName'), ids)
}

export function AddonStudio() {
  const t = useT()
  const studio = useStore((s) => s.addonStudio)
  const closeStudio = useStore((s) => s.closeAddonStudio)
  const formOpen = useStore((s) => Boolean(s.formDialog))
  const notify = useStore((s) => s.notify)
  useSyncExternalStore(userAddons.subscribe, userAddons.getVersion)

  const [draft, setDraft] = useState<UserAddonModel | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedJson, setSavedJson] = useState('')
  const [section, setSection] = useState<StudioSection>('general')
  const [focus, setFocus] = useState<{ index: number; token: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // On opening: load the existing add-on, or create a new one.
  useEffect(() => {
    if (!studio) {
      setDraft(null)
      return
    }
    const existing = userAddons.get(studio.addonId)
    const model = existing ? structuredClone(existing) : newModel(studio.starter, userAddons.ids())
    setDraft(model)
    setSavedId(existing ? existing.id : null)
    setSavedJson(JSON.stringify(model))
    setSection('general')
    setFocus(null)
    requestAnimationFrame(() => rootRef.current?.focus())
    // Only on opening, or when switching add-on.
  }, [studio])

  const issues = useMemo(() => (draft ? validateAddon(draft) : []), [draft])
  const dirty = useMemo(() => Boolean(draft && JSON.stringify(draft) !== savedJson), [draft, savedJson])

  const update = useCallback((fn: (model: UserAddonModel) => UserAddonModel) => {
    setDraft((current) => (current ? fn(current) : current))
  }, [])

  const jump = (issue: ValidationIssue) => {
    setSection(issue.section)
    if (issue.index !== undefined) setFocus({ index: issue.index, token: Date.now() })
  }

  const save = async () => {
    if (!draft || saving) return false
    setSaving(true)
    try {
      const result = await userAddons.save(draft, savedId)
      const blocking = blockingIssues(result)
      if (blocking.length) {
        notify(t('addonStudio.studio.saveBlocked', { message: blocking[0].message }), 'error')
        jump(blocking[0])
        return false
      }
      setSavedId(draft.id)
      setSavedJson(JSON.stringify(draft))
      notify(t('common.saved', { name: draft.name }), 'success')
      return true
    } catch (err) {
      notify((err as Error).message, 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const requestClose = () => {
    if (dirty && !confirm(t('addonStudio.studio.confirmDiscard'))) return
    closeStudio()
  }

  const remove = async () => {
    if (!draft || !savedId) return
    if (!confirm(t('common.confirmDelete', { name: draft.name }))) return
    await userAddons.remove(savedId)
    notify(t('addonStudio.dialog.deleted', { name: draft.name }), 'info')
    closeStudio()
  }

  if (!studio || !draft) return null

  const errorSections = new Set(blockingIssues(issues).map((i) => i.section))
  const blockingCount = blockingIssues(issues).length

  return (
    <div
      className={`lm-anim-fade fixed inset-0 flex items-center justify-center bg-black/45 p-3 ${formOpen ? 'z-40' : 'z-50'}`}
    >
      <div
        ref={rootRef}
        tabIndex={-1}
        data-keybinding-recorder
        role="dialog"
        aria-label={t('addonStudio.studio.title')}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            event.stopPropagation()
            void save()
            return
          }
          if (event.key !== 'Escape' || event.defaultPrevented) return
          event.preventDefault()
          event.stopPropagation()
          requestClose()
        }}
        className="lm-glass lm-shadow lm-anim-dialog flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-lumen-lg border border-edge outline-none"
      >
        {/* Kopf */}
        <header className="flex shrink-0 items-center gap-2 border-b border-edge px-4 py-2.5">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lumen-sm bg-active font-mono text-[11px] font-bold"
            style={{ color: draft.color || 'var(--c-accent)' }}
          >
            {draft.icon || <Blocks size={14} />}
          </span>
          <input
            value={draft.name}
            onChange={(e) => update((m) => ({ ...m, name: e.target.value }))}
            placeholder={t('addonStudio.studio.namePlaceholder')}
            className="lm-transition min-w-0 flex-1 rounded-lumen-sm border border-transparent bg-transparent px-2 py-1 text-[15px] font-medium outline-none hover:border-edge focus:border-accent"
          />
          <label className="flex items-center gap-1 text-[11px] text-subtle">
            v
            <input
              value={draft.version}
              onChange={(e) => update((m) => ({ ...m, version: e.target.value }))}
              className="lm-transition w-[74px] rounded-lumen-sm border border-edge bg-input px-1.5 py-0.5 font-mono text-[11.5px] text-fg outline-none focus:border-accent"
            />
          </label>
          {dirty && <span title={t('addonStudio.studio.unsaved')} className="size-2 shrink-0 rounded-full bg-warn" />}
          {blockingCount > 0 && (
            <Button size="sm" onClick={() => setSection('general')} title={t('addonStudio.studio.problemsHint')}>
              <AlertTriangle size={12} className="text-bad" /> {blockingCount}
            </Button>
          )}

          <span className="mx-1 h-5 w-px bg-edge" />

          <Button size="sm" title={t('addonStudio.studio.export')} onClick={() => void userAddons.exportModel(draft)}>
            <Download size={12} />
          </Button>
          {savedId && (
            <Button size="sm" variant="danger" title={t('common.delete')} onClick={() => void remove()}>
              <Trash2 size={12} />
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={requestClose} title={t('common.closeEsc')}>
            <X size={12} /> {dirty ? t('common.discard') : t('common.close')}
          </Button>
          <Button size="sm" variant="solid" disabled={saving} onClick={() => void save()} title={t('addonStudio.studio.saveHint')}>
            <Check size={12} /> {t('common.save')}
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Navigation */}
          <nav className="flex w-[184px] shrink-0 flex-col gap-0.5 border-r border-edge p-2">
            {NAV.map((entry, index) => {
              const active = entry.id === section
              const Icon = entry.icon
              const count = COUNTS[entry.id]?.(draft)
              return (
                <button
                  key={entry.id}
                  onClick={() => setSection(entry.id)}
                  style={{ animationDelay: `calc(var(--duration) * ${index * 0.15})` }}
                  className={[
                    'lm-transition lm-anim-right flex h-8 items-center gap-2 rounded-lumen-sm px-2.5 text-left text-[12.5px]',
                    active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
                  ].join(' ')}
                >
                  <Icon size={13} className={active ? 'text-accent' : 'text-subtle'} />
                  <span className="min-w-0 flex-1 truncate">{t(`addonStudio.nav.${entry.id}`)}</span>
                  {errorSections.has(entry.id) && <span className="size-1.5 shrink-0 rounded-full bg-bad" />}
                  {count !== undefined && <span className="shrink-0 font-mono text-[10px] text-subtle">{count}</span>}
                </button>
              )
            })}
            <span className="flex-1" />
            <p className="px-1 text-[10.5px] leading-relaxed text-subtle">{t('addonStudio.studio.footer')}</p>
          </nav>

          <div key={section} className="lm-anim-fade min-w-0 flex-1 overflow-hidden">
            {section === 'general' && (
              <div className="h-full overflow-y-auto">
                <GeneralPage model={draft} issues={issues} onJump={jump} onChange={(patch) => update((m) => ({ ...m, ...patch }))} />
              </div>
            )}
            {section === 'languages' && (
              <LanguagesPage
                languages={draft.languages}
                issues={issues.filter((i) => i.section === 'languages')}
                focus={focus}
                onChange={(languages) => update((m) => ({ ...m, languages }))}
              />
            )}
            {section === 'commands' && (
              <CommandsPage
                model={draft}
                issues={issues.filter((i) => i.section === 'commands')}
                focus={focus}
                onChange={(commands) => update((m) => ({ ...m, commands }))}
              />
            )}
            {section === 'events' && (
              <EventsPage
                model={draft}
                issues={issues.filter((i) => i.section === 'events')}
                focus={focus}
                onChange={(events) => update((m) => ({ ...m, events }))}
              />
            )}
            {section === 'templates' && (
              <TemplatesPage
                model={draft}
                issues={issues.filter((i) => i.section === 'templates')}
                focus={focus}
                onChange={(templates) => update((m) => ({ ...m, templates }))}
              />
            )}
            {section === 'kinds' && (
              <KindsPage
                model={draft}
                issues={issues.filter((i) => i.section === 'kinds')}
                focus={focus}
                onChange={(projectKinds) => update((m) => ({ ...m, projectKinds }))}
              />
            )}
            {section === 'snippets' && (
              <SnippetsPage
                model={draft}
                issues={issues.filter((i) => i.section === 'snippets')}
                focus={focus}
                onChange={(snippets) => update((m) => ({ ...m, snippets }))}
              />
            )}
            {section === 'panels' && (
              <PanelsPage
                model={draft}
                issues={issues.filter((i) => i.section === 'panels')}
                focus={focus}
                onChange={(panels) => update((m) => ({ ...m, panels }))}
              />
            )}
            {section === 'themes' && (
              <div className="h-full overflow-y-auto">
                <ThemesPage themes={draft.themes} onChange={(themes) => update((m) => ({ ...m, themes }))} />
              </div>
            )}
            {section === 'json' && <JsonPage model={draft} onReplace={(model) => setDraft(model)} />}
          </div>
        </div>
      </div>
    </div>
  )
}
