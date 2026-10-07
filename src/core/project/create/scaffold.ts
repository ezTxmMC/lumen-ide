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
 * Creates a new project from a template: resolve and check the field values,
 * make the folders, write the files. The templates come from the add-ons
 * (`Addon.projectTemplates`).
 */

import type { FormField, FormValues, ProjectTask, ProjectTemplate, TemplateContext } from '@/core/types';
import { t, tr } from '@/i18n';
import { choicesSettled, fieldChoices, isChoiceField, type LoadedChoices } from './choices';

/** `My Project!` → `my-project` */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'projekt';
}

/** `My Project` → `myproject` — for Java packages and identifiers. */
export function identifier(name: string): string {
  const id = slugify(name).replace(/-/g, '');
  return /^[0-9]/.test(id) ? `p${id}` : id;
}

/** `my-project` → `MyProject` */
export function pascalCase(name: string): string {
  const words = slugify(name).split('-').filter(Boolean);
  const out = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  if (!out) {
    return 'App';
  }
  return /^[0-9]/.test(out) ? `P${out}` : out;
}

/** `my-project` → `my_project` — Python packages, Rust crates, C identifiers. */
export function snakeCase(name: string): string {
  const id = slugify(name).replace(/-/g, '_');
  return /^[0-9]/.test(id) ? `p_${id}` : id;
}

export function isValidPackage(pkg: string): boolean {
  return /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/.test(pkg);
}

/** The fields visible at the current values. */
export function visibleFields(fields: FormField[], values: FormValues): FormField[] {
  return fields.filter((f) => !f.when || f.when(values));
}

/**
 * Resolve the values: what the user typed wins, otherwise the defaults — and
 * derived defaults are evaluated repeatedly until they settle (artifactId from
 * the name, the package from groupId and artifactId).
 *
 * A select or combobox only ever holds one of its choices: when the value —
 * typed or default — is not on the list (the list was fetched afresh for
 * another Minecraft version, say), the default takes its place if it is on
 * the list, else the first choice. A list still loading leaves the value be.
 */
export function resolveValues(
  fields: FormField[], base: FormValues, touched: FormValues = {}, loaded: LoadedChoices = {},
): FormValues {
  let values: FormValues = { ...base, ...touched };
  for (let round = 0; round < 6; round++) {
    const next: FormValues = { ...values };
    for (const field of fields) {
      next[field.id] = resolveField(field, values, touched, loaded);
    }
    const stable = fields.every((f) => next[f.id] === values[f.id]);
    values = next;
    if (stable) {
      break;
    }
  }
  return values;
}

function defaultOf(field: FormField, values: FormValues): string | undefined {
  if (typeof field.default !== 'function') {
    return field.default;
  }
  try {
    return field.default(values);
  } catch {
    return undefined;
  }
}

function resolveField(field: FormField, values: FormValues, touched: FormValues, loaded: LoadedChoices): string {
  const fallback = defaultOf(field, values);
  if (!isChoiceField(field)) {
    if (field.id in touched) {
      return touched[field.id];
    }
    return fallback ?? (field.type === 'toggle' ? 'false' : '');
  }
  const choices = fieldChoices(field, values, loaded);
  const wanted = field.id in touched ? touched[field.id] : fallback;
  if (!choicesSettled(field, values, loaded) || !choices.length) {
    return wanted ?? choices[0]?.value ?? '';
  }
  if (wanted !== undefined && choices.some((c) => c.value === wanted)) {
    return wanted;
  }
  if (fallback !== undefined && choices.some((c) => c.value === fallback)) {
    return fallback;
  }
  return choices[0].value;
}

/**
 * The error message per field, for visible fields only. Given the load
 * states, a field whose choices are still loading or failed counts as not
 * ready yet — a form can't be submitted on a list nobody has seen.
 */
