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
 * The rows of the settings dialog, one builder per section. Each returns rows
 * tagged with their section and a search text; the dialog filters them.
 */

import { type ReactNode } from 'react';
import { Keyboard, Palette, type Settings } from 'lucide-react';
import { useStore } from '@/state/store';
import { LANGUAGES, useT } from '@/i18n';
import { Button, Select, Toggle } from '../../ui';
import type { lsp } from '@/core/lsp/manager';
import type { terminals } from '@/lib/project/terminals';

export type SectionId = 'general' | 'editor' | 'formatting' | 'font' | 'lsp' | 'terminal' | 'sdks' | 'window' | 'updates' | 'about';

export interface Row {
  section: SectionId;
  /** Search text: the label and the hint. */
  text: string;
  node: ReactNode;
}

export interface AppInfo {
  version: string;
  platform: string;
  windowSystem: 'wayland' | 'x11' | 'other';
  waylandSession: boolean;
  electron: string;
  chrome: string;
}

export type State = ReturnType<typeof useStore.getState>;

type Effects = State['effects'];

/** Everything the row builders read, gathered by the dialog. */
export interface SettingsData {
  t: ReturnType<typeof useT>;
  effects: Effects;
  setEffects: State['setEffects'];
  openDialog: State['openDialog'];
  showPanel: State['showPanel'];
  language: State['language'];
  setLanguage: State['setLanguage'];
  navSide: State['layout']['navSide'];
  workspace: State['workspace'];
  system: string;
  stats: { addons: number; active: number; languages: number; lspLanguages: number; themes: number; kinds: number; templates: number; };
  servers: ReturnType<typeof lsp.list>;
  shells: typeof terminals.shells;
  externals: typeof terminals.externals;
  info: AppInfo | null;
  initialWindowSystem: Effects['windowSystem'];
}

export const FONT_STACKS = [
  { value: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace", label: 'JetBrains Mono' },
  { value: "'Fira Code', ui-monospace, monospace", label: 'Fira Code' },
  { value: "'Cascadia Code', ui-monospace, monospace", label: 'Cascadia Code' },
  { value: "'Iosevka', ui-monospace, monospace", label: 'Iosevka' },
  { value: "'Source Code Pro', ui-monospace, monospace", label: 'Source Code Pro' },
  { value: "'SF Mono', ui-monospace, monospace", label: 'SF Mono' },
  { value: 'ui-monospace, monospace', label: 'settings.font.systemMono' },
];

export const toggle = (d: SettingsData, sectionId: SectionId, key: keyof Effects, label: string, hint?: string, disabled?: boolean): Row => ({
  section: sectionId,
  text: `${label} ${hint ?? ''}`,
  node: (
    <Toggle
      label={label}
      hint={hint}
      checked={Boolean(d.effects[key])}
      disabled={disabled}
      onChange={(v) => d.setEffects({ [key]: v } as Partial<Effects>)}
    />
  ),
});

export function generalRows(d: SettingsData): Row[] {
  const { t, effects, setEffects, openDialog, language, setLanguage, system, stats } = d;
  return [
    {
      section: 'general',
      text: `${t('settings.general.language')} ${t('settings.general.languageHint')} language sprache`,
      node: (
        <div className="py-2">
          <Select
            label={t('settings.general.language')}
            value={language}
            options={[
              { value: 'system', label: t('settings.general.system', { language: system }) },
              ...LANGUAGES.map((l) => ({ value: l.id, label: l.id === 'en' ? l.name : `${l.name} · ${l.english}` })),
            ]}
            onChange={(v) => setLanguage(v)}
          />
          <p className="text-[11.5px] leading-snug text-subtle">{t('settings.general.languageHint')}</p>
        </div>
      ),
    },
    toggle(d, 'general', 'reopenLastProject', t('settings.general.reopenLastProject'), t('settings.general.reopenLastProjectHint')),
    {
      section: 'general',
      text: `${t('projectSwitcher.setting.label')} ${t('projectSwitcher.setting.hint')}`,
      node: (
        <div className="py-2">
          <Select
            label={t('projectSwitcher.setting.label')}
            value={effects.openProjectsIn}
            options={[
              { value: 'ask', label: t('projectSwitcher.setting.ask') },
              { value: 'this', label: t('projectSwitcher.setting.this') },
              { value: 'new', label: t('projectSwitcher.setting.new') },
            ]}
            onChange={(v) => setEffects({ openProjectsIn: v })}
          />
          <p className="text-[11.5px] leading-snug text-subtle">{t('projectSwitcher.setting.hint')}</p>
        </div>
      ),
    },
    toggle(d, 'general', 'gradleTasksOnOpen', t('settings.general.gradleTasksOnOpen'), t('settings.general.gradleTasksOnOpenHint')),
    toggle(d, 'general', 'securityScan', t('settings.general.securityScan'), t('settings.general.securityScanHint')),
    toggle(d, 'general', 'restoreOpenFiles', t('settings.general.restoreOpenFiles'), t('settings.general.restoreOpenFilesHint')),
    {
      section: 'general',
      text: t('settings.general.density'),
      node: (
        <Select
          label={t('settings.general.density')}
          value={effects.density}
          options={[
            { value: 'comfortable', label: t('settings.general.comfortable') },
            { value: 'compact', label: t('settings.general.compact') },
          ]}
          onChange={(v) => setEffects({ density: v })}
        />
      ),
    },
    {
      section: 'general',
      text: `${t('settings.general.keybindings')} ${t('settings.general.keybindingsHint')}`,
      node: (
        <LinkRow
          icon={Keyboard}
          label={t('settings.general.keybindings')}
          hint={t('settings.general.keybindingsHint')}
          action={t('settings.general.openKeybindings')}
          onClick={() => openDialog('keybindings')}
        />
      ),
    },
    {
      section: 'general',
      text: t('settings.general.themes'),
      node: (
        <LinkRow
          icon={Palette}
          label={t('settings.general.themes')}
          action={t('settings.general.openThemes')}
          onClick={() => openDialog('themes')}
        />
      ),
    },
    {
      section: 'general',
      text: t('settings.general.projectStats', { kinds: stats.kinds, templates: stats.templates }),
      node: <p className="py-2 text-[11.5px] leading-relaxed text-subtle">{t('settings.general.projectStats', { kinds: stats.kinds, templates: stats.templates })}</p>,
    },
  ];
}

export function LinkRow({ icon: Icon, label, hint, action, onClick }: {
  icon: typeof Settings;
  label: string;
  hint?: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lumen-sm bg-active text-accent">
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-subtle">{hint}</div>}
      </div>
      <Button variant="outline" size="sm" onClick={onClick}>{action}</Button>
    </div>
  );
}
