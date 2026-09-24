/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  AlignLeft, AppWindow, Blocks, Code2, Coffee, Info, RefreshCw, Settings, SlidersHorizontal, TerminalSquare, Type, Zap,
} from 'lucide-react';
import { useStore } from '@/state/store';
import { useDialogVisible } from '@/hooks/usePresence';
import { registry } from '@/core/registry';
import { lsp } from '@/core/lsp/manager';
import { terminals } from '@/lib/terminals';
import { LANGUAGES, systemLanguage, useT } from '@/i18n';
import { extensions as installedExtensions } from '@/core/extensions/manager';
import { formatRows } from '../settings/format-rows';
import { ExtensionSettingsPage } from '../settings/ExtensionSettingsPage';
import { Empty } from '../ui';
import { DialogShell, type DialogSection } from './DialogShell';
import {
  aboutRows, editorRows, extensionRows, fontRows, generalRows, lspRows, sdkRows, terminalRows, updateRows, windowRows,
  type AppInfo, type Row, type SectionId, type SettingsData,
} from './SettingsRows';

const SECTIONS: { id: SectionId; icon: typeof Settings; }[] = [
  { id: 'general', icon: SlidersHorizontal },
  { id: 'editor', icon: Code2 },
  { id: 'formatting', icon: AlignLeft },
  { id: 'font', icon: Type },
  { id: 'lsp', icon: Zap },
  { id: 'terminal', icon: TerminalSquare },
  { id: 'sdks', icon: Coffee },
  { id: 'extensions', icon: Blocks },
  { id: 'window', icon: AppWindow },
  { id: 'updates', icon: RefreshCw },
  { id: 'about', icon: Info },
];

/** Everything the row builders read, from the store, the registry and the language servers. */
function useSettingsData(info: AppInfo | null, initialWindowSystem: SettingsData['initialWindowSystem']): SettingsData {
  const t = useT();
  const effects = useStore((s) => s.effects);
  const setEffects = useStore((s) => s.setEffects);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const openDialog = useStore((s) => s.openDialog);
  const showPanel = useStore((s) => s.showPanel);
  const workspace = useStore((s) => s.workspace);
  const registryVersion = useStore((s) => s.registryVersion);
  const lspVersion = useStore((s) => s.lspVersion);
  const extensionSettings = useStore((s) => s.extensionSettings);
  const navSide = useStore((s) => s.layout.navSide);
  useSyncExternalStore(terminals.subscribe.bind(terminals), terminals.getVersion);
  useSyncExternalStore(installedExtensions.subscribe, installedExtensions.getVersion);

  const servers = useMemo(() => lsp.list(), [lspVersion]);
  const stats = useMemo(() => ({
    addons: registry.all().length,
    active: registry.activeIds().length,
    languages: registry.languages().length,
    lspLanguages: registry.languages().filter((l) => l.lsp?.length).length,
    themes: registry.themes().length,
    kinds: registry.projectKinds().length,
    templates: registry.projectTemplates().length,
  }), [registryVersion]);

  return {
    t, effects, setEffects, openDialog, showPanel, language, setLanguage, navSide, extensionSettings, workspace,
    system: LANGUAGES.find((l) => l.id === systemLanguage())?.name ?? 'English',
    stats, servers, shells: terminals.shells, externals: terminals.externals, info, initialWindowSystem,
  };
}

export function SettingsDialog() {
  const t = useT();
  const open = useDialogVisible('settings');
  const requested = useStore((s) => s.dialogSection);

  const [section, setSection] = useState<SectionId>('general');
  const [query, setQuery] = useState('');
  const [formatLanguage, setFormatLanguage] = useState('typescript');
  const formatSettings = useStore((s) => s.formatSettings);
  const setFormat = useStore((s) => s.setFormat);
  const resetFormat = useStore((s) => s.resetFormat);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [initialWindowSystem, setInitialWindowSystem] = useState(useStore.getState().effects.windowSystem);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    if (requested && SECTIONS.some((s) => s.id === requested)) {
      setSection(requested as SectionId);
    }
    void window.lumen.app.info().then((value) => setInfo(value as AppInfo)).catch(() => {});
    setInitialWindowSystem(useStore.getState().effects.windowSystem);
  }, [open, requested]);

  const data = useSettingsData(info, initialWindowSystem);

  if (!open) {
    return null;
  }

  const rows: Row[] = [
    ...formatRows({
      t,
      languages: registry.languages().map((l) => ({ id: l.id, name: l.name, indentUnit: l.indentUnit })),
      languageId: formatLanguage,
      onLanguage: setFormatLanguage,
      settings: formatSettings,
      onChange: (patch) => setFormat(formatLanguage, patch),
      onReset: () => resetFormat(formatLanguage),
    }),
    ...generalRows(data),
    ...editorRows(data),
    ...fontRows(data),
    ...lspRows(data),
    ...terminalRows(data),
    ...sdkRows(data),
    ...windowRows(data),
    ...updateRows(data),
    ...extensionRows(data),
    ...aboutRows(data),
  ];

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? rows.filter((row) => row.text.toLowerCase().includes(needle))
    : rows.filter((row) => row.section === section);

  const sections: DialogSection[] = SECTIONS.map(({ id, icon }) => ({
    id,
    icon,
    label: t(`settings.sections.${id}`),
    badge: needle ? String(rows.filter((row) => row.section === id && row.text.toLowerCase().includes(needle)).length || '') : undefined,
  }));

  return (
    <DialogShell
      id="settings"
      title={t('shell.dialog.settings')}
      icon={Settings}
      sections={sections}
      section={needle ? undefined : section}
      onSection={(id) => { setQuery(''); setSection(id as SectionId); }}
      search={query}
      onSearch={setQuery}
      searchPlaceholder={t('settings.searchPlaceholder')}
    >
      <div className={`mx-auto px-6 py-4 ${!needle && section === 'extensions' ? 'max-w-[900px]' : 'max-w-[680px]'}`}>
        {!needle && (
          <h3 className="mb-2 text-[16px] font-medium text-fg">{t(`settings.sections.${section}`)}</h3>
        )}
        {needle && visible.length === 0 && <Empty title={t('settings.noResults', { query })} />}
        {!needle && section === 'extensions' && <ExtensionSettingsPage />}
        {(needle || section !== 'extensions') && (
          <div className="divide-y divide-edge/60">
            {visible.map((row, index) => (
              row.node ? <div key={`${row.section}-${index}`}>{row.node}</div> : null
            ))}
          </div>
        )}
      </div>
    </DialogShell>
  );
}
