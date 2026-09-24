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
 * The interface's side of extension code.
 *
 * Extension code runs in the main process and speaks to the window only
 * through messages; this module is where they land. It keeps the content of
 * extension views (fetched when a view is visible and whenever the extension
 * says it changed), the status-bar items, and answers the extension's
 * questions through Lumen's own dialogs. In the other direction it pushes the
 * extension settings, the interface language and a few events (a file saved,
 * the active file, window focus).
 */

import { useStore } from '@/state/store';
import { getLanguage, t } from '@/i18n';
import type { FormField } from '@/core/types';
import { extensions } from './manager';
import { localizeTitle } from './localize';
import type {
  HostEvent, InputField, StatusItem, UiMessage, UiRequest, ViewAction, ViewContent,
} from '../../../electron/features/extension-host/contract';

export type HostStatusItem = StatusItem & { extensionId: string; id: string; };

interface ViewState {
  content: ViewContent | null;
  loading: boolean;
  error: string | null;
  /** The content changed while nobody looked; fetch on the next show. */
  stale: boolean;
}

const viewStates = new Map<string, ViewState>();
const visible = new Map<string, number>();
const listeners = new Set<() => void>();
let status: HostStatusItem[] = [];
let version = 0;
let started = false;

const keyOf = (extensionId: string, viewId: string, instance?: string) =>
  instance === undefined ? `${extensionId}/${viewId}` : `${extensionId}/${viewId}#${instance}`;

/**
 * Tabs of editor views (`location: "editor"`) are virtual tabs with this
 * scheme; the editor area draws the view instead of a text editor for them.
 */
const VIEW_TAB_SCHEME = 'lumen-view:';

export function viewTabPath(extensionId: string, viewId: string, instance: string): string {
  return `${VIEW_TAB_SCHEME}${[extensionId, viewId, instance].map(encodeURIComponent).join('/')}`;
}

export function parseViewTabPath(path: string | null | undefined): { extensionId: string; viewId: string; instance: string; } | null {
  if (!path?.startsWith(VIEW_TAB_SCHEME)) {
    return null;
  }
  const parts = path.slice(VIEW_TAB_SCHEME.length).split('/').map(decodeURIComponent);
  if (parts.length !== 3) {
    return null;
  }
  return { extensionId: parts[0], viewId: parts[1], instance: parts[2] };
}

/** The declared icon of the view behind a `lumen-view:` tab, for the tab bar. */
export function viewTabIcon(path: string | null | undefined): string | null {
  const view = parseViewTabPath(path);
  if (!view) {
    return null;
  }
  const manifest = extensions.list().find((entry) => entry.manifest.id === view.extensionId)?.manifest;
  return manifest?.views?.find((declared) => declared.id === view.viewId)?.icon ?? 'blocks';
}

const isEditorView = (extensionId: string, viewId: string) =>
  extensions.list().some(({ manifest }) => manifest.id === extensionId
    && (manifest.views ?? []).some((view) => view.id === viewId && view.location === 'editor'));

/** Open an editor view's tab, or bring it forward when it is already open. */
function openViewTab(extensionId: string, viewId: string, instance: string, title?: string) {
  const store = useStore.getState();
  const path = viewTabPath(extensionId, viewId, instance);
  const open = store.tabs.find((tab) => tab.path === path);
  if (open) {
    store.setActiveTab(open.id);
    return;
  }
  const declared = extensions.list().find(({ manifest }) => manifest.id === extensionId)?.manifest.views?.find((view) => view.id === viewId);
  const declaredTitle = declared ? localizeTitle(declared, getLanguage()).title : undefined;
  store.openVirtual(path, title || declaredTitle || viewId, '', null);
}

function emit() {
  version++;
  for (const fn of listeners) {
    fn();
  }
}

function stateOf(key: string): ViewState {
  const known = viewStates.get(key);
  if (known) {
    return known;
  }
  const fresh: ViewState = { content: null, loading: false, error: null, stale: true };
  viewStates.set(key, fresh);
  return fresh;
}

async function load(extensionId: string, viewId: string, instance?: string) {
  const key = keyOf(extensionId, viewId, instance);
  const state = stateOf(key);
  state.loading = true;
  state.stale = false;
  emit();
  try {
    state.content = await window.lumen.extensionHost.renderView(extensionId, viewId, instance);
    state.error = null;
  } catch (err) {
    state.error = (err as Error).message;
  } finally {
    state.loading = false;
    emit();
  }
}

const sendEvent = (event: HostEvent) => void window.lumen.extensionHost.emit(event).catch(() => {});

/* ------------------------------------------------------------------ *
 * Messages and questions from extension code
 * ------------------------------------------------------------------ */

