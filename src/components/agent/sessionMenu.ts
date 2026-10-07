/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The “…” menu of an agent chat: the session actions the agent supports and the per-chat system prompt. */

import { Archive, Download, GitFork, MessageSquareText, Trash2, Undo2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { agentChat, type AgentInfo } from '@/core/agent/chat';
import type { MenuItem } from '@/components/ui/ContextMenu';

type Translate = (key: string, params?: Record<string, string | number>) => string;

function editSystemPrompt(info: AgentInfo, t: Translate) {
  const chat = agentChat.activeChat(info.key);
  useStore.getState().openForm({
    title: t('agent.systemPrompt.title'),
    submitLabel: t('common.save'),
    initial: { prompt: chat.systemPrompt },
    fields: [{ id: 'prompt', label: t('agent.systemPrompt.label'), type: 'textarea', hint: t('agent.systemPrompt.hint'), placeholder: t('agent.systemPrompt.placeholder') }],
    onSubmit: (values) => agentChat.setSystemPrompt(info.key, values.prompt ?? ''),
  });
}

function deleteSession(info: AgentInfo, t: Translate) {
  const chat = agentChat.activeChat(info.key);
  if (!confirm(t('agent.deleteConfirm', { title: chat.title }))) {
    return;
  }
  void agentChat.runAction(info.key, 'delete');
}

/** Only what the agent declares it can do; an empty list means the button has nothing to offer. */
export function sessionMenuItems(info: AgentInfo, running: boolean, t: Translate): MenuItem[] {
  const key = info.key;
  const capabilities = agentChat.capabilities(key);
  const busy = running || !agentChat.activeChat(key).sessionId;
  const items: MenuItem[] = [];
  if (capabilities.compact) {
    items.push({ label: t('agent.actions.compact'), icon: Archive, disabled: busy, run: () => void agentChat.runAction(key, 'compact') });
  }
  if (capabilities.rewind) {
    items.push({ label: t('agent.actions.rewind'), icon: Undo2, disabled: busy, run: () => void agentChat.runAction(key, 'rewind') });
  }
  if (capabilities.fork) {
    items.push({ label: t('agent.actions.fork'), icon: GitFork, disabled: busy, run: () => void agentChat.runAction(key, 'fork') });
  }
  if (capabilities.export) {
    items.push({ label: t('agent.actions.export'), icon: Download, disabled: busy, run: () => void agentChat.runAction(key, 'export') });
  }
  if (info.agent.systemPrompt) {
    const active = agentChat.activeChat(key).systemPrompt.length > 0;
    items.push({ label: t('agent.systemPrompt.menu'), icon: MessageSquareText, checked: active, run: () => editSystemPrompt(info, t) });
  }
  if (capabilities.delete) {
    items.push('sep', { label: t('agent.actions.delete'), icon: Trash2, danger: true, disabled: busy, run: () => deleteSession(info, t) });
  }
  return items;
}
