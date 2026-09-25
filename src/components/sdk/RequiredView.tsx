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
 * “Required”: the SDKs the installed add-ons ask for, and the basic setup
 * (Java, Node.js, Python, Gradle, Maven) — each with whether it is on the
 * machine yet, and a way to the download.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { CheckCircle2, Download, TriangleAlert } from 'lucide-react';
import { useT } from '@/i18n';
import { extensions } from '@/core/extensions/manager';
import { detectInstalled, essentialIds, requirementRows, sdkTitle, useSdk, type RequirementRow } from '@/core/sdk';
import { Button, Empty } from '../ui';
import { Badge, DistributionMark } from './parts';

function Row({ row, onOpen }: { row: RequirementRow; onOpen: (sdk: string, tab: 'installed' | 'download') => void; }) {
  const t = useT();
  const { name, color } = sdkTitle(row.sdk);
  const installed = useSdk((s) => s.installed[row.sdk] ?? []);
  const have = installed.length > 0;
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lumen border border-edge bg-surface p-3 pl-4">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <DistributionMark name={name} color={color} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-medium text-fg">{name}</span>
          {have
            ? <Badge tone="ok">{t('sdk.required.found', { version: installed[0].version })}</Badge>
            : <Badge tone="warn">{t('sdk.required.notFound')}</Badge>}
        </div>
        {row.needs.map((need) => (
          <div key={need.addon} className="truncate text-[11.5px] text-subtle" title={need.reason}>
            {t('sdk.required.neededBy', { addon: need.addon })}{need.version ? ` (≥ ${need.version})` : ''}{need.reason ? ` — ${need.reason}` : ''}
          </div>
        ))}
      </div>
      {have
        ? (
          <Button size="sm" variant="outline" onClick={() => onOpen(row.sdk, 'installed')}>
            <CheckCircle2 size={12} /> {t('sdk.required.manage')}
          </Button>
        )
        : (
          <Button size="sm" variant="solid" onClick={() => onOpen(row.sdk, 'download')}>
            <Download size={12} /> {t('sdk.command.download')}
          </Button>
        )}
    </div>
  );
}

export function RequiredView({ onOpen }: { onOpen: (sdk: string, tab: 'installed' | 'download') => void; }) {
  const t = useT();
  useSyncExternalStore(extensions.subscribe, extensions.getVersion);
  const asked = requirementRows();
  const askedIds = new Set(asked.map((row) => row.sdk));
  const essentials: RequirementRow[] = essentialIds().filter((id) => !askedIds.has(id)).map((sdk) => ({ sdk, needs: [] }));
  const key = [...asked, ...essentials].map((row) => row.sdk).join(',');

  useEffect(() => {
    for (const id of key.split(',').filter(Boolean)) {
      void detectInstalled(id).catch(() => {});
    }
  }, [key]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
          <TriangleAlert size={11} /> {t('sdk.required.title')}
        </h3>
        {asked.length === 0
          ? <Empty title={t('sdk.required.none')} hint={t('sdk.required.noneHint')} />
          : <div className="flex flex-col gap-2">{asked.map((row) => <Row key={row.sdk} row={row} onOpen={onOpen} />)}</div>}
      </section>
      <section>
        <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('sdk.required.essentials')}</h3>
        <div className="flex flex-col gap-2">{essentials.map((row) => <Row key={row.sdk} row={row} onOpen={onOpen} />)}</div>
      </section>
    </div>
  );
}
