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
 * Views and editor groups in windows of their own.
 *
 * The state here is only the list of what is away (`state/popout.ts`); the
 * native windows are `core/popout/windows.ts`, and `PopoutHost` draws into
 * them. A popped-out view keeps its place in the layout, so bringing it back
 * needs no bookkeeping; a popped-out tab becomes an editor group of its own
 * and returns into the group it came from.
 */

import { viewRegistry } from '@/core/views';
import {
  closePopoutWindow, controlPopout, hostBounds, onPopoutClosed, openPopoutWindow, popoutWindow, savedBounds,
} from '@/core/popout/windows';
import { t } from '@/i18n';
import { dockOf } from '../layout';
import { commitGroups, currentGroup, nextGroupId, withoutTab, type StoreAccess } from '../editor-groups';
import {
  addPopout, defaultBounds, dockGroupBack, popoutKey, poppedGroupIds, removePopout, visibleGroups, type PopoutEntry,
} from '../popout';
import type { EditorGroup, PopoutSlice, Slice, State } from '../types';

interface Ctx {
  get: () => State;
  set: Parameters<Slice<PopoutSlice>>[0];
  access: StoreAccess;
}

/** Open the native window for an entry, or say why not. */
function openFor({ get }: Ctx, entry: Omit<PopoutEntry, 'bounds'>, title: string, shape: 'column' | 'strip' | 'editor') {
  const bounds = savedBounds(entry.key) ?? defaultBounds(entry.kind, shape, hostBounds());
  const win = openPopoutWindow(entry.key, title, bounds);
  if (win) {
    return { ...entry, bounds };
  }
  get().notify(t('popout.openFailed'), 'error');
  return null;
}

function focus(key: string) {
  void controlPopout(key, 'focus');
  popoutWindow(key)?.focus();
}

/** Tabs go into a new window, as a group of their own. */
function popOutTabs(ctx: Ctx, tabIds: string[], activeTabId: string) {
  const { get, set, access } = ctx;
  const s = get();
  const home = currentGroup(s);
  const group: EditorGroup = { id: nextGroupId(), tabIds, activeTabId };
  const key = popoutKey('group', group.id);
  const title = s.tabs.find((tab) => tab.id === activeTabId)?.name ?? t('popout.editor');
  const entry = openFor(ctx, { key, kind: 'group', ref: group.id, from: home.id }, title, 'editor');
  if (!entry) {
    return;
  }
  set({ popouts: addPopout(s.popouts, entry) });
  const moving = new Set(tabIds);
  const rest = get().groups.map((existing) => [...moving].reduce(withoutTab, existing));
  commitGroups(access, [...rest, group], group.id, { remember: false });
}

function popOutActions(ctx: Ctx): Pick<PopoutSlice, 'popOutView' | 'popOutTab' | 'popOutGroup'> {
  const { get, set, access } = ctx;
  return {
    popOutView(id) {
      const view = viewRegistry.get(id);
      if (!view) {
        return;
      }
      const key = popoutKey('view', id);
      if (get().popouts.some((entry) => entry.key === key)) {
        focus(key);
        return;
      }
      const dock = dockOf(get().layout, id, viewRegistry.list());
      const entry = openFor(ctx, { key, kind: 'view', ref: id }, view.title(), dock === 'bottom' ? 'strip' : 'column');
      if (!entry) {
        return;
      }
      set({ popouts: addPopout(get().popouts, entry) });
    },

    popOutTab(tabId) {
      const s = get();
      const id = tabId ?? s.activeTabId;
      if (!id) {
        return;
      }
      const owner = s.groups.find((group) => group.tabIds.includes(id));
      const popped = poppedGroupIds(s.popouts);
      // Already alone in a window of its own: bring that forward instead of making another.
      if (owner && popped.has(owner.id) && owner.tabIds.length === 1) {
        focus(popoutKey('group', owner.id));
        return;
      }
      popOutTabs(ctx, [id], id);
    },

    popOutGroup(groupId) {
      const s = get();
      const group = s.groups.find((existing) => existing.id === groupId);
      if (!group?.tabIds.length) {
        return;
      }
      const key = popoutKey('group', groupId);
      if (s.popouts.some((entry) => entry.key === key)) {
        focus(key);
        return;
      }
      const title = s.tabs.find((tab) => tab.id === group.activeTabId)?.name ?? t('popout.editor');
      const entry = openFor(ctx, { key, kind: 'group', ref: groupId, from: visibleGroups(s.groups, s.popouts).find((g) => g.id !== groupId)?.id }, title, 'editor');
      if (!entry) {
        return;
      }
      set({ popouts: addPopout(s.popouts, entry) });
      // The main window needs a group of its own to go on with.
      const others = visibleGroups(get().groups, get().popouts);
      const groups = others.length ? get().groups : [{ id: nextGroupId(), tabIds: [], activeTabId: null }, ...get().groups];
      commitGroups(access, groups, groupId, { remember: false });
    },
  };
}

function dockBackActions(ctx: Ctx): Pick<PopoutSlice, 'dockBack' | 'dockAllBack' | 'focusPopout' | 'setPopoutBounds'> {
  const { get, set, access } = ctx;
  return {
    dockBack(key) {
      const s = get();
      const entry = s.popouts.find((existing) => existing.key === key);
      if (!entry) {
        return;
      }
      closePopoutWindow(key);
      if (entry.kind === 'view') {
        set({ popouts: removePopout(s.popouts, key) });
        if (viewRegistry.has(entry.ref)) {
          get().showView(entry.ref);
        }
        return;
      }
      const result = dockGroupBack(s.groups, s.popouts, entry.ref, entry.from, s.activeGroupId);
      set({ popouts: removePopout(s.popouts, key) });
      if (!result) {
        return;
      }
      commitGroups(access, result.groups, result.activeGroupId, { remember: false });
    },

    dockAllBack() {
      for (const entry of [...get().popouts]) {
        get().dockBack(entry.key);
      }
    },

    focusPopout: focus,

    setPopoutBounds(key, bounds) {
      set((s) => ({ popouts: s.popouts.map((entry) => (entry.key === key ? { ...entry, bounds } : entry)) }));
    },
  };
}

export const createPopoutSlice: Slice<PopoutSlice> = (set, get) => {
  const ctx: Ctx = { get, set, access: { get, set } };

  const slice: PopoutSlice = {
    popouts: [],
    ...popOutActions(ctx),
    ...dockBackActions(ctx),
  };

  // A window closed from outside (its close button, the window manager): its contents go home.
  onPopoutClosed((key) => slice.dockBack(key));

  return slice;
};
