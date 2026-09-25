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
 * Installing with the questions that belong to it.
 *
 * An extension that brings program code runs it with the rights of Lumen
 * itself, so it is never installed silently: the user is told what that means
 * and sees a fingerprint of the code they approve. The same goes for an
 * update whose code has changed — only unchanged code carries over.
 */

import { useStore } from '@/state/store';
import { t } from '@/i18n';
import { CodeApprovalRequired, extensions } from './manager';
import { warnAboutMissingSdks } from '@/core/sdk/requirements';
import { hostOf } from './trust';
import type { ExtensionManifest } from './types';

/**
 * Fetch and install; when the code needs approval, ask, then finish.
 *
 * `done` is called with the manifest once it is installed — right away, or
 * after the user agreed. Errors other than the approval go to the caller.
 */
export async function installExtension(
  server: string,
  id: string,
  version: string | undefined,
  done: (manifest: ExtensionManifest) => void,
): Promise<void> {
  const finished = (manifest: ExtensionManifest) => {
    done(manifest);
    // An SDK the add-on works with may be missing — say so right away.
    void warnAboutMissingSdks(manifest).catch(() => {});
    // A new agent should not have to be hunted for: show its chat.
    const agent = manifest.agents?.[0];
    if (agent) {
      useStore.getState().showSidebar(`agent:${manifest.id}/${agent.id}`);
    }
  };
  try {
    finished(await extensions.installFrom(server, id, version));
  } catch (err) {
    if (!(err instanceof CodeApprovalRequired)) {
      throw err;
    }
    const { manifest, hash } = err;
    useStore.getState().openForm({
      title: t('extensions.codeTitle', { name: manifest.name }),
      description: t('extensions.codeBody', {
        name: manifest.name,
        host: hostOf(server) ?? server,
      }),
      detail: { label: t('extensions.codeChecksum'), value: hash },
      submitLabel: t('extensions.codeApprove'),
      fields: [],
      onSubmit: async () => {
        await extensions.install(manifest, server, { approveCode: true });
        finished(manifest);
      },
    });
  }
}
