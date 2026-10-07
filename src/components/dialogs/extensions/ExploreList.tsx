/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { appVersion } from '@/core/extensions/compat/app-version';
import { catalog, type CatalogEntry } from '@/core/extensions/catalog';
import { fitsApp } from '@/core/extensions/compat/compat';
import { extensions as installedExtensions } from '@/core/extensions/manager';
import { hostOf } from '@/core/extensions/trust';
import type { ExtensionServer, ExtensionSummary } from '@/core/extensions/types';
import { isNewer } from '@/core/extensions/compat/version';
import { useT } from '@/i18n';
import { Blocks, CheckCircle2, Globe, RefreshCw } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { Button, Empty } from '../../ui';
import { AddonSdks } from '../../sdk/AddonSdks';
import { Badge, SecurityMark } from './ExtensionBadges';
import { type Category, CATEGORIES } from './extension-hooks';
import { ServerProblems } from './UpdatesAndServers';

export function ExploreList(
  { entries, servers, category, onCategory, busy, providesText, onInstall }: {
    entries: CatalogEntry[];
    servers: ExtensionServer[];
    category: Category;
    onCategory: (category: Category) => void;
    busy: string | null;
    providesText: (provides: Record<string, number> | undefined) => string;
    onInstall: (server: ExtensionServer, entry: ExtensionSummary, version?: string) => void;
  },
) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  useSyncExternalStore(
    installedExtensions.subscribe,
    installedExtensions.getVersion,
  );
  const loading = catalog.loading();

  const opened = entries.find(({ summary }) => summary.id === openId);

  const body = () => {
    if (!servers.length) {
      return (
        <Empty
          icon={<Globe size={22} />}
          title={t("extensions.noServers")}
          hint={t("extensions.subtitle")}
        />
      );
    }
    if (opened) {
      return (
        <AddonDetail
          entry={opened}
          busy={busy}
          providesText={providesText}
          onBack={() => setOpenId(null)}
          onInstall={onInstall}
        />
      );
    }
    if (loading && !entries.length) {
      return (
        <Empty
          icon={<RefreshCw size={22} className="lm-anim-spin" />}
          title={t("extensions.loading")}
        />
      );
    }
    if (!entries.length) {
      return (
        <Empty icon={<Blocks size={22} />} title={t("extensions.noResults")} />
      );
    }
    return (
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {entries.map(({ summary, server }) => {
          const current = installedExtensions.get(summary.id);
          const outdated = Boolean(current) &&
            isNewer(summary.version, current?.manifest.version ?? "");
          const fits = fitsApp(summary.minAppVersion, appVersion());
          const label = () => {
            if (!fits) {
              return t("extensions.requiresApp", {
                required: summary.minAppVersion ?? "",
              });
            }
            if (outdated) {
              return t("extensions.update");
            }
            if (current) {
              return t("extensions.installed");
            }
            return t("extensions.install");
          };
          return (
            <div
              key={summary.id}
              onClick={() => setOpenId(summary.id)}
              className="lm-transition flex cursor-pointer items-start gap-3 rounded-lumen border border-edge bg-elevated p-3 hover:border-edge-strong"
            >
              <Badge icon={summary.icon} color={summary.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] text-fg">
                    {summary.name}
                  </span>
                  {current && !outdated && (
                    <CheckCircle2 size={12} className="shrink-0 text-good" />
                  )}
                  {summary.security && <SecurityMark security={summary.security} />}
                </div>
                <div className="line-clamp-2 text-[12px] text-muted">
                  {summary.description}
                </div>
                <div className="mt-1 truncate text-[11.5px] text-subtle">
                  {t("extensions.versionLabel", { version: summary.version })}
                  {summary.author
                    ? ` · ${
                      t("extensions.byAuthor", { author: summary.author })
                    }`
                    : ""}
                  {providesText(summary.provides)
                    ? ` · ${providesText(summary.provides)}`
                    : ""}
                  {` · ${server.name ?? hostOf(server.url) ?? server.url}`}
                </div>
              </div>
              <span onClick={(event) => event.stopPropagation()}><Button
                size="sm"
                variant={outdated ? "solid" : undefined}
                disabled={!fits || busy === summary.id ||
                  (Boolean(current) && !outdated)}
                onClick={() => onInstall(server, summary)}
              >
                {busy === summary.id && (
                  <RefreshCw size={12} className="lm-anim-spin" />
                )}
                {label()}
              </Button></span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-4">
      {!opened && <div className="mb-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((id) => (
          <button
            key={id}
            onClick={() => onCategory(id)}
            className={[
              "lm-transition rounded-full border px-2.5 py-0.5 text-[11.5px]",
              id === category
                ? "border-accent bg-active text-fg"
                : "border-edge text-muted hover:border-edge-strong",
            ].join(" ")}
          >
            {t(`addonStudio.dialog.nav.${id}`)}
          </button>
        ))}
      </div>}
      <ServerProblems servers={servers} />
      {body()}
    </div>
  );
}

function newestFirst(a: string, b: string): number {
  if (isNewer(a, b)) {
    return -1;
  }
  return isNewer(b, a) ? 1 : 0;
}

/** One add-on in full: the whole description, and every version the server carries. */
function AddonDetail({ entry: { summary, server }, busy, providesText, onBack, onInstall }: {
  entry: CatalogEntry;
  busy: string | null;
  providesText: (provides: Record<string, number> | undefined) => string;
  onBack: () => void;
  onInstall: (server: ExtensionServer, entry: ExtensionSummary, version?: string) => void;
}) {
  const t = useT();
  const current = installedExtensions.get(summary.id)?.manifest.version;
  const fits = fitsApp(summary.minAppVersion, appVersion());
  const versions = [...new Set([summary.preview, summary.version, ...(summary.versions ?? [])].filter((v): v is string => Boolean(v)))]
    .sort(newestFirst);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button size="sm" variant="outline" onClick={onBack}>{t("common.back")}</Button>
      </div>
      <div className="flex items-start gap-3">
        <Badge icon={summary.icon} color={summary.color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] text-fg">{summary.name}</div>
          <div className="text-[11.5px] text-subtle">
            {summary.author ? `${t("extensions.byAuthor", { author: summary.author })} · ` : ""}
            {server.name ?? hostOf(server.url) ?? server.url}
            {providesText(summary.provides) ? ` · ${providesText(summary.provides)}` : ""}
          </div>
        </div>
      </div>
      {summary.requires?.length ? <div className="-mx-5"><AddonSdks requires={summary.requires} /></div> : null}
      {summary.description && <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{summary.description}</p>}
      <div>
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t("extensions.versions")}</div>
        <div className="flex flex-col gap-1.5">
          {versions.map((version) => {
            const installedNow = version === current;
            const preview = version === summary.preview && version !== summary.version;
            return (
              <div key={version} className="flex items-center gap-3 rounded-lumen border border-edge bg-elevated px-3 py-2">
                <span className="font-mono text-[12.5px] text-fg">{version}</span>
                {version === summary.version && <span className="text-[11px] text-accent">{t("extensions.latestVersion")}</span>}
                {preview && <span className="text-[11px] text-warn">{t("extensions.previewVersion")}</span>}
                {installedNow && <CheckCircle2 size={12} className="text-good" />}
                <span className="flex-1" />
                <Button
                  size="sm"
                  disabled={!fits || busy === summary.id}
                  onClick={() => onInstall(server, summary, version)}
                >
                  {busy === summary.id && <RefreshCw size={12} className="lm-anim-spin" />}
                  {t(installedNow ? "extensions.reinstall" : "extensions.install")}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
