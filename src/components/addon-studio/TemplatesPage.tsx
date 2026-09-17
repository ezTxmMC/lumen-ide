/** The Studio's “templates” area: simple project templates with fields and files. */

import { useEffect, useMemo, useState } from 'react'
import { FileCode2, FolderTree, Trash2 } from 'lucide-react'
import { t as translate, useT } from '@/i18n'
import { registry } from '@/core/registry'
import { conditionsHold, fillPlaceholders } from '@/core/user-addons/compile'
import type { UserAddonModel, UserCondition, UserTemplate, UserTemplateField } from '@/core/user-addons/schema'
import type { ValidationIssue } from '@/core/user-addons/validate'
import { Button, Empty } from '../ui'
import {
  AddButton, AreaField, CheckField, ChipInput, ColorField, Heading, ItemList, NumberField, TextField, inputClass,
} from './fields'

export function newTemplate(existing: UserTemplate[]): UserTemplate {
  let n = existing.length + 1
  while (existing.some((tpl) => tpl.id === `vorlage${n}`)) n++
  return {
    id: `vorlage${n}`,
    name: translate('addonStudio.templates.defaultName', { n }),
    fields: [],
    files: [{ path: 'README.md', content: '# {{name}}\n' }],
    open: 'README.md',
  }
}

const FIELD_TYPES = ['text', 'select', 'toggle'] as const

function sampleValue(field: UserTemplateField): string {
  if (field.default) return field.default
  if (field.type === 'toggle') return 'false'
  return field.choices?.[0]?.value ?? field.id
}

type ConditionMode = 'always' | 'set' | 'equals' | 'notEquals'

function conditionMode(condition: UserCondition | undefined): ConditionMode {
  if (!condition?.field) return 'always'
  if (condition.equals !== undefined) return 'equals'
  if (condition.notEquals !== undefined) return 'notEquals'
  return 'set'
}

