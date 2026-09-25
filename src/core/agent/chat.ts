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
 * The state of agent chats.
 *
 * An agent is whatever an extension's code registers — Lumen knows nothing
 * about which product is behind it. This file turns the events every agent
 * reports (`AgentEvent`) into lists of items the panel draws: streamed text,
 * thinking, tool calls, permission requests, the agent's plan, and the cost of
 * each turn.
 *
 * Every agent can hold several chats; each has its own conversation on the
 * agent's side (`sessionId`). The state lives outside the panel on purpose:
 * moving the view to another dock unmounts the panel, but a running answer
 * must not be lost with it.
 */

import { useStore } from '@/state/store';
import { t } from '@/i18n';
import { extensions } from '@/core/extensions/manager';
import { editorBridge } from '@/lib/editor-bridge';
import { emitFsChanges } from '@/lib/fs-events';
import type { ExtensionAgent } from '@/core/extensions/types';
import type {
  AgentAttachment, AgentEvent, AgentModel, AgentUsage,
} from '../../../electron/features/extension-host/contract';

export interface TodoEntry {
  text: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/** An attachment as the composer holds it: the data for the agent plus a preview. */
export interface DraftAttachment extends AgentAttachment {
  /** A data URL for image thumbnails. */
  preview?: string;
}

export type ChatItem =
  | { id: number; role: 'user'; text: string; context?: string; attachments?: { name: string; preview?: string; }[]; }
  | { id: number; role: 'assistant'; text: string; streaming?: boolean; }
  | { id: number; role: 'thinking'; text: string; streaming?: boolean; }
  | { id: number; role: 'tool'; toolId: string; name: string; input: Record<string, unknown>; status: 'running' | 'done' | 'error'; output?: string; }
  | { id: number; role: 'permission'; requestId: string; tool: string; input: Record<string, unknown>; blockedPath?: string; reason?: string; canRemember: boolean; state: 'pending' | 'allowed' | 'denied'; }
  | { id: number; role: 'todos'; items: TodoEntry[]; }
  | { id: number; role: 'result'; isError: boolean; usage: AgentUsage; }
  | { id: number; role: 'note'; text: string; error: boolean; };

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

/** An agent an installed extension offers. */
export interface AgentInfo {
  /** `<extension id>/<agent id>` — what the main process addresses it by. */
  key: string;
  extensionId: string;
  agent: ExtensionAgent;
}

export interface Chat {
  /** The chat id the main process knows the conversation by. */
  id: string;
  title: string;
  items: ChatItem[];
  running: boolean;
  sessionId?: string;
  /** The project folder the session belongs to — another project is another conversation. */
  sessionRoot: string | null;
  /** What the agent reported at the start of the session. */
  model?: string;
  slashCommands: string[];
  /** A short line while the agent works (“compacting”, “retrying” …). */
  status?: string;
  createdAt: number;
}

interface AgentState {
  chats: Chat[];
  activeChatId: string;
  mode: string | null;
  /** `''` follows the extension's setting. */
  model: string | null;
  /** The effort chosen per model id (`''` for the default model); missing means the model's own. */
  efforts: Record<string, string>;
  /** What the agent's code reported; `null` until asked. */
  reportedModels: AgentModel[] | null;
  modelsLoading: boolean;
  modelsError?: string;
  includeFile: boolean;
  /** Messages sent, newest last — for the composer's arrow-up history. */
  history: string[];
}

/** A conversation the agent keeps on its side and can resume. */
export interface StoredSession {
  id: string;
  title: string;
  updatedAt?: number;
}

/** Tools that change a file: the file is opened once the tool has run. */
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const MAX_SELECTION = 8000;
const MAX_HISTORY = 50;
const MODEL_KEY = (key: string) => `lumen.agent.model.${key}`;
const EFFORT_KEY = (key: string) => `lumen.agent.effort.${key}`;

const listeners = new Set<() => void>();
const agents = new Map<string, AgentState>();
let version = 0;
let counter = 0;
let chatCounter = 0;
let started = false;

function emit() {
  version++;
  for (const fn of listeners) {
    fn();
  }
}

function newChat(): Chat {
  return {
    id: `chat-${++chatCounter}`,
    title: t('agent.chats.untitled'),
    items: [],
    running: false,
    sessionRoot: null,
    slashCommands: [],
    createdAt: Date.now(),
  };
}

function storedModel(key: string): string | null {
  try {
    return window.localStorage.getItem(MODEL_KEY(key));
  } catch {
    return null;
  }
}

function storedEfforts(key: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(EFFORT_KEY(key)) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

function remember(storageKey: string, value: string) {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // A choice that is not remembered is no reason to fail.
  }
}

function stateOf(key: string): AgentState {
  const known = agents.get(key);
  if (known) {
    return known;
  }
  const first = newChat();
  const fresh: AgentState = {
    chats: [first], activeChatId: first.id, mode: null, model: storedModel(key), efforts: storedEfforts(key),
    reportedModels: null, modelsLoading: false, includeFile: true, history: [],
  };
  agents.set(key, fresh);
  return fresh;
}

function chatOf(key: string, chatId?: string): Chat {
  const state = stateOf(key);
  const id = chatId ?? state.activeChatId;
  return state.chats.find((chat) => chat.id === id) ?? state.chats[0];
}

function push(chat: Chat, item: DistributiveOmit<ChatItem, 'id'>) {
  chat.items = [...chat.items, { ...item, id: ++counter } as ChatItem];
}

function patch(chat: Chat, match: (item: ChatItem) => boolean, change: (item: ChatItem) => ChatItem) {
  chat.items = chat.items.map((item) => (match(item) ? change(item) : item));
}

/** Streamed items are complete once the full message or the end of the turn arrives. */
function settleStreams(chat: Chat, drop: boolean) {
  const streaming = (item: ChatItem) => (item.role === 'assistant' || item.role === 'thinking') && item.streaming === true;
  if (drop) {
    chat.items = chat.items.filter((item) => !streaming(item));
    return;
  }
  patch(chat, streaming, (item) => ({ ...item, streaming: false }) as ChatItem);
}

function appendDelta(chat: Chat, text: string, thinking: boolean) {
  const role = thinking ? 'thinking' : 'assistant';
  const last = chat.items[chat.items.length - 1];
  if (last && last.role === role && last.streaming) {
    const updated = { ...last, text: last.text + text };
    chat.items = [...chat.items.slice(0, -1), updated];
    return;
  }
  push(chat, { role, text, streaming: true });
}

function setTodos(chat: Chat, items: TodoEntry[]) {
  const existing = chat.items.find((item) => item.role === 'todos');
  if (!existing) {
    push(chat, { role: 'todos', items });
    return;
  }
  patch(chat, (item) => item.id === existing.id, (item) => ({ ...item, items }) as ChatItem);
}

/** A path the agent reported, made absolute against the session's folder. */
function absoluteIn(root: string | null, file: string) {
  if (!root || /^([\\/]|[A-Za-z]:[\\/])/.test(file)) {
    return file;
  }
  return `${root}/${file.replace(/^\.\//, '')}`;
}

const relativeTo = (root: string, file: string) => (file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file);

/** A tool that writes a plan: its input becomes the to-do card. */
function todosFromTool(name: string, input: Record<string, unknown>): TodoEntry[] | null {
  if (name !== 'TodoWrite' || !Array.isArray(input.todos)) {
    return null;
  }
  return input.todos
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      text: String(entry.content ?? entry.text ?? ''),
      status: (['pending', 'in_progress', 'completed'].includes(String(entry.status)) ? entry.status : 'pending') as TodoEntry['status'],
    }));
}

