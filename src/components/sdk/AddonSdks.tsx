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
 * The SDKs an add-on works with, right in the add-on's own page: whether each
 * is on the machine, and a way to its download or its list. This is where SDKs
 * are found — the SDK dialog shows only what the installed add-ons need.
 */

import { useEffect } from 'react';
import { Download, Settings2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { detectInstalled, sdkTitle, useSdk } from '@/core/sdk';
import type { ExtensionRequirement } from '@/core/extensions/types';
import { Button } from '../ui';
import { Badge } from './parts';

const NONE: never[] = [];

function Row({ requirement }: { requirement: ExtensionRequirement; }) {
  const t = useT();
  const openDialog = useStore((s) => s.openDialog);
  const { name, color } = sdkTitle(requirement.sdk);
  const installed = useSdk((s) => s.installed[requirement.sdk] ?? NONE);
  const have = installed.length > 0;

  useEffect(() => { void detectInstalled(requirement.sdk).catch(() => {}); }, [requirement.sdk]);

  return (
    <div className="flex items-center gap-2.5 rounded-lumen-sm border border-edge px-2.5 py-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] text-fg">{name}</span>
          {requirement.version && <span className="font-mono text-[10.5px] text-subtle">≥ {requirement.version}</span>}
          {have
            ? <Badge tone="ok">{t('sdk.required.found', { version: installed[0].version })}</Badge>
            : <Badge tone="warn">{t('sdk.required.notFound')}</Badge>}
        </div>
        {requirement.reason && <div className="truncate text-[11px] text-subtle" title={requirement.reason}>{requirement.reason}</div>}
      </div>
      {have
        ? (
          <Button size="sm" variant="outline" onClick={() => openDialog('sdks', `${requirement.sdk}:installed`)}>
            <Settings2 size={12} /> {t('sdk.required.manage')}
          </Button>
        )
        : (
          <Button size="sm" variant="solid" onClick={() => openDialog('sdks', `${requirement.sdk}:download`)}>
            <Download size={12} /> {t('sdk.command.download')}
          </Button>
        )}
    </div>
  );
}

/** Nothing when the add-on names no SDK. */
export function AddonSdks({ requires }: { requires: ExtensionRequirement[] | undefined; }) {
  const t = useT();
  if (!requires?.length) {
    return null;
  }
  return (
    <section className="px-5 pb-3">
      <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('sdk.required.section')}</h4>
      <div className="flex flex-col gap-1.5">
        {requires.map((requirement) => <Row key={requirement.sdk} requirement={requirement} />)}
      </div>
    </section>
  );
}
