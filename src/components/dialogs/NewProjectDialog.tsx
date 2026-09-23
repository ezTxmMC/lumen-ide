/**
 * “New project”: a page in two steps. First the template — a category rail,
 * a search, the templates as cards; then its configuration — name, location,
 * the template's fields by section, what runs afterwards — beside a live
 * preview of the files it will generate.
 *
 * The pieces live in `./new-project`; the catalogue logic (categories, search,
 * recent templates) in `core/project/catalog`, the field values with their
 * fetched choices in `hooks/useFormValues`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, ChevronRight, FolderPlus, Loader2, X } from 'lucide-react'
import { useStore } from '@/state/store'
import { usePresence } from '@/hooks/usePresence'
import { useFormValues } from '@/hooks/useFormValues'
import { registry } from '@/core/registry'
import { resolveValues, slugify, validateValues, type ScaffoldProgress } from '@/core/project/scaffold'
import {
  ALL_CATEGORY, RECENT_CATEGORY, filterTemplates, knownRecent, rememberRecent, templateCategories,
  type CatalogOptions,
} from '@/core/project/catalog'
import { takeOverSetup } from '@/core/project/setup-handover'
import { locale, tr, useLanguage, useT } from '@/i18n'
import type { FormValues, ProjectTemplate } from '@/core/types'
import { Button, Kbd } from '../ui'
import { escapeOwnedByPopover } from '../overlays/escape'
import { TemplateBrowser } from './new-project/TemplateBrowser'
import { TemplateConfig } from './new-project/TemplateConfig'
import { FilePreview } from './new-project/FilePreview'
import { usePreview } from './new-project/usePreview'
import {
  LAYOUT_KEY, OPTIONS_KEY, PARENT_KEY, RECENT_KEY, readStorage, writeStorage, type CreateOptions,
} from './new-project/storage'

type Step = 'pick' | 'configure'

/** The main process refuses writes outside the granted folders (see `assertWritable`). */
const OUTSIDE_WORKSPACE = /outside the workspace folder|außerhalb des Arbeitsordners/

