/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Adding a dependency to the project through its package manager. */

import { lsp } from '@/core/lsp/manager';
import { projectContext } from '@/core/project/detect';
import type { FormValues } from '@/core/types';
import { t, tr } from '@/i18n';
import type { State, WorkspaceSlice } from '../../types';
import { fromDisk } from '@/lib/editor/line-endings';
import { JVM_MANAGERS, type Ctx } from './context';

/** A project kind that can take dependencies. */
export type DetectedKind = NonNullable<State['project']>['kinds'][number];

/** The “add dependency” form for the kinds that support it. */
export function dependencyForm(get: () => State, kinds: DetectedKind[], preferred: DetectedKind): NonNullable<State['formDialog']> {
  const scopeChoices = (id: string) => kinds.find((k) => k.kind.id === id)?.kind.dependencies?.scopes ?? [];
  const support = (id: string) => kinds.find((k) => k.kind.id === id)?.kind.dependencies;
  const description = kinds.length > 1
    ? t('notify.dependency.chooseManager')
    : t('notify.dependency.via', { manager: preferred.kind.dependencies!.manager });
  const scopeField = {
    id: 'scope', label: t('notify.dependency.scope'), type: 'select' as const,
    default: (v: FormValues) => scopeChoices(v.kind)[0]?.value ?? '',
    choices: kinds.flatMap((k) => k.kind.dependencies?.scopes ?? []).filter((c, i, all) => all.findIndex((x) => x.value === c.value) === i),
    when: (v: FormValues) => scopeChoices(v.kind).length > 0,
  };

  return {
    title: t('notify.dependency.title'),
    description,
    submitLabel: t('common.add'),
    initial: { kind: preferred.kind.id },
    fields: [
      {
        id: 'kind', label: t('notify.dependency.manager'), type: 'select',
        choices: kinds.map((k) => ({ value: k.kind.id, label: `${tr(k.kind.name)} — ${k.kind.dependencies!.manager}` })),
        when: () => kinds.length > 1,
      },
      {
        id: 'name', label: t('notify.dependency.package'), mono: true,
        placeholder: preferred.kind.dependencies!.placeholder,
        hint: preferred.kind.dependencies!.hint,
        suggestions: (v: FormValues) =>
          (JVM_MANAGERS.has(v.kind || preferred.kind.id) ? get().localDependencies : []).map((d) => d.name),
      },
      {
        id: 'version', label: t('common.version'), mono: true, required: false,
        placeholder: t('notify.dependency.versionPlaceholder'),
        // Only the versions of the package typed in that are actually there.
        suggestions: (v: FormValues) =>
          get().localDependencies.find((d) => d.name === v.name?.trim())?.versions ?? [],
      },
      ...(kinds.some((k) => k.kind.dependencies?.scopes?.length) ? [scopeField] : []),
    ],
    onSubmit: async (values) => {
      const kind = values.kind || preferred.kind.id;
      const chosen = support(kind);
      if (!chosen) {
        return t('notify.dependency.managerNotFound');
      }
      if (chosen.versionRequired && !values.version?.trim()) {
        return t('notify.dependency.versionRequired', { manager: chosen.manager });
      }
      const scopes = scopeChoices(kind);
      const scope = scopes.some((c) => c.value === values.scope) ? values.scope : scopes[0]?.value;
      try {
        await get().addDependency(kind, { name: values.name.trim(), version: values.version?.trim() || undefined, scope });
      } catch (err) {
        return (err as Error).message.replace(/^Error: /, '');
      }
    },
  };
}

export function dependencyActions(ctx: Ctx): Pick<WorkspaceSlice, 'addDependency' | 'openDependencyDialog'> {
  const { get, set } = ctx;
  return {
    async addDependency(kindId, dep) {
      const project = get().project;
      const detected = project?.kinds.find((k) => k.kind.id === kindId);
      const support = detected?.kind.dependencies;
      if (!project || !support) {
        throw new Error(t('notify.dependency.unsupported'));
      }

      const pctx = projectContext(project.root, get().platform);
      const action = await support.add(pctx, dep);
      const { runTask } = await import('@/lib/project/run');

      if (action.type === 'task') {
        await runTask(action.task, () => void get().refreshProject());
        return;
      }

      const target = `${project.root}/${action.file}`;
      const tab = get().tabs.find((open) => open.path === target);
      await window.lumen.fs.writeFile(target, action.content);
      if (tab) {
        const { text, eol } = fromDisk(action.content);
        set((s) => ({
          tabs: s.tabs.map((open) => (open.id === tab.id ? { ...open, content: text, saved: text, eol, diskChanged: false } : open)),
        }));
        lsp.changeDocument(target, text);
      }
      get().notify(t('notify.dependency.added', { name: dep.name, file: action.file }), 'success');
      await get().refreshProject();
      if (action.then) {
        await runTask(action.then);
      }
    },

    openDependencyDialog(kindId) {
      const project = get().project;
      const kinds = (project?.kinds ?? []).filter((k) => k.kind.dependencies);
      if (!kinds.length) {
        get().notify(t('notify.dependency.noManager'), 'info');
        return;
      }
      const preferred = kinds.find((k) => k.kind.id === kindId) ?? kinds[0];
      // Load what is already present locally in the background: the dialog is
      // there at once, the suggestions fill in as soon as the search is through.
      if (kinds.some((k) => JVM_MANAGERS.has(k.kind.id))) {
        void get().loadLocalDependencies();
      }
      get().openForm(dependencyForm(get, kinds, preferred));
    },
  };
}
