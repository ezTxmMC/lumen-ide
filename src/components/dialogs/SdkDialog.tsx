/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Coffee, Download, HardDrive, RefreshCw, Wrench } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { TOOLS, detectInstalled, isFinished, loadCatalog, requirementRows, toolInfo, useSdk } from '@/core/sdk';
import { extensions } from '@/core/extensions/manager';
import { Button } from '../ui';
import { InstalledList } from '../sdk/InstalledList';
import { DownloadCatalog } from '../sdk/DownloadCatalog';
import { ToolDownloads, ToolInstalled } from '../sdk/ToolViews';
import { DialogShell, type DialogSection } from './DialogShell';

type Tab = 'installed' | 'download';

const asTab = (value: string | null | undefined): Tab => (value === 'download' ? 'download' : 'installed');

const PROVIDERS = ['java', ...TOOLS.map((tool) => tool.id)];

/** `openDialog('sdks', …)`: `installed` / `download` (Java), `node`, or `node:download`. */
function parseRequest(value: string | null | undefined): { section: string; tab: Tab; } {
  const [first, second] = (value ?? '').split(':');
  if (PROVIDERS.includes(first)) {
    return { section: first, tab: asTab(second) };
  }
  return { section: 'java', tab: asTab(first) };
}

/** SDKs & JDKs: one entry per SDK on the left, and Installed / Download tabs for the chosen one. */
export function SdkDialog() {
  const t = useT();
  const open = useStore((s) => s.dialog === 'sdks');
  const requested = useStore((s) => s.dialogSection);
  const [section, setSection] = useState('java');
  const [tab, setTab] = useState<Tab>('installed');
  const [search, setSearch] = useState('');
  const installed = useSdk((s) => s.installed);
  const running = useSdk((s) => Object.values(s.jobs).filter((job) => !isFinished(job.progress.phase)).length);
  const busy = useSdk((s) => (tab === 'installed' ? s.detecting : s.catalogLoading));
  const tool = toolInfo(section);
  const defaults = useSdk((s) => s.settings.defaults);
  useSyncExternalStore(extensions.subscribe, extensions.getVersion);
  // Only the SDKs that matter here: Java, those the installed add-ons ask for, and any that already has something
  // installed by Lumen or chosen as default — not all of them.
  const wanted = new Set(['java', ...requirementRows().map((row) => row.sdk)]);
  const shown = TOOLS.filter((entry) => wanted.has(entry.id) || defaults[entry.id] || installed[entry.id]?.some((sdk) => sdk.managed) || entry.id === section);

  // Opening the dialog (or a command that names a section) picks where to start — changing the SDK afterwards keeps the tab.
  useEffect(() => {
    if (!open) {
      return;
    }
    const wanted = parseRequest(requested);
    setSection(wanted.section);
    setTab(wanted.tab);
    setSearch('');
  }, [open, requested]);

  useEffect(() => {
    if (open) {
      void detectInstalled(section);
    }
  }, [open, section]);

  const refresh = () => {
    if (tab === 'installed') {
      void detectInstalled(section);
      return;
    }
    void loadCatalog(section, true);
  };

  const sections: DialogSection[] = [
    { id: 'java', label: 'Java', icon: Coffee, badge: installed.java?.length ? String(installed.java.length) : undefined },
    ...shown.map((entry) => ({ id: entry.id, label: entry.name, icon: Wrench, badge: installed[entry.id]?.length ? String(installed[entry.id].length) : undefined })),
  ];

  return (
    <DialogShell
      id="sdks"
      title={t('sdk.title')}
      icon={Coffee}
      wide
      sections={sections}
      section={section}
      onSection={(id) => { setSection(id); setSearch(''); }}
      search={search}
      onSearch={setSearch}
      searchPlaceholder={t('sdk.searchPlaceholder')}
      headerExtra={(
        <Button size="sm" title={tab === 'installed' ? t('sdk.command.detect') : t('sdk.refresh')} onClick={refresh} disabled={busy}>
          <RefreshCw size={12} className={busy ? 'lm-anim-spin' : ''} />
          <span>{tab === 'installed' ? t('sdk.detect') : t('sdk.refresh')}</span>
        </Button>
      )}
    >
      <TabBar tab={tab} onTab={setTab} installedCount={installed[section]?.length ?? 0} running={running} />
      {tab === 'installed' && !tool && <InstalledList search={search} onDownload={() => setTab('download')} />}
      {tab === 'installed' && tool && <ToolInstalled tool={tool} search={search} onDownload={() => setTab('download')} />}
      {tab === 'download' && !tool && <DownloadCatalog search={search} />}
      {tab === 'download' && tool && <ToolDownloads tool={tool} search={search} />}
    </DialogShell>
  );
}

/** Installed and Download, for the SDK chosen on the left. */
function TabBar({ tab, onTab, installedCount, running }: { tab: Tab; onTab: (tab: Tab) => void; installedCount: number; running: number; }) {
  const t = useT();
  const tabs: { id: Tab; label: string; icon: typeof HardDrive; badge?: string; }[] = [
    { id: 'installed', label: t('sdk.section.installed'), icon: HardDrive, badge: installedCount ? String(installedCount) : undefined },
    { id: 'download', label: t('sdk.section.download'), icon: Download, badge: running ? `↓${running}` : undefined },
  ];
  return (
    <div role="tablist" className="flex gap-1 border-b border-edge px-4 pt-2">
      {tabs.map(({ id, label, icon: Icon, badge }) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          onClick={() => onTab(id)}
          className={[
            'lm-transition -mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[12.5px]',
            tab === id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
          ].join(' ')}
        >
          <Icon size={13} /> {label}
          {badge && <span className="rounded-full bg-active px-1.5 font-mono text-[10px] text-subtle">{badge}</span>}
        </button>
      ))}
    </div>
  );
}
