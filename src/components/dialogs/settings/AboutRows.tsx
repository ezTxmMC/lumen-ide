/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useT } from '@/i18n';
import { checkForUpdates, downloadUpdate, installUpdate, useUpdater } from '@/features/updater';
import { Button } from '../../ui';
import { type Row, type SettingsData, toggle } from './SettingsRows';

export function updateRows(d: SettingsData): Row[] {
  const { t } = d;
  return [
    {
      section: 'updates',
      text: `${t('updater.title')} update version`,
      node: <UpdateStatus />,
    },
    toggle(d, 'updates', 'autoUpdate', t('updater.auto'), t('updater.autoHint')),
  ];
}

export function aboutRows(d: SettingsData): Row[] {
  const { t, stats, workspace, info } = d;
  return [
    {
      section: 'about',
      text: 'about version',
      node: (
        <div className="py-2">
          <dl className="space-y-1 text-[12px]">
            {[
              [t('settings.about.addons'), t('settings.about.activeOf', { active: stats.active, total: stats.addons })],
              [t('settings.about.languages'), String(stats.languages)],
              [t('settings.about.themes'), String(stats.themes)],
              [t('settings.about.folder'), workspace ?? '—'],
            ].map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-subtle">{key}</dt>
                <dd className="truncate text-right text-muted" title={value}>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-subtle">{t('settings.about.version', { version: info?.version ?? '' })}</p>
          {info && <p className="text-[11px] text-subtle">{t('settings.about.runtime', { electron: info.electron, chrome: info.chrome })}</p>}
        </div>
      ),
    },
  ];
}

/** State of the updater, with whatever action comes next. */
function UpdateStatus() {
  const t = useT();
  const update = useUpdater();
  const [checking, setChecking] = useState(false);
  const version = update.version ?? update.current;
  const percent = update.total ? Math.round(((update.received ?? 0) / update.total) * 100) : 0;

  const check = () => {
    setChecking(true);
    void checkForUpdates().finally(() => setChecking(false));
  };

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lumen-sm bg-active text-accent">
        <RefreshCw size={15} className={update.status === 'checking' || update.status === 'downloading' ? 'lm-anim-spin' : ''} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-fg">{updateStatusText(t, update.status, update.installable, { version, percent, error: update.error ?? '' })}</div>
        {update.status === 'downloading' && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-active">
            <div className="lm-transition h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
        )}
        {update.notes && <div className="mt-0.5 text-[11.5px] leading-snug whitespace-pre-line text-subtle">{update.notes}</div>}
      </div>
      <UpdateAction status={update.status} installable={update.installable} busy={checking} onCheck={check} />
    </div>
  );
}

function updateStatusText(t: ReturnType<typeof useT>, status: string, installable: boolean, params: { version: string; percent: number; error: string; }) {
  if (status === 'available' && !installable) {
    return t('updater.status.availableManual', params);
  }
  return t(`updater.status.${status}`, params);
}

function UpdateAction({ status, installable, busy, onCheck }: {
  status: string;
  installable: boolean;
  busy: boolean;
  onCheck: () => void;
}) {
  const t = useT();
  if (status === 'ready') {
    return <Button variant="solid" size="sm" onClick={() => void installUpdate()}>{t('updater.action.install')}</Button>;
  }
  if (status === 'available' && installable) {
    return <Button variant="solid" size="sm" onClick={() => void downloadUpdate()}><Download size={12} /> {t('updater.action.download')}</Button>;
  }
  if (status === 'available') {
    return <Button variant="outline" size="sm" onClick={() => void window.lumen.updater.openDownload()}>{t('updater.action.openDownload')}</Button>;
  }
  return (
    <Button variant="outline" size="sm" disabled={busy || status === 'checking' || status === 'downloading'} onClick={onCheck}>
      {t('updater.action.check')}
    </Button>
  );
}
