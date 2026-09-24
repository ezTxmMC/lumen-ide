/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Dialogs around breakpoints. */

import { t } from '@/i18n';
import type { FormField } from '@/core/types';
import { breakpoints } from './breakpoints';
import { askForm } from './config';

type Focus = 'condition' | 'hitCondition' | 'logMessage';

const TITLE_KEYS: Record<Focus, string> = {
  condition: 'debug.edit.conditionTitle',
  hitCondition: 'debug.edit.hitTitle',
  logMessage: 'debug.edit.logTitle',
};

/** Edit condition, hit count and logpoint message, creating the breakpoint if needed. */
export async function editBreakpoint(path: string, line: number, focus: Focus) {
  const existing = breakpoints.at(path, line);
  const fields: FormField[] = [
    { id: 'condition', label: t('debug.edit.condition'), hint: t('debug.edit.conditionHint'), required: false, mono: true, placeholder: 'i > 10' },
    { id: 'hitCondition', label: t('debug.edit.hitCondition'), hint: t('debug.edit.hitHint'), required: false, mono: true, placeholder: '>= 3' },
    { id: 'logMessage', label: t('debug.edit.logMessage'), hint: t('debug.edit.logHint'), required: false, mono: true, placeholder: 'i = {i}' },
  ];
  // The field that was asked for comes first.
  fields.sort((a, b) => Number(b.id === focus) - Number(a.id === focus));
  const values = await askForm(t(TITLE_KEYS[focus], { line: line + 1 }), fields, {
    condition: existing?.condition ?? '',
    hitCondition: existing?.hitCondition ?? '',
    logMessage: existing?.logMessage ?? '',
  }, t('debug.edit.save'));
  if (!values) {
    return;
  }
  const patch = {
    condition: values.condition?.trim() || undefined,
    hitCondition: values.hitCondition?.trim() || undefined,
    logMessage: values.logMessage?.trim() || undefined,
  };
  const current = breakpoints.at(path, line);
  if (current) {
    breakpoints.update(current.id, { ...patch, enabled: true });
    return;
  }
  breakpoints.add(path, line, patch);
}
