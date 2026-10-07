/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { DependencyAction, DependencySpec, DependencySupport, ProjectContext, ProjectMeta } from '@/core/types';
import type { UserDependencyEdit, UserDependencySupport, UserKindDependencyScan } from '../schema';
import { safeRegex, jsonAt, scopedText } from './tasks';

/**
 * Fill in a dependency's placeholders.
 *
 * `{short}` is the last part of the name: for `kemalcr/kemal` the entry in
 * `shard.yml` is called `kemal`, not the whole path.
 *
 * Without a scope the first declared one applies, as the dialog preselects it.
 * `{scope}` names a section in the build file (`dependencies:`), and an empty
 * one would write a heading called `:`.
 */
function dependencyFiller(dep: DependencySpec, separator: string, fallbackScope = '') {
  const [first, ...rest] = dep.name.trim().split(/\s+/);
  const name = first ?? dep.name;
  const spec = dep.version ? `${name}${separator}${dep.version}` : name;
  const values: Record<string, string> = {
    name,
    version: dep.version ?? '',
    scope: dep.scope || fallbackScope,
    spec,
    short: name.split('/').pop() ?? name,
  };
  const fill = (text: string) => text.replace(/\{(name|version|scope|spec|short)\}/g, (_all, key: string) => values[key]);
  /** Does the line contain a placeholder that stays empty? */
  const incomplete = (text: string) => /\{(name|version|scope|spec|short)\}/.test(text)
    && [...text.matchAll(/\{(name|version|scope|spec|short)\}/g)].some((match) => !values[match[1]]);
  return { name, spec, rest, fill, incomplete };
}

/**
 * Write the entry into the build file.
 *
 * Two cases: with the section present the lines go straight after its
 * heading; without it, the section is appended at the end of the file.
 */
async function editDependency(
  ctx: ProjectContext, edit: UserDependencyEdit, dep: DependencySpec, separator: string, fallbackScope: string,
): Promise<DependencyAction> {
  const { fill, incomplete } = dependencyFiller(dep, separator, fallbackScope);
  const text = await ctx.readFile(edit.file);
  if (text === null) {
    throw new Error(`${edit.file} fehlt`);
  }

  const indent = edit.indent ?? '  ';
  const block = edit.lines
    .filter((line) => !incomplete(line))
    .map((line) => `${indent}${fill(line)}`)
    .join('\n');

  const then = edit.then
    ? {
      id: edit.then.id ?? `${edit.then.command}:after-add`,
      label: fill(edit.then.label),
      command: edit.then.command,
      args: edit.then.args.map(fill),
    }
    : undefined;

  const header = safeRegex(fill(edit.sectionPattern), 'm')?.exec(text);
  if (!header) {
    const head = text.replace(/\s*$/, '');
    return { type: 'edit', file: edit.file, content: `${head}\n\n${fill(edit.sectionHeader)}\n${block}\n`, then };
  }
  const at = header.index + header[0].length;
  return { type: 'edit', file: edit.file, content: `${text.slice(0, at)}\n${block}${text.slice(at)}`, then };
}

export function compileDependencies(support: UserDependencySupport | undefined): DependencySupport | undefined {
  const runsCommand = Boolean(support?.command?.trim());
  if (!support || (!runsCommand && !support.edit)) {
    return undefined;
  }
  const separator = support.specSeparator ?? '@';
  const fallbackScope = support.scopes?.[0]?.value ?? '';
  return {
    manager: support.manager || support.command || support.edit?.file || '',
    placeholder: support.placeholder || '',
    hint: support.hint || undefined,
    scopes: support.scopes?.length ? support.scopes : undefined,
    versionRequired: support.versionRequired,
    add: async (ctx, dep) => {
      if (support.edit) {
        return editDependency(ctx, support.edit, dep, separator, fallbackScope);
      }

      // Anything after the name (`serde --features derive`) is kept and moved
      // to the end — the package manager gets it unchanged.
      const { rest, fill } = dependencyFiller(dep, separator, fallbackScope);
      const command = support.command ?? '';
      // Empty arguments fall away: `{version}` without a version should not
      // hand the package manager a stray empty argument.
      const scopeArgs = support.scopeArgs?.[dep.scope ?? ''] ?? [];
      const args = (support.args ?? [])
        .flatMap((arg) => {
          if (arg === '{scopeArgs}') {
            return scopeArgs;
          }
          if (arg === '{rest}') {
            return rest;
          }
          return [fill(arg)];
        })
        .filter((arg) => arg !== '');
      return {
        type: 'task',
        task: {
          id: support.id ?? `${command}:add`,
          label: support.label ? fill(support.label) : `${command} ${args.join(' ')}`,
          command,
          args,
        },
      };
    },
  };
}

function scanScope(scan: UserKindDependencyScan, match: RegExpMatchArray): string {
  if (match[3] && !match[2]) {
    return scan.scope ?? scan.directScope ?? 'direct';
  }
  if (match[3]) {
    return scan.scope ?? scan.indirectScope ?? 'indirect';
  }
  return scan.scope ?? scan.directScope ?? 'direct';
}

/** Read dependencies out of the build file — one pass per entry. */
export async function scanDependencies(
  ctx: ProjectContext, scans: UserKindDependencyScan | UserKindDependencyScan[] | undefined,
): Promise<ProjectMeta['dependencies']> {
  const list = [scans ?? []].flat();
  if (!list.length) {
    return undefined;
  }
  const out: NonNullable<ProjectMeta['dependencies']> = [];
  const cache = new Map<string, string | null>();

  for (const scan of list) {
    if (!scan.file.trim()) {
      continue;
    }
    if (!cache.has(scan.file)) {
      cache.set(scan.file, await ctx.readFile(scan.file));
    }
    const text = cache.get(scan.file);
    if (text === null || text === undefined) {
      continue;
    }
    const skip = scan.skipPattern ? safeRegex(scan.skipPattern) : null;

    // JSON: an object of name → version, the way Composer and npm keep it.
    if (scan.json !== undefined) {
      const node = jsonAt(text, scan.json);
      if (!node || typeof node !== 'object') {
        continue;
      }
      for (const [name, version] of Object.entries(node as Record<string, unknown>)) {
        if (!name || skip?.test(name)) {
          continue;
        }
        out.push({ name, version: typeof version === 'string' ? version : undefined, scope: scan.scope ?? 'direct' });
      }
      continue;
    }

    if (!scan.pattern?.trim()) {
      continue;
    }
    const haystack = scopedText(text, scan.block, scan.section);
    if (!haystack) {
      continue;
    }
    const pattern = safeRegex(scan.pattern, 'gm');
    if (!pattern) {
      continue;
    }
    for (const match of haystack.matchAll(pattern)) {
      const name = match[1]?.trim();
      if (!name || skip?.test(name)) {
        continue;
      }
      // When the version is not in the second group it comes from a second
      // pattern applied to the whole match.
      const fromPattern = scan.versionPattern
        ? safeRegex(scan.versionPattern)?.exec(match[0])?.[1]?.trim()
        : undefined;
      out.push({
        name,
        version: fromPattern ?? (match[2] ?? match[3])?.trim(),
        scope: scanScope(scan, match),
      });
    }
  }
  return out.length ? out : undefined;
}
