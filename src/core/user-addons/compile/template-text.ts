/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { FormValues, TemplateContext } from '@/core/types';
import type { UserCondition } from '../schema';

/** Do all conditions hold? An empty list always does. */
export function conditionsHold(
  conditions: UserCondition | UserCondition[] | undefined, values: FormValues,
): boolean {
  if (!conditions) {
    return true;
  }
  if (!Array.isArray(conditions)) {
    return conditionHolds(conditions, values);
  }
  return conditions.every((condition) => conditionHolds(condition, values));
}

/** Does the condition hold for these values? Without a comparison: set and not `false`. */
export function conditionHolds(condition: UserCondition | undefined, values: FormValues): boolean {
  if (!condition?.field) {
    return true;
  }
  const value = values[condition.field] ?? '';
  if (condition.equals !== undefined) {
    return value === condition.equals;
  }
  if (condition.notEquals !== undefined) {
    return value !== condition.notEquals;
  }
  return value !== '' && value !== 'false';
}

/** `field`, `field=value` or `field!=value` from a block's head. */
function blockCondition(head: string): UserCondition {
  const unequal = /^([\w.-]+)\s*!=\s*(.*)$/.exec(head);
  if (unequal) {
    return { field: unequal[1], notEquals: unequal[2].trim() };
  }
  const equal = /^([\w.-]+)\s*=\s*(.*)$/.exec(head);
  if (equal) {
    return { field: equal[1], equals: equal[2].trim() };
  }
  return { field: head.trim() };
}

const BLOCK = /\{\{#(if|unless)\s+([^}]+?)\s*\}\}((?:(?!\{\{#(?:if|unless)\s)[\s\S])*?)\{\{\/\1\}\}/;

/** Resolve blocks innermost first, so nesting works. */
function resolveBlocks(text: string, values: FormValues): string {
  let out = text;
  for (let guard = 0; guard < 500; guard++) {
    const match = BLOCK.exec(out);
    if (!match) {
      return out;
    }
    const holds = conditionHolds(blockCondition(match[2]), values);
    const keep = match[1] === 'if' ? holds : !holds;
    out = out.slice(0, match.index) + (keep ? match[3] : '') + out.slice(match.index + match[0].length);
  }
  return out;
}

/** Words of a value (`my-project`, `MyProject`, `my_project` → my, project). */
function words(value: string): string[] {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** Filters after `|`: packages as paths, class names, spellings. */
export const PLACEHOLDER_FILTERS: Record<string, (value: string) => string> = {
  path: (value) => value.replace(/\./g, '/'),
  lower: (value) => value.toLowerCase(),
  upper: (value) => value.toUpperCase(),
  pascal: (value) => words(value).map(capitalize).join(''),
  camel: (value) => words(value).map((word, i) => (i === 0 ? word.toLowerCase() : capitalize(word))).join(''),
  snake: (value) => words(value).map((word) => word.toLowerCase()).join('_'),
  // Letters and digits only, lower case — for identifiers that tolerate no
  // separators; a Go package name may not contain an underscore.
  alnum: (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ''),
  kebab: (value) => words(value).map((word) => word.toLowerCase()).join('-'),
  // For values that end up inside a JSON string: a PHP namespace such as
  // `Acme\\Demo` has to appear there with doubled backslashes, or the file is
  // broken. The surrounding quotes are dropped — the template already has them.
  json: (value) => JSON.stringify(value).slice(1, -1),
};

/**
 * Replaces `{{name}}`, `{{slug}}`, `{{dir}}` and `{{field}}` — filters included,
 * as in `{{group|path}}` or `{{name|pascal}}` — and resolves `{{#if}}` and
 * `{{#unless}}` blocks.
 */
export function fillPlaceholders(text: string, ctx: TemplateContext): string {
  const values: FormValues = { ...ctx.values, name: ctx.name, slug: ctx.slug, dir: ctx.dir };
  return resolveBlocks(text, values).replace(/\{\{\s*([\w.-]+)\s*(?:\|\s*(\w+)\s*)?\}\}/g, (match, key: string, filter?: string) => {
    const value = values[key];
    if (value === undefined) {
      return match;
    }
    const apply = filter ? PLACEHOLDER_FILTERS[filter] : undefined;
    if (filter && !apply) {
      return match;
    }
    return apply ? apply(value) : value;
  });
}