export function NewProjectDialog() {
  const open = useStore((s) => s.newProjectOpen)
  const { visible, closing } = usePresence(open)
  const setOpen = useStore((s) => s.setNewProjectOpen)
  const createProject = useStore((s) => s.createProject)
  const registryVersion = useStore((s) => s.registryVersion)
  const workspace = useStore((s) => s.workspace)
  const t = useT()
  const language = useLanguage()

  const templates = useMemo(() => registry.projectTemplates(), [registryVersion])
  const languages = useMemo(() => registry.languages(), [registryVersion])

  const [step, setStep] = useState<Step>('pick')
  const [templateId, setTemplateId] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL_CATEGORY)
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [recent, setRecent] = useState<string[]>([])
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [touched, setTouched] = useState<FormValues>({})
  const [options, setOptions] = useState<CreateOptions>({})
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ScaffoldProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const catalog: CatalogOptions = useMemo(
    () => ({ translate: tr, otherLabel: t('forms.newProject.other'), locale: locale() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the language changes the labels
    [t, language],
  )
  const recentIds = useMemo(() => knownRecent(recent, templates), [recent, templates])
  const categories = useMemo(() => templateCategories(templates, languages, catalog), [templates, languages, catalog])
  const shown = useMemo(
    () => filterTemplates(templates, languages, { text: query, category, recent: recentIds }, catalog),
    [templates, languages, query, category, recentIds, catalog],
  )
  const template: ProjectTemplate | undefined = templates.find((entry) => entry.id === templateId)

  // Everything starts afresh on opening; the location, options, layout and recent templates are remembered.
  useEffect(() => {
    if (!open) return
    const remembered = knownRecent(readStorage<string[]>(RECENT_KEY, []), registry.projectTemplates())
    setRecent(remembered)
    setCategory(remembered.length ? RECENT_CATEGORY : ALL_CATEGORY)
    setTemplateId(remembered[0] ?? '')
    setStep('pick')
    setQuery('')
    setError(null)
    setBusy(false)
    setProgress(null)
    setName('')
    setTouched({})
    setShowErrors(false)
    setLayout(readStorage<'grid' | 'list'>(LAYOUT_KEY, 'grid') === 'list' ? 'list' : 'grid')
    const state = useStore.getState()
    setParent(readStorage<string>(PARENT_KEY, '') || (state.workspace ? state.workspace.replace(/[\\/][^\\/]+$/, '') : ''))
    const stored = readStorage<CreateOptions>(OPTIONS_KEY, {})
    setOptions({ ...stored, window: stored.window ?? (state.effects.openProjectsIn === 'new' ? 'new' : 'this') })
  }, [open])

  // The selection follows the search: a hidden template can't stay selected.
  useEffect(() => {
    if (!open || step !== 'pick' || !shown.length) return
    if (shown.some((entry) => entry.id === templateId)) return
    setTemplateId(shown[0].id)
  }, [open, step, shown, templateId])

  // Another template has other fields.
  useEffect(() => {
    setTouched({})
    setShowErrors(false)
    setError(null)
  }, [templateId])

  // A stale error goes as soon as the input changes.
  useEffect(() => {
    setError(null)
  }, [name, parent, touched])

  // A project created for a new window arrives here: open its file, run its setup.
  useEffect(() => {
    if (!workspace) return
    const note = takeOverSetup(workspace)
    if (!note) return
    const state = useStore.getState()
    state.showView('project')
    if (note.open) void state.openFile(note.open).catch(() => {})
    if (!note.tasks.length) return
    void import('@/lib/run').then(({ runTasks }) => runTasks(note.tasks, workspace, () => void useStore.getState().refreshProject()))
  }, [workspace])

  const fields = useMemo(() => template?.fields ?? [], [template])
  const trimmed = name.trim()
  const slug = slugify(trimmed)
  const base = useMemo(() => ({ name: trimmed, slug }), [trimmed, slug])
  const { values, loaded, retry } = useFormValues(fields, base, touched, `${templateId}|${open}`)
  const errors = useMemo(() => validateValues(fields, values, loaded), [fields, values, loaded, language])

  // Until a name is typed the preview shows the placeholder's project.
  const previewName = trimmed || t('forms.newProject.namePlaceholder')
  const previewValues = useMemo(
    () => resolveValues(fields, { name: previewName, slug: slugify(previewName) }, touched, loaded),
    [fields, previewName, touched, loaded],
  )
  const preview = usePreview(template, parent, previewName, previewValues, open && step === 'configure')
  const target = parent && trimmed ? `${parent.replace(/[\\/]$/, '')}/${slug}` : ''

  const choose = (id: string) => {
    setTemplateId(id)
    setStep('configure')
  }

  const create = async () => {
    if (!template || busy) return
    setShowErrors(true)
    if (!trimmed) {
      setError(t('forms.newProject.nameMissing'))
      return
    }
    if (!parent.trim()) {
      setError(t('forms.newProject.chooseParent'))
      return
    }
    const loading = fields.some((field) => field.loadChoices && errors[field.id] && loaded[field.id]?.status !== 'error')
    if (Object.keys(errors).length) {
      setError(t(loading ? 'forms.newProject.waitChoices' : 'forms.newProject.checkFields'))
      return
    }
    setBusy(true)
    setError(null)
    writeStorage(OPTIONS_KEY, options)
    const run = async (folder: string) => {
      await createProject(template, folder, trimmed, values, {
        setup: options.setup ?? true,
        git: options.git ?? true,
        window: options.window,
        onProgress: setProgress,
      })
      writeStorage(PARENT_KEY, folder)
      writeStorage(RECENT_KEY, rememberRecent(recentIds, template.id))
    }
    try {
      await run(parent)
    } catch (err) {
      const message = (err as Error).message.replace(/^Error: /, '')
      if (!OUTSIDE_WORKSPACE.test(message)) {
        setError(message)
        setBusy(false)
        setProgress(null)
        return
      }
      // No write permission (the path came from storage) — confirm once through a dialog.
      const picked = await window.lumen.dialog.chooseFolder(t('forms.newProject.confirmParent'), parent)
      if (!picked) {
        setBusy(false)
        setProgress(null)
        return
      }
      setParent(picked)
      try {
        await run(picked)
      } catch (retryError) {
        setError((retryError as Error).message.replace(/^Error: /, ''))
      }
    }
    setBusy(false)
    setProgress(null)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (escapeOwnedByPopover()) return
        e.stopPropagation()
        setOpen(false)
        return
      }
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || escapeOwnedByPopover()) return
      e.preventDefault()
      e.stopPropagation()
      if (step === 'pick' && templateId) {
        choose(templateId)
        return
      }
      if (step === 'configure') void create()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  })

  if (!visible) return null

  const chooseParent = async () => {
    const dir = await window.lumen.dialog.chooseFolder(t('forms.newProject.chooseParent'), parent || undefined)
    if (dir) setParent(dir)
  }

  const changeLayout = (next: 'grid' | 'list') => {
    setLayout(next)
    writeStorage(LAYOUT_KEY, next)
  }

  return (
    <div className={`lm-anim-fade fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4 ${closing ? 'lm-closing' : ''}`} onClick={() => setOpen(false)}>
      <div
        className="lm-glass lm-shadow lm-anim-dialog flex h-[min(820px,94vh)] w-[min(1200px,96vw)] flex-col overflow-hidden rounded-lumen-lg border border-edge"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('forms.newProject.title')}
      >
        <header className="flex items-center gap-2 border-b border-edge px-4 py-2.5">
          <FolderPlus size={15} className="text-accent" />
          <button
            type="button"
            onClick={() => setStep('pick')}
            className={`text-[14px] font-medium ${step === 'pick' ? 'text-fg' : 'lm-transition text-muted hover:text-fg'}`}
          >
            {t('forms.newProject.title')}
          </button>
          {step === 'configure' && template && (
            <span className="lm-anim-fade flex min-w-0 items-center gap-2 text-[14px] text-fg">
              <ChevronRight size={13} className="text-subtle" />
              <span className="truncate">{tr(template.name)}</span>
            </span>
          )}
          {step === 'pick' && (
            <span className="text-[11.5px] text-subtle">{t('forms.newProject.templateCount', { count: templates.length })}</span>
          )}
          <span className="flex-1" />
          <Button size="sm" onClick={() => setOpen(false)} title={t('common.closeEsc')}><X size={13} /></Button>
        </header>

        {step === 'pick' && (
          <TemplateBrowser
            templates={templates}
            visible={shown}
            categories={categories}
            category={category}
            onCategory={setCategory}
            recentCount={recentIds.length}
            query={query}
            onQuery={setQuery}
            selectedId={templateId}
            onSelect={setTemplateId}
            onChoose={choose}
            layout={layout}
            onLayout={changeLayout}
            languages={languages}
            searchRef={searchRef}
          />
        )}

        {step === 'configure' && template && (
          <div className="flex min-h-0 flex-1">
            <TemplateConfig
              key={template.id}
              template={template}
              languages={languages}
              onBack={() => setStep('pick')}
              name={name}
              onName={setName}
              slug={slug}
              nameError={showErrors && !trimmed ? t('forms.newProject.nameMissing') : undefined}
              parent={parent}
              onParent={setParent}
              onChooseParent={() => void chooseParent()}
              parentError={showErrors && !parent.trim() ? t('forms.newProject.chooseParent') : undefined}
              fields={fields}
              values={values}
              errors={showErrors ? errors : {}}
              loaded={loaded}
              onField={(id, value) => setTouched((current) => ({ ...current, [id]: value }))}
              onRetry={retry}
              onSubmit={() => void create()}
              options={options}
              onOptions={(patch) => setOptions((current) => ({ ...current, ...patch }))}
              setup={preview.setup}
              canChooseWindow={Boolean(workspace)}
            />
            <aside className="lm-anim-fade flex w-[330px] shrink-0 flex-col gap-3 border-l border-edge p-4">
              <section className="rounded-lumen border border-edge bg-surface/60 px-3 py-2.5">
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('forms.newProject.target')}</div>
                <div className={`break-all font-mono text-[11.5px] ${target ? 'text-fg' : 'text-subtle'}`}>{target || t('forms.newProject.targetHint')}</div>
              </section>
              <FilePreview preview={preview} rootName={slugify(previewName)} />
            </aside>
          </div>
        )}

        <footer className="flex items-center gap-3 border-t border-edge px-4 py-2.5">
          <FooterStatus step={step} busy={busy} progress={progress} error={error} template={template} />
          <span className="flex-1" />
          {step === 'configure' && (
            <span className="hidden items-center gap-1 text-[10.5px] text-subtle sm:flex"><Kbd>Ctrl ↵</Kbd> {t('forms.newProject.createHint')}</span>
          )}
          <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          {step === 'pick' && (
            <Button variant="solid" disabled={!template} onClick={() => template && choose(template.id)}>
              {t('forms.newProject.next')}<ArrowRight size={13} />
            </Button>
          )}
          {step === 'configure' && (
            <Button variant="solid" disabled={busy || !template} onClick={() => void create()}>
              {busy ? <Loader2 size={13} className="lm-anim-spin" /> : <FolderPlus size={13} />}
              {t('forms.newProject.create')}
            </Button>
          )}
        </footer>
      </div>
    </div>
  )
}

