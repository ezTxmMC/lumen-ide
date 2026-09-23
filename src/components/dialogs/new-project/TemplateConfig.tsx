import { AppWindow, ArrowLeft, FolderOpen, GitBranch, PanelTop, Terminal } from 'lucide-react'
import type { FormField, FormValues, LanguageSpec, ProjectTask, ProjectTemplate } from '@/core/types'
import type { LoadedChoices } from '@/core/project/choices'
import { tr, useT } from '@/i18n'
import { Button } from '../../ui'
import { FormFields } from '../../overlays/FormFields'
import { Badge } from './TemplateBrowser'
import { TemplateIcon, templateBadges } from './TemplateIcon'
import type { CreateOptions } from './storage'

const inputClass = 'w-full rounded-lumen-sm border bg-input px-2.5 py-1.5 text-[13px] outline-none focus:border-accent'
const cardClass = 'mb-3 rounded-lumen border border-edge bg-surface/60 px-3.5 py-3'
const headingClass = 'mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle'

/** The second step: name, location, the template's own fields and what happens afterwards. */
export function TemplateConfig({
  template, languages, onBack,
  name, onName, slug, nameError,
  parent, onParent, onChooseParent, parentError,
  fields, values, errors, loaded, onField, onRetry, onSubmit,
  options, onOptions, setup, canChooseWindow,
}: {
  template: ProjectTemplate
  languages: LanguageSpec[]
  onBack: () => void
  name: string
  onName: (name: string) => void
  slug: string
  nameError?: string
  parent: string
  onParent: (parent: string) => void
  onChooseParent: () => void
  parentError?: string
  fields: FormField[]
  values: FormValues
  errors: Record<string, string>
  loaded: LoadedChoices
  onField: (id: string, value: string) => void
  onRetry: (id: string) => void
  onSubmit: () => void
  options: CreateOptions
  onOptions: (patch: Partial<CreateOptions>) => void
  setup: ProjectTask[]
  canChooseWindow: boolean
}) {
  const t = useT()
  const badges = templateBadges(template, languages)

  return (
    <div className="lm-anim-right min-w-0 flex-1 overflow-y-auto p-4">
      <div className="mb-4 flex items-start gap-3">
        <TemplateIcon template={template} languages={languages} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-medium text-fg">{tr(template.name)}</h2>
            {badges.map((badge) => <Badge key={badge} text={badge} />)}
          </div>
          {template.description && <p className="mt-0.5 text-[12px] leading-snug text-subtle">{tr(template.description)}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={onBack} title={t('forms.newProject.change')}>
          <ArrowLeft size={12} />{t('forms.newProject.change')}
        </Button>
      </div>

      <section className={cardClass}>
        <h3 className={headingClass}>{t('forms.newProject.project')}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1 block text-[11.5px] text-muted">{t('forms.newProject.projectName')}</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => onName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                onSubmit()
              }}
              placeholder={t('forms.newProject.namePlaceholder')}
              spellCheck={false}
              className={`${inputClass} ${nameError ? 'border-bad' : 'border-edge'}`}
            />
            {nameError && <span className="mt-1 block text-[11px] text-bad">{nameError}</span>}
            {!nameError && name.trim() && <span className="mt-1 block truncate font-mono text-[11px] text-subtle">{t('forms.newProject.folder', { slug })}</span>}
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[11.5px] text-muted">{t('forms.newProject.location')}</span>
            <div className="flex items-center gap-1.5">
              <input
                value={parent}
                onChange={(e) => onParent(e.target.value)}
                placeholder={t('forms.newProject.parentPlaceholder')}
                spellCheck={false}
                className={`${inputClass} font-mono text-[12px] ${parentError ? 'border-bad' : 'border-edge'}`}
              />
              <Button variant="outline" onClick={onChooseParent} title={t('forms.newProject.chooseFolder')}><FolderOpen size={13} /></Button>
            </div>
            {parentError && <span className="mt-1 block text-[11px] text-bad">{parentError}</span>}
          </label>
        </div>
      </section>

      <FormFields
        fields={fields}
        values={values}
        errors={errors}
        onChange={onField}
        onSubmit={onSubmit}
        loaded={loaded}
        onRetry={onRetry}
        variant="cards"
      />

      <section className={cardClass}>
        <h3 className={headingClass}>{t('forms.newProject.afterCreate')}</h3>
        <div className="flex flex-col gap-2 text-[12.5px] text-muted">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-[var(--c-accent)]" checked={options.git ?? true} onChange={(e) => onOptions({ git: e.target.checked })} />
            <GitBranch size={12} className="text-subtle" />
            {t('forms.newProject.gitInit')}
          </label>
          {setup.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2">
              <input type="checkbox" className="mt-0.5 accent-[var(--c-accent)]" checked={options.setup ?? true} onChange={(e) => onOptions({ setup: e.target.checked })} />
              <Terminal size={12} className="mt-0.5 text-subtle" />
              <span className="min-w-0">
                {t('forms.newProject.runSetup')}
                <span className="mt-1 flex flex-col gap-0.5">
                  {setup.map((task) => (
                    <code key={task.id} className="block truncate rounded bg-input px-1.5 py-0.5 font-mono text-[11px] text-subtle" title={task.label}>
                      $ {[task.command, ...task.args].join(' ')}
                    </code>
                  ))}
                </span>
              </span>
            </label>
          )}
          {canChooseWindow && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span>{t('forms.newProject.openIn')}</span>
              <div className="flex rounded-lumen-sm border border-edge p-0.5" role="radiogroup">
                {([['this', PanelTop, 'forms.newProject.openHere'], ['new', AppWindow, 'forms.newProject.openNew']] as const).map(([target, Icon, label]) => (
                  <button
                    key={target}
                    type="button"
                    role="radio"
                    aria-checked={(options.window ?? 'this') === target}
                    onClick={() => onOptions({ window: target })}
                    className={`lm-transition flex items-center gap-1.5 rounded px-2 py-0.5 text-[12px] ${(options.window ?? 'this') === target ? 'bg-active text-fg' : 'text-subtle hover:text-fg'}`}
                  >
                    <Icon size={12} />{t(label)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