function onMessage(message: UiMessage & { extensionId: string; }) {
  const store = useStore.getState();
  const handlers: { [K in UiMessage['kind']]: (m: Extract<UiMessage, { kind: K; }>) => void } = {
    notify: (m) => store.notify(m.message, m.tone),
    openFile: (m) => void store.openAt(m.path, Math.max(0, (m.line ?? 1) - 1), Math.max(0, (m.column ?? 1) - 1)),
    showView: (m) => {
      if (isEditorView(message.extensionId, m.viewId)) {
        openViewTab(message.extensionId, m.viewId, m.instance ?? '', m.title);
        return;
      }
      store.showView(`view:${message.extensionId}/${m.viewId}`);
    },
    runInTerminal: (m) => void store.openTerminal({ command: m.command, cwd: m.cwd, title: m.title }),
    refreshProject: () => void store.refreshProject(),
    openDocument: (m) => store.openVirtual(`lumen-doc:${message.extensionId}/${Date.now()}/${m.name}`, m.name, m.content, m.languageId ?? null),
  };
  const handler = handlers[message.kind] as ((m: UiMessage) => void) | undefined;
  handler?.(message);
}

const FIELD_TYPES: Record<NonNullable<InputField['type']>, FormField['type']> = {
  text: 'text', password: 'password', textarea: 'textarea', select: 'select', toggle: 'toggle',
};

function toFormField(field: InputField): FormField {
  return {
    id: field.id,
    label: field.label,
    type: FIELD_TYPES[field.type ?? 'text'],
    placeholder: field.placeholder,
    hint: field.hint,
    required: field.required ?? false,
    choices: field.choices,
    mono: field.mono,
    default: field.value,
  };
}

function onRequest(request: UiRequest & { requestId: string; extensionId: string; }) {
  const store = useStore.getState();
  const answer = (value: unknown) => void window.lumen.extensionHost.answer(request.requestId, value);
  if (request.kind === 'confirm') {
    store.openForm({
      title: request.title,
      description: request.message,
      fields: [],
      submitLabel: request.confirmLabel ?? t('common.ok'),
      onSubmit: () => answer(true),
      onCancel: () => answer(false),
    });
    return;
  }
  if (request.kind === 'input') {
    store.openForm({
      title: request.title,
      description: request.description,
      fields: request.fields.map(toFormField),
      submitLabel: request.submitLabel,
      onSubmit: (values) => answer(values),
      onCancel: () => answer(null),
    });
    return;
  }
  store.openForm({
    title: request.title,
    fields: [{
      id: 'choice',
      label: request.placeholder ?? request.title,
      type: 'select',
      default: request.items[0]?.value ?? '',
      choices: request.items.map((item) => ({ value: item.value, label: item.label, hint: item.detail })),
    }],
    onSubmit: (values) => answer(values.choice || null),
    onCancel: () => answer(null),
  });
}

/* ------------------------------------------------------------------ *
 * Events for extension code
 * ------------------------------------------------------------------ */

type OpenTab = ReturnType<typeof useStore.getState>['tabs'][number];

/** Tell the extension about closed tabs of its editor views, so it can let go of what they held. */
function closeViewTabs(tabs: OpenTab[], previous: OpenTab[]) {
  const still = new Set(tabs.map((tab) => tab.path));
  for (const tab of previous) {
    const view = parseViewTabPath(tab.path);
    if (!view || still.has(tab.path)) {
      continue;
    }
    viewStates.delete(keyOf(view.extensionId, view.viewId, view.instance));
    void window.lumen.extensionHost.viewAction(view.extensionId, view.viewId, { action: '__close', inputs: {}, instance: view.instance }).catch(() => {});
  }
}

type StoreState = ReturnType<typeof useStore.getState>;

function activeFileEvent(state: StoreState): HostEvent {
  const tab = state.tabs.find((open) => open.id === state.activeTabId);
  if (!tab?.path || tab.virtual) {
    return { kind: 'activeFile', path: null };
  }
  const language = state.languageFor(tab);
  return { kind: 'activeFile', path: tab.path, languageId: language?.id, languageName: language?.name };
}

function projectEvent(state: StoreState): HostEvent {
  const root = state.workspace;
  const name = state.project?.name || root?.split(/[\\/]/).filter(Boolean).pop() || null;
  return { kind: 'project', root, name };
}

