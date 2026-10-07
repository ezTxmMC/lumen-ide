/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** What happens right after a folder opens: which language servers start and which files reopen. */

import { registry } from '@/core/registry';
import { lsp } from '@/core/lsp/manager';
import { matchLanguage } from '@/core/editor/language';
import { type ProjectConfig } from '@/core/project/config';
import { nextGroupId } from '../../editor-groups';
import type { EditorGroup } from '../../types';
import type { Ctx } from './context';

/** How many files are looked at to see which languages a project really uses. */
export const LANGUAGE_SAMPLE = 4000;

/**
 * The languages whose servers start with the project: those of its project
 * kinds that actually have files — Maven and Gradle name Java and Kotlin, but
 * a pure Java project needs no Kotlin server. Without a project kind, the most
 * common language of the folder that has a server.
 */
export async function projectServerLanguages(root: string, kindLanguages: string[]): Promise<string[]> {
  const files = await window.lumen.fs.listFiles(root, LANGUAGE_SAMPLE).catch(() => [] as string[]);
  const languages = registry.languages();
  const counts = new Map<string, number>();
  for (const file of files) {
    const id = matchLanguage(file, languages)?.id;
    if (id) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const withServer = (id: string) => Boolean(languages.find((language) => language.id === id)?.lsp?.length);
  if (kindLanguages.length) {
    return kindLanguages.filter((id) => counts.has(id) && withServer(id));
  }
  const top = [...counts.entries()].filter(([id]) => withServer(id)).sort((a, b) => b[1] - a[1])[0];
  return top ? [top[0]] : [];
}

/** Start the chosen language servers of the project, before any file is open. */
export async function startProjectServers({ get }: Ctx, root: string) {
  const s = get();
  if (!s.effects.lsp || !s.effects.lspAutoStart || s.workspace !== root) {
    return;
  }
  const languages = await projectServerLanguages(root, s.project?.languages ?? []);
  for (const id of languages) {
    const spec = registry.languages().find((language) => language.id === id);
    if (spec && get().workspace === root) {
      void lsp.startForProject(spec, s.project?.root ?? root);
    }
  }
}

/** Open the files remembered in the project configuration, into two groups where it was split. */
export async function restoreOpenFiles({ get, set }: Ctx, root: string, config: ProjectConfig) {
  const [first, second] = config.openGroups?.length ? config.openGroups : [config.openFiles ?? []];
  for (const relative of (first ?? []).slice(0, 16)) {
    if (get().workspace !== root) {
      return;
    }
    await get().openFile(`${root}/${relative}`).catch(() => {});
  }
  if (!second?.length) {
    return;
  }
  const extra: EditorGroup = { id: nextGroupId(), tabIds: [], activeTabId: null };
  set((st) => ({ groups: [...st.groups, extra], activeGroupId: extra.id, splitDirection: config.splitDirection ?? 'right' }));
  for (const relative of second.slice(0, 16)) {
    if (get().workspace !== root) {
      return;
    }
    await get().openFile(`${root}/${relative}`).catch(() => {});
  }
  get().focusGroup(0);
}
