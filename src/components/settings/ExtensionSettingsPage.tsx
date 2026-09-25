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
 * The *Settings* section of the add-ons dialog: one page per installed add-on.
 *
 * On the left the add-ons that bring settings, with how many of them
 * differ from their defaults; on the right the chosen one — its particulars,
 * its settings grouped by `section` into cards, a mark beside each changed
 * value that resets it, and a reset for the whole add-on. A search narrows the
 * list to the add-ons — and, within one, the settings — that match it.
 */

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Blocks, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useStore } from '@/state/store';
import { useLanguage, useT } from '@/i18n';
import { extensions as installedExtensions } from '@/core/extensions/manager';
import { localizeSetting } from '@/core/extensions/localize';
import type { ExtensionManifest, ExtensionSetting } from '@/core/extensions/types';
import { Button, Empty } from '../ui';
import { ExtensionSettingRow, settingChanged, settingDefault, settingVisible } from './ExtensionSettingRow';

type Manifest = Omit<ExtensionManifest, 'code'>;

/** Settings in their sections, in the order the sections first appear. */
function bySection(settings: ExtensionSetting[]): [string, ExtensionSetting[]][] {
  const groups = new Map<string, ExtensionSetting[]>();
  for (const setting of settings) {
    const key = setting.section ?? '';
    groups.set(key, [...(groups.get(key) ?? []), setting]);
  }
  return [...groups.entries()];
}