function FooterStatus({ step, busy, progress, error, template }: {
  step: Step
  busy: boolean
  progress: ScaffoldProgress | null
  error: string | null
  template: ProjectTemplate | undefined
}) {
  const t = useT()
  if (error) {
    return (
      <span role="alert" className="lm-anim-fade flex min-w-0 items-center gap-1.5 rounded-lumen-sm border border-bad/40 bg-bad/10 px-2 py-1 text-[12px] text-bad">
        <AlertCircle size={12} className="shrink-0" />
        <span className="truncate" title={error}>{error}</span>
      </span>
    )
  }
  if (busy) return <ProgressLine progress={progress} />
  if (step === 'pick' && template) {
    return <span className="truncate text-[12px] text-muted">{t('forms.newProject.selected', { name: tr(template.name) })}</span>
  }
  return null
}

function ProgressLine({ progress }: { progress: ScaffoldProgress | null }) {
  const t = useT()
  const label = (() => {
    if (!progress || progress.step === 'check') return t('forms.newProject.progress.check')
    if (progress.step === 'generate') return t('forms.newProject.progress.generate')
    return t('forms.newProject.progress.write', { done: progress.done, total: progress.total })
  })()
  const share = progress?.step === 'write' && progress.total ? progress.done / progress.total : null
  return (
    <span className="lm-anim-fade flex min-w-0 items-center gap-2 text-[12px] text-muted" role="status">
      <Loader2 size={12} className="lm-anim-spin shrink-0 text-accent" />
      <span className="truncate">{label}</span>
      <span className="relative h-1 w-28 shrink-0 overflow-hidden rounded-full bg-input">
        {share === null && <span className="lm-shimmer absolute inset-0" />}
        {share !== null && <span className="lm-transition absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.round(share * 100)}%` }} />}
      </span>
    </span>
  )
}
