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
 * Add-ons in one place.
 *
 *   Explore    everything all enabled servers offer, in one list
 *   Installed  every add-on that is present — built in, from a server, by hand
 *   Updates    installed add-ons with a newer version on their server
 *   Settings   the settings the installed add-ons bring, one page per add-on
 *   Servers    the servers themselves
 *
 * A server Lumen has not verified raises a prompt before installing — which
 * is also where it can be marked trusted for good.
 */

import { appVersion } from '@/core/extensions/compat/app-version';
import { catalog } from '@/core/extensions/catalog';
import { fitsApp } from '@/core/extensions/compat/compat';
import { extensions as installedExtensions } from '@/core/extensions/manager';
import type { ExtensionSummary } from '@/core/extensions/types';
import { useT } from '@/i18n';
import { useStore } from '@/state/store';
import { Blocks, Compass, Globe, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ExtensionSettingsPage } from '../../settings/ExtensionSettingsPage';
import { Button } from '../../ui';
import { type DialogSection, DialogShell } from '../DialogShell';
import { InstalledView } from './InstalledView';
import { useProvidesText } from './ExtensionBadges';
import { type Category, useExtensionInstall, useDialogRouting, entryMatches } from './extension-hooks';
import { ExploreList } from './ExploreList';
import { UpdateList, ServerList } from './UpdatesAndServers';

export function ExtensionsDialog() {
  const t = useT();
  const open = useStore((s) => s.dialog === "extensions");
  const requested = useStore((s) => s.dialogSection);
  const servers = useStore((s) => s.extensionServers);
  const setServer = useStore((s) => s.setExtensionServer);
  const removeServer = useStore((s) => s.removeExtensionServer);
  const addServer = useStore((s) => s.addExtensionServer);

  const { section, setSection, installedFilter } = useDialogRouting(
    open,
    requested,
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");

  useSyncExternalStore(
    installedExtensions.subscribe,
    installedExtensions.getVersion,
  );
  useSyncExternalStore(catalog.subscribe, catalog.getVersion);
  const providesText = useProvidesText();

  const activeServers = useMemo(
    () => servers.filter((server) => !server.disabled),
    [servers],
  );
  const serverKey = activeServers.map((server) => server.url).join("\n");

  const { busy, install, updateAll } = useExtensionInstall(
    servers,
    activeServers,
  );

  const offered = catalog.explore(activeServers);
  const updates = catalog.updates(activeServers);
  const installable = updates.filter((update) =>
    fitsApp(update.minAppVersion, appVersion())
  );

  /** Ask every enabled server whenever the dialog opens or the list changes. */
  useEffect(() => {
    if (!open) {
      return;
    }
    void catalog.refresh(activeServers);
  }, [open, serverKey]);

  const sections = useMemo<DialogSection[]>(() => [
    {
      id: "explore",
      label: t("extensions.explore"),
      icon: Compass,
      badge: offered.length ? String(offered.length) : undefined,
    },
    { id: "installed", label: t("extensions.installed"), icon: Blocks },
    {
      id: "updates",
      label: t("extensions.updates"),
      icon: RefreshCw,
      badge: installable.length ? String(installable.length) : undefined,
    },
    {
      id: "settings",
      label: t("extensions.settings"),
      icon: SlidersHorizontal,
    },
    {
      id: "servers",
      label: t("extensions.servers"),
      icon: Globe,
      badge: String(servers.length),
    },
  ], [t, offered.length, installable.length, servers.length]);
  const searchable = section !== "servers";

  const needle = search.trim().toLowerCase();
  const matches = (entry: ExtensionSummary) => entryMatches(entry, needle);
  const explored = offered.filter(({ summary }) =>
    matches(summary) && (category === "all" || summary.category === category)
  );
  const shownUpdates = updates.filter((update) => entryMatches(update, needle));

  return (
    <DialogShell
      id="extensions"
      wide
      title={t("extensions.title")}
      icon={Blocks}
      sections={sections}
      section={section}
      onSection={setSection}
      search={searchable ? search : undefined}
      onSearch={searchable ? setSearch : undefined}
      searchPlaceholder={t("extensions.search")}
      headerExtra={section === "servers" || section === "settings"
        ? undefined
        : (
          <Button
            size="sm"
            variant="outline"
            title={t("extensions.refresh")}
            onClick={() => void catalog.refresh(activeServers)}
            disabled={catalog.loading()}
          >
            <RefreshCw
              size={12}
              className={catalog.loading() ? "lm-anim-spin" : ""}
            />
            {t("extensions.refresh")}
          </Button>
        )}
    >
      {section === "settings" && (
        <div className="p-4">
          <ExtensionSettingsPage
            query={search}
            onBrowse={() => setSection("explore")}
            onManage={() => setSection("installed")}
          />
        </div>
      )}

      {section === "servers" && (
        <div className="p-4">
          <ServerList
            servers={servers}
            onAdd={addServer}
            onRemove={removeServer}
            onPatch={setServer}
          />
        </div>
      )}

      {section === "installed" && (
        <InstalledView
          query={search}
          initialFilter={installedFilter}
          updates={updates}
        />
      )}

      {section === "explore" && (
        <ExploreList
          entries={explored}
          servers={activeServers}
          category={category}
          onCategory={setCategory}
          busy={busy}
          providesText={providesText}
          onInstall={install}
        />
      )}

      {section === "updates" && (
        <UpdateList
          updates={shownUpdates}
          servers={activeServers}
          busy={busy}
          onUpdate={(update) => void install(update.server, update, update.to)}
          onUpdateAll={() => void updateAll()}
        />
      )}
    </DialogShell>
  );
}
