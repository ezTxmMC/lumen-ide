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
 * The items of an agent chat: messages, thinking, tool calls, permission
 * requests, the agent's plan and the footer of each turn.
 */

import { useState } from 'react';
import {
  Brain, Check, ChevronRight, Circle, CircleCheck, CircleDot, FileCode2, ListTodo, Loader2, ShieldQuestion, X,
} from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { agentChat, type ChatItem, type TodoEntry } from '@/core/agent/chat';
import { Button } from '@/components/ui';
import { Markdown } from './Markdown';

type ItemOf<R extends ChatItem['role']> = Extract<ChatItem, { role: R; }>;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** The one line that says what a tool call is about. */
export function summarize(input: Record<string, unknown>): string {
  for (const key of ['file_path', 'notebook_path', 'command', 'pattern', 'url', 'query', 'path', 'description', 'prompt']) {
    const value = input[key];
    if (typeof value === 'string' && value) {
      return value.split('\n')[0];
    }
  }
  return '';
}

/** A file the tool works on, when it names one. */
function fileOf(input: Record<string, unknown>): string | null {
  const file = input.file_path ?? input.notebook_path ?? input.path;
  if (typeof file !== 'string' || !file.startsWith('/')) {
    return null;
  }
  return file;
}

function DiffBlock({ oldText, newText }: { oldText: string; newText: string; }) {
  return (
    <div className="mt-1.5 overflow-hidden rounded-lumen-sm border border-edge font-mono text-[11px] leading-snug">
      {oldText && <pre className="max-h-40 overflow-auto whitespace-pre-wrap bg-bad/10 px-2 py-1 text-bad">{oldText}</pre>}
      {newText && <pre className="max-h-40 overflow-auto whitespace-pre-wrap bg-ok/10 px-2 py-1 text-ok">{newText}</pre>}
    </div>
  );
}

/** What the user should see before deciding: the diff, the file, the command. */
export function Preview({ tool, input }: { tool: string; input: Record<string, unknown>; }) {
  if (tool === 'Edit' && (text(input.old_string) || text(input.new_string))) {
    return <DiffBlock oldText={text(input.old_string)} newText={text(input.new_string)} />;
  }
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    return (
      <>
        {(input.edits as Record<string, unknown>[]).slice(0, 8).map((edit, i) => (
          <DiffBlock key={i} oldText={text(edit.old_string)} newText={text(edit.new_string)} />
        ))}
      </>
    );
  }
  const body = text(input.content) || text(input.command) || text(input.patch);
  if (!body) {
    return null;
  }
  const shell = tool === 'Bash' || tool === 'Shell';
  return (
    <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-lumen-sm border border-edge bg-input px-2 py-1 font-mono text-[11px] leading-snug text-muted">
      {shell ? `$ ${body}` : body}
    </pre>
  );
}

function StatusIcon({ status }: { status: 'running' | 'done' | 'error'; }) {
  if (status === 'running') {
    return <Loader2 size={11} className="lm-anim-spin shrink-0 text-subtle" />;
  }
  if (status === 'error') {
    return <X size={11} className="shrink-0 text-bad" />;
  }
  return <Check size={11} className="shrink-0 text-ok" />;
}

function FileLink({ file }: { file: string; }) {
  const t = useT();
  return (
    <button
      title={t('agent.openFile')}
      onClick={(e) => { e.stopPropagation(); void useStore.getState().openFile(file); }}
      className="lm-transition rounded p-0.5 text-subtle hover:text-accent"
    >
      <FileCode2 size={11} />
    </button>
  );
}

