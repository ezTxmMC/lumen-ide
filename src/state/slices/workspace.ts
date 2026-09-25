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
 * The opened folder, the workspace of several folders around it, and the
 * project detected in the active one — its kinds, tasks, configuration and
 * dependencies.
 */

import { isProjectsWindow } from '@/lib/window-mode';
import { registry } from '@/core/registry';
import { lsp } from '@/core/lsp/manager';
import { matchLanguage } from '@/core/language';
import { detectProject, projectContext } from '@/core/project/detect';
import {
  EMPTY_PROJECT_CONFIG, loadProjectConfig, projectConfigFile, saveProjectConfig, type ProjectConfig,
} from '@/core/project/config';
import { scaffoldProject } from '@/core/project/scaffold';
import type { FormValues } from '@/core/types';
import { t, tr } from '@/i18n';
import { baseName, isWorkspaceDef, WORKSPACE_COLORS } from '../helpers';
import { nextGroupId } from '../editor-groups';
import { captureSession, rememberOpenFiles, restoreSession } from '../session';
import type { EditorGroup, RecentProject, Slice, State, WorkspaceDef, WorkspaceSlice } from '../types';
import { fromDisk } from '@/lib/line-endings';

/** Project kinds whose dependencies come from ~/.m2 or the Gradle cache. */
const JVM_MANAGERS = new Set(['maven', 'gradle']);

/** How many files are looked at to see which languages a project really uses. */
const LANGUAGE_SAMPLE = 4000;

/**
 * The languages whose servers start with the project: those of its project
 * kinds that actually have files — Maven and Gradle name Java and Kotlin, but
 * a pure Java project needs no Kotlin server. Without a project kind, the most
 * common language of the folder that has a server.
 */
