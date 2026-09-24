/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useMemo, useSyncExternalStore } from 'react';
import { useStore } from '@/state/store';
import { lsp } from '@/core/lsp/manager';
import { terminals } from '@/lib/terminals';
import { keybindings } from '@/core/keybindings';
import { useLanguage } from '@/i18n';
import {
  buildCommands, getCommandProviderVersion, subscribeCommandProviders,
} from '@/core/commands';
import type { Command } from '@/core/types';

/** Every command — built in plus those of the active add-ons — recomputed when anything changes. */
export function useCommands(options: { includeHidden?: boolean; } = {}): Command[] {
  const registryVersion = useStore((s) => s.registryVersion);
  const themeId = useStore((s) => s.themeId);
  const effects = useStore((s) => s.effects);
  const project = useStore((s) => s.project);
  const config = useStore((s) => s.projectConfig);
  const lspVersion = useStore((s) => s.lspVersion);
  const groups = useStore((s) => s.groups.length);
  const activeTabId = useStore((s) => s.activeTabId);
  const workspaces = useStore((s) => s.workspaces);
  const extraFolders = useStore((s) => s.extraFolders);
  const language = useLanguage();
  const terminalVersion = useSyncExternalStore(terminals.subscribe.bind(terminals), terminals.getVersion);
  const bindingVersion = useSyncExternalStore(keybindings.subscribe, keybindings.getVersion);
  const providerVersion = useSyncExternalStore(subscribeCommandProviders, getCommandProviderVersion);
  void lsp;

  return useMemo(
    () => buildCommands(options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      registryVersion, themeId, effects, project, config, lspVersion, terminalVersion, groups, activeTabId,
      language, bindingVersion, providerVersion, options.includeHidden, workspaces, extraFolders,
    ],
  );
}
