import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, FolderPlus, Loader2, Search, X } from 'lucide-react'
import { useStore } from '@/state/store'
import { usePresence } from '@/hooks/usePresence'
import { registry } from '@/core/registry'
import { resolveValues, slugify, templateContext, validateValues } from '@/core/project/scaffold'
import { locale, tr, useLanguage, useT } from '@/i18n'
import { Button, Kbd } from './ui'
import { FormFields } from './FormFields'
import type { FormValues, ProjectTemplate } from '@/core/types'

const PARENT_KEY = 'lumen.newProject.parent'
const OPTIONS_KEY = 'lumen.newProject.options'

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable — then without remembering.
  }
}

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

  const [templateId, setTemplateId] = useState('')
  const [filter, setFilter] = useState('')
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [touched, setTouched] = useState<FormValues>({})
  const [runSetup, setRunSetup] = useState(true)
  const [gitInit, setGitInit] = useState(true)
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template: ProjectTemplate | undefined =
    templates.find((t) => t.id === templateId) ?? templates[0]

  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    setName('')
    setFilter('')
    setShowErrors(false)
    const remembered = readStorage<string>(PARENT_KEY, '')
    setParent(remembered || (workspace ? workspace.replace(/[\\/][^\\/]+$/, '') : ''))
    const options = readStorage<{ setup?: boolean; git?: boolean }>(OPTIONS_KEY, {})
    setRunSetup(options.setup ?? true)
    setGitInit(options.git ?? true)
  }, [open, workspace])

  // Reset the input when the template changes — the fields differ.
  useEffect(() => {
    setTouched({})
    setShowErrors(false)
  }, [template?.id])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [open, setOpen])

  const grouped = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const map = new Map<string, ProjectTemplate[]>()
    for (const entry of templates) {
      const lang = languages.find((l) => l.id === entry.languageId)
      const haystack = `${tr(entry.name)} ${tr(entry.description)} ${lang?.name ?? ''}`.toLowerCase()
      if (needle && !haystack.includes(needle)) continue
      const key = lang?.name ?? t('forms.newProject.other')
      map.set(key, [...(map.get(key) ?? []), entry])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], locale()))
  }, [templates, languages, filter, t, language])

  const slug = slugify(name || '')
  const fields = template?.fields ?? []
  const values = useMemo(() => resolveValues(fields, { name: name.trim(), slug }, touched), [fields, name, slug, touched])
  const errors = useMemo(() => validateValues(fields, values), [fields, values, language])
  const target = parent && name.trim() ? `${parent.replace(/[\\/]$/, '')}/${slug}` : ''

  const previewFiles = useMemo(() => {
    if (!template || !name.trim()) return []
    try {
      const ctx = templateContext(template, parent || '/tmp', name.trim(), touched)
      return Object.keys(template.files(ctx)).sort()
    } catch {
      return []
    }
  }, [template, name, parent, touched])

  const setupTasks = useMemo(() => {
    if (!template?.setup || !name.trim()) return []
    try {
      return template.setup(templateContext(template, parent || '/tmp', name.trim(), touched))
    } catch {
      return []
    }
  }, [template, name, parent, touched])

  if (!visible) return null

  const chooseParent = async () => {
    const dir = await window.lumen.dialog.chooseFolder(t('forms.newProject.chooseParent'), parent || undefined)
    if (dir) setParent(dir)
  }

  const create = async () => {
    if (!template || busy) return
    setShowErrors(true)
    if (!name.trim()) {
      setError(t('forms.newProject.nameMissing'))
      return
    }
    if (!parent) {
      setError(t('forms.newProject.chooseParent'))
      return
    }
    if (Object.keys(errors).length) {
      setError(t('forms.newProject.checkFields'))
      return
    }
    setBusy(true)
    setError(null)
    writeStorage(OPTIONS_KEY, { setup: runSetup, git: gitInit })
    try {
      await createProject(template, parent, name.trim(), touched, { setup: runSetup, git: gitInit })
      writeStorage(PARENT_KEY, parent)
    } catch (err) {
      const message = (err as Error).message.replace(/^Error: /, '')
      if (!/außerhalb des Arbeitsordners/.test(message)) {
        setError(message)
        setBusy(false)
        return
      }
      // No write permission (the path came from storage) — confirm once through a dialog.
      const picked = await window.lumen.dialog.chooseFolder(t('forms.newProject.confirmParent'), parent)
      if (!picked) {
        setBusy(false)
        return
      }
      setParent(picked)
      try {
        await createProject(template, picked, name.trim(), touched, { setup: runSetup, git: gitInit })
        writeStorage(PARENT_KEY, picked)
      } catch (retry) {
        setError((retry as Error).message.replace(/^Error: /, ''))
      }
    }
    setBusy(false)
  }

  const field = 'w-full rounded-lumen-sm border border-edge bg-input px-2.5 py-1.5 text-[13px] outline-none focus:border-accent'
  const langOf = (id?: string) => languages.find((l) => l.id === id)

  return (
    <div className={`lm-anim-fade fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6 ${closing ? 'lm-closing' : ''}`} onClick={() => setOpen(false)}>
      <div
        className="lm-glass lm-shadow lm-anim-dialog flex h-[min(720px,92vh)] w-[min(980px,95vw)] flex-col overflow-hidden rounded-lumen-lg border border-edge"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('forms.newProject.title')}
      >
        <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
          <FolderPlus size={15} className="text-accent" />
          <span className="text-[14px] font-medium text-fg">{t('forms.newProject.title')}</span>
          <span className="text-[11.5px] text-subtle">{t('forms.newProject.templateCount', { count: templates.length })}</span>
          <span className="flex-1" />
          <Button size="sm" onClick={() => setOpen(false)} title={t('common.closeEsc')}><X size={13} /></Button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Vorlagen */}
          <div className="flex w-[300px] shrink-0 flex-col border-r border-edge">
            <div className="border-b border-edge p-2">
              <div className="flex items-center gap-2 rounded-lumen-sm border border-edge bg-input px-2 py-1.5 focus-within:border-accent">
                <Search size={12} className="shrink-0 text-subtle" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('forms.newProject.searchTemplate')}
                  className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-subtle"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {grouped.map(([languageName, list]) => {
                const lang = langOf(list[0]?.languageId)
                return (
                  <div key={languageName} className="mb-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
                      <span className="font-mono text-[9px] font-bold" style={{ color: lang?.color }}>{lang?.icon}</span>
                      {languageName}
                    </div>
                    {list.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => setTemplateId(entry.id)}
                        className={[
                          'lm-transition mb-0.5 block w-full rounded-lumen-sm px-2 py-1.5 text-left',
                          template?.id === entry.id ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
                        ].join(' ')}
                      >
                        <div className="text-[12.5px]">{tr(entry.name)}</div>
                        {entry.description && <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-subtle">{tr(entry.description)}</div>}
                      </button>
                    ))}
                  </div>
                )
              })}
              {grouped.length === 0 && (
                <p className="p-3 text-[12px] text-subtle">
                  {t(templates.length ? 'forms.newProject.noMatch' : 'forms.newProject.noTemplates')}
                </p>
              )}
            </div>
          </div>

          {/* Formular */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
            {template && (
              <>
                <div className="mb-3">
                  <div className="text-[15px] font-medium text-fg">{tr(template.name)}</div>
                  {template.description && <p className="mt-0.5 text-[12px] text-subtle">{tr(template.description)}</p>}
                </div>

                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] text-muted">{t('forms.newProject.projectName')}</span>
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void create() }}
                      placeholder={t('forms.newProject.namePlaceholder')}
                      className={`${field} ${showErrors && !name.trim() ? 'border-bad' : ''}`}
                    />
                    {slug && name && <span className="mt-1 block font-mono text-[11px] text-subtle">{t('forms.newProject.folder', { slug })}</span>}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] text-muted">{t('forms.newProject.parent')}</span>
                    <div className="flex items-center gap-1.5">
                      <input value={parent} onChange={(e) => setParent(e.target.value)} placeholder={t('forms.newProject.parentPlaceholder')} className={`${field} font-mono text-[12px]`} />
                      <Button variant="outline" onClick={() => void chooseParent()} title={t('forms.newProject.chooseFolder')}><FolderOpen size={13} /></Button>
                    </div>
                  </label>
                </div>

                <FormFields
                  fields={fields}
                  values={values}
                  errors={showErrors ? errors : {}}
                  onChange={(id, value) => setTouched((t) => ({ ...t, [id]: value }))}
                  onSubmit={() => void create()}
                />

                <fieldset className="mb-3">
                  <legend className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('forms.newProject.afterCreate')}</legend>
                  <div className="flex flex-col gap-1.5 text-[12.5px] text-muted">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={gitInit} onChange={(e) => setGitInit(e.target.checked)} />
                      {t('forms.newProject.gitInit')}
                    </label>
                    {setupTasks.length > 0 && (
                      <label className="flex items-start gap-2">
                        <input type="checkbox" className="mt-0.5" checked={runSetup} onChange={(e) => setRunSetup(e.target.checked)} />
                        <span>
                          {t('forms.newProject.runSetup')}
                          <span className="block font-mono text-[11px] text-subtle">
                            {setupTasks.map((task) => `${task.command} ${task.args.join(' ')}`).join(' → ')}
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                </fieldset>

                {previewFiles.length > 0 && (
                  <div className="mb-3 rounded-lumen border border-edge p-2.5">
                    <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
                      {t('forms.newProject.preview', { count: previewFiles.length })}
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 font-mono text-[11px] text-muted">
                      {previewFiles.map((f) => <div key={f} className="truncate" title={f}>{f}</div>)}
                    </div>
                  </div>
                )}

                {error && <p className="mb-3 rounded-lumen-sm border border-bad/40 bg-bad/10 px-2.5 py-1.5 text-[12px] text-bad">{error}</p>}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-edge px-4 py-2.5">
          <span className="truncate font-mono text-[11px] text-subtle">{target || t('forms.newProject.targetHint')}</span>
          <span className="flex-1" />
          <span className="flex items-center gap-1 text-[10.5px] text-subtle"><Kbd>↵</Kbd> {t('forms.newProject.createHint')}</span>
          <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="solid" disabled={busy || !template} onClick={() => void create()}>
            {busy ? <Loader2 size={13} className="lm-anim-spin" /> : <FolderPlus size={13} />}
            {t('forms.newProject.create')}
          </Button>
        </div>
      </div>
    </div>
  )
}
