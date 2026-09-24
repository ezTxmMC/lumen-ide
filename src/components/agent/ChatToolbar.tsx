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
 * The head of an agent chat: which chat, earlier sessions, the mode, the model
 * and how hard it thinks.
 */

import { useEffect, useState } from 'react';
import { ChevronDown, Eraser, History, MessageSquare, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { agentChat, type AgentInfo } from '@/core/agent/chat';
import { Button } from '@/components/ui';
import { ContextMenu, menuBelow, type MenuItem } from '@/components/ui/ContextMenu';

type Menu = { x: number; y: number; items: MenuItem[]; };

/** Effort levels Lumen names itself; others show the agent's label. */
const KNOWN_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

/** The agent's modes, its model and effort selectors, and the model refresh. */
function ModelControls({ info }: { info: AgentInfo; }) {
  const t = useT();
  const key = info.key;
  const chat = agentChat.activeChat(key);
  const modes = info.agent.modes ?? [];
  const models = agentChat.models(key);
  const loading = agentChat.modelsLoading(key);
  const modelsError = agentChat.modelsError(key);
  const mode = agentChat.mode(key);
  const model = agentChat.model(key);
  const known = models.some((entry) => entry.id === model);
  const current = agentChat.currentModel(key);
  const efforts = current?.efforts ?? [];
  const effort = agentChat.effort(key);
  const fallback = models.find((entry) => entry.isDefault);

  useEffect(() => {
    void agentChat.loadModels(key);
  }, [key]);

  const effortLabel = (entry: { id: string; label?: string; }) => {
    if (KNOWN_EFFORTS.has(entry.id)) {
      return t(`agent.effort.levels.${entry.id}`);
    }
    return entry.label ?? entry.id;
  };
  const defaultEffort = efforts.find((entry) => entry.id === current?.defaultEffort);
  const defaultModelLabel = fallback ? `${t('agent.model.default')} · ${fallback.label}` : t('agent.model.default');
  const modelTitle = [
    chat.model ? t('agent.model.reported', { model: chat.model }) : t('agent.model.label'),
    current?.description,
    modelsError,
  ].filter(Boolean).join('\n');

  if (modes.length === 0 && models.length === 0 && !loading) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {modes.map((entry) => (
        <button
          key={entry.id}
          title={entry.description}
          onClick={() => agentChat.setMode(key, entry.id)}
          className={[
            'lm-transition rounded-full border px-2 py-0.5 text-[11px]',
            entry.id === mode ? 'border-accent bg-active text-fg' : 'border-edge text-muted hover:border-edge-strong',
          ].join(' ')}
        >
          {entry.label}
        </button>
      ))}
      <span className="flex-1" />
      <select
        value={model}
        onChange={(e) => agentChat.setModel(key, e.target.value)}
        title={modelTitle}
        className="max-w-[200px] rounded-lumen-sm border border-edge bg-input px-1 py-0.5 text-[11px] text-muted"
      >
        <option value="">{loading && models.length === 0 ? t('agent.model.loading') : defaultModelLabel}</option>
        {model && !known && <option value={model}>{model}</option>}
        {models.map((entry) => <option key={entry.id} value={entry.id} title={entry.description}>{entry.label}</option>)}
      </select>
      {efforts.length > 0 && (
        <select
          value={effort}
          onChange={(e) => agentChat.setEffort(key, e.target.value)}
          title={efforts.find((entry) => entry.id === effort)?.description ?? t('agent.effort.label')}
          className="max-w-[140px] rounded-lumen-sm border border-edge bg-input px-1 py-0.5 text-[11px] text-muted"
        >
          <option value="">
            {defaultEffort ? t('agent.effort.defaultOf', { level: effortLabel(defaultEffort) }) : t('agent.effort.default')}
          </option>
          {efforts.map((entry) => (
            <option key={entry.id} value={entry.id} title={entry.description}>{effortLabel(entry)}</option>
          ))}
        </select>
      )}
      <button
        title={t('agent.model.refresh')}
        disabled={loading}
        onClick={() => void agentChat.loadModels(key, true)}
        className="lm-transition inline-flex h-5 items-center justify-center rounded-lumen-sm px-1 text-muted hover:bg-hover hover:text-fg disabled:opacity-50"
      >
        <RefreshCw size={11} className={loading ? 'animate-spin' : undefined} />
      </button>
    </div>
  );
}