function watchStore() {
  let lastSettings = useStore.getState().extensionSettings;
  let lastLanguage = useStore.getState().language;
  for (const [id, values] of Object.entries(lastSettings)) {
    void window.lumen.extensionHost.setSettings(id, values);
  }
  sendEvent({ kind: 'locale', language: getLanguage() });
  sendEvent(activeFileEvent(useStore.getState()));
  sendEvent(projectEvent(useStore.getState()));
  if (!document.hasFocus()) {
    sendEvent({ kind: 'windowBlur' });
  }

  useStore.subscribe((state, previous) => {
    if (state.extensionSettings !== lastSettings) {
      for (const [id, values] of Object.entries(state.extensionSettings)) {
        if (lastSettings[id] !== values) {
          void window.lumen.extensionHost.setSettings(id, values);
        }
      }
      lastSettings = state.extensionSettings;
    }
    if (state.language !== lastLanguage) {
      lastLanguage = state.language;
      // After `setLanguage` has resolved “system” to a real language.
      window.setTimeout(() => sendEvent({ kind: 'locale', language: getLanguage() }), 0);
    }
    if (state.tabs !== previous.tabs) {
      closeViewTabs(state.tabs, previous.tabs);
    }
    if (state.activeTabId !== previous.activeTabId) {
      sendEvent(activeFileEvent(state));
    }
    if (state.project !== previous.project || state.workspace !== previous.workspace) {
      sendEvent(projectEvent(state));
    }
    if (state.tabs === previous.tabs) {
      return;
    }
    for (const tab of state.tabs) {
      const before = previous.tabs.find((open) => open.id === tab.id);
      if (!before || before.saved === tab.saved || !tab.path || tab.virtual) {
        continue;
      }
      sendEvent({ kind: 'fileSaved', path: tab.path });
    }
  });
  window.addEventListener('focus', () => sendEvent({ kind: 'windowFocus' }));
  window.addEventListener('blur', () => sendEvent({ kind: 'windowBlur' }));
}

/* ------------------------------------------------------------------ *
 * The module's face
 * ------------------------------------------------------------------ */

export const extensionHost = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  getVersion: () => version,

  view: (extensionId: string, viewId: string, instance?: string): ViewState => stateOf(keyOf(extensionId, viewId, instance)),
  statusItems: () => status,

  /** A view became visible (mounted) — fetch its content when stale. Returns the matching `hide`. */
  show(extensionId: string, viewId: string, instance?: string): () => void {
    const key = keyOf(extensionId, viewId, instance);
    visible.set(key, (visible.get(key) ?? 0) + 1);
    if (stateOf(key).stale || !stateOf(key).content) {
      void load(extensionId, viewId, instance);
    }
    void window.lumen.extensionHost.viewAction(extensionId, viewId, { action: '__show', inputs: {}, instance }).catch(() => {});
    sendEvent({ kind: 'viewVisible', extensionId, viewId });
    return () => {
      const count = (visible.get(key) ?? 1) - 1;
      if (count <= 0) {
        visible.delete(key);
      }
      if (count > 0) {
        visible.set(key, count);
      }
    };
  },

  reload: (extensionId: string, viewId: string, instance?: string) => load(extensionId, viewId, instance),

  /** Run a view action — after asking, where the action wants that. */
  async action(extensionId: string, viewId: string, action: ViewAction, inputs: Record<string, string | boolean>, instance?: string) {
    if (action.disabled) {
      return;
    }
    const run = async () => {
      try {
        await window.lumen.extensionHost.viewAction(extensionId, viewId, { action: action.action, payload: action.payload, inputs, instance });
      } catch (err) {
        useStore.getState().notify((err as Error).message, 'error');
      }
    };
    if (!action.confirm) {
      await run();
      return;
    }
    useStore.getState().openForm({
      title: action.title,
      description: action.confirm,
      fields: [],
      submitLabel: action.title,
      onSubmit: () => void run(),
    });
  },

  async runCommand(extensionId: string, commandId: string, args?: unknown) {
    try {
      await window.lumen.extensionHost.runCommand(extensionId, commandId, args);
    } catch (err) {
      useStore.getState().notify((err as Error).message, 'error');
    }
  },

  /** Once at startup. */
  init() {
    if (started) {
      return;
    }
    started = true;
    const host = window.lumen.extensionHost;
    host.onViewChanged(({ extensionId, viewId, instance }) => {
      const changed = (key: string, tab?: string) => {
        if (visible.has(key)) {
          void load(extensionId, viewId, tab);
          return;
        }
        stateOf(key).stale = true;
      };
      if (instance !== undefined) {
        changed(keyOf(extensionId, viewId, instance), instance);
        return;
      }
      // Without an instance: the view itself and every open tab of it.
      changed(keyOf(extensionId, viewId));
      const prefix = `${keyOf(extensionId, viewId)}#`;
      for (const key of new Set([...viewStates.keys(), ...visible.keys()])) {
        if (key.startsWith(prefix)) {
          changed(key, key.slice(prefix.length));
        }
      }
    });
    const refreshStatus = () => void host.statusItems().then((items) => {
      status = items;
      emit();
    }).catch(() => {});
    host.onStatusChanged(refreshStatus);
    refreshStatus();
    host.onUi(onMessage);
    host.onUiRequest(onRequest);
    watchStore();
  },
};
