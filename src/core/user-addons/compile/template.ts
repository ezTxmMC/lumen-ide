/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { FormField, FormValues, ProjectTemplate, TemplateContext } from '@/core/types';
import type { UserTemplate, UserTemplateField } from '../schema';
import type { CompileDeps } from './addon';
import { conditionsHold, conditionHolds, fillPlaceholders } from './template-text';
import { safeRegex } from './tasks';

/** A list from a JSON response, following `choicesPath` and the value/label field names. */
export function extractChoices(data: unknown, field: UserTemplateField): { value: string; label: string; }[] {
  let node: unknown = data;
  for (const key of (field.choicesPath ?? '').split('.').filter(Boolean)) {
    node = (node as Record<string, unknown> | null)?.[key];
  }
  if (!Array.isArray(node)) {
    return [];
  }
  const pick = (item: unknown, path: string | undefined): string => {
    if (typeof item === 'string' || typeof item === 'number') {
      return String(item);
    }
    if (!path || !item || typeof item !== 'object') {
      return '';
    }
    let value: unknown = item;
    for (const key of path.split('.')) {
      value = (value as Record<string, unknown> | null)?.[key];
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    return '';
  };
  const match = field.choicesMatch ? safeRegex(field.choicesMatch) : null;
  const list = node
    .map((item) => {
      const value = pick(item, field.choicesValue);
      return { value, label: pick(item, field.choicesLabel) || value };
    })
    .filter((choice) => choice.value && (!match || match.test(choice.value)));
  if (field.choicesReverse) {
    list.reverse();
  }
  if (field.choicesLimit && field.choicesLimit > 0) {
    return list.slice(0, field.choicesLimit);
  }
  return list;
}

/** The add-on's own project kind (a local id) or an existing one (`maven`, `tool.x`). */
function qualifiedKindId(kindId: string | undefined, addonId: string, localKinds: ReadonlySet<string>): string | undefined {
  if (!kindId) {
    return undefined;
  }
  if (!localKinds.has(kindId)) {
    return kindId;
  }
  return `${addonId}.${kindId}`;
}

/**
 * A default may name other values: `github.com/user/{{slug}}`.
 *
 * Without this a field like a Go module path or a PHP namespace could not have
 * a sensible default at all — the built-in add-ons wrote those as functions,
 * and a manifest has only text. Placeholders are resolved against the values
 * worked out so far, which `resolveValues` settles over several rounds.
 */
function compileDefault(value: string | undefined) {
  if (value === undefined || !value.includes('{{')) {
    return value;
  }
  return (values: FormValues) => fillPlaceholders(value, {
    values,
    name: values.name ?? '',
    slug: values.slug ?? '',
    dir: values.dir ?? '',
  } as TemplateContext);
}

export function compileTemplate(
  template: UserTemplate, addonId: string, deps: CompileDeps = {}, localKinds: ReadonlySet<string> = new Set(),
): ProjectTemplate {
  const kindId = template.kindId;
  const fields: FormField[] = template.fields.map((field) => ({
    id: field.id,
    label: field.label || field.id,
    type: field.type ?? 'text',
    default: compileDefault(field.default),
    placeholder: field.placeholder || undefined,
    hint: field.hint || undefined,
    choices: (field.choicesUrl && deps.remoteChoices?.(field)) || field.choices,
    // Preselect the first loaded entry when no fixed default is given.
    ...(field.choicesUrl && !field.default ? { default: deps.remoteChoices?.(field)?.[0]?.value } : {}),
    pattern: field.pattern || undefined,
    required: field.required,
    section: field.section || undefined,
    mono: field.mono,
    when: field.when?.field ? (values: FormValues) => conditionHolds(field.when, values) : undefined,
  }));
  const conditionalKind = (values: FormValues) => (conditionHolds(template.kindWhen, values)
    ? qualifiedKindId(kindId, addonId, localKinds)
    : undefined);
  return {
    id: `${addonId}.${template.id}`,
    name: template.name,
    description: template.description || undefined,
    languageId: template.languageId || undefined,
    icon: template.icon || undefined,
    color: template.color || undefined,
    fields,
    // When the project kind hangs on a condition it becomes a function, which
    // the core calls with whatever was entered.
    kindId: template.kindWhen ? conditionalKind : qualifiedKindId(kindId, addonId, localKinds),
    files: (ctx) => Object.fromEntries(
      template.files
        .filter((file) => file.path.trim() && conditionsHold(file.when, ctx.values))
        .map((file) => [fillPlaceholders(file.path.trim(), ctx), fillPlaceholders(file.content, ctx)]),
    ),
    open: template.open ? (ctx) => fillPlaceholders(template.open ?? '', ctx) : undefined,
    next: template.next ? (ctx) => fillPlaceholders(template.next ?? '', ctx) : undefined,
    // Placeholders in the program and the label too: which package manager
    // installs is a field of the template (`{{pm}} install`).
    setup: template.setup?.length
      ? (ctx) => (template.setup ?? []).map((step, i) => ({
        id: `${addonId}.${template.id}.setup${i}`,
        label: fillPlaceholders(step.label || step.command, ctx),
        command: fillPlaceholders(step.command, ctx),
        args: step.args.map((arg) => fillPlaceholders(arg, ctx)),
      }))
      : undefined,
  };
}
