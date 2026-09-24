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
 * Filling in a template's form the way Lumen's project page does: defaults,
 * choices computed from other fields, lists loaded in dependency order — then
 * `files()`. For the tests and the generation harness.
 */

import type { FieldChoice, FormField, FormValues, ProjectTemplate, TemplateContext } from '../../../src/core/types';
import { lumen } from '../src/lumen';

function defaultOf(field: FormField, values: FormValues): string | undefined {
  if (typeof field.default === 'function') { return field.default(values); }
  return field.default;
}

const isChoice = (field: FormField) => field.type === 'select' || field.type === 'combobox';

function choicesOf(field: FormField, values: FormValues, loaded: FieldChoice[] | undefined): FieldChoice[] {
  if (loaded) { return loaded; }
  if (field.choicesFor) { return field.choicesFor(values); }
  return field.choices ?? [];
}

export interface Filled {
  values: FormValues;
  /** The choices each loaded field offered. */
  choices: Record<string, FieldChoice[]>;
}

/**
 * Resolve every field. `overrides` stand for what a user picked; a picked
 * value that the loaded list does not offer is an error — the test asked for
 * something the form would not allow.
 */
export async function fill(template: ProjectTemplate, name: string, overrides: FormValues = {}): Promise<Filled> {
  const fields = template.fields ?? [];
  let values: FormValues = { name, slug: lumen().project.slugify(name) };
  const loaded: Record<string, FieldChoice[]> = {};
  const loadedFor: Record<string, string> = {};

  for (let round = 0; round < 16; round++) {
    let changed = false;
    for (const field of fields) {
      const visible = !field.when || field.when(values);
      if (visible && field.loadChoices) {
        const key = JSON.stringify((field.dependsOn ?? []).map((id) => values[id] ?? ''));
        if (loadedFor[field.id] !== key) {
          loaded[field.id] = await field.loadChoices(values, new AbortController().signal);
          loadedFor[field.id] = key;
          changed = true;
        }
      }
      const next = resolve(field, values, overrides, visible ? loaded[field.id] : undefined);
      if (next !== values[field.id]) {
        values = { ...values, [field.id]: next };
        changed = true;
      }
    }
    if (!changed) { break; }
  }

  for (const field of fields) {
    if (!(field.id in overrides) || !isChoice(field)) { continue; }
    if (field.when && !field.when(values)) { continue; }
    const offered = choicesOf(field, values, loaded[field.id]).map((c) => c.value);
    if (!offered.includes(overrides[field.id])) {
      throw new Error(`${template.id}: ${field.id} = ${overrides[field.id]} is not offered (${offered.slice(0, 8).join(', ')} …)`);
    }
  }
  return { values, choices: loaded };
}

function resolve(field: FormField, values: FormValues, overrides: FormValues, loaded: FieldChoice[] | undefined): string {
  if (field.id in overrides) { return overrides[field.id]; }
  const fallback = defaultOf(field, values);
  if (!isChoice(field)) { return fallback ?? (field.type === 'toggle' ? 'false' : ''); }
  const choices = choicesOf(field, values, loaded);
  if (fallback !== undefined && choices.some((c) => c.value === fallback)) { return fallback; }
  return choices[0]?.value ?? fallback ?? '';
}

export async function generate(template: ProjectTemplate, name: string, overrides: FormValues = {}, dir = `/tmp/${name}`) {
  const { values, choices } = await fill(template, name, overrides);
  const ctx: TemplateContext = { name, slug: values.slug, dir, values };
  const files = await template.files(ctx);
  return { values, choices, files, ctx };
}