const HANDLERS: { [K in AgentEvent['kind']]: (chat: Chat, event: Extract<AgentEvent, { kind: K; }>) => void } = {
  session(chat, event) {
    chat.sessionId = event.sessionId;
    chat.model = event.model ?? chat.model;
    if (event.slashCommands?.length) {
      chat.slashCommands = event.slashCommands;
    }
  },
  assistant(chat, event) {
    settleStreams(chat, true);
    for (const block of event.blocks) {
      if (block.type === 'text') {
        push(chat, { role: 'assistant', text: block.text });
      }
      if (block.type === 'thinking') {
        push(chat, { role: 'thinking', text: block.text });
      }
      if (block.type !== 'tool') {
        continue;
      }
      const todos = todosFromTool(block.name, block.input);
      if (todos) {
        setTodos(chat, todos);
        continue;
      }
      push(chat, { role: 'tool', toolId: block.id, name: block.name, input: block.input, status: 'running' });
    }
  },
  delta(chat, event) {
    appendDelta(chat, event.text, event.thinking === true);
  },
  toolResult(chat, event) {
    const tool = chat.items.find((item) => item.role === 'tool' && item.toolId === event.toolUseId);
    patch(
      chat,
      (item) => item.role === 'tool' && item.toolId === event.toolUseId,
      (item) => ({ ...item, status: event.isError ? 'error' : 'done', output: event.text }) as ChatItem,
    );
    if (tool?.role !== 'tool' || event.isError) {
      return;
    }
    const reported = tool.input.file_path ?? tool.input.notebook_path;
    if (typeof reported !== 'string' || !reported) {
      return;
    }
    const file = absoluteIn(chat.sessionRoot, reported);
    if (tool.name === 'Delete') {
      emitFsChanges([{ path: file, type: 3 }]);
      return;
    }
    if (!FILE_TOOLS.has(tool.name)) {
      return;
    }
    // Open what the agent touched, and hand the edit to the tabs explicitly
    // rather than waiting for the watcher: an unedited tab reloads, an edited
    // one shows the "changed on disk" banner.
    void useStore.getState().openFile(file, true).catch(() => {}).then(() => emitFsChanges([{ path: file, type: 2 }]));
  },
  permission(chat, event) {
    push(chat, {
      role: 'permission', requestId: event.requestId, tool: event.tool, input: event.input,
      blockedPath: event.blockedPath, reason: event.reason, canRemember: event.canRemember, state: 'pending',
    });
  },
  permissionSettled(chat, event) {
    patch(chat, (item) => item.role === 'permission' && item.requestId === event.requestId && item.state === 'pending', (item) => ({ ...item, state: 'denied' }) as ChatItem);
  },
  todos(chat, event) {
    setTodos(chat, event.items);
  },
  status(chat, event) {
    chat.status = event.text || undefined;
  },
  result(chat, event) {
    settleStreams(chat, false);
    if (event.isError && event.text) {
      push(chat, { role: 'note', text: event.text, error: true });
    }
    const usage: AgentUsage = { ...(event.usage ?? {}), costUsd: event.usage?.costUsd ?? event.costUsd, durationMs: event.usage?.durationMs ?? event.durationMs };
    push(chat, { role: 'result', isError: event.isError, usage });
  },
  error(chat, event) {
    settleStreams(chat, false);
    push(chat, { role: 'note', text: event.message, error: true });
  },
  done(chat) {
    // The turn may have changed files through the shell (sed, git, a
    // generator) that no tool result names: compare every tab with the disk.
    void useStore.getState().syncTabsWithDisk();
    emitFsChanges([]);
    settleStreams(chat, false);
    chat.running = false;
    chat.status = undefined;
  },
};

