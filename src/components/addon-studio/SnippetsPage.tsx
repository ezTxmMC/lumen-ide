/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * The Studio's “snippets” area: code fragments for any language, including
 * languages of other add-ons such as `java`. They show up in that language's
 * completion.
 */

import { useEffect, useMemo, useState } from 'react';
import { Scissors, Trash2 } from 'lucide-react';
import { t as translate, useT } from '@/i18n';
import { registry } from '@/core/registry';
import type { UserAddonModel, UserSnippet } from '@/core/user-addons/schema';
import type { ValidationIssue } from '@/core/user-addons/validate';
import { Button, Empty } from '../ui';
import { AreaField, Heading, ItemList, TextField, inputClass } from './fields';

export function newSnippet(model: UserAddonModel): UserSnippet {
  return {
    languageId: model.languages[0]?.id ?? 'java',
    label: `snippet${(model.snippets?.length ?? 0) + 1}`,
    detail: translate('studioProject.snippets.defaultDetail'),
    body: '${name}($0)',
  };
}

export function SnippetsPage({
  model, onChange, issues, focus,
}: {
  model: UserAddonModel;
  onChange: (snippets: UserSnippet[]) => void;
  issues: ValidationIssue[];
  focus?: { index: number; token: number; } | null;
}) {
  const t = useT();
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    if (focus) {
      setSelected(focus.index);
    }
  }, [focus]);

  const snippets = model.snippets;
  const index = Math.min(selected, snippets.length - 1);
  const snippet = snippets[index];
  const languages = useMemo(() => {
    const out = new Map<string, string>();
    for (const language of model.languages) {
      out.set(language.id, language.name || language.id);
    }
    for (const language of registry.languages()) {
      out.set(language.id, language.name);
    }
    return [...out.entries()];
  }, [model.languages]);

  if (!snippet) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Empty icon={<Scissors size={28} strokeWidth={1.4} />} title={t('studioProject.snippets.empty')} hint={t('studioProject.snippets.emptyHint')} />
        <Button variant="solid" onClick={() => { onChange([newSnippet(model)]); setSelected(0); }}>{t('studioProject.snippets.add')}</Button>
      </div>
    );
  }

  const patch = (next: Partial<UserSnippet>) => onChange(snippets.map((entry, i) => (i === index ? { ...entry, ...next } : entry)));
  const errors = issues.filter((i) => i.index === index).map((i) => i.message);

  return (
    <div className="flex h-full min-h-0">
      <ItemList
        items={snippets}
        selected={index}
        onSelect={setSelected}
        render={(entry) => ({ title: entry.label || '—', subtitle: entry.languageId, color: model.color })}
        onAdd={() => { onChange([...snippets, newSnippet(model)]); setSelected(snippets.length); }}
        addLabel={t('studioProject.snippets.add')}
        errorIndexes={new Set(issues.filter((i) => i.index !== undefined).map((i) => i.index as number))}
      />
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate font-mono text-[14px] font-medium">{snippet.label || '—'}</h3>
          <Button size="sm" variant="danger" title={t('common.delete')} onClick={() => {
            onChange(snippets.filter((_, i) => i !== index));
            setSelected(Math.max(0, index - 1));
          }}>
            <Trash2 size={12} />
          </Button>
        </div>
        <Heading title={t('studioProject.snippets.title')} hint={t('studioProject.snippets.hint')} />
        {errors.length > 0 && <p className="mb-2 text-[11px] text-bad">{errors.join(' · ')}</p>}
        <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
          <label className="min-w-0">
            <span className="mb-1 block text-[11.5px] text-muted">{t('studioProject.snippets.language')}</span>
            <select value={snippet.languageId} onChange={(e) => patch({ languageId: e.target.value })} className={`${inputClass} border-edge`}>
              {languages.map(([id, name]) => <option key={id} value={id}>{name} ({id})</option>)}
            </select>
          </label>
          <TextField mono label={t('studioProject.snippets.label')} value={snippet.label} onChange={(label) => patch({ label })} />
          <TextField label={t('studioProject.snippets.detail')} value={snippet.detail} onChange={(detail) => patch({ detail: detail || undefined })} />
          <AreaField className="col-span-3" rows={12} label={t('studioProject.snippets.body')} hint={t('studioProject.snippets.bodyHint')} value={snippet.body} onChange={(body) => patch({ body })} />
        </div>
      </div>
    </div>
  );
}
