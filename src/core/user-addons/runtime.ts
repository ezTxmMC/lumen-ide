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
 * The runtime of user add-ons in the renderer: a real `GraphHost` — editor,
 * store, files, processes — along with commands and events.
 *
 * Events are recognised through a store subscription:
 * - file opened: a new tab with a path
 * - file saved: a tab's `saved` changes to the current contents after it had
 *   unsaved changes, or after it gains a path for the first time
 * - tab changed: `activeTabId` changes
 */

import { useStore } from '@/state/store';
import { editorBridge } from '@/lib/editor-bridge';
import { findTask, runTask } from '@/lib/run';
import { runCommandById } from '@/core/commands';
import { registry } from '@/core/registry';
import { t } from '@/i18n';
import type { Effects } from '@/core/theme';
import { NODE_CATALOG, TOGGLE_SETTINGS, type EventKind } from './catalog';
import {
  eventNodes, GraphError, runGraph, toText, type GraphHost, type GraphTrace,
} from './interpreter';
import type { Graph, UserAddonModel, UserCommand } from './schema';

const SHELL_ALLOWED_KEY = 'lumen.userAddons.shellAllowed';
/** Concurrent runs per add-on — which guards against event avalanches. */
const MAX_CONCURRENT = 16;

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

const isAbsolute = (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');

function normalize(p: string): string {
  const drive = /^[A-Za-z]:/.exec(p)?.[0] ?? '';
  const parts: string[] = [];
  for (const part of p.slice(drive.length).split(/[\\/]+/)) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `${drive}/${parts.join('/')}`;
}

/** Resolve a path relative to the workspace folder; nothing outside is allowed. */
export function resolveWorkspacePath(input: string): string {
  const root = useStore.getState().workspace;
  if (!root) {
    throw new Error(t('addonStudio.run.noWorkspace'));
  }
  if (!input.trim()) {
    throw new Error(t('addonStudio.run.emptyPath'));
  }
  const base = normalize(root);
  const target = normalize(isAbsolute(input) ? input : `${root}/${input}`);
  if (target !== base && !target.startsWith(`${base}/`)) {
    throw new Error(t('addonStudio.run.outsideWorkspace', { path: input }));
  }
  // On Windows the path starts with the drive, not with `/`.
  return /^\/[A-Za-z]:/.test(target) ? target.slice(1) : target;
}

/* ------------------------------------------------------------------ *
 * Dialogs as promises
 * ------------------------------------------------------------------ */

function formPromise(spec: Parameters<ReturnType<typeof useStore.getState>['openForm']>[0], pickValue: (values: Record<string, string>) => string) {
  return new Promise<string | null>((resolve) => {
    let done = false;
    const finish = (value: string | null) => {
      if (done) {
        return;
      }
      done = true;
      unsubscribe();
      resolve(value);
    };
    const wrapped = {
      ...spec,
      onSubmit: (values: Record<string, string>) => finish(pickValue(values)),
    };
    const unsubscribe = useStore.subscribe((state) => {
      if (state.formDialog !== wrapped) {
        finish(null);
      }
    });
    useStore.getState().openForm(wrapped);
  });
}

function shellAllowed(addonId: string): boolean {
  try {
    const list = JSON.parse(localStorage.getItem(SHELL_ALLOWED_KEY) ?? '[]') as string[];
    return list.includes(addonId);
  } catch {
    return false;
  }
}

function allowShell(addonId: string) {
  try {
    const list = JSON.parse(localStorage.getItem(SHELL_ALLOWED_KEY) ?? '[]') as string[];
    localStorage.setItem(SHELL_ALLOWED_KEY, JSON.stringify([...new Set([...list, addonId])]));
  } catch {
    // Without storage the question comes back next time.
  }
}

/* ------------------------------------------------------------------ *
 * Host
 * ------------------------------------------------------------------ */

const view = () => editorBridge.view;

export const rendererHost: GraphHost = {
  selection() {
    const v = view();
    if (!v) {
      return '';
    }
    const range = v.state.selection.main;
    return v.state.sliceDoc(range.from, range.to);
  },
  replaceSelection(text) {
    const v = view();
    if (!v) {
      throw new Error(t('addonStudio.run.noEditor'));
    }
    v.dispatch(v.state.replaceSelection(text));
  },
  insert(text) {
    const v = view();
    if (!v) {
      throw new Error(t('addonStudio.run.noEditor'));
    }
    const head = v.state.selection.main.head;
    v.dispatch({ changes: { from: head, insert: text }, selection: { anchor: head + text.length } });
  },
  documentText() {
    const v = view();
    if (v) {
      return v.state.doc.toString();
    }
    return useStore.getState().activeTab()?.content ?? '';
  },
  currentLine() {
    const v = view();
    if (!v) {
      return { text: '', number: 0 };
    }
    const line = v.state.doc.lineAt(v.state.selection.main.head);
    return { text: line.text, number: line.number };
  },
  filePath: () => useStore.getState().activeTab()?.path ?? '',
  languageId: () => useStore.getState().activeTab()?.languageId ?? '',
  cursor() {
    const v = view();
    if (!v) {
      return { line: 0, column: 0 };
    }
    const head = v.state.selection.main.head;
    const line = v.state.doc.lineAt(head);
    return { line: line.number, column: head - line.from + 1 };
  },
  gotoLine(line) {
    if (!view()) {
      throw new Error(t('addonStudio.run.noEditor'));
    }
    editorBridge.reveal(Math.max(0, Math.floor(line) - 1), 0);
  },

  notify: (message, kind) => useStore.getState().notify(message, kind),
  prompt: (title, label, initial) => formPromise({
    title: title || t('addonStudio.run.promptTitle'),
    fields: [{ id: 'value', label: label || t('addonStudio.pin.value'), default: initial, required: false }],
    onSubmit: () => {},
  }, (values) => values.value ?? ''),
  pick(title, items) {
    if (!items.length) {
      return Promise.resolve(null);
    }
    return formPromise({
      title: title || t('addonStudio.run.pickTitle'),
      fields: [{
        id: 'value',
        label: t('addonStudio.pin.value'),
        type: 'select',
        default: items[0],
        choices: items.map((item) => ({ value: item, label: item })),
      }],
      onSubmit: () => {},
    }, (values) => values.value ?? items[0]);
  },
  output(text) {
    const s = useStore.getState();
    s.showPanel('output');
    for (const line of text.split('\n')) {
      s.appendOutput({ stream: 'stdout', text: line });
    }
  },

  async openFile(path) {
    await useStore.getState().openFile(resolveWorkspacePath(path));
  },
  readFile: (path) => window.lumen.fs.readFile(resolveWorkspacePath(path)),
  async writeFile(path, content) {
    await window.lumen.fs.writeFile(resolveWorkspacePath(path), content);
  },
  async shell(addonId, command) {
    if (!command.trim()) {
      throw new Error(t('addonStudio.run.emptyCommand'));
    }
    if (!shellAllowed(addonId)) {
      const name = registry.get(addonId)?.name ?? addonId;
      if (!confirm(t('addonStudio.run.confirmShell', { name, command }))) {
        throw new Error(t('addonStudio.run.shellDenied'));
      }
      allowShell(addonId);
    }
    const s = useStore.getState();
    return window.lumen.userAddons.exec(command, s.project?.root ?? s.workspace);
  },
  async runTask(id) {
    const task = findTask(id);
    if (!task) {
      return false;
    }
    await runTask(task);
    return true;
  },

  runCommand: (id) => runCommandById(id),
  setTheme(id) {
    if (!registry.themes().some((theme) => theme.id === id)) {
      throw new Error(t('addonStudio.run.unknownTheme', { id }));
    }
    useStore.getState().setTheme(id);
  },
  toggleSetting(key, mode) {
    if (!TOGGLE_SETTINGS.includes(key)) {
      throw new Error(t('addonStudio.run.unknownSetting', { key }));
    }
    const s = useStore.getState();
    const current = Boolean(s.effects[key as keyof Effects]);
    const next = mode === 'toggle' ? !current : mode === 'on';
    s.setEffects({ [key]: next } as Partial<Effects>);
  },
};

/* ------------------------------------------------------------------ *
 * Running
 * ------------------------------------------------------------------ */

const running = new Map<string, number>();

export function reportGraphError(model: Pick<UserAddonModel, 'id' | 'name'>, err: unknown, where: string) {
  const s = useStore.getState();
  const message = (err as Error)?.message ?? String(err);
  const node = err instanceof GraphError && err.nodeId ? ` [${err.nodeId}]` : '';
  s.appendOutput({ stream: 'stderr', text: `✗ ${model.name} · ${where}${node}: ${message}` });
  s.notify(t('addonStudio.run.failed', { name: model.name, message }), 'error');
}

export async function runEntry(
  model: Pick<UserAddonModel, 'id' | 'name'>,
  graph: Graph,
  entry: string,
  where: string,
  options: { payload?: Record<string, unknown>; signal?: AbortSignal; trace?: GraphTrace; rethrow?: boolean; } = {},
) {
  const count = running.get(model.id) ?? 0;
  if (count >= MAX_CONCURRENT) {
    return;
  }
  running.set(model.id, count + 1);
  try {
    await runGraph(graph, {
      entry,
      host: rendererHost,
      addonId: model.id,
      payload: options.payload,
      signal: options.signal,
      trace: options.trace,
    });
  } catch (err) {
    if (options.rethrow) {
      throw err;
    }
    reportGraphError(model, err, where);
  } finally {
    running.set(model.id, (running.get(model.id) ?? 1) - 1);
  }
}

export async function runUserCommand(model: UserAddonModel, command: UserCommand) {
  const entry = eventNodes(command.graph, 'command')[0];
  if (!entry) {
    useStore.getState().notify(t('addonStudio.validate.commandEntry'), 'warning');
    return;
  }
  await runEntry(model, command.graph, entry.id, command.title);
}

function fire(model: UserAddonModel, kind: EventKind, payload: Record<string, unknown> = {}) {
  for (const event of model.events) {
    for (const node of eventNodes(event.graph, kind, NODE_CATALOG)) {
      void runEntry(model, event.graph, node.id, event.name, { payload });
    }
  }
}

const hasEvent = (model: UserAddonModel, kind: EventKind) =>
  model.events.some((event) => eventNodes(event.graph, kind).length > 0);

/** Starts an add-on's event graphs; the return value unsubscribes. */
export function startUserEvents(model: UserAddonModel): () => void {
  const pathPayload = (path: string | null, languageId: string | null) => ({ path: path ?? '', language: languageId ?? '' });

  const startup = hasEvent(model, 'startup') ? setTimeout(() => fire(model, 'startup'), 0) : null;
  const watching = ['fileSaved', 'fileOpened', 'tabChanged'].some((kind) => hasEvent(model, kind as EventKind));
  const unsubscribe = watching
    ? useStore.subscribe((state, prev) => {
      if (state.tabs !== prev.tabs) {
        const before = new Map(prev.tabs.map((tab) => [tab.id, tab]));
        for (const tab of state.tabs) {
          const old = before.get(tab.id);
          if (!tab.path || tab.virtual) {
            continue;
          }
          if (!old) {
            fire(model, 'fileOpened', pathPayload(tab.path, tab.languageId));
            continue;
          }
          const savedNow = tab.saved !== old.saved && tab.content === tab.saved;
          const wasDirty = old.content !== old.saved || !old.path;
          if (savedNow && wasDirty) {
            fire(model, 'fileSaved', pathPayload(tab.path, tab.languageId));
          }
        }
      }
      if (state.activeTabId !== prev.activeTabId && state.activeTabId) {
        const tab = state.tabs.find((entry) => entry.id === state.activeTabId);
        fire(model, 'tabChanged', pathPayload(tab?.path ?? null, tab?.languageId ?? null));
      }
    })
    : () => {};

  return () => {
    if (startup) {
      clearTimeout(startup);
    }
    unsubscribe();
  };
}

/** Shorten values for the tooltips of a test run. */
export function previewValue(value: unknown): string {
  const text = toText(value);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
