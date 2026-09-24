/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The Studio's “general”, “themes” and “JSON” areas. */

import { useEffect, useState } from 'react';
import { AlertTriangle, CircleAlert, Link2, Package, Palette, Trash2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import type { Theme } from '@/core/types';
import {
  normalizeModel, USER_ADDON_PREFIX, type UserAddonCategory, type UserAddonModel, type UserThemeEntry,
} from '@/core/user-addons/schema';
import { validateAddon, type StudioSection, type ValidationIssue } from '@/core/user-addons/validate';
import { Button, Empty } from '../ui';
import { AreaField, ColorField, Heading, TextField, inputClass } from './fields';

const CATEGORIES: UserAddonCategory[] = ['tool', 'language', 'theme'];

export function GeneralPage({
  model, onChange, issues, onJump,
}: {
  model: UserAddonModel;
  onChange: (patch: Partial<UserAddonModel>) => void;
  issues: ValidationIssue[];
  onJump: (issue: ValidationIssue) => void;
}) {
  const t = useT();
  const fieldError = (field: string) => issues.find((i) => i.section === 'general' && i.field === field)?.message ?? null;
  const stats: [string, number][] = [
    ['languages', model.languages.length],
    ['commands', model.commands.length],
    ['events', model.events.length],
    ['templates', model.templates.length],
    ['themes', model.themes.length],
  ];

  return (
    <div className="mx-auto max-w-[760px] px-5 py-4">
      <div className="mb-4 flex items-center gap-3">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-lumen bg-active font-mono text-[16px] font-bold"
          style={{ color: model.color || 'var(--c-accent)' }}
        >
          {model.icon || model.name.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-medium">{model.name || t('common.untitled')}</div>
          <div className="font-mono text-[11.5px] text-subtle">{model.id} · v{model.version}</div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-5 gap-2">
        {stats.map(([key, count]) => (
          <div key={key} className="rounded-lumen-sm border border-edge px-2.5 py-2">
            <div className="text-[18px] font-medium tabular-nums">{count}</div>
            <div className="truncate text-[11px] text-subtle">{t(`addonStudio.nav.${key}`)}</div>
          </div>
        ))}
      </div>

      <Heading title={t('addonStudio.general.metadata')} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <TextField label={t('common.name')} value={model.name} error={fieldError('name')} onChange={(name) => onChange({ name })} />
        <TextField mono label={t('addonStudio.general.id')} value={model.id} error={fieldError('id')} hint={t('addonStudio.general.idHint', { prefix: USER_ADDON_PREFIX })} onChange={(id) => onChange({ id })} />
        <TextField mono label={t('common.version')} value={model.version} error={fieldError('version')} onChange={(version) => onChange({ version })} />
        <TextField label={t('common.author')} value={model.author} onChange={(author) => onChange({ author })} />
        <TextField label={t('addonStudio.general.icon')} value={model.icon} hint={t('addonStudio.general.iconHint')} onChange={(icon) => onChange({ icon })} />
        <ColorField label={t('addonStudio.general.color')} value={model.color} onChange={(color) => onChange({ color })} />
        <label className="min-w-0">
          <span className="mb-1 block text-[11.5px] text-muted">{t('addonStudio.general.category')}</span>
          <select value={model.category ?? 'tool'} onChange={(e) => onChange({ category: e.target.value as UserAddonCategory })} className={`${inputClass} border-edge`}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`addonStudio.dialog.nav.${c}`)}</option>)}
          </select>
        </label>
        <AreaField className="col-span-2" rows={3} label={t('common.description')} value={model.description} onChange={(description) => onChange({ description })} />
      </div>

      <Heading title={t('addonStudio.general.problems', { count: issues.length })} />
      {issues.length === 0 && <p className="text-[12px] text-ok">{t('addonStudio.general.noProblems')}</p>}
      {issues.map((issue, i) => (
        <button
          key={i}
          onClick={() => onJump(issue)}
          className="lm-transition mb-1 flex w-full items-start gap-2 rounded-lumen-sm border border-edge px-2.5 py-1.5 text-left text-[12px] hover:bg-hover"
        >
          {issue.warning
            ? <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />
            : <CircleAlert size={13} className="mt-0.5 shrink-0 text-bad" />}
          <span className="min-w-0 flex-1">
            <span className="mr-1.5 text-subtle">{t(`addonStudio.nav.${issue.section}`)}</span>
            {issue.message}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Swatches({ theme }: { theme: Theme; }) {
  return (
    <span className="flex shrink-0 overflow-hidden rounded-[4px] border border-edge">
      {[theme.ui.bg, theme.ui.bgElevated, theme.ui.accent, theme.ui.text].map((color, i) => (
        <span key={i} className="block h-6 w-4" style={{ background: color }} />
      ))}
    </span>
  );
}

export function ThemesPage({
  themes, onChange,
}: {
  themes: UserThemeEntry[];
  onChange: (themes: UserThemeEntry[]) => void;
}) {
  const t = useT();
  const customThemes = useStore((s) => s.customThemes);
  const setTheme = useStore((s) => s.setTheme);
  const [pick, setPick] = useState('');

  const resolve = (entry: UserThemeEntry) => ('theme' in entry ? entry.theme : customThemes.find((th) => th.id === entry.ref));
  const linked = new Set(themes.map((entry) => ('ref' in entry ? entry.ref : entry.theme.id)));
  const available = customThemes.filter((th) => !linked.has(th.id));

  return (
    <div className="mx-auto max-w-[760px] px-5 py-4">
      <Heading title={t('addonStudio.themes.title')} hint={t('addonStudio.themes.hint')} />
      <div className="mb-3 flex items-center gap-2">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${inputClass} max-w-[280px] border-edge`}>
          <option value="">{t('addonStudio.themes.choose')}</option>
          {available.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={!pick} onClick={() => { onChange([...themes, { ref: pick }]); setPick(''); }}>
          <Link2 size={12} /> {t('addonStudio.themes.link')}
        </Button>
        <Button size="sm" variant="outline" disabled={!pick} onClick={() => {
          const theme = customThemes.find((th) => th.id === pick);
          if (!theme) {
            return;
          }
          onChange([...themes, { theme: structuredClone(theme) }]);
          setPick('');
        }}>
          <Package size={12} /> {t('addonStudio.themes.embed')}
        </Button>
      </div>
      {customThemes.length === 0 && <p className="mb-3 text-[11.5px] text-subtle">{t('addonStudio.themes.noCustom')}</p>}

      {themes.length === 0 && <Empty icon={<Palette size={26} strokeWidth={1.4} />} title={t('addonStudio.themes.empty')} />}
      {themes.map((entry, i) => {
        const theme = resolve(entry);
        const isRef = 'ref' in entry;
        return (
          <div key={i} className="mb-1.5 flex items-center gap-3 rounded-lumen-sm border border-edge px-2.5 py-2">
            {theme && <Swatches theme={theme} />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] text-fg">{theme?.name ?? (isRef ? entry.ref : '')}</div>
              <div className="text-[11px] text-subtle">
                {isRef ? t('addonStudio.themes.linked') : t('addonStudio.themes.embedded')}
                {theme ? ` · ${t(theme.type === 'dark' ? 'common.dark' : 'common.light')}` : ` · ${t('addonStudio.themes.missing')}`}
              </div>
            </div>
            {theme && (
              <Button size="sm" onClick={() => setTheme(theme.id)} title={t('addonStudio.themes.applyHint')}>
                {t('common.apply')}
              </Button>
            )}
            {isRef && theme && (
              <Button size="sm" onClick={() => onChange(themes.map((e, j) => (j === i ? { theme: structuredClone(theme) } : e)))}>
                <Package size={12} /> {t('addonStudio.themes.embed')}
              </Button>
            )}
            <Button size="sm" variant="danger" title={t('common.remove')} onClick={() => onChange(themes.filter((_, j) => j !== i))}>
              <Trash2 size={12} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function JsonPage({ model, onReplace }: { model: UserAddonModel; onReplace: (model: UserAddonModel) => void; }) {
  const t = useT();
  const serialized = JSON.stringify(model, null, 2);
  const [text, setText] = useState(serialized);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setText(serialized);
    }
  }, [serialized, dirty]);

  let parseError: string | null = null;
  let parsed: UserAddonModel | null = null;
  try {
    parsed = normalizeModel(JSON.parse(text));
  } catch (err) {
    parseError = (err as Error).message;
  }
  const issues = parsed ? validateAddon(parsed).filter((i) => !i.warning) : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex shrink-0 items-center gap-2">
        <p className="min-w-0 flex-1 text-[11.5px] text-subtle">{t('addonStudio.json.hint')}</p>
        <Button size="sm" variant="outline" disabled={!dirty} onClick={() => { setText(serialized); setDirty(false); }}>
          {t('common.reset')}
        </Button>
        <Button size="sm" variant="solid" disabled={!dirty || !parsed} onClick={() => {
          if (!parsed) {
            return;
          }
          onReplace(parsed);
          setDirty(false);
        }}>
          {t('common.apply')}
        </Button>
      </div>
      <textarea
        value={text}
        spellCheck={false}
        onChange={(e) => { setText(e.target.value); setDirty(true); }}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') {
            return;
          }
          e.preventDefault();
          const el = e.currentTarget;
          const start = el.selectionStart;
          setText(`${el.value.slice(0, start)}  ${el.value.slice(el.selectionEnd)}`);
          setDirty(true);
          requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
        }}
        className={`${inputClass} min-h-0 flex-1 resize-none font-mono text-[12px] leading-relaxed ${parseError ? 'border-bad' : 'border-edge'}`}
      />
      <div className="shrink-0 text-[11.5px]">
        {parseError && <span className="text-bad">{t('addonStudio.json.parseError', { message: parseError })}</span>}
        {!parseError && issues.length > 0 && <span className="text-warn">{issues.slice(0, 3).map((i) => i.message).join(' · ')}</span>}
        {!parseError && issues.length === 0 && <span className="text-ok">{t('addonStudio.json.valid')}</span>}
      </div>
    </div>
  );
}

export const SECTION_ORDER: StudioSection[] = ['general', 'languages', 'commands', 'events', 'templates', 'themes', 'json'];
