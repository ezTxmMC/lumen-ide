/**
 * The Studio's “panels” area: pages for the window's docks — a cheat sheet on
 * the right, a guide on the left, a status page at the bottom. Markdown or
 * HTML, with a live preview in the same sealed frame the dock uses.
 */

import { useEffect, useState } from 'react'
import { PanelsTopLeft, Trash2 } from 'lucide-react'
import { t as translate, useT } from '@/i18n'
import type { UserAddonModel, UserPanel } from '@/core/user-addons/schema'
import type { ValidationIssue } from '@/core/user-addons/validate'
import { Button, Empty } from '../ui'
import { ExtensionPageView } from '../panels/ExtensionPageView'
import { namedIcon } from '../ui/named-icons'
import { AreaField, Heading, ItemList, TextField, inputClass } from './fields'

const LOCATIONS: UserPanel['location'][] = ['left', 'right', 'bottom']

export function newPanel(model: UserAddonModel): UserPanel {
  const n = (model.panels?.length ?? 0) + 1
  return {
    id: `panel-${n}`,
    title: translate('studioProject.panels.defaultTitle', { n }),
    icon: 'book-open',
    location: 'right',
    format: 'markdown',
    content: translate('studioProject.panels.defaultContent'),
  }
}

export function PanelsPage({
  model, onChange, issues, focus,
}: {
  model: UserAddonModel
  onChange: (panels: UserPanel[]) => void
  issues: ValidationIssue[]
  focus?: { index: number; token: number } | null
}) {
  const t = useT()
  const [selected, setSelected] = useState(0)
  useEffect(() => {
    if (focus) setSelected(focus.index)
  }, [focus])

  const panels = model.panels ?? []
  const index = Math.min(selected, panels.length - 1)
  const panel = panels[index]

  if (!panel) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Empty icon={<PanelsTopLeft size={28} strokeWidth={1.4} />} title={t('studioProject.panels.empty')} hint={t('studioProject.panels.emptyHint')} />
        <Button variant="solid" onClick={() => { onChange([newPanel(model)]); setSelected(0) }}>{t('studioProject.panels.add')}</Button>
      </div>
    )
  }

  const patch = (next: Partial<UserPanel>) => onChange(panels.map((entry, i) => (i === index ? { ...entry, ...next } : entry)))
  const errors = issues.filter((issue) => issue.index === index).map((issue) => issue.message)
  const Icon = namedIcon(panel.icon)

  return (
    <div className="flex h-full min-h-0">
      <ItemList
        items={panels}
        selected={index}
        onSelect={setSelected}
        render={(entry) => ({ title: entry.title || entry.id || '—', subtitle: t(`shell.layout.${entry.location}`), color: model.color })}
        onAdd={() => { onChange([...panels, newPanel(model)]); setSelected(panels.length) }}
        addLabel={t('studioProject.panels.add')}
        errorIndexes={new Set(issues.filter((issue) => issue.index !== undefined).map((issue) => issue.index as number))}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon size={15} className="shrink-0 text-accent" />
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{panel.title || '—'}</h3>
          <Button size="sm" variant="danger" title={t('common.delete')} onClick={() => {
            onChange(panels.filter((_, i) => i !== index))
            setSelected(Math.max(0, index - 1))
          }}>
            <Trash2 size={12} />
          </Button>
        </div>
        <Heading title={t('studioProject.panels.title')} hint={t('studioProject.panels.hint')} />
        {errors.length > 0 && <p className="mb-2 text-[11px] text-bad">{errors.join(' · ')}</p>}
        <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
          <TextField mono label={t('studioProject.panels.id')} value={panel.id} onChange={(id) => patch({ id })} />
          <TextField label={t('studioProject.panels.titleLabel')} value={panel.title} onChange={(title) => patch({ title })} />
          <TextField mono label={t('studioProject.panels.icon')} value={panel.icon ?? ''} onChange={(icon) => patch({ icon: icon || undefined })} />
          <label className="min-w-0">
            <span className="mb-1 block text-[11.5px] text-muted">{t('studioProject.panels.location')}</span>
            <select value={panel.location} onChange={(e) => patch({ location: e.target.value as UserPanel['location'] })} className={`${inputClass} border-edge`}>
              {LOCATIONS.map((location) => <option key={location} value={location}>{t(`shell.layout.${location}`)}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[11.5px] text-muted">{t('studioProject.panels.format')}</span>
            <select value={panel.format} onChange={(e) => patch({ format: e.target.value as UserPanel['format'] })} className={`${inputClass} border-edge`}>
              <option value="markdown">Markdown</option>
              <option value="html">HTML</option>
            </select>
          </label>
          <span />
          <AreaField className="col-span-3" rows={12} label={t('studioProject.panels.content')} hint={t('studioProject.panels.contentHint')} value={panel.content} onChange={(content) => patch({ content })} />
        </div>
        <div className="mt-3 text-[11.5px] text-muted">{t('studioProject.panels.preview')}</div>
        <div className="mt-1 h-64 shrink-0 overflow-hidden rounded-lumen border border-edge">
          <ExtensionPageView page={{ id: panel.id, title: panel.title, format: panel.format, content: panel.content }} />
        </div>
      </div>
    </div>
  )
}
