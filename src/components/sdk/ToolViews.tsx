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
 * The installed and download lists of the SDKs beside Java (Node.js, Go,
 * Gradle, Maven, Deno, Bun, Kotlin, Zig): the same two views for all of them,
 * driven by the provider state in `core/sdk`.
 */

import { useEffect, useMemo } from 'react';
import { CloudDownload, Download, FolderOpen, Loader2, Star, Trash2 } from 'lucide-react';
import { useT } from '@/i18n';
import {
  activeSdk, cancelInstall, installPackage, loadCatalog, removeInstalled, resolveSdk, setDefaultSdk, useSdk,
  type InstalledSdk, type SdkPackage, type ToolInfo,
} from '@/core/sdk';
import { Button, Empty } from '../ui';
import { Badge, DistributionMark, InstallProgressBar, formatBytes } from './parts';

const NONE_INSTALLED: InstalledSdk[] = [];
const NONE_PACKAGES: SdkPackage[] = [];

const matches = (text: string, needle: string) => !needle || needle.split(/\s+/).every((part) => text.toLowerCase().includes(part));

export function ToolInstalled({ tool, search, onDownload }: { tool: ToolInfo; search: string; onDownload: () => void; }) {
  const t = useT();
  const installed = useSdk((s) => s.installed[tool.id] ?? NONE_INSTALLED);
  const detecting = useSdk((s) => s.detecting);
  const defaultValue = useSdk((s) => s.settings.defaults[tool.id]);
  const defaultHome = resolveSdk(defaultValue, installed)?.home;
  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () => installed.filter((sdk) => matches(`${tool.name} ${sdk.version} ${sdk.home}`, needle)),
    [installed, needle, tool.name],
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <ToolHeader tool={tool} active={activeSdk(tool.id)?.home ?? null} />

      {detecting && installed.length === 0 && (
        <div className="lm-anim-fade flex items-center gap-2 px-1 text-[12px] text-muted">
          <Loader2 size={13} className="lm-anim-spin" /> {t('sdk.list.detecting')}
        </div>
      )}

      {!detecting && visible.length === 0 && (
        <>
          <Empty
            icon={<Download size={26} strokeWidth={1.4} />}
            title={needle ? t('common.nothingFound') : t('sdk.tools.empty', { name: tool.name })}
            hint={needle ? undefined : t('sdk.tools.emptyHint')}
          />
          {!needle && (
            <div className="flex justify-center">
              <Button variant="solid" onClick={onDownload}>{t('sdk.command.download')}</Button>
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((sdk, index) => (
          <div
            key={sdk.home}
            style={{ animationDelay: `calc(var(--duration) * ${Math.min(index, 12) * 0.12})` }}
            className="lm-anim-up lm-transition relative flex items-start gap-3 overflow-hidden rounded-lumen border border-edge bg-surface p-3 pl-4 hover:border-edge-strong"
          >
            <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tool.color }} />
            <DistributionMark name={tool.name} color={tool.color} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-medium text-fg">{tool.name}</span>
                <span className="font-mono text-[12px] text-muted">{sdk.version}</span>
                {sdk.home === defaultHome && <Badge tone="accent">{t('sdk.badge.default')}</Badge>}
                <Badge>{sdk.managed ? t('sdk.badge.lumen') : t('sdk.tools.system')}</Badge>
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-subtle" title={sdk.home}>{sdk.home}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant={sdk.home === defaultHome ? 'ghost' : 'outline'}
                onClick={() => void setDefaultSdk(tool.id, sdk.home === defaultHome ? null : sdk.home)}
              >
                <Star size={11} className={sdk.home === defaultHome ? 'fill-current text-accent' : ''} />
                <span className="hidden sm:inline">{sdk.home === defaultHome ? t('sdk.action.unsetDefault') : t('sdk.action.setDefault')}</span>
              </Button>
              <Button size="sm" title={t('sdk.action.reveal')} onClick={() => void window.lumen.shell.showItemInFolder(sdk.home)}>
                <FolderOpen size={12} />
              </Button>
              {sdk.managed && (
                <Button
                  size="sm"
                  variant="danger"
                  title={t('common.remove')}
                  onClick={() => { if (confirm(t('sdk.list.confirmRemove', { name: `${tool.name} ${sdk.version}` }))) {
                    void removeInstalled(sdk);
                  } }}
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolHeader({ tool, active }: { tool: ToolInfo; active: string | null; }) {
  const t = useT();
  return (
    <div className="lm-anim-fade flex items-center gap-3 rounded-lumen border border-edge bg-overlay/60 px-3 py-2.5">
      <DistributionMark name={tool.name} color={tool.color} size={28} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-fg">{tool.name} <span className="text-subtle">— {tool.purpose}</span></div>
        <div className="truncate text-[11px] text-subtle" title={active ?? undefined}>
          {t('sdk.tools.usedBy', { addon: tool.addon })}
          {active ? ` · ${t('sdk.active.title')}: ${active}` : ''}
        </div>
      </div>
    </div>
  );
}

export function ToolDownloads({ tool, search }: { tool: ToolInfo; search: string; }) {
  const t = useT();
  const catalog = useSdk((s) => s.catalogs[tool.id]);
  const loading = useSdk((s) => s.catalogLoading);
  const error = useSdk((s) => s.catalogError);
  const jobs = useSdk((s) => s.jobs);
  const installed = useSdk((s) => s.installed[tool.id] ?? NONE_INSTALLED);

  useEffect(() => { void loadCatalog(tool.id); }, [tool.id]);

  const packages = catalog?.packages ?? NONE_PACKAGES;
  const needle = search.trim().toLowerCase();
  const visible = useMemo(() => packages.filter((pkg) => matches(`${tool.name} ${pkg.version}`, needle)), [packages, needle, tool.name]);
  const newest = packages[0]?.version;

  return (
    <div className="flex flex-col gap-3 p-4">
      <ToolHeader tool={tool} active={null} />
      {loading && packages.length === 0 && (
        <div className="lm-anim-fade flex items-center gap-2 px-1 text-[12px] text-muted">
          <Loader2 size={13} className="lm-anim-spin" /> {t('sdk.tools.loading')}
        </div>
      )}
      {error && !loading && packages.length === 0 && <Empty icon={<CloudDownload size={26} strokeWidth={1.4} />} title={t('sdk.error.catalog', { message: error })} />}
      {!loading && !error && visible.length === 0 && <Empty icon={<CloudDownload size={26} strokeWidth={1.4} />} title={t('common.nothingFound')} />}

      <div className="flex flex-col gap-2">
        {visible.map((pkg) => {
          const job = jobs[pkg.id];
          const have = installed.some((sdk) => sdk.managed && sdk.version === pkg.version);
          return (
            <div key={pkg.id} className="lm-transition relative flex flex-col gap-2 overflow-hidden rounded-lumen border border-edge bg-surface p-3 pl-4 hover:border-edge-strong">
              <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tool.color }} />
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium text-fg">{tool.name}</span>
                    <span className="font-mono text-[12px] text-muted">{pkg.version}</span>
                    {pkg.version === newest && <Badge tone="accent">{t('sdk.tools.latest')}</Badge>}
                    {pkg.lts && <Badge tone="ok">LTS</Badge>}
                    {have && <Badge>{t('sdk.tools.installed')}</Badge>}
                  </div>
                  <div className="truncate font-mono text-[11px] text-subtle">
                    {pkg.filename}{pkg.size > 0 ? ` · ${formatBytes(pkg.size)}` : ''}
                  </div>
                </div>
                {!job && (
                  <Button size="sm" variant="outline" disabled={have} onClick={() => void installPackage(pkg)}>
                    <Download size={12} /> {t('sdk.tools.install')}
                  </Button>
                )}
              </div>
              {job && <InstallProgressBar progress={job.progress} onCancel={() => cancelInstall(pkg.id)} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
