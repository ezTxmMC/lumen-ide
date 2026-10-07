/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ProjectContext, ProjectKind, ProjectMeta } from '@/core/types';
import type { UserProjectKind } from '../schema';
import { ruleHolds, factValue, kindTasks } from './tasks';
import { compileDependencies, scanDependencies } from './dependencies';

/** Name, version, description and the free-form facts of a project. */
async function inspectKind(kind: UserProjectKind, ctx: ProjectContext): Promise<ProjectMeta> {
  const meta: ProjectMeta = { facts: {}, buildFile: kind.buildFile, sourceRoots: kind.sourceRoots };
  meta.dependencies = await scanDependencies(ctx, kind.dependencyScan);
  for (const fact of kind.facts ?? []) {
    const text = await ctx.readFile(fact.file);
    const value = text === null ? undefined : factValue(text, fact);
    if (!value) {
      continue;
    }
    if (fact.role === 'name') {
      meta.name = value;
      continue;
    }
    if (fact.role === 'version') {
      meta.version = value;
      continue;
    }
    if (fact.role === 'description') {
      meta.description = value;
      continue;
    }
    meta.facts![fact.label || fact.file] = value;
  }
  // No facts, no empty field: a project kind without `facts` should have
  // the same shape as a hand-written one.
  if (!Object.keys(meta.facts ?? {}).length) {
    delete meta.facts;
  }
  return meta;
}

export function compileProjectKind(kind: UserProjectKind, addonId: string): ProjectKind {
  const id = `${addonId}.${kind.id}`;
  const rules = kind.rules ?? [];
  return {
    id,
    name: kind.name || kind.id,
    icon: kind.icon || undefined,
    color: kind.color || undefined,
    markers: kind.markers,
    priority: kind.priority,
    languageIds: kind.languageIds?.length ? kind.languageIds : undefined,
    role: 'build',
    dependencies: compileDependencies(kind.dependencies),
    async detect(ctx) {
      // Markers with `*` are checked by the core; a rule without a file cannot exist.
      for (const rule of rules) {
        if (!(await ruleHolds(ctx, rule))) {
          return false;
        }
      }
      return true;
    },
    tasks: (ctx) => kindTasks(id, kind, ctx),
    inspect: (ctx) => inspectKind(kind, ctx),
  };
}
