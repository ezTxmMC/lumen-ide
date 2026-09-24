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
 * The chat of an agent an extension registers: streamed answers, the tools it
 * runs, the plan it follows, and — above all — the question “may it?” before
 * each action. Nothing here knows which product answers; the state lives in
 * `core/agent/chat.ts`, the pieces in `components/agent/`.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { agentChat } from '@/core/agent/chat';
import { ChatMessage } from '@/components/agent/ChatItems';
import { ChatToolbar } from '@/components/agent/ChatToolbar';
import { Composer } from '@/components/agent/Composer';

function EmptyChat({ agentKey }: { agentKey: string; }) {
  const t = useT();
  const workspace = useStore((s) => s.workspace);
  const info = agentChat.find(agentKey);
  if (!info) {
    return null;
  }
  const suggestions = info.agent.suggestions ?? [];
  return (
    <div className="m-auto max-w-[260px] text-center text-[12px] leading-relaxed text-subtle">
      <Sparkles size={22} strokeWidth={1.4} className="mx-auto mb-2 text-accent" />
      {workspace ? (info.agent.description ?? t('agent.empty', { name: info.agent.name })) : t('agent.noProject')}
      {workspace && suggestions.length > 0 && (
        <div className="mt-3 flex flex-col gap-1 text-left">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em]">{t('agent.suggestions')}</div>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => void agentChat.send(agentKey, suggestion)}
              className="lm-transition rounded-lumen-sm border border-edge px-2 py-1 text-left text-[11.5px] text-muted hover:border-accent hover:text-fg"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentPanel({ agentKey }: { agentKey: string; }) {
  const t = useT();
  useSyncExternalStore(agentChat.subscribe, agentChat.getVersion);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const info = agentChat.find(agentKey);
  const chat = agentChat.activeChat(agentKey);
  const items = chat.items;
  const running = chat.running;

  // Follow the answer as it streams in — unless the user scrolled up to read.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !stick.current) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [items, running, chat.id]);

  if (!info) {
    return null;
  }

  const onScroll = () => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatToolbar info={info} running={running} />

      <div ref={scroller} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {items.length === 0 && <EmptyChat agentKey={agentKey} />}
        {items.map((item) => <ChatMessage key={item.id} agentKey={agentKey} item={item} />)}
        {running && (
          <div className="flex items-center gap-1.5 text-[11.5px] text-subtle">
            <Loader2 size={11} className="lm-anim-spin" /> {chat.status ?? t('agent.working')}
          </div>
        )}
      </div>

      <Composer key={chat.id} info={info} running={running} />
    </div>
  );
}
