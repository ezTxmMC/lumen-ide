/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The sections of the template editor: basics, fields, files, setup steps and the preview. */

import { FileCode2, Trash2 } from 'lucide-react';
import { useT } from '@/i18n';
import { conditionsHold, fillPlaceholders } from '@/core/user-addons/compile';
import type { UserCondition, UserTemplate, UserTemplateField } from '@/core/user-addons/schema';
import { Button } from '../ui';
import {
  AreaField, CheckField, ChipInput, ColorField, NumberField, TextField, inputClass,
} from './fields';

const FIELD_TYPES = ['text', 'select', 'toggle'] as const;

export function sampleValue(field: UserTemplateField): string {
  if (field.default) {
    return field.default;
  }
  if (field.type === 'toggle') {
    return 'false';
  }
  return field.choices?.[0]?.value ?? field.id;
}

type ConditionMode = 'always' | 'set' | 'equals' | 'notEquals';

function conditionMode(condition: UserCondition | undefined): ConditionMode {
  if (!condition?.field) {
    return 'always';
  }
  if (condition.equals !== undefined) {
    return 'equals';
  }
  if (condition.notEquals !== undefined) {
    return 'notEquals';
  }
  return 'set';
}

/** “Only when field … is …” — for fields and for files. */
function ConditionEditor({ label, condition, fieldIds, onChange, className = '' }: {
  label: string;
  condition: UserCondition | undefined;
  fieldIds: string[];
  onChange: (condition: UserCondition | undefined) => void;
  className?: string;
}) {
  const t = useT();
  const mode = conditionMode(condition);
  const value = condition?.equals ?? condition?.notEquals ?? '';
  const build = (nextMode: ConditionMode, field: string, nextValue: string): UserCondition | undefined => {
    if (nextMode === 'always' || !field) {
      return undefined;
    }
    if (nextMode === 'equals') {
      return { field, equals: nextValue };
    }
    if (nextMode === 'notEquals') {
      return { field, notEquals: nextValue };
    }
    return { field };
  };
  const field = condition?.field ?? fieldIds[0] ?? '';
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
  );
}

type Patch = (next: Partial<UserTemplate>) => void;

export function TemplateBasics({ template, languageIds, kindIds, fieldError, patch }: {
  template: UserTemplate;
  languageIds: string[];
  kindIds: string[];
  fieldError: (field: string) => string | null;
  patch: Patch;
}) {
  const t = useT();
  return (
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
  );
}

export function TemplateFields({ template, patch }: { template: UserTemplate; patch: Patch; }) {
  const t = useT();
  const patchField = (i: number, next: Partial<UserTemplateField>) =>
    patch({ fields: template.fields.map((f, j) => (j === i ? { ...f, ...next } : f)) });
  return (
    <>
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
                const [value, ...label] = entry.split('=');
                return { value: value.trim(), label: (label.join('=') || value).trim() };
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
    </>
  );
}

export function TemplateFiles({ template, fileIndex, fileError, onFile, patch }: {
  template: UserTemplate;
  fileIndex: number;
  fileError: string | null;
  onFile: (index: number) => void;
  patch: Patch;
}) {
  const t = useT();
  const current = template.files[fileIndex];
  return (
      <div className="flex min-h-[260px] rounded-lumen-sm border border-edge">
        <div className="w-[190px] shrink-0 overflow-y-auto border-r border-edge p-1">
          {template.files.map((entry, i) => (
            <button
              key={i}
              onClick={() => onFile(i)}
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
              <TextField className="flex-1" mono label={t('addonStudio.templates.path')} value={current.path} error={fileError} onChange={(path) => patch({ files: template.files.map((f, j) => (j === fileIndex ? { ...f, path } : f)) })} />
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
  );
}

export function TemplateSetup({ template, patch }: { template: UserTemplate; patch: Patch; }) {
  const t = useT();
  return (
    <>
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
    </>
  );
}

export function TemplatePreview({ template, sampleValues, ctx }: {
  template: UserTemplate;
  sampleValues: Record<string, string>;
  ctx: { name: string; slug: string; dir: string; values: Record<string, string>; };
}) {
  const t = useT();
  return (
    <>
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
    </>
  );
}