async function projectServerLanguages(root: string, kindLanguages: string[]): Promise<string[]> {
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

const emptyConfig = (): ProjectConfig => structuredClone(EMPTY_PROJECT_CONFIG);

interface Ctx {
  get: () => State;
  set: Parameters<Slice<WorkspaceSlice>>[0];
  remember: (root: string) => Promise<void>;
  capture: () => void;
}

/** Start the chosen language servers of the project, before any file is open. */
async function startProjectServers({ get }: Ctx, root: string) {
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
async function restoreOpenFiles({ get, set }: Ctx, root: string, config: ProjectConfig) {
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

function folderActions(ctx: Ctx): Pick<WorkspaceSlice, 'openFolder' | 'setWorkspace'> {
  const { get, set, remember } = ctx;
  return {
    async openFolder() {
      const root = await window.lumen.dialog.openFolder();
      if (!root) {
        return;
      }
      await get().setWorkspace(root);
    },

    async setWorkspace(root, options = {}) {
      // The project screen's own window opens nothing itself: the main window takes the project.
      if (isProjectsWindow) {
        await window.lumen.window.openProject(root);
        return;
      }
      const previous = get().workspace;
      if (previous && previous !== root && !options.keepTabs) {
        await remember(previous);
        get().closeAll();
      }
      // A single folder outside the workspace leaves it.
      const ws = get().workspaces.find((w) => w.id === get().currentWorkspaceId);
      if (ws && !ws.folders.includes(root)) {
        set({ currentWorkspaceId: null, extraFolders: [] });
      }

      await window.lumen.workspace.set(root, get().extraFolders.filter((f) => f !== root));
      lsp.setWorkspace(root);

      const recent: RecentProject[] = [
        { ...(get().recentProjects.find((p) => p.path === root) ?? { name: baseName(root) }), path: root, openedAt: Date.now() },
        ...get().recentProjects.filter((p) => p.path !== root),
      ].slice(0, 12);

      set({ workspace: root, recentProjects: recent, project: null, projectConfig: emptyConfig(), references: null });
      get().persist();

      const config = await loadProjectConfig(root);
      if (get().workspace !== root) {
        return;
      }
      lsp.setPreferred(config.lsp);
      set({ projectConfig: config });

      await get().refreshProject();
      void startProjectServers(ctx, root);

      if (options.restoreFiles === false || !get().effects.restoreOpenFiles || get().tabs.length > 0) {
        return;
      }
      await restoreOpenFiles(ctx, root, config);
    },
  };
}

function workspaceSwitchActions(ctx: Ctx): Pick<WorkspaceSlice, 'closeWorkspace' | 'openWorkspace'> {
  const { get, set, remember, capture } = ctx;
  return {
    async closeWorkspace() {
      const previous = get().workspace;
      const dirty = get().tabs.filter((tab) => tab.content !== tab.saved && !tab.readonly);
      if (dirty.length > 0 && !confirm(t('notify.closeUnsaved', { count: dirty.length, names: dirty.map((tab) => `• ${tab.name}`).join('\n') }))) {
        return;
      }
      if (previous) {
        await remember(previous);
      }
      capture();
      get().closeAll();
      lsp.setWorkspace(null);
      set({
        workspace: null, extraFolders: [], currentWorkspaceId: null, project: null,
        projectConfig: emptyConfig(), references: null,
      });
      get().persist();
      // The window goes with the project; the project screen's window takes over.
      if (!isProjectsWindow) {
        await window.lumen.window.closeToProjects();
      }
    },

    async openWorkspace(id) {
      const target = get().workspaces.find((w) => w.id === id);
      if (!target) {
        return;
      }
      if (isProjectsWindow) {
        await window.lumen.window.handOver({ workspace: id });
        return;
      }
      const previous = get().workspace;
      if (previous) {
        await remember(previous);
      }
      capture();
      get().closeAll();

      const existing: string[] = [];
      for (const folder of target.folders) {
        if (await window.lumen.fs.exists(folder)) {
          existing.push(folder);
        }
      }
      if (!existing.length) {
        get().notify(t('workspaces.missingFolders', { name: target.name }), 'error');
        return;
      }
      const active = existing.includes(target.activeFolder) ? target.activeFolder : existing[0];
      set((s) => ({
        currentWorkspaceId: target.id,
        extraFolders: existing.filter((f) => f !== active),
        workspaces: s.workspaces.map((w) => (w.id === target.id ? { ...w, openedAt: Date.now(), activeFolder: active } : w)),
        // A folder change without closing: reset `workspace` so that setWorkspace reloads cleanly.
        workspace: null,
      }));
      await get().setWorkspace(active, { keepTabs: true, restoreFiles: !target.session });
      if (target.session) {
        await restoreSession(get, set, target.session, nextGroupId);
      }
      get().persist();
    },
  };
}

function workspaceListActions(ctx: Ctx): Pick<WorkspaceSlice, 'saveWorkspace' | 'updateWorkspace' | 'deleteWorkspace' | 'exportWorkspace' | 'importWorkspace' | 'removeRecent' | 'loadLocalDependencies'> {
  const { get, set, capture } = ctx;
  return {
    saveWorkspace(name) {
      const s = get();
      if (!s.workspace) {
        return null;
      }
      const folders = [s.workspace, ...s.extraFolders];
      const current = s.workspaces.find((w) => w.id === s.currentWorkspaceId);
      if (current && !name) {
        const updated = { ...current, folders, activeFolder: s.workspace };
        set({ workspaces: s.workspaces.map((w) => (w.id === current.id ? updated : w)) });
        capture();
        get().persist();
        return updated;
      }
      const def: WorkspaceDef = {
        id: `ws-${Date.now().toString(36)}`,
        name: name || baseName(s.workspace),
        color: WORKSPACE_COLORS[s.workspaces.length % WORKSPACE_COLORS.length],
        folders,
        activeFolder: s.workspace,
        openedAt: Date.now(),
      };
      set({ workspaces: [...s.workspaces, def], currentWorkspaceId: def.id });
      capture();
      get().persist();
      return def;
    },

    updateWorkspace(id, patch) {
      set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
      get().persist();
    },

    deleteWorkspace(id) {
      set((s) => ({
        workspaces: s.workspaces.filter((w) => w.id !== id),
        currentWorkspaceId: s.currentWorkspaceId === id ? null : s.currentWorkspaceId,
      }));
      get().persist();
    },

    async exportWorkspace(id) {
      const def = get().workspaces.find((w) => w.id === id);
      if (!def) {
        return;
      }
      const target = await window.lumen.dialog.saveFile(`${def.name.replace(/[^\w.-]+/g, '-')}.lumen-workspace.json`);
      if (!target) {
        return;
      }
      const { session: _session, ...portable } = def;
      void _session;
      await window.lumen.fs.writeFile(target, `${JSON.stringify({ schema: 1, ...portable }, null, 2)}\n`);
      get().notify(t('workspaces.exported', { name: def.name }), 'success');
    },

    async importWorkspace() {
      const picked = await window.lumen.dialog.openFile();
      if (!picked) {
        return;
      }
      try {
        const parsed = JSON.parse(picked.content) as Partial<WorkspaceDef>;
        const candidate = { ...parsed, id: `ws-${Date.now().toString(36)}`, openedAt: Date.now(), color: parsed.color ?? WORKSPACE_COLORS[0] };
        if (!isWorkspaceDef(candidate)) {
          throw new Error('invalid');
        }
        set((s) => ({ workspaces: [...s.workspaces, candidate] }));
        get().persist();
        get().notify(t('workspaces.imported', { name: candidate.name }), 'success');
      } catch {
        get().notify(t('workspaces.invalidFile'), 'error');
      }
    },

    removeRecent(path) {
      set((s) => ({ recentProjects: s.recentProjects.filter((p) => p.path !== path) }));
      get().persist();
    },

    async loadLocalDependencies() {
      if (get().localDependencies.length) {
        return;
      }
      const list = await window.lumen.deps.local().catch(() => []);
      set({ localDependencies: list });
    },
  };
}

function workspaceFolderActions(ctx: Ctx): Pick<WorkspaceSlice, 'addFolderToWorkspace' | 'removeFolderFromWorkspace' | 'setActiveFolder'> {
  const { get, set } = ctx;
  return {
    async addFolderToWorkspace(path) {
      const folder = path ?? await window.lumen.dialog.chooseFolder(t('workspaces.chooseFolder'));
      if (!folder) {
        return;
      }
      const s = get();
      if (!s.workspace) {
        await get().setWorkspace(folder);
        return;
      }
      if (folder === s.workspace || s.extraFolders.includes(folder)) {
        return;
      }
      const extraFolders = [...s.extraFolders, folder];
      set({ extraFolders });
      await window.lumen.workspace.set(s.workspace, extraFolders);
      if (!get().currentWorkspaceId) {
        get().saveWorkspace(baseName(s.workspace));
      }
      const current = get().workspaces.find((w) => w.id === get().currentWorkspaceId);
      if (current) {
        set((st) => ({
          workspaces: st.workspaces.map((w) => (w.id === current.id ? { ...w, folders: [st.workspace!, ...extraFolders] } : w)),
        }));
      }
      get().persist();
      get().notify(t('workspaces.folderAdded', { name: baseName(folder) }), 'success');
    },

    async removeFolderFromWorkspace(path) {
      const s = get();
      if (path === s.workspace) {
        const next = s.extraFolders[0];
        if (!next) {
          return;
        }
        await get().setActiveFolder(next);
      }
      const extraFolders = get().extraFolders.filter((f) => f !== path);
      set({ extraFolders });
      if (get().workspace) {
        await window.lumen.workspace.set(get().workspace!, extraFolders);
      }
      const prefix = `${path}/`;
      for (const tab of get().tabs.filter((tb) => tb.path && !tb.virtual && tb.path.startsWith(prefix) && tb.content === tb.saved)) {
        get().closeTabEverywhere(tab.id);
      }
      set((st) => ({
        workspaces: st.workspaces.map((w) => (w.id === st.currentWorkspaceId
          ? { ...w, folders: w.folders.filter((f) => f !== path), activeFolder: st.workspace ?? w.activeFolder }
          : w)),
      }));
      get().persist();
    },

    async setActiveFolder(path) {
      const s = get();
      if (path === s.workspace) {
        return;
      }
      const folders = [s.workspace, ...s.extraFolders].filter((f): f is string => Boolean(f));
      if (!folders.includes(path)) {
        return;
      }
      set({ extraFolders: folders.filter((f) => f !== path) });
      await get().setWorkspace(path, { keepTabs: true, restoreFiles: false });
      set((st) => ({
        workspaces: st.workspaces.map((w) => (w.id === st.currentWorkspaceId ? { ...w, activeFolder: path } : w)),
      }));
      get().persist();
    },
  };
}

function projectActions(ctx: Ctx): Pick<WorkspaceSlice, 'refreshProject' | 'reloadProjectConfig'> {
  const { get, set } = ctx;
  return {
    async refreshProject() {
      const root = get().workspace;
      if (!root) {
        return;
      }
      set({ projectLoading: true });
      try {
        const info = await detectProject(root, registry.projectKinds(), get().platform);
        if (get().workspace !== root) {
          return;
        }
        const name = get().projectConfig.name ?? info.name;
        set((s) => ({
          project: { ...info, name },
          projectLoading: false,
          recentProjects: s.recentProjects.map((p) => {
            if (p.path !== root) {
              return p;
            }
            // Project kinds may carry their name as a translation key.
            return { ...p, name, kind: tr(info.primary?.kind.name), color: info.primary?.kind.color, icon: info.primary?.kind.icon };
          }),
        }));
        get().persist();
      } catch (err) {
        set({ projectLoading: false });
        get().notify(t('notify.projectDetectFailed', { error: (err as Error).message }), 'warning');
      }
    },

    async reloadProjectConfig() {
      const root = get().workspace;
      if (!root) {
        return;
      }
      const config = await loadProjectConfig(root);
      if (get().workspace !== root) {
        return;
      }
      lsp.setPreferred(config.lsp);
      set((s) => ({
        projectConfig: config,
        project: s.project ? { ...s.project, name: config.name || s.project.name } : null,
      }));
    },

  };
}

function projectConfigActions(ctx: Ctx): Pick<WorkspaceSlice, 'updateProjectConfig' | 'openProjectConfig' | 'setPreferredLsp'> {
  const { get, set } = ctx;
  return {
    async updateProjectConfig(patch) {
      const root = get().workspace;
      if (!root) {
        return;
      }
      const config: ProjectConfig = { ...get().projectConfig, ...patch };
      set({ projectConfig: config });
      if (patch.lsp) {
        lsp.setPreferred(config.lsp);
      }
      if (patch.name !== undefined && get().project) {
        set((s) => ({ project: s.project ? { ...s.project, name: patch.name || s.project.name } : null }));
      }
      try {
        await saveProjectConfig(root, config);
      } catch (err) {
        get().notify(t('notify.projectConfigNotSaved', { error: (err as Error).message }), 'error');
      }
    },

    async openProjectConfig() {
      const root = get().workspace;
      if (!root) {
        return;
      }
      const file = await projectConfigFile(root);
      if (!(await window.lumen.fs.exists(file))) {
        await saveProjectConfig(root, get().projectConfig);
      }
      await get().openFile(file);
    },

    async setPreferredLsp(languageId, label) {
      const next = { ...get().projectConfig.lsp };
      delete next[languageId];
      if (label) {
        next[languageId] = label;
      }
      await get().updateProjectConfig({ lsp: next });
      get().notify(label ? t('notify.lspPreferred', { name: label }) : t('notify.lspPreferenceRemoved'), 'info');
      // The new server takes over at once — for the open files and for the project itself.
      const spec = registry.languages().find((language) => language.id === languageId);
      const s = get();
      if (spec && s.effects.lsp) {
        await lsp.applyPreference(spec, s.project?.root ?? s.workspace);
      }
    },
  };
}

function createProjectAction(ctx: Ctx): Pick<WorkspaceSlice, 'createProject'> {
  const { get, set } = ctx;
  return {
    async createProject(template, parentDir, name, values, options = {}) {
      const result = await scaffoldProject(template, parentDir, name, values, options.onProgress);
      set({ newProjectOpen: false });
      const tasks = [
        ...(options.git ? [{ id: 'setup:git', label: 'git init', command: 'git', args: ['init', '-q'] }] : []),
        ...(options.setup ? result.setup : []),
      ];
      // A window of its own: that window runs the setup when the project arrives there.
      if (options.window === 'new' && get().workspace) {
        const { handOverSetup } = await import('@/core/project/setup-handover');
        handOverSetup(result.dir, tasks, result.open);
        await window.lumen.window.openProject(result.dir);
        get().notify(t('notify.projectCreated', { name }), 'success');
        return;
      }
      await get().setWorkspace(result.dir);
      if (result.open) {
        await get().openFile(result.open).catch(() => {});
      }
      get().showView('project');
      get().notify(result.next ? t('notify.projectCreatedNext', { next: tr(result.next) }) : t('notify.projectCreated', { name }), 'success');

      if (!tasks.length) {
        return;
      }
      const { runTasks } = await import('@/lib/run');
      await runTasks(tasks, result.dir, () => void get().refreshProject());
    },
  };
}

/** A project kind that can take dependencies. */
type DetectedKind = NonNullable<State['project']>['kinds'][number];

/** The “add dependency” form for the kinds that support it. */
function dependencyForm(get: () => State, kinds: DetectedKind[], preferred: DetectedKind): NonNullable<State['formDialog']> {
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

function dependencyActions(ctx: Ctx): Pick<WorkspaceSlice, 'addDependency' | 'openDependencyDialog'> {
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
      const { runTask } = await import('@/lib/run');

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

export const createWorkspaceSlice: Slice<WorkspaceSlice> = (set, get) => {
  const ctx: Ctx = {
    get,
    set,
    remember: (root) => rememberOpenFiles(get, set, root),
    capture: () => captureSession(get, set),
  };

  return {
    workspace: null,
    extraFolders: [],
    workspaces: [],
    currentWorkspaceId: null,
    recentProjects: [],
    localDependencies: [],
    project: null,
    projectConfig: emptyConfig(),
    projectLoading: false,
    ...folderActions(ctx),
    ...workspaceSwitchActions(ctx),
    ...workspaceListActions(ctx),
    ...workspaceFolderActions(ctx),
    ...projectActions(ctx),
    ...projectConfigActions(ctx),
    ...createProjectAction(ctx),
    ...dependencyActions(ctx),
  };
};
