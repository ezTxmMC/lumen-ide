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
 * “Which view / which window does this command mean?” — for the commands and
 * menu entries of pop-out, which act on whatever the user is working in.
 */

import { useStore } from '@/state/store';
import { activeView } from '@/state/layout';
import { isViewPopped, poppedGroupIds, popoutKey } from '@/state/popout';
import { DOCKS, viewRegistry, type Dock } from '@/core/views';
import { focusedPopoutKey } from './windows';

/** The dock the keyboard focus is in, judged by the `data-dock` marks the docks carry. */
function focusedDock(): Dock | null {
  const mark = document.activeElement?.closest<HTMLElement>('[data-dock]')?.dataset.dock;
  return DOCKS.find((dock) => dock === mark) ?? null;
}

/**
 * The view a “pop out” command takes: the one of the dock with focus, else
 * the navigation side's, else the bottom dock's — the first that is open and
 * still docked.
 */
export function activeDockViewId(): string | null {
  const { layout, popouts } = useStore.getState();
  const known = viewRegistry.list();
  const order: Dock[] = [layout.navSide, 'bottom', layout.navSide === 'left' ? 'right' : 'left'];
  const focused = focusedDock();
  const docks = focused ? [focused, ...order.filter((dock) => dock !== focused)] : order;
  for (const dock of docks) {
    if (!layout[dock].open) {
      continue;
    }
    const id = activeView(layout, dock, known);
    if (id && !isViewPopped(popouts, id)) {
      return id;
    }
  }
  return null;
}

/** The pop-out a “dock back” command takes: the window in front, else the active group's, else the latest. */
export function dockBackTargetKey(): string | null {
  const { popouts, activeGroupId } = useStore.getState();
  const focused = focusedPopoutKey();
  if (focused && popouts.some((entry) => entry.key === focused)) {
    return focused;
  }
  if (poppedGroupIds(popouts).has(activeGroupId)) {
    return popoutKey('group', activeGroupId);
  }
  return popouts[popouts.length - 1]?.key ?? null;
}
