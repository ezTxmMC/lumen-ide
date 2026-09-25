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
 * What the installed add-ons need: extensions list the SDKs they work with
 * (`requires` in their manifest — Node.js for Angular, Java and Gradle for
 * Minecraft …). This reads those lists, says which SDKs are still missing,
 * and points that out after an extension is installed.
 */

import { extensions } from '@/core/extensions/manager';
import type { ExtensionManifest, ExtensionRequirement } from '@/core/extensions/types';
import { useStore } from '@/state/store';
import { t } from '@/i18n';
import { detectInstalled, useSdk } from './state';
import { sdkTitle } from './tools';

export interface RequirementRow {
  sdk: string;
  /** Who asks for it, with what they say about it. */
  needs: { addon: string; version?: string; reason?: string; }[];
}

/** The SDKs the installed, switched-on extensions ask for, one row per SDK. */
export function requirementRows(): RequirementRow[] {
  const rows = new Map<string, RequirementRow>();
  for (const { manifest } of extensions.listActive()) {
    for (const requirement of manifest.requires ?? []) {
      const row = rows.get(requirement.sdk) ?? { sdk: requirement.sdk, needs: [] };
      row.needs.push({ addon: manifest.name, version: requirement.version, reason: requirement.reason });
      rows.set(requirement.sdk, row);
    }
  }
  return [...rows.values()].sort((a, b) => sdkTitle(a.sdk).name.localeCompare(sdkTitle(b.sdk).name));
}

/** Whether at least one SDK of that kind is installed — found on the machine or installed by Lumen. */
export const hasSdk = (id: string) => (useSdk.getState().installed[id]?.length ?? 0) > 0;

/** After installing an extension: say so when an SDK it needs is not there. */
export async function warnAboutMissingSdks(manifest: Pick<ExtensionManifest, 'name' | 'requires'>) {
  const wanted: ExtensionRequirement[] = manifest.requires ?? [];
  if (!wanted.length) {
    return;
  }
  await Promise.all(wanted.map((requirement) => detectInstalled(requirement.sdk).catch(() => {})));
  const missing = wanted.filter((requirement) => !hasSdk(requirement.sdk));
  if (!missing.length) {
    return;
  }
  useStore.getState().notify(t('sdk.required.missing', {
    addon: manifest.name,
    sdks: missing.map((requirement) => sdkTitle(requirement.sdk).name).join(', '),
  }), 'warning');
}
