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
 * The security scanner's part of the interface: a look at every project that
 * opens, and a command to look again.
 */

import { registerCommandProvider } from '@/core/commands';
import { scanProject } from '@/core/security';
import { t } from '@/i18n';
import { useStore } from '@/state/store';
import type { Command } from '@/core/types';

let started = false;
let lastRoot: string | null = null;

/** Give the project a moment to open — the scan reads files, the first paint should not wait for it. */
const SCAN_DELAY_MS = 1500;

function commands(): Command[] {
  return [{
    id: 'security.scanProject',
    title: t('security.cmd.scanProject'),
    category: t('security.category'),
    when: () => Boolean(useStore.getState().workspace),
    run: () => {
      const root = useStore.getState().workspace;
      if (root) {
        void scanProject(root, { explicit: true });
      }
    },
  }];
}

export function init() {
  if (started) {
    return;
  }
  started = true;
  registerCommandProvider(commands);
  useStore.subscribe((state) => {
    const root = state.workspace;
    if (root === lastRoot) {
      return;
    }
    lastRoot = root;
    if (!root || !state.effects.securityScan) {
      return;
    }
    window.setTimeout(() => void scanProject(root), SCAN_DELAY_MS);
  });
}