/** The chat and session menus, opened below the button that was clicked. */
function useChatMenus(info: AgentInfo, running: boolean, setMenu: (menu: Menu | null) => void) {
  const t = useT();
  const key = info.key;
  const chat = agentChat.activeChat(key);

  const rename = () => {
    useStore.getState().openForm({
      title: t('agent.chats.renameTitle'),
      submitLabel: t('common.save'),
      initial: { name: chat.title },
      fields: [{ id: 'name', label: t('agent.chats.name') }],
      onSubmit: (values) => agentChat.renameChat(key, chat.id, values.name),
    });
  };

  const openChats = (element: HTMLElement) => {
    const items: MenuItem[] = [
      { header: t('agent.chats.title') },
      ...agentChat.chats(key).map<MenuItem>((entry) => ({
        label: entry.title,
        icon: MessageSquare,
        checked: entry.id === chat.id,
        hint: entry.running ? '●' : undefined,
        run: () => agentChat.selectChat(key, entry.id),
      })),
      'sep',
      { label: t('agent.newChat'), icon: Plus, run: () => { agentChat.newChat(key); } },
      { label: t('agent.chats.rename'), icon: Pencil, run: rename },
      { label: t('agent.clear'), icon: Eraser, disabled: running, run: () => agentChat.reset(key) },
      { label: t('agent.chats.close'), icon: X, disabled: running, danger: true, run: () => agentChat.closeChat(key, chat.id) },
    ];
    setMenu({ ...menuBelow(element), items });
  };

  const openSessions = async (element: HTMLElement) => {
    const at = menuBelow(element);
    setMenu({ ...at, items: [{ header: t('agent.sessions.title') }, { label: t('agent.sessions.loading'), disabled: true, run: () => {} }] });
    const sessions = await agentChat.sessions(key);
    const entries: MenuItem[] = sessions.slice(0, 30).map((session) => ({
      label: session.title,
      icon: History,
      hint: session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : undefined,
      run: () => agentChat.resume(key, session),
    }));
    const empty: MenuItem = { label: t('agent.sessions.none'), disabled: true, run: () => {} };
    setMenu({ ...at, items: [{ header: t('agent.sessions.title') }, ...(entries.length ? entries : [empty])] });
  };

  return { openChats, openSessions };
}

export function ChatToolbar({ info, running }: { info: AgentInfo; running: boolean; }) {
  const t = useT();
  const key = info.key;
  const [menu, setMenu] = useState<Menu | null>(null);
  const chat = agentChat.activeChat(key);
  const { openChats, openSessions } = useChatMenus(info, running, setMenu);

  return (
    <div className="shrink-0 border-b border-edge px-2 py-1.5">
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => openChats(e.currentTarget)}
          className="lm-transition flex min-w-0 flex-1 items-center gap-1 rounded-lumen-sm px-1.5 py-0.5 text-left text-[12px] text-fg hover:bg-hover"
          title={t('agent.chats.title')}
        >
          <MessageSquare size={11} className="shrink-0 text-subtle" />
          <span className="truncate">{chat.title}</span>
          <ChevronDown size={11} className="shrink-0 text-subtle" />
        </button>
        <button
          title={t('agent.sessions.open')}
          onClick={(e) => void openSessions(e.currentTarget)}
          className="lm-transition inline-flex h-6 items-center justify-center rounded-lumen-sm px-2 text-muted hover:bg-hover hover:text-fg"
        >
          <History size={12} />
        </button>
        <Button size="sm" title={t('agent.newChat')} onClick={() => agentChat.newChat(key)}>
          <Plus size={12} />
        </Button>
      </div>

      <ModelControls info={info} />

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