/** “Only when field … is …” — for fields and for files. */
function ConditionEditor({ label, condition, fieldIds, onChange, className = '' }: {
  label: string
  condition: UserCondition | undefined
  fieldIds: string[]
  onChange: (condition: UserCondition | undefined) => void
  className?: string
}) {
  const t = useT()
  const mode = conditionMode(condition)
  const value = condition?.equals ?? condition?.notEquals ?? ''
  const build = (nextMode: ConditionMode, field: string, nextValue: string): UserCondition | undefined => {
    if (nextMode === 'always' || !field) return undefined
    if (nextMode === 'equals') return { field, equals: nextValue }
    if (nextMode === 'notEquals') return { field, notEquals: nextValue }
    return { field }
  }
  const field = condition?.field ?? fieldIds[0] ?? ''
  return (
    <div className={`grid grid-cols-[auto_1fr_1fr_1fr] items-end gap-2 ${className}`}>
      <span className="pb-1.5 text-[11.5px] text-muted">{label}</span>
      <select value={mode} onChange={(e) => onChange(build(e.target.value as ConditionMode, field, value))} className={`${inputClass} border-edge`}>
        {(['always', 'set', 'equals', 'notEquals'] as const).map((entry) => (
          <option key={entry} value={entry} disabled={entry !== 'always' && !fieldIds.length}>{t(`studioProject.templates.when.${entry}`)}</option>
        ))}
      </select>
      {mode !== 'always' && (
        <select value={field} onChange={(e) => onChange(build(mode, e.target.value, value))} className={`${inputClass} border-edge font-mono`}>
          {fieldIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      )}
      {(mode === 'equals' || mode === 'notEquals') && (
        <input value={value} onChange={(e) => onChange(build(mode, field, e.target.value))} placeholder="true" className={`${inputClass} border-edge font-mono`} />
      )}
    </div>
  )
}

export function TemplatesPage({
  model, onChange, issues, focus,
}: {
  model: UserAddonModel
  onChange: (templates: UserTemplate[]) => void
  issues: ValidationIssue[]
  focus?: { index: number; token: number } | null
}) {
  const t = useT()
  const [selected, setSelected] = useState(0)
  const [file, setFile] = useState(0)
  useEffect(() => {
    if (focus) setSelected(focus.index)
  }, [focus])

  const templates = model.templates
  const index = Math.min(selected, templates.length - 1)
  const template = templates[index]

  const languageIds = useMemo(() => [
    ...new Set([...model.languages.map((l) => l.id), ...registry.languages().map((l) => l.id)]),
  ], [model.languages])
  const kindIds = useMemo(() => [
    ...new Set([...model.projectKinds.map((kind) => kind.id), ...registry.projectKinds().map((kind) => kind.id)]),
  ], [model.projectKinds])

  if (!template) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Empty icon={<FolderTree size={28} strokeWidth={1.4} />} title={t('addonStudio.templates.empty')} hint={t('addonStudio.templates.emptyHint')} />
        <Button variant="solid" onClick={() => { onChange([newTemplate(templates)]); setSelected(0) }}>{t('addonStudio.templates.add')}</Button>
      </div>
    )
  }

  const patch = (next: Partial<UserTemplate>) => onChange(templates.map((tpl, i) => (i === index ? { ...tpl, ...next } : tpl)))
  const fieldError = (field: string) => issues.filter((i) => i.index === index && i.field === field).map((i) => i.message).join(' · ') || null
  const patchField = (i: number, next: Partial<UserTemplateField>) =>
    patch({ fields: template.fields.map((f, j) => (j === i ? { ...f, ...next } : f)) })
  const fileIndex = Math.min(file, template.files.length - 1)
  const current = template.files[fileIndex]

  // A preview with sample values: the default, else the first choice, else the field id.
  const sampleValues = Object.fromEntries(template.fields.map((f) => [f.id, sampleValue(f)]))
  const ctx = { name: t('addonStudio.templates.sampleName'), slug: 'mein-projekt', dir: '/…/mein-projekt', values: sampleValues }

  return (
    <div className="flex h-full min-h-0">
      <ItemList
        items={templates}
        selected={index}
        onSelect={setSelected}
        render={(tpl) => ({ title: tpl.name || tpl.id, subtitle: t('addonStudio.templates.fileCount', { count: tpl.files.length }), color: tpl.color ?? model.color })}
        onAdd={() => { onChange([...templates, newTemplate(templates)]); setSelected(templates.length) }}
        addLabel={t('addonStudio.templates.add')}
        errorIndexes={new Set(issues.filter((i) => i.index !== undefined).map((i) => i.index as number))}
      />

      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{template.name || template.id}</h3>
          <Button size="sm" variant="danger" title={t('common.delete')} onClick={() => {
            if (!confirm(t('common.confirmDelete', { name: template.name || template.id }))) return
            onChange(templates.filter((_, i) => i !== index))
            setSelected(Math.max(0, index - 1))
          }}>
            <Trash2 size={12} />
          </Button>
        </div>

        <Heading title={t('addonStudio.templates.basics')} hint={`${t('addonStudio.templates.placeholdersHint')} ${t('studioProject.templates.syntaxHint')}`} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <TextField mono label={t('addonStudio.templates.id')} value={template.id} error={fieldError('id')} onChange={(id) => patch({ id })} />
          <TextField label={t('common.name')} value={template.name} error={fieldError('name')} onChange={(name) => patch({ name })} />
          <TextField className="col-span-2" label={t('common.description')} value={template.description} onChange={(description) => patch({ description })} />
          <label className="min-w-0">
            <span className="mb-1 block text-[11.5px] text-muted">{t('addonStudio.templates.language')}</span>
            <select value={template.languageId ?? ''} onChange={(e) => patch({ languageId: e.target.value || undefined })} className={`${inputClass} border-edge`}>
              <option value="">{t('common.none')}</option>
              {languageIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <ColorField label={t('addonStudio.general.color')} value={template.color} onChange={(color) => patch({ color })} />
          <label className="min-w-0">
            <span className="mb-1 block text-[11.5px] text-muted">{t('studioProject.templates.kind')}</span>
            <select value={template.kindId ?? ''} onChange={(e) => patch({ kindId: e.target.value || undefined })} className={`${inputClass} border-edge`}>
              <option value="">{t('common.none')}</option>
              {kindIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <TextField mono label={t('addonStudio.templates.open')} value={template.open} onChange={(open) => patch({ open: open || undefined })} placeholder="src/main.txt" />
          <TextField label={t('addonStudio.templates.next')} value={template.next} onChange={(next) => patch({ next: next || undefined })} />
        </div>

        <Heading
          title={t('addonStudio.templates.fields')}
          hint={t('addonStudio.templates.fieldsHint')}
          action={<AddButton label={t('common.add')} onClick={() => patch({ fields: [...template.fields, { id: `feld${template.fields.length + 1}`, label: t('addonStudio.templates.fieldDefault'), type: 'text' }] })} />}
        />
        {fieldError('fields') && <p className="mb-1.5 text-[11px] text-bad">{fieldError('fields')}</p>}
        {template.fields.map((field, i) => (
          <div key={i} className="mb-1.5 grid grid-cols-4 items-end gap-2 rounded-lumen-sm border border-edge p-2">
            <TextField mono label={t('addonStudio.templates.fieldId')} value={field.id} onChange={(id) => patchField(i, { id })} />
            <TextField label={t('addonStudio.templates.fieldLabel')} value={field.label} onChange={(label) => patchField(i, { label })} />
            <label className="min-w-0">
              <span className="mb-1 block text-[11.5px] text-muted">{t('addonStudio.templates.fieldType')}</span>
              <select value={field.type ?? 'text'} onChange={(e) => patchField(i, { type: e.target.value as UserTemplateField['type'] })} className={`${inputClass} border-edge`}>
                {FIELD_TYPES.map((type) => <option key={type} value={type}>{t(`addonStudio.templates.type.${type}`)}</option>)}
              </select>
            </label>
            <TextField label={t('addonStudio.templates.fieldDefaultValue')} value={field.default} onChange={(value) => patchField(i, { default: value || undefined })} />
            <TextField label={t('addonStudio.templates.fieldPlaceholder')} value={field.placeholder} onChange={(placeholder) => patchField(i, { placeholder: placeholder || undefined })} />
            <TextField mono label={t('addonStudio.templates.fieldPattern')} value={field.pattern} onChange={(pattern) => patchField(i, { pattern: pattern || undefined })} />
            <TextField label={t('addonStudio.templates.fieldSection')} value={field.section} onChange={(section) => patchField(i, { section: section || undefined })} />
            <div className="flex items-center justify-between gap-2">
              <CheckField label={t('addonStudio.templates.fieldRequired')} checked={field.required !== false} onChange={(required) => patchField(i, { required })} />
              <Button size="sm" variant="danger" title={t('common.remove')} onClick={() => patch({ fields: template.fields.filter((_, j) => j !== i) })}>
                <Trash2 size={12} />
              </Button>
            </div>
            <TextField className="col-span-4" label={t('addonStudio.templates.fieldHint')} value={field.hint} onChange={(hint) => patchField(i, { hint: hint || undefined })} />
            <ConditionEditor
              className="col-span-4"
              label={t('studioProject.templates.fieldWhen')}
              condition={field.when}
              fieldIds={template.fields.map((other) => other.id).filter((id) => id !== field.id)}
              onChange={(when) => patchField(i, { when })}
            />
            {field.type === 'select' && (
              <ChipInput
                className="col-span-4"
                allowSpaces
                label={t('addonStudio.templates.fieldChoices')}
                hint={t('addonStudio.templates.fieldChoicesHint')}
                values={(field.choices ?? []).map((c) => (c.label && c.label !== c.value ? `${c.value}=${c.label}` : c.value))}
                onChange={(values) => patchField(i, {
                  choices: values.map((entry) => {
                    const [value, ...label] = entry.split('=')
                    return { value: value.trim(), label: (label.join('=') || value).trim() }
                  }),
                })}
              />
            )}
            {field.type === 'select' && (
              <div className="col-span-4 grid grid-cols-6 items-end gap-2 rounded-[5px] bg-input/40 p-2">
                <TextField className="col-span-6" mono label={t('studioProject.templates.choicesUrl')} placeholder="https://fill.papermc.io/v3/projects/paper/versions" hint={t('studioProject.templates.choicesUrlHint')} value={field.choicesUrl} onChange={(choicesUrl) => patchField(i, { choicesUrl: choicesUrl || undefined })} />
                <TextField mono label={t('studioProject.templates.choicesPath')} placeholder="versions" value={field.choicesPath} onChange={(choicesPath) => patchField(i, { choicesPath: choicesPath || undefined })} />
                <TextField mono label={t('studioProject.templates.choicesValue')} placeholder="id" value={field.choicesValue} onChange={(choicesValue) => patchField(i, { choicesValue: choicesValue || undefined })} />
                <TextField mono label={t('studioProject.templates.choicesLabel')} placeholder="name" value={field.choicesLabel} onChange={(choicesLabel) => patchField(i, { choicesLabel: choicesLabel || undefined })} />
                <TextField mono label={t('studioProject.templates.choicesMatch')} placeholder="^[0-9.]+$" value={field.choicesMatch} onChange={(choicesMatch) => patchField(i, { choicesMatch: choicesMatch || undefined })} />
                <NumberField label={t('studioProject.templates.choicesLimit')} min={0} max={500} value={field.choicesLimit} onChange={(choicesLimit) => patchField(i, { choicesLimit })} />
                <CheckField label={t('studioProject.templates.choicesReverse')} checked={Boolean(field.choicesReverse)} onChange={(choicesReverse) => patchField(i, { choicesReverse: choicesReverse || undefined })} />
              </div>
            )}
          </div>
        ))}

        <Heading
          title={t('addonStudio.templates.files')}
          action={<AddButton label={t('common.add')} onClick={() => {
            patch({ files: [...template.files, { path: `datei${template.files.length + 1}.txt`, content: '' }] })
            setFile(template.files.length)
          }} />}
        />
        <div className="flex min-h-[260px] rounded-lumen-sm border border-edge">
          <div className="w-[190px] shrink-0 overflow-y-auto border-r border-edge p-1">
            {template.files.map((entry, i) => (
              <button
                key={i}
                onClick={() => setFile(i)}
                className={[
                  'lm-transition flex w-full items-center gap-1.5 rounded-[4px] px-1.5 py-1 text-left font-mono text-[11.5px]',
                  i === fileIndex ? 'bg-active text-fg' : 'text-muted hover:bg-hover',
                ].join(' ')}
              >
                <FileCode2 size={11} className="shrink-0 text-subtle" />
                <span className="truncate">{entry.path || '—'}</span>
              </button>
            ))}
          </div>
          {current && (
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-2">
              <div className="flex items-end gap-2">
                <TextField className="flex-1" mono label={t('addonStudio.templates.path')} value={current.path} error={fieldError('files')} onChange={(path) => patch({ files: template.files.map((f, j) => (j === fileIndex ? { ...f, path } : f)) })} />
                <Button size="sm" variant="danger" title={t('common.remove')} onClick={() => patch({ files: template.files.filter((_, j) => j !== fileIndex) })}>
                  <Trash2 size={12} />
                </Button>
              </div>
              <ConditionEditor
                label={t('studioProject.templates.fileWhen')}
                condition={Array.isArray(current.when) ? current.when[0] : current.when}
                fieldIds={template.fields.map((field) => field.id)}
                onChange={(when) => patch({ files: template.files.map((f, j) => (j === fileIndex ? { ...f, when } : f)) })}
              />
              <AreaField rows={10} label={t('addonStudio.templates.content')} value={current.content} onChange={(content) => patch({ files: template.files.map((f, j) => (j === fileIndex ? { ...f, content } : f)) })} />
            </div>
          )}
        </div>

        <Heading
          title={t('addonStudio.templates.setup')}
          hint={t('addonStudio.templates.setupHint')}
          action={<AddButton label={t('common.add')} onClick={() => patch({ setup: [...(template.setup ?? []), { label: '', command: '', args: [] }] })} />}
        />
        {(template.setup ?? []).map((step, i) => (
          <div key={i} className="mb-1.5 grid grid-cols-[1fr_1fr_2fr_auto] items-end gap-2 rounded-lumen-sm border border-edge p-2">
            <TextField label={t('addonStudio.languages.runLabel')} value={step.label} onChange={(label) => patch({ setup: (template.setup ?? []).map((s, j) => (j === i ? { ...s, label } : s)) })} />
            <TextField mono label={t('addonStudio.languages.command')} value={step.command} onChange={(command) => patch({ setup: (template.setup ?? []).map((s, j) => (j === i ? { ...s, command } : s)) })} />
            <ChipInput allowSpaces label={t('addonStudio.languages.args')} values={step.args} onChange={(args) => patch({ setup: (template.setup ?? []).map((s, j) => (j === i ? { ...s, args } : s)) })} />
            <Button size="sm" variant="danger" title={t('common.remove')} onClick={() => patch({ setup: (template.setup ?? []).filter((_, j) => j !== i) })}>
              <Trash2 size={12} />
            </Button>
          </div>
        ))}
        <div className="h-6" />
      </div>

      <div className="w-[300px] shrink-0 overflow-y-auto border-l border-edge p-3">
        <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('addonStudio.templates.preview')}</h4>
        <p className="mb-2 text-[11px] text-subtle">{t('addonStudio.templates.previewHint', { name: ctx.name })}</p>
        {template.files.filter((entry) => conditionsHold(entry.when, sampleValues)).map((entry, i) => (
          <div key={i} className="mb-2">
            <div className="flex items-center gap-1.5 font-mono text-[11.5px] text-fg">
              <FileCode2 size={11} className="text-accent" />
              {fillPlaceholders(entry.path, ctx)}
            </div>
            <pre className="mt-1 max-h-[120px] overflow-auto rounded-[4px] bg-input p-1.5 font-mono text-[10.5px] whitespace-pre-wrap text-muted">
              {fillPlaceholders(entry.content, ctx) || '—'}
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}