function onEvent(event: AgentEvent) {
  const state = agents.get(event.agent);
  const chat = state?.chats.find((entry) => entry.id === event.chatId);
  if (!chat) {
    return;
  }
  const handler = HANDLERS[event.kind] as (chat: Chat, event: AgentEvent) => void;
  handler(chat, event);
  emit();
}

/** The context line for the prompt: the open file, the cursor and a selection. */
function editorContext(root: string): { prompt: string; label?: string; } {
  const state = useStore.getState();
  const tab = state.activeTab();
  if (!tab?.path || tab.virtual) {
    return { prompt: '' };
  }
  const file = relativeTo(root, tab.path);
  const line = state.cursor.line + 1;
  const view = editorBridge.view;
  const range = view && editorBridge.tabId === tab.id ? view.state.selection.main : null;
  const selection = range && !range.empty ? view!.state.sliceDoc(range.from, range.to).slice(0, MAX_SELECTION) : '';
  if (!selection) {
    return { prompt: `[The user has ${file} open, cursor at line ${line}.]`, label: `${file}:${line}` };
  }
  const from = view!.state.doc.lineAt(range!.from).number;
  const to = view!.state.doc.lineAt(range!.to).number;
  return {
    prompt: `[The user has ${file} open and selected lines ${from}–${to}:]\n\`\`\`\n${selection}\n\`\`\``,
    label: `${file}:${from}-${to}`,
  };
}

/** The first line of a message, as a chat's title. */
const titleFrom = (text: string) => {
  const line = text.trim().split('\n')[0];
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
};