function ExtensionBadge({ manifest, size = 'md' }: { manifest: Manifest; size?: 'sm' | 'md'; }) {
  const box = size === 'sm' ? 'size-7 text-[10px]' : 'size-10 text-[12px]';
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lumen-sm border border-edge font-mono font-bold ${box}`}
      style={{ color: manifest.color, background: manifest.color ? `${manifest.color}1f` : undefined }}
    >
      {manifest.icon ?? <Blocks size={size === 'sm' ? 13 : 17} />}
    </span>
  );
}

function ExtensionNav({ manifests, selectedId, changedCount, onSelect }: {
  manifests: Manifest[];
  selectedId: string;
  changedCount(manifest: Manifest): number;
  onSelect(id: string): void;
}) {
  const t = useT();
  return (
    <nav className="flex w-[200px] shrink-0 flex-col gap-0.5" aria-label={t('extensions.settings')}>
      {manifests.map((manifest) => {
        const count = changedCount(manifest);
        const active = manifest.id === selectedId;
        return (
          <button
            key={manifest.id}
            type="button"
            onClick={() => onSelect(manifest.id)}
            className={[
              'lm-transition flex items-center gap-2 rounded-lumen-sm px-2 py-1.5 text-left',
              active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
            ].join(' ')}
          >
            <ExtensionBadge manifest={manifest} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px]">{manifest.name}</span>
              <span className="block truncate text-[10.5px] text-subtle">
                {t('settings.ext.count', { count: manifest.settings?.length ?? 0 })}
                {count > 0 && <span className="text-accent"> · {t('settings.ext.changed', { count })}</span>}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function ExtensionHeader({ manifest: selected, changed, onResetAll, onManage }: { manifest: Manifest; changed: number; onResetAll(): void; onManage(): void; }) {
  const t = useT();
  return (
    <header className="mb-3 flex items-start gap-3 rounded-lumen border border-edge bg-surface/60 p-3">
      <ExtensionBadge manifest={selected} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[14px] font-medium text-fg">{selected.name}</span>
          <span className="font-mono text-[11px] text-subtle">{selected.version}</span>
        </div>
        {selected.author && <div className="text-[11px] text-subtle">{selected.author}</div>}
        {selected.description && <p className="mt-1 text-[12px] leading-snug text-muted">{selected.description}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Button size="sm" variant="outline" disabled={!changed} onClick={onResetAll} title={t('settings.ext.resetAllHint')}>
          <RotateCcw size={12} /> {t('settings.ext.resetAll')}
        </Button>
        <Button size="sm" onClick={onManage}>
          <SlidersHorizontal size={12} /> {t('settings.ext.manage')}
        </Button>
      </div>
    </header>
  );
}

function SettingSections({ extensionId, settings }: { extensionId: string; settings: ExtensionSetting[]; }) {
  return (
    <div className="flex flex-col gap-3">
      {bySection(settings).map(([section, list]) => (
        <section key={section || '-'} className="rounded-lumen border border-edge py-1 pl-6 pr-3">
          {section && (
            <h4 className="-ml-3 mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{section}</h4>
          )}
          <div className="divide-y divide-edge/60">
            {list.map((setting) => (
              <ExtensionSettingRow key={setting.key} extensionId={extensionId} setting={setting} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Whether the add-on's name, or any of its settings' texts, contain the search text. */
function settingMatches(setting: ExtensionSetting, needle: string): boolean {
  return `${setting.section ?? ''} ${setting.label} ${setting.hint ?? ''} ${setting.key}`.toLowerCase().includes(needle);
}

function manifestMatches(manifest: Manifest, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return manifest.name.toLowerCase().includes(needle) || (manifest.settings ?? []).some((setting) => settingMatches(setting, needle));
}

export function ExtensionSettingsPage({ query = '', onBrowse, onManage }: { query?: string; onBrowse(): void; onManage(): void; }) {
  const t = useT();
  const language = useLanguage();
  const values = useStore((s) => s.extensionSettings);
  const setSetting = useStore((s) => s.setExtensionSetting);
  useSyncExternalStore(installedExtensions.subscribe, installedExtensions.getVersion);
  const needle = query.trim().toLowerCase();

  // An add-on that is switched off shows no settings, as if it were not installed.
  const registryVersion = useStore((s) => s.registryVersion);
  const withSettings = useMemo(
    () => installedExtensions.listActive()
      .map(({ manifest }) => manifest)
      .filter((manifest) => manifest.settings?.length)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [installedExtensions.getVersion(), registryVersion],
  );
  const shown = withSettings.filter((manifest) => manifestMatches(manifest, needle));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = shown.find((manifest) => manifest.id === selectedId) ?? shown[0];

  if (!withSettings.length) {
    return (
      <Empty
        icon={<Blocks size={22} />}
        title={t('settings.ext.none')}
        hint={t('settings.ext.noneHint')}
        action={<Button variant="outline" size="sm" onClick={onBrowse}>{t('settings.ext.browse')}</Button>}
      />
    );
  }
  if (!selected) {
    return <Empty title={t('settings.noResults', { query })} />;
  }

  const changedCount = (manifest: Manifest) =>
    (manifest.settings ?? []).filter((setting) => settingChanged(values[manifest.id], setting)).length;
  const settings = (selected.settings ?? []).map((setting) => localizeSetting(setting, language));
  // A search that names the add-on itself keeps all of its settings.
  const wholeAddon = !needle || selected.name.toLowerCase().includes(needle);
  const visible = settings
    .filter((setting) => settingVisible(setting, settings, values[selected.id]))
    .filter((setting) => wholeAddon || settingMatches(setting, needle));
  const changed = changedCount(selected);
  const resetAll = () => {
    for (const setting of selected.settings ?? []) {
      if (setting.type === 'secret') {
        continue;
      }
      setSetting(selected.id, setting.key, settingDefault(setting));
    }
  };

  return (
    <div className="flex min-h-[420px] gap-4">
      <ExtensionNav manifests={shown} selectedId={selected.id} changedCount={changedCount} onSelect={setSelectedId} />

      <div className="min-w-0 flex-1">
        <ExtensionHeader manifest={selected} changed={changed} onResetAll={resetAll} onManage={onManage} />

        <SettingSections extensionId={selected.id} settings={visible} />
      </div>
    </div>
  );
}
