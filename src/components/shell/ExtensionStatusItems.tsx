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
 * The status-bar items extension code sets (`ctx.statusBar.set`) — the Git
 * branch, the CI state of a pull request. A click runs the item's command.
 */

import { useSyncExternalStore } from 'react';
import { extensionHost } from '@/core/extensions/host';
import { extensions } from '@/core/extensions/manager';
import { useStore } from '@/state/store';
import { namedIcon } from '../ui/named-icons';
import { TONE_TEXT } from '../extension-view/ExtensionView';

export function ExtensionStatusItems({ side }: { side: 'left' | 'right'; }) {
  useSyncExternalStore(extensionHost.subscribe, extensionHost.getVersion);
  // Switching an add-on off changes the registry version, which re-renders this.
  useStore((s) => s.registryVersion);
  const active = new Set(extensions.listActive().map(({ manifest }) => manifest.id));
  const items = extensionHost.statusItems()
    .filter((item) => active.has(item.extensionId))
    .filter((item) => (item.side ?? 'left') === side)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  return (
    <>
      {items.map((item) => {
        const Icon = item.icon ? namedIcon(item.icon) : null;
        const tone = item.tone ? TONE_TEXT[item.tone] : '';
        const command = item.command;
        return (
          <button
            key={`${item.extensionId}/${item.id}`}
            title={item.tooltip ?? item.text}
            disabled={!command}
            onClick={() => { if (command) {
              void extensionHost.runCommand(item.extensionId, command);
            } }}
            className={`lm-transition flex max-w-[220px] items-center gap-1 rounded px-1 enabled:hover:bg-hover enabled:hover:text-fg ${tone}`}
          >
            {Icon && <Icon size={10} className="shrink-0" />}
            <span className="truncate">{item.text}</span>
          </button>
        );
      })}
    </>
  );
}
