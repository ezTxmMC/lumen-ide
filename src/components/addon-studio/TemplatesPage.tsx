/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The Studio's “templates” area: simple project templates with fields and files. */

import { useEffect, useMemo, useState } from 'react';
import { FolderTree, Trash2 } from 'lucide-react';
import { t as translate, useT } from '@/i18n';
import { registry } from '@/core/registry';
import type { UserAddonModel, UserTemplate } from '@/core/user-addons/schema';
import type { ValidationIssue } from '@/core/user-addons/validate';
import { Button, Empty } from '../ui';
import { ItemList, Heading, AddButton } from './fields';
import {
  TemplateBasics, TemplateFields, TemplateFiles, TemplatePreview, TemplateSetup, sampleValue,
} from './TemplateSections';

export function newTemplate(existing: UserTemplate[]): UserTemplate {
  let n = existing.length + 1;
  while (existing.some((tpl) => tpl.id === `vorlage${n}`)) {
    n++;
  }
  return {
    id: `vorlage${n}`,
    name: translate('addonStudio.templates.defaultName', { n }),
    fields: [],
    files: [{ path: 'README.md', content: '# {{name}}\n' }],
    open: 'README.md',
  };
}

export function TemplatesPage({
  model, onChange, issues, focus,
}: {
  model: UserAddonModel;
  onChange: (templates: UserTemplate[]) => void;
  issues: ValidationIssue[];
  focus?: { index: number; token: number; } | null;
}) {
  const t = useT();
  const [selected, setSelected] = useState(0);
  const [file, setFile] = useState(0);
  useEffect(() => {
    if (focus) {
      setSelected(focus.index);
    }
  }, [focus]);

  const templates = model.templates;
  const index = Math.min(selected, templates.length - 1);
  const template = templates[index];

  const languageIds = useMemo(() => [
    ...new Set([...model.languages.map((l) => l.id), ...registry.languages().map((l) => l.id)]),
  ], [model.languages]);
  const kindIds = useMemo(() => [
    ...new Set([...model.projectKinds.map((kind) => kind.id), ...registry.projectKinds().map((kind) => kind.id)]),
  ], [model.projectKinds]);

  if (!template) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Empty icon={<FolderTree size={28} strokeWidth={1.4} />} title={t('addonStudio.templates.empty')} hint={t('addonStudio.templates.emptyHint')} />
        <Button variant="solid" onClick={() => { onChange([newTemplate(templates)]); setSelected(0); }}>{t('addonStudio.templates.add')}</Button>
      </div>
    );
  }

  const patch = (next: Partial<UserTemplate>) => onChange(templates.map((tpl, i) => (i === index ? { ...tpl, ...next } : tpl)));
  const fieldError = (field: string) => issues.filter((i) => i.index === index && i.field === field).map((i) => i.message).join(' · ') || null;
  const fileIndex = Math.min(file, template.files.length - 1);

  // A preview with sample values: the default, else the first choice, else the field id.
  const sampleValues = Object.fromEntries(template.fields.map((f) => [f.id, sampleValue(f)]));
  const ctx = { name: t('addonStudio.templates.sampleName'), slug: 'mein-projekt', dir: '/…/mein-projekt', values: sampleValues };

  return (
    <div className="flex h-full min-h-0">
      <ItemList
        items={templates}
        selected={index}
        onSelect={setSelected}
        render={(tpl) => ({ title: tpl.name || tpl.id, subtitle: t('addonStudio.templates.fileCount', { count: tpl.files.length }), color: tpl.color ?? model.color })}
        onAdd={() => { onChange([...templates, newTemplate(templates)]); setSelected(templates.length); }}
        addLabel={t('addonStudio.templates.add')}
        errorIndexes={new Set(issues.filter((i) => i.index !== undefined).map((i) => i.index as number))}
      />

      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{template.name || template.id}</h3>
          <Button size="sm" variant="danger" title={t('common.delete')} onClick={() => {
            if (!confirm(t('common.confirmDelete', { name: template.name || template.id }))) {
              return;
            }
            onChange(templates.filter((_, i) => i !== index));
            setSelected(Math.max(0, index - 1));
          }}>
            <Trash2 size={12} />
          </Button>
        </div>

        <Heading title={t('addonStudio.templates.basics')} hint={`${t('addonStudio.templates.placeholdersHint')} ${t('studioProject.templates.syntaxHint')}`} />
        <TemplateBasics template={template} languageIds={languageIds} kindIds={kindIds} fieldError={fieldError} patch={patch} />

        <Heading
          title={t('addonStudio.templates.fields')}
          hint={t('addonStudio.templates.fieldsHint')}
          action={<AddButton label={t('common.add')} onClick={() => patch({ fields: [...template.fields, { id: `feld${template.fields.length + 1}`, label: t('addonStudio.templates.fieldDefault'), type: 'text' }] })} />}
        />
        {fieldError('fields') && <p className="mb-1.5 text-[11px] text-bad">{fieldError('fields')}</p>}
        <TemplateFields template={template} patch={patch} />

        <Heading
          title={t('addonStudio.templates.files')}
          action={<AddButton label={t('common.add')} onClick={() => {
            patch({ files: [...template.files, { path: `datei${template.files.length + 1}.txt`, content: '' }] });
            setFile(template.files.length);
          }} />}
        />
        <TemplateFiles template={template} fileIndex={fileIndex} fileError={fieldError('files')} onFile={setFile} patch={patch} />

        <Heading
          title={t('addonStudio.templates.setup')}
          hint={t('addonStudio.templates.setupHint')}
          action={<AddButton label={t('common.add')} onClick={() => patch({ setup: [...(template.setup ?? []), { label: '', command: '', args: [] }] })} />}
        />
        <TemplateSetup template={template} patch={patch} />
        <div className="h-6" />
      </div>

      <div className="w-[300px] shrink-0 overflow-y-auto border-l border-edge p-3">
        <TemplatePreview template={template} sampleValues={sampleValues} ctx={ctx} />
      </div>
    </div>
  );
}
