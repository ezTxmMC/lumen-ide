/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { catalog } from '@/core/extensions/catalog';
import { installExtension } from '@/core/extensions/flow';
import { offerServers } from '@/core/extensions/integration/lsp';
import { extensions as installedExtensions } from '@/core/extensions/manager';
import { hostOf, isTrusted } from '@/core/extensions/trust';
import type { ExtensionServer, ExtensionSummary } from '@/core/extensions/types';
import { useT } from '@/i18n';
import { useStore } from '@/state/store';
import { useCallback, useEffect, useState } from 'react';

export type Category = "all" | "language" | "theme" | "tool";

export const CATEGORIES: Category[] = ["all", "language", "theme", "tool"];

const INSTALLED_FILTERS = [
  "all",
  "language",
  "theme",
  "tool",
  "extension",
  "user",
];

/** Installing, updating and updating everything, with the id of what is currently busy. */
export function useExtensionInstall(
  servers: ExtensionServer[],
  activeServers: ExtensionServer[],
) {
  const t = useT();
  const notify = useStore((s) => s.notify);
  const openForm = useStore((s) => s.openForm);
  const setServer = useStore((s) => s.setExtensionServer);
  const [busy, setBusy] = useState<string | null>(null);

  /** Install or update — asking first for unverified servers. */
  const install = useCallback(
    async (
      server: ExtensionServer,
      entry: Pick<ExtensionSummary, "id" | "name">,
      version?: string,
    ) => {
      const run = async () => {
        setBusy(entry.id);
        try {
          await installExtension(server.url, entry.id, version, (manifest) => {
            notify(
              t("extensions.installedNotice", { name: entry.name }),
              "success",
            );
            void offerServers(manifest);
          });
        } catch (err) {
          notify(
            t("extensions.installFailed", { error: (err as Error).message }),
            "error",
          );
        } finally {
          setBusy(null);
        }
      };

      if (isTrusted(server.url, servers)) {
        await run();
        return;
      }
      const host = hostOf(server.url) ?? server.url;
      openForm({
        title: t("extensions.untrustedTitle"),
        description: t("extensions.untrustedBody", { name: entry.name, host }),
        submitLabel: t("extensions.install"),
        fields: [{
          id: "trust",
          label: t("extensions.untrustedTrustAlways", { host }),
          type: "toggle",
          default: "",
        }],
        onSubmit: async (values) => {
          if (values.trust === "true") {
            setServer(server.url, { trusted: true });
          }
          await run();
        },
      });
    },
    [servers, notify, openForm, setServer, t],
  );

  const updateAll = useCallback(async () => {
    setBusy("*");
    try {
      const names = await installedExtensions.updateAll();
      notify(
        names.length
          ? t("extensions.updated", { names: names.join(", ") })
          : t("extensions.updatesNone"),
        names.length ? "success" : "info",
      );
      await catalog.refresh(activeServers);
    } finally {
      setBusy(null);
    }
  }, [notify, t, activeServers]);

  return { busy, install, updateAll };
}

/** The open section, and the installed-filter; `openDialog('extensions', 'servers')` and the like pick them. */
export function useDialogRouting(open: boolean, requested: string | null) {
  const [section, setSection] = useState("explore");
  const [installedFilter, setInstalledFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !requested) {
      return;
    }
    if (INSTALLED_FILTERS.includes(requested)) {
      setSection("installed");
      setInstalledFilter(requested);
      return;
    }
    setSection(requested);
  }, [open, requested]);

  return { section, setSection, installedFilter };
}

/** Whether an extension's name, id, description or keywords contain the search text. */
export function entryMatches(
  entry: Pick<ExtensionSummary, "id" | "name" | "description" | "keywords">,
  needle: string,
): boolean {
  if (!needle) {
    return true;
  }
  return [entry.name, entry.id, entry.description, ...(entry.keywords ?? [])]
    .join(" ").toLowerCase().includes(needle);
}
