/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Side effects of the “New project” page that do not touch its own state. */

import { useEffect } from 'react';
import { useStore } from '@/state/store';
import { takeOverSetup } from '@/core/project/setup-handover';
import { escapeOwnedByPopover } from '../../overlays/escape';
import type { Step } from './DialogChrome';

/** A project created for a new window arrives here: open its file, run its setup. */
export function useSetupHandover(workspace: string | null) {
  useEffect(() => {
    if (!workspace) {
      return;
    }
    const note = takeOverSetup(workspace);
    if (!note) {
      return;
    }
    const state = useStore.getState();
    state.showView('project');
    if (note.open) {
      void state.openFile(note.open).catch(() => {});
    }
    if (!note.tasks.length) {
      return;
    }
    void import('@/lib/run').then(({ runTasks }) => runTasks(note.tasks, workspace, () => void useStore.getState().refreshProject()));
  }, [workspace]);
}

/** Esc closes, Ctrl+Enter advances or creates. Re-registered every render, as it reads live state. */
export function useDialogKeys(open: boolean, keys: {
  step: Step;
  templateId: string;
  choose: (id: string) => void;
  create: () => Promise<void>;
  close: () => void;
}) {
  const { step, templateId, choose, create, close } = keys;
  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (escapeOwnedByPopover()) {
          return;
        }
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || escapeOwnedByPopover()) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (step === 'pick' && templateId) {
        choose(templateId);
        return;
      }
      if (step === 'configure') {
        void create();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  });
}