export const agentChat = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  getVersion: () => version,

  /** Every agent the installed extensions declare. */
  agents(): AgentInfo[] {
    return extensions.listActive().flatMap(({ manifest }) =>
      (manifest.agents ?? []).map((agent) => ({ key: `${manifest.id}/${agent.id}`, extensionId: manifest.id, agent })));
  },

  find: (key: string): AgentInfo | undefined => agentChat.agents().find((entry) => entry.key === key),

  chats: (key: string) => stateOf(key).chats,
  activeChat: (key: string) => chatOf(key),
  items: (key: string) => chatOf(key).items,
  isRunning: (key: string) => chatOf(key).running,
  includeFile: (key: string) => stateOf(key).includeFile,
  history: (key: string) => stateOf(key).history,

  /** The chosen mode; before any choice, the agent's first one. */
  mode(key: string): string {
    return stateOf(key).mode ?? agentChat.find(key)?.agent.modes?.[0]?.id ?? '';
  },

  /** The chosen model; `''` means the extension's setting (or the agent's default) applies. */
  model: (key: string): string => stateOf(key).model ?? '',

  /** The models to choose from: what the agent reports first, then what its manifest lists. */
  models(key: string): AgentModel[] {
    const reported = stateOf(key).reportedModels ?? [];
    const listed = agentChat.find(key)?.agent.models ?? [];
    return [...reported, ...listed.filter((entry) => !reported.some((known) => known.id === entry.id))];
  },

  modelsLoading: (key: string) => stateOf(key).modelsLoading,
  modelsError: (key: string) => stateOf(key).modelsError,

  /** Ask the agent which models it offers; `refresh` makes it skip its own cache. Once per agent unless refreshed. */
  async loadModels(key: string, refresh = false) {
    const state = stateOf(key);
    const info = agentChat.find(key);
    if (!info || state.modelsLoading) {
      return;
    }
    if (state.reportedModels && !refresh) {
      return;
    }
    state.modelsLoading = true;
    state.modelsError = undefined;
    emit();
    try {
      const settings = useStore.getState().extensionSettings[info.extensionId];
      state.reportedModels = await window.lumen.agent.models(key, settings, refresh);
    } catch (err) {
      // Left unset, so the next look (the extension may still be starting) asks again.
      state.modelsError = (err as Error).message;
    } finally {
      state.modelsLoading = false;
      emit();
    }
  },

  /**
   * The model a message goes to, as far as it is known: the chosen one, or —
   * for “Default” — the one the extension's setting names or the agent marks.
   */
  currentModel(key: string): AgentModel | undefined {
    const models = agentChat.models(key);
    const chosen = agentChat.model(key);
    const picked = chosen ? models.find((entry) => entry.id === chosen) : undefined;
    if (picked) {
      return picked;
    }
    const info = agentChat.find(key);
    const setting = info?.agent.modelSetting
      ? useStore.getState().extensionSettings[info.extensionId]?.[info.agent.modelSetting]
      : undefined;
    const configured = setting && setting !== 'auto' ? models.find((entry) => entry.id === setting) : undefined;
    return configured ?? models.find((entry) => entry.isDefault);
  },


  /** The effort chosen for the current model; `''` leaves it to the extension's setting and the model. */
  effort(key: string): string {
    const effort = stateOf(key).efforts[agentChat.model(key)] ?? '';
    const efforts = agentChat.currentModel(key)?.efforts ?? [];
    if (!effort || !efforts.some((entry) => entry.id === effort)) {
      return '';
    }
    return effort;
  },

  /** Once at startup, so events are never missed while the panel is closed. */
  init() {
    if (started) {
      return;
    }
    started = true;
    window.lumen.agent.onEvent(onEvent);
  },

  setMode(key: string, mode: string) {
    stateOf(key).mode = mode;
    emit();
  },

  setModel(key: string, model: string) {
    stateOf(key).model = model;
    remember(MODEL_KEY(key), model);
    emit();
  },

  /** Remembered per model: switching models brings back each one's own level. */
  setEffort(key: string, effort: string) {
    const state = stateOf(key);
    const efforts = { ...state.efforts };
    delete efforts[agentChat.model(key)];
    if (effort) {
      efforts[agentChat.model(key)] = effort;
    }
    state.efforts = efforts;
    remember(EFFORT_KEY(key), JSON.stringify(efforts));
    emit();
  },

  setIncludeFile(key: string, value: boolean) {
    stateOf(key).includeFile = value;
    emit();
  },

  /* ---------------------------------------------------------------- *
   * Chats
   * ---------------------------------------------------------------- */

  newChat(key: string): string {
    const state = stateOf(key);
    const chat = newChat();
    state.chats = [...state.chats, chat];
    state.activeChatId = chat.id;
    emit();
    return chat.id;
  },

  selectChat(key: string, chatId: string) {
    const state = stateOf(key);
    if (!state.chats.some((chat) => chat.id === chatId)) {
      return;
    }
    state.activeChatId = chatId;
    emit();
  },

  renameChat(key: string, chatId: string, title: string) {
    const chat = stateOf(key).chats.find((entry) => entry.id === chatId);
    if (!chat || !title.trim()) {
      return;
    }
    chat.title = title.trim();
    emit();
  },

  /** Close a chat; the last one is emptied rather than removed. */
  closeChat(key: string, chatId: string) {
    const state = stateOf(key);
    const chat = state.chats.find((entry) => entry.id === chatId);
    if (!chat || chat.running) {
      return;
    }
    const rest = state.chats.filter((entry) => entry.id !== chatId);
    state.chats = rest.length ? rest : [newChat()];
    if (state.activeChatId === chatId) {
      state.activeChatId = state.chats[state.chats.length - 1].id;
    }
    emit();
  },

  /** Empty the active chat and start a fresh conversation in it. */
  reset(key: string) {
    const chat = chatOf(key);
    if (chat.running) {
      return;
    }
    chat.items = [];
    chat.sessionId = undefined;
    chat.title = t('agent.chats.untitled');
    emit();
  },

  /** Earlier conversations the agent keeps for the open project. */
  async sessions(key: string): Promise<StoredSession[]> {
    const root = useStore.getState().workspace;
    if (!root) {
      return [];
    }
    return window.lumen.agent.sessions(key, root).catch(() => []);
  },

  /** Continue a stored conversation in a new chat. */
  resume(key: string, session: StoredSession) {
    const state = stateOf(key);
    const existing = state.chats.find((chat) => chat.sessionId === session.id);
    if (existing) {
      state.activeChatId = existing.id;
      emit();
      return;
    }
    const chat = newChat();
    chat.title = session.title || chat.title;
    chat.sessionId = session.id;
    chat.sessionRoot = useStore.getState().workspace;
    push(chat, { role: 'note', text: t('agent.sessions.resumed', { title: chat.title }), error: false });
    state.chats = [...state.chats, chat];
    state.activeChatId = chat.id;
    emit();
  },

  /* ---------------------------------------------------------------- *
   * Talking
   * ---------------------------------------------------------------- */

  async send(key: string, text: string, attachments: DraftAttachment[] = []) {
    const state = useStore.getState();
    const root = state.workspace;
    const agentState = stateOf(key);
    const chat = chatOf(key);
    const info = agentChat.find(key);
    const message = text.trim();
    if (!message || chat.running || !info) {
      return;
    }
    if (!root) {
      push(chat, { role: 'note', text: t('agent.noProject'), error: true });
      emit();
      return;
    }
    // Another project is another conversation.
    if (chat.sessionRoot !== root) {
      chat.sessionId = undefined;
      chat.sessionRoot = root;
    }

    const context = agentState.includeFile ? editorContext(root) : { prompt: '' };
    const prompt = context.prompt ? `${context.prompt}\n\n${message}` : message;
    if (!chat.items.some((item) => item.role === 'user')) {
      chat.title = titleFrom(message);
    }
    agentState.history = [...agentState.history.filter((entry) => entry !== message), message].slice(-MAX_HISTORY);

    push(chat, {
      role: 'user', text: message, context: context.label,
      attachments: attachments.map((entry) => ({ name: entry.name, preview: entry.preview })),
    });
    chat.running = true;
    emit();
    try {
      await window.lumen.agent.send({
        agent: key,
        chatId: chat.id,
        text: prompt,
        cwd: root,
        mode: agentChat.mode(key),
        sessionId: chat.sessionId,
        model: agentChat.model(key) || undefined,
        effort: agentChat.effort(key) || undefined,
        attachments: attachments.map(({ preview: _preview, ...entry }) => entry),
        settings: state.extensionSettings[info.extensionId],
      });
    } catch (err) {
      chat.running = false;
      push(chat, { role: 'note', text: (err as Error).message, error: true });
      emit();
    }
  },

  async interrupt(key: string) {
    await window.lumen.agent.interrupt(key, chatOf(key).id);
  },

  async answer(key: string, requestId: string, allow: boolean, remember = false, message?: string) {
    const isRequest = (item: ChatItem) => item.role === 'permission' && item.requestId === requestId;
    const chat = stateOf(key).chats.find((entry) => entry.items.some(isRequest));
    if (chat) {
      patch(chat, isRequest, (item) => ({ ...item, state: allow ? 'allowed' : 'denied' }) as ChatItem);
    }
    emit();
    await window.lumen.agent.answer({ agent: key, requestId, allow, remember, message });
  },
};
