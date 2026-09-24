/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The merge commands, for the palette and the shortcuts. */

import { editorBridge } from '@/lib/editor-bridge';
import { t } from '@/i18n';
import type { Command } from '@/core/types';
import type { Resolution } from './conflicts';
import { acceptAll, acceptAtCursor, conflictsOf, gotoConflict, openMergeEditorFromView } from './editor';

/** The active editor, when its file has conflict blocks. */
const conflictedView = () => {
  const view = editorBridge.view;
  if (!view || !conflictsOf(view.state).length) {
    return null;
  }
  return view;
};

const onView = (fn: (view: NonNullable<typeof editorBridge.view>) => unknown) => () => {
  const view = conflictedView();
  if (view) {
    fn(view);
  }
};

/** Jump to the next block of the active file — also the status bar's click. */
export const gotoNextConflict = onView((view) => gotoConflict(view, 1));

export function mergeCommands(): Command[] {
  const category = t('merge.cmd.category');
  const when = () => Boolean(conflictedView());
  const accept = (id: string, resolution: Resolution): Command => ({
    id: `merge.${id}`, title: t(`merge.cmd.${id}`), category, when, run: onView((view) => acceptAtCursor(view, resolution)),
  });
  const acceptEvery = (id: string, resolution: Resolution): Command => ({
    id: `merge.${id}`, title: t(`merge.cmd.${id}`), category, when, run: onView((view) => acceptAll(view, resolution)),
  });
  return [
    { id: 'merge.next', title: t('merge.cmd.next'), category, when, run: gotoNextConflict },
    { id: 'merge.previous', title: t('merge.cmd.previous'), category, when, run: onView((view) => gotoConflict(view, -1)) },
    accept('acceptCurrent', 'current'),
    accept('acceptIncoming', 'incoming'),
    accept('acceptBoth', 'both'),
    acceptEvery('acceptAllCurrent', 'current'),
    acceptEvery('acceptAllIncoming', 'incoming'),
    acceptEvery('acceptAllBoth', 'both'),
    { id: 'merge.openEditor', title: t('merge.cmd.openEditor'), category, when, run: onView(openMergeEditorFromView) },
  ];
}
