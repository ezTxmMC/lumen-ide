/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Creating the project: validation, the scaffold call and the permission retry. */

import type { ProjectTemplate, FormValues, FormField } from '@/core/types';
import type { ScaffoldProgress } from '@/core/project/scaffold';
import { rememberRecent } from '@/core/project/catalog';
import type { useT } from '@/i18n';
import {
  OPTIONS_KEY, PARENT_KEY, RECENT_KEY, writeStorage, type CreateOptions,
} from './storage';

/** The main process refuses writes outside the granted folders (see `assertWritable`). */
const OUTSIDE_WORKSPACE = /outside the workspace folder|außerhalb des Arbeitsordners/;

export interface SubmitContext {
  t: ReturnType<typeof useT>;
  template: ProjectTemplate;
  fields: FormField[];
  values: FormValues;
  errors: Record<string, string>;
  loaded: Record<string, { status: string; } | undefined>;
  name: string;
  parent: string;
  options: CreateOptions;
  recentIds: string[];
  createProject: (
    template: ProjectTemplate, folder: string, name: string, values: FormValues,
    options: { setup: boolean; git: boolean; window: CreateOptions['window']; onProgress: (progress: ScaffoldProgress) => void; },
  ) => Promise<unknown>;
  setShowErrors: (value: boolean) => void;
  setError: (value: string | null) => void;
  setBusy: (value: boolean) => void;
  setProgress: (value: ScaffoldProgress | null) => void;
  setParent: (value: string) => void;
}

const cleanMessage = (err: unknown) => (err as Error).message.replace(/^Error: /, '');

/** The message of the first thing missing from the form, if anything is. */
function validationMessage(ctx: SubmitContext): string | null {
  const { t, fields, errors, loaded, name, parent } = ctx;
  if (!name) {
    return t('forms.newProject.nameMissing');
  }
  if (!parent.trim()) {
    return t('forms.newProject.chooseParent');
  }
  const loading = fields.some((field) => field.loadChoices && errors[field.id] && loaded[field.id]?.status !== 'error');
  if (Object.keys(errors).length) {
    return t(loading ? 'forms.newProject.waitChoices' : 'forms.newProject.checkFields');
  }
  return null;
}

export async function submitProject(ctx: SubmitContext) {
  const { t, template, values, name, parent, options, recentIds } = ctx;
  const { createProject, setError, setBusy, setProgress, setParent } = ctx;
  ctx.setShowErrors(true);
  const invalid = validationMessage(ctx);
  if (invalid) {
    setError(invalid);
    return;
  }
  setBusy(true);
  setError(null);
  writeStorage(OPTIONS_KEY, options);
  const run = async (folder: string) => {
    await createProject(template, folder, name, values, {
      setup: options.setup ?? true,
      git: options.git ?? true,
      window: options.window,
      onProgress: setProgress,
    });
    writeStorage(PARENT_KEY, folder);
    writeStorage(RECENT_KEY, rememberRecent(recentIds, template.id));
  };
  try {
    await run(parent);
  } catch (err) {
    const message = cleanMessage(err);
    if (!OUTSIDE_WORKSPACE.test(message)) {
      setError(message);
      setBusy(false);
      setProgress(null);
      return;
    }
    // No write permission (the path came from storage) — confirm once through a dialog.
    const picked = await window.lumen.dialog.chooseFolder(t('forms.newProject.confirmParent'), parent);
    if (!picked) {
      setBusy(false);
      setProgress(null);
      return;
    }
    setParent(picked);
    try {
      await run(picked);
    } catch (retryError) {
      setError(cleanMessage(retryError));
    }
  }
  setBusy(false);
  setProgress(null);
}