export function validateValues(fields: FormField[], values: FormValues, loaded?: LoadedChoices): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of visibleFields(fields, values)) {
    const value = (values[field.id] ?? '').trim();
    const type = field.type ?? 'text';
    const state = loaded && field.loadChoices ? loaded[field.id] : undefined;
    if (loaded && field.loadChoices && (!state || state.status === 'loading')) {
      errors[field.id] = t('forms.choices.loading');
      continue;
    }
    if (state?.status === 'error') {
      errors[field.id] = t('forms.choices.failed');
      continue;
    }
    if (type === 'combobox' && !value && field.required !== false) {
      errors[field.id] = t('forms.required');
      continue;
    }
    if (type !== 'text') {
      continue;
    }
    if (!value && field.required !== false) {
      errors[field.id] = t('forms.required');
      continue;
    }
    if (!value || !field.pattern) {
      continue;
    }
    if (new RegExp(`^(?:${field.pattern})$`).test(value)) {
      continue;
    }
    errors[field.id] = field.patternHint ? tr(field.patternHint) : t('forms.invalid');
  }
  return errors;
}

export function templateContext(
  template: ProjectTemplate, parentDir: string, name: string, values: FormValues,
): TemplateContext {
  const slug = slugify(name);
  return {
    name,
    slug,
    dir: `${parentDir.replace(/[\\/]$/, '')}/${slug}`,
    values: resolveValues(template.fields ?? [], { name, slug }, values),
  };
}

export interface ScaffoldResult {
  dir: string;
  written: string[];
  open: string | null;
  setup: ProjectTask[];
  next: string | null;
}

/** Where creating a project stands — for a progress display. */
export type ScaffoldProgress =
  | { step: 'check'; }
  | { step: 'generate'; }
  | { step: 'write'; done: number; total: number; };

export async function scaffoldProject(
  template: ProjectTemplate,
  parentDir: string,
  name: string,
  values: FormValues,
  onProgress?: (progress: ScaffoldProgress) => void,
): Promise<ScaffoldResult> {
  onProgress?.({ step: 'check' });
  const ctx = templateContext(template, parentDir, name, values);
  const errors = validateValues(template.fields ?? [], ctx.values);
  const firstError = Object.entries(errors)[0];
  if (firstError) {
    const label = tr(template.fields?.find((f) => f.id === firstError[0])?.label) || firstError[0];
    throw new Error(`${label}: ${firstError[1]}`);
  }

  if (await window.lumen.fs.exists(ctx.dir)) {
    const entries = await window.lumen.fs.list(ctx.dir);
    if (entries.length > 0) {
      throw new Error(t('forms.notEmpty', { name: ctx.slug }));
    }
  }

  onProgress?.({ step: 'generate' });
  const files = await template.files(ctx);
  await window.lumen.fs.create(ctx.dir, true);
  const written: string[] = [];
  const generated = Object.entries(files);
  for (const [relative, content] of generated) {
    onProgress?.({ step: 'write', done: written.length, total: generated.length });
    const target = `${ctx.dir}/${relative.replace(/^[\\/]/, '')}`;
    const text = content === '' || content.endsWith('\n') ? content : `${content}\n`;
    await window.lumen.fs.writeFile(target, text);
    written.push(relative);
  }

  const open = typeof template.open === 'function' ? template.open(ctx) : template.open;
  const next = typeof template.next === 'function' ? template.next(ctx) : template.next;
  return {
    dir: ctx.dir,
    written,
    open: open ? `${ctx.dir}/${open}` : null,
    setup: template.setup?.(ctx) ?? [],
    next: next ?? null,
  };
}

/** Standard .gitignore building blocks for the templates. */
export const GITIGNORE = {
  java: 'target/\nbuild/\n.gradle/\nout/\n*.class\n*.jar\n!gradle/wrapper/*.jar\n.idea/\n*.iml\n',
  c: 'build/\nbuilddir/\n*.o\n*.a\n*.so\n*.out\ncompile_commands.json\n.cache/\n.xmake/\nvcpkg_installed/\nCMakeUserPresets.json\n',
  node: 'node_modules/\ndist/\n.env\n*.log\n.astro/\n.angular/\n',
  python: '__pycache__/\n*.py[cod]\n.venv/\n.pytest_cache/\n.ruff_cache/\ndist/\n*.egg-info/\n',
  rust: 'target/\n',
  go: 'bin/\n*.test\n',
  php: 'vendor/\n.phpunit.cache/\n',
  dotnet: 'bin/\nobj/\n*.user\n.vs/\n',
  crystal: 'lib/\nbin/\n.shards/\n',
  novus: 'build/\n',
};
