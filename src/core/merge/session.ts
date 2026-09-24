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
 * The file open in the merge editor — at most one at a time. Kept outside the
 * store: nothing else needs it, and it must not be persisted.
 */

import { useSyncExternalStore } from 'react';
import { useStore } from '@/state/store';
import { editorBridge } from '@/lib/editor-bridge';
import { t } from '@/i18n';
import { parseConflicts } from './conflicts';

export interface MergeSession {
  /** Bumped per opening, so the editor rebuilds its views. */
  id: number;
  tabId: string | null;
  path: string | null;
  name: string;
  languageId: string | null;
  /** The text with its conflict blocks, as it was when the merge editor opened. */
  text: string;
}

let session: MergeSession | null = null;
let counter = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const fn of listeners) {
    fn();
  }
};

export const mergeSession = {
  get: () => session,

  open(next: Omit<MergeSession, 'id'>) {
    counter++;
    session = { ...next, id: counter };
    emit();
  },

  close() {
    if (!session) {
      return;
    }
    session = null;
    emit();
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

export function useMergeSession(): MergeSession | null {
  return useSyncExternalStore(mergeSession.subscribe, mergeSession.get);
}

/**
 * Open the merge editor for a tab, with the text the editor shows right now
 * (unsaved edits included). Returns false when the text has no conflict.
 */
export function openMergeEditorForTab(tabId: string | null, text?: string): boolean {
  const state = useStore.getState();
  const tab = state.tabs.find((open) => open.id === tabId) ?? null;
  if (!tab) {
    return false;
  }
  const live = editorBridge.tabId === tab.id && editorBridge.view ? editorBridge.view.state.doc.toString() : tab.content;
  const content = text ?? live;
  if (!parseConflicts(content).length) {
    state.notify(t('merge.notify.noConflicts'), 'info');
    return false;
  }
  mergeSession.open({ tabId: tab.id, path: tab.path, name: tab.name, languageId: tab.languageId, text: content });
  return true;
}