function ToolRow({ item }: { item: ItemOf<'tool'>; }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const file = fileOf(item.input);
  return (
    <div className="text-[11.5px]">
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen(!open)} className="lm-transition flex min-w-0 flex-1 items-center gap-1.5 rounded-lumen-sm px-1 py-0.5 text-left text-muted hover:bg-hover">
          <ChevronRight size={11} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          <StatusIcon status={item.status} />
          <span className="shrink-0 font-medium text-fg">{item.name}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-subtle">{summarize(item.input)}</span>
        </button>
        {file && <FileLink file={file} />}
      </div>
      {open && (
        <div className="ml-4">
          <Preview tool={item.name} input={item.input} />
          {item.output && (
            <>
              <div className="mt-1.5 text-[10px] uppercase tracking-[0.08em] text-subtle">{t('agent.output')}</div>
              <pre className="mt-0.5 max-h-56 overflow-auto whitespace-pre-wrap rounded-lumen-sm border border-edge px-2 py-1 font-mono text-[11px] leading-snug text-subtle">{item.output}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PermissionCard({ agentKey, item }: { agentKey: string; item: ItemOf<'permission'>; }) {
  const t = useT();
  const [reasoning, setReasoning] = useState(false);
  const [reason, setReason] = useState('');
  const pendingNow = item.state === 'pending';
  const summary = summarize(item.input);
  const deny = () => void agentChat.answer(agentKey, item.requestId, false, false, reason.trim() || undefined);
  return (
    <div className={`rounded-lumen border p-2.5 ${pendingNow ? 'border-accent bg-active' : 'border-edge bg-surface'}`}>
      <div className="flex items-center gap-1.5 text-[12px] text-fg">
        <ShieldQuestion size={13} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">{t('agent.wantsToUse', { tool: item.tool })}</span>
        {!pendingNow && <span className={`text-[10.5px] ${item.state === 'allowed' ? 'text-ok' : 'text-bad'}`}>{t(item.state === 'allowed' ? 'agent.allowed' : 'agent.denied')}</span>}
      </div>
      {summary && <div className="mt-1 break-all font-mono text-[11px] text-muted">{summary}</div>}
      {item.reason && <div className="mt-1 text-[11px] text-subtle">{t('agent.reason', { reason: item.reason })}</div>}
      {item.blockedPath && <div className="mt-1 text-[11px] text-warn">{t('agent.outside', { path: item.blockedPath })}</div>}
      <Preview tool={item.tool} input={item.input} />
      {pendingNow && reasoning && (
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') {
            deny();
          } }}
          placeholder={t('agent.reasonPlaceholder')}
          className="mt-2 w-full rounded-lumen-sm border border-edge bg-input px-2 py-1 text-[12px] outline-none focus:border-accent"
        />
      )}
      {pendingNow && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="solid" onClick={() => void agentChat.answer(agentKey, item.requestId, true)}>{t('agent.allow')}</Button>
          {item.canRemember && <Button size="sm" variant="outline" onClick={() => void agentChat.answer(agentKey, item.requestId, true, true)}>{t('agent.allowAlways')}</Button>}
          <Button size="sm" variant="danger" onClick={deny}>{t('agent.deny')}</Button>
          {!reasoning && <Button size="sm" onClick={() => setReasoning(true)}>{t('agent.denyWithReason')}</Button>}
        </div>
      )}
    </div>
  );
}

const TODO_ICON: Record<TodoEntry['status'], { icon: typeof Circle; tone: string; }> = {
  pending: { icon: Circle, tone: 'text-subtle' },
  in_progress: { icon: CircleDot, tone: 'text-accent' },
  completed: { icon: CircleCheck, tone: 'text-ok' },
};

function TodoCard({ item }: { item: ItemOf<'todos'>; }) {
  const t = useT();
  const done = item.items.filter((entry) => entry.status === 'completed').length;
  return (
    <div className="rounded-lumen border border-edge bg-surface p-2.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-fg">
        <ListTodo size={12} className="text-accent" />
        <span className="flex-1 font-medium">{t('agent.todos.title')}</span>
        <span className="text-[10.5px] text-subtle">{t('agent.todos.progress', { done, total: item.items.length })}</span>
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {item.items.map((entry, i) => {
          const { icon: Icon, tone } = TODO_ICON[entry.status];
          return (
            <li key={i} className="flex items-start gap-1.5 text-[11.5px]">
              <Icon size={11} className={`mt-0.5 shrink-0 ${tone}`} />
              <span className={entry.status === 'completed' ? 'text-subtle line-through' : 'text-muted'}>{entry.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ThinkingBlock({ item }: { item: ItemOf<'thinking'>; }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="text-[11.5px]">
      <button onClick={() => setOpen(!open)} className="lm-transition flex items-center gap-1.5 rounded-lumen-sm px-1 py-0.5 text-subtle hover:bg-hover hover:text-muted">
        <ChevronRight size={11} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        <Brain size={11} className={item.streaming ? 'lm-anim-pulse text-accent' : ''} />
        {item.streaming ? t('agent.thinking') : t('agent.thought')}
      </button>
      {open && <div className="ml-4 mt-1 whitespace-pre-wrap border-l-2 border-edge pl-2 text-[11.5px] leading-relaxed text-subtle">{item.text}</div>}
    </div>
  );
}

const formatNumber = (value: number) => (value >= 10_000 ? `${(value / 1000).toFixed(1)}k` : String(value));

function ResultFooter({ item }: { item: ItemOf<'result'>; }) {
  const t = useT();
  const { usage } = item;
  const parts = [
    usage.inputTokens !== undefined || usage.outputTokens !== undefined
      ? t('agent.usage.tokens', { input: formatNumber(usage.inputTokens ?? 0), output: formatNumber(usage.outputTokens ?? 0) })
      : null,
    usage.cacheReadTokens ? t('agent.usage.cached', { count: formatNumber(usage.cacheReadTokens) }) : null,
    usage.turns ? t('agent.usage.turns', { count: usage.turns }) : null,
    usage.durationMs ? t('agent.usage.duration', { seconds: (usage.durationMs / 1000).toFixed(1) }) : null,
    usage.costUsd ? t('agent.usage.cost', { cost: usage.costUsd.toFixed(usage.costUsd < 0.01 ? 4 : 2) }) : null,
  ].filter(Boolean);
  if (!parts.length && !item.isError) {
    return null;
  }
  return (
    <div className={`flex flex-wrap gap-x-2 px-1 font-mono text-[10px] ${item.isError ? 'text-bad' : 'text-subtle'}`}>
      {item.isError && <span>{t('agent.usage.failed')}</span>}
      {parts.map((part) => <span key={part}>{part}</span>)}
    </div>
  );
}

export function ChatMessage({ agentKey, item }: { agentKey: string; item: ChatItem; }) {
  if (item.role === 'user') {
    return (
      <div className="ml-6 rounded-lumen bg-active px-2.5 py-1.5 text-[12.5px] text-fg">
        <div className="whitespace-pre-wrap break-words">{item.text}</div>
        {item.attachments?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.attachments.map((entry, i) => entry.preview
              ? <img key={i} src={entry.preview} alt={entry.name} className="h-10 rounded border border-edge object-cover" />
              : <span key={i} className="rounded bg-input px-1 text-[10px] text-subtle">{entry.name}</span>)}
          </div>
        ) : null}
        {item.context && <div className="mt-1 truncate font-mono text-[10px] text-subtle">@{item.context}</div>}
      </div>
    );
  }
  if (item.role === 'assistant') {
    return <Markdown text={item.text} streaming={item.streaming} />;
  }
  if (item.role === 'thinking') {
    return <ThinkingBlock item={item} />;
  }
  if (item.role === 'tool') {
    return <ToolRow item={item} />;
  }
  if (item.role === 'permission') {
    return <PermissionCard agentKey={agentKey} item={item} />;
  }
  if (item.role === 'todos') {
    return <TodoCard item={item} />;
  }
  if (item.role === 'result') {
    return <ResultFooter item={item} />;
  }
  return <div className={`rounded-lumen-sm border border-dashed border-edge px-2 py-1.5 text-[11.5px] ${item.error ? 'text-bad' : 'text-subtle'}`}>{item.text}</div>;
}
