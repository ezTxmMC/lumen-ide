/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Facet, StateEffect, StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { t } from '@/i18n';
import { breakpoints, type BreakpointEntry } from '../state/breakpoints';
import { debug } from '../manager';
import { samePath } from '../state/paths';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

interface ViewInfo {
  path: string | null;
  tabId: string;
}

export const infoFacet = Facet.define<ViewInfo, ViewInfo>({
  combine: (values) => values[0] ?? { path: null, tabId: '' },
});

export interface Mark {
  id: string;
  /** Start of the line. */
  pos: number;
  classes: string;
  title: string;
}

export const setMarks = StateEffect.define<Mark[]>();

function lineStart(state: EditorState, line: number) {
  const number = Math.min(Math.max(line + 1, 1), state.doc.lines);
  return state.doc.line(number).from;
}

function markClasses(bp: BreakpointEntry) {
  const status = breakpoints.statusOf(bp.id);
  const classes = ['lm-bp'];
  if (!bp.enabled) {
    classes.push('lm-bp-disabled');
  }
  if (bp.logMessage) {
    classes.push('lm-bp-log');
  }
  if (bp.condition || bp.hitCondition) {
    classes.push('lm-bp-conditional');
  }
  if (bp.enabled && debug.hasSessions && status && !status.verified) {
    classes.push('lm-bp-unverified');
  }
  return classes.join(' ');
}

function markTitle(bp: BreakpointEntry) {
  const status = breakpoints.statusOf(bp.id);
  const parts = [bp.logMessage ? t('debug.bp.logpoint', { message: bp.logMessage }) : t('debug.bp.breakpoint')];
  if (bp.condition) {
    parts.push(t('debug.bp.conditionIs', { condition: bp.condition }));
  }
  if (bp.hitCondition) {
    parts.push(t('debug.bp.hitIs', { hits: bp.hitCondition }));
  }
  if (!bp.enabled) {
    parts.push(t('debug.bp.disabled'));
  }
  if (status && !status.verified) {
    parts.push(status.message ?? t('debug.bp.unverified'));
  }
  return parts.join('\n');
}

export function marksFor(state: EditorState, path: string | null): Mark[] {
  return breakpoints.forPath(path).map((bp) => ({
    id: bp.id,
    pos: lineStart(state, bp.line),
    classes: markClasses(bp),
    title: markTitle(bp),
  }));
}

export const marksField = StateField.define<Mark[]>({
  create: (state) => marksFor(state, state.facet(infoFacet).path),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMarks)) {
        return effect.value;
      }
    }
    if (!tr.docChanged) {
      return value;
    }
    return value.map((mark) => ({ ...mark, pos: tr.state.doc.lineAt(tr.changes.mapPos(mark.pos, 1)).from }));
  },
});

interface ExecMark {
  pos: number;
  top: boolean;
}

export const setExec = StateEffect.define<ExecMark | null>();

export function execFor(state: EditorState, path: string | null): ExecMark | null {
  const exec = debug.exec;
  if (!exec || !samePath(exec.path, path)) {
    return null;
  }
  return { pos: lineStart(state, exec.line), top: exec.top };
}

export const execField = StateField.define<ExecMark | null>({
  create: (state) => execFor(state, state.facet(infoFacet).path),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setExec)) {
        return effect.value;
      }
    }
    if (!value || !tr.docChanged) {
      return value;
    }
    return { ...value, pos: tr.state.doc.lineAt(tr.changes.mapPos(value.pos, 1)).from };
  },
  provide: (field) => EditorView.decorations.from(field, (exec) => {
    if (!exec) {
      return Decoration.none;
    }
    const cls = exec.top ? 'lm-debug-exec-line' : 'lm-debug-frame-line';
    return Decoration.set([Decoration.line({ class: cls }).range(exec.pos)]);
  }),
});
