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
 * Where the user writes to an agent: a multi-line field with `/` command and
 * `@` file suggestions, the message history on arrow-up, pasted or attached
 * images, and the switch that sends the open file and selection along.
 */

import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type RefObject } from 'react';
import { ImagePlus, Send, Square, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { agentChat, type AgentInfo, type DraftAttachment } from '@/core/agent/chat';
import type { AgentCommandSource } from '../../../electron/features/extension-host/contract';
import { fuzzyMatch } from '@/lib/fuzzy';
import { Button } from '@/components/ui';
import { QuickActions } from './QuickActions';

const MAX_SUGGESTIONS = 12;

/** The order the palette groups commands in. */
const SOURCE_ORDER: AgentCommandSource[] = ['builtin', 'user', 'project', 'plugin', 'skill'];

/** One line of the `/` or `@` palette. */
interface Suggestion {
  value: string;
  description?: string;
  hint?: string;
  source?: AgentCommandSource;
}
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface Token {
  trigger: '/' | '@';
  query: string;
  start: number;
  end: number;
}

/** The `/command` or `@file` being typed at the caret, if any. */
function tokenAt(value: string, caret: number): Token | null {
  const before = value.slice(0, caret);
  const match = /(^|\s)([/@])([^\s]*)$/.exec(before);
  if (!match) {
    return null;
  }
  const trigger = match[2] as '/' | '@';
  const start = before.length - match[3].length - 1;
  // Commands only count at the very start of the message.
  if (trigger === '/' && before.slice(0, start).trim()) {
    return null;
  }
  return { trigger, query: match[3], start, end: caret };
}

function readImage(file: File): Promise<DraftAttachment | null> {
  if (!file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      resolve({ name: file.name || 'image.png', mimeType: file.type, data: url.split(',')[1] ?? '', preview: url });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

const SUGGESTION_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'];

/** Arrows move through the suggestions, Enter or Tab takes one, Escape dismisses them. */
function navigateSuggestions(
  key: string,
  suggestions: Suggestion[],
  selected: number,
  actions: { setSelected: (update: (index: number) => number) => void; accept: (value: string) => void; dismiss: () => void; },
) {
  if (key === 'ArrowDown') {
    actions.setSelected((i) => (i + 1) % suggestions.length);
  }
  if (key === 'ArrowUp') {
    actions.setSelected((i) => (i - 1 + suggestions.length) % suggestions.length);
  }
  if (key === 'Enter' || key === 'Tab') {
    actions.accept(suggestions[selected].value);
  }
  if (key === 'Escape') {
    actions.dismiss();
  }
}

/** Rank candidates against the query; an empty query keeps the order, grouped by source. */
function rank(candidates: Suggestion[], query: string): Suggestion[] {
  if (!query) {
    const order = (entry: Suggestion) => SOURCE_ORDER.indexOf(entry.source ?? 'builtin');
    return [...candidates].sort((a, b) => order(a) - order(b)).slice(0, MAX_SUGGESTIONS);
  }
  return candidates
    .map((entry) => ({ entry, match: fuzzyMatch(entry.value, query) }))
    .filter((found) => found.match !== null)
    .sort((a, b) => b.match!.score - a.match!.score)
    .slice(0, MAX_SUGGESTIONS)
    .map((found) => found.entry);
}

/** The suggestions for the token at the caret; the workspace's files load on first `@`. */
function useSuggestions(token: Token | null, key: string, workspace: string | null) {
  const [files, setFiles] = useState<string[] | null>(null);
  const commands = agentChat.commands(key);
  const suggestions = useMemo(() => {
    if (!token) {
      return [];
    }
    if (token.trigger === '/') {
      const entries = commands.map((entry) => ({
        value: entry.name,
        description: entry.description,
        hint: entry.argumentHint,
        source: entry.source,
      }));
      return rank(entries, token.query);
    }
    return rank((files ?? []).map((file) => ({ value: file })), token.query);
  }, [token, commands, files]);

  const loadFiles = () => {
    if (files || !workspace) {
      return;
    }
    const prefix = `${workspace.replace(/[\\/]$/, '')}/`;
    void window.lumen.fs.listFiles(workspace, 20_000)
      .then((list) => setFiles(list.map((file) => (file.startsWith(prefix) ? file.slice(prefix.length) : file))))
      .catch(() => setFiles([]));
  };

  return { suggestions, loadFiles };
}

/** Pasted or attached images waiting to be sent. */
function useAttachments() {
  const t = useT();
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const addImages = async (list: File[]) => {
    const read = (await Promise.all(list.map(readImage))).filter((entry): entry is DraftAttachment => Boolean(entry));
    if (!read.length) {
      useStore.getState().notify(t('agent.imagesOnly'), 'warning');
      return;
    }
    setAttachments((current) => [...current, ...read]);
  };
  return { attachments, setAttachments, addImages };
}

function SuggestionList({ token, suggestions, selected, onAccept }: {
  token: Token | null;
  suggestions: Suggestion[];
  selected: number;
  onAccept: (value: string) => void;
}) {
  const t = useT();
  const grouped = token?.trigger === '/' && !token.query;
  return (
    <div role="listbox" className="lm-glass lm-shadow absolute right-2 bottom-full left-2 mb-1 max-h-64 overflow-y-auto rounded-lumen border border-edge p-1">
      <div className="px-2 pt-0.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">
        {t(token?.trigger === '/' ? 'agent.complete.commands' : 'agent.complete.files')}
      </div>
      {suggestions.map((entry, i) => {
        const startsGroup = grouped && entry.source !== suggestions[i - 1]?.source;
        return (
          <div key={entry.value}>
            {startsGroup && (
              <div className="px-2 pt-1 pb-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-subtle">
                {t(`agent.source.${entry.source ?? 'builtin'}`)}
              </div>
            )}
            <button
              role="option"
              aria-selected={i === selected}
              onMouseDown={(e) => { e.preventDefault(); onAccept(entry.value); }}
              className={`lm-transition block w-full rounded-lumen-sm px-2 py-1 text-left ${i === selected ? 'bg-hover text-fg' : 'text-muted'}`}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="min-w-0 truncate font-mono text-[11.5px]">{token?.trigger}{entry.value}</span>
                {entry.hint && <span className="shrink-0 font-mono text-[10.5px] text-subtle">{entry.hint}</span>}
                {entry.source && !grouped && token?.trigger === '/' && (
                  <span className="ml-auto shrink-0 text-[9.5px] uppercase text-subtle">{t(`agent.source.${entry.source}`)}</span>
                )}
              </span>
              {entry.description && <span className="block truncate text-[10.5px] text-subtle">{entry.description}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AttachmentStrip({ attachments, onRemove }: { attachments: DraftAttachment[]; onRemove: (index: number) => void; }) {
  const t = useT();
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5">
      {attachments.map((entry, i) => (
        <div key={i} className="group relative">
          <img src={entry.preview} alt={entry.name} className="h-12 rounded-lumen-sm border border-edge object-cover" />
          <button
            title={t('agent.removeAttachment')}
            onClick={() => onRemove(i)}
            className="absolute -top-1 -right-1 hidden rounded-full border border-edge bg-surface p-px text-subtle group-hover:block hover:text-bad"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ComposerBar({ info, running, canSend, canAttach, picker, onFiles, onSend }: {
  info: AgentInfo;
  running: boolean;
  canSend: boolean;
  canAttach: boolean;
  picker: RefObject<HTMLInputElement | null>;
  onFiles: (list: File[]) => void;
  onSend: () => void;
}) {
  const t = useT();
  const key = info.key;
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-[11px] text-muted">
        <input
          type="checkbox"
          className="accent-[var(--c-accent)]"
          checked={agentChat.includeFile(key)}
          onChange={(e) => agentChat.setIncludeFile(key, e.target.checked)}
        />
        <span className="truncate">{t('agent.includeFile')}</span>
      </label>
      {info.agent.images && (
        <>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
          />
          <Button size="sm" title={t('agent.attach')} onClick={() => picker.current?.click()} disabled={!canAttach}>
            <ImagePlus size={12} />
          </Button>
        </>
      )}
      {running && (
        <Button size="sm" variant="outline" onClick={() => void agentChat.interrupt(key)}>
          <Square size={11} /> {t('agent.stop')}
        </Button>
      )}
      {!running && (
        <Button size="sm" variant="solid" disabled={!canSend} onClick={onSend}>
          <Send size={11} /> {t('agent.send')}
        </Button>
      )}
    </div>
  );
}

/** Arrow-up and arrow-down through the messages sent before. */
function useInputHistory(key: string, setDraft: (text: string) => void) {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const browseHistory = (step: 1 | -1) => {
    const history = agentChat.history(key);
    if (!history.length) {
      return false;
    }
    const index = historyIndex === -1 ? history.length : historyIndex;
    const next = index - step;
    if (next < 0) {
      return true;
    }
    if (next >= history.length) {
      setHistoryIndex(-1);
      setDraft('');
      return true;
    }
    setHistoryIndex(next);
    setDraft(history[next]);
    return true;
  };

  return { historyIndex, setHistoryIndex, browseHistory };
}

export function Composer({ info, running }: { info: AgentInfo; running: boolean; }) {
  const t = useT();
  const workspace = useStore((s) => s.workspace);
  const key = info.key;
  const [draft, setDraft] = useState('');
  const [token, setToken] = useState<Token | null>(null);
  const [selected, setSelected] = useState(0);
  const { historyIndex, setHistoryIndex, browseHistory } = useInputHistory(key, setDraft);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { suggestions, loadFiles } = useSuggestions(token, key, workspace);
  const { attachments, setAttachments, addImages } = useAttachments();

  const update = (value: string, caret: number) => {
    setDraft(value);
    setHistoryIndex(-1);
    const next = tokenAt(value, caret);
    setToken(next);
    setSelected(0);
    if (next?.trigger === '@') {
      loadFiles();
    }
  };

  const accept = (value: string) => {
    if (!token) {
      return;
    }
    const insert = `${token.trigger}${value} `;
    const next = `${draft.slice(0, token.start)}${insert}${draft.slice(token.end)}`;
    setDraft(next);
    setToken(null);
    const caret = token.start + insert.length;
    window.requestAnimationFrame(() => field.current?.setSelectionRange(caret, caret));
  };

  const submit = () => {
    if (!draft.trim() || running) {
      return;
    }
    void agentChat.send(key, draft, attachments);
    setDraft('');
    setAttachments([]);
    setToken(null);
    setHistoryIndex(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (suggestions.length && SUGGESTION_KEYS.includes(event.key)) {
      event.preventDefault();
      navigateSuggestions(event.key, suggestions, selected, { setSelected, accept, dismiss: () => setToken(null) });
      return;
    }
    const caret = event.currentTarget.selectionStart;
    const onFirstLine = !draft.slice(0, caret).includes('\n');
    const onLastLine = !draft.slice(caret).includes('\n');
    if (event.key === 'ArrowUp' && onFirstLine && browseHistory(1)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown' && onLastLine && historyIndex !== -1 && browseHistory(-1)) {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }
    event.preventDefault();
    submit();
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!info.agent.images) {
      return;
    }
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (!images.length) {
      return;
    }
    event.preventDefault();
    void addImages(images);
  };

  return (
    <div className="relative shrink-0 border-t border-edge p-2">
      {suggestions.length > 0 && (
        <SuggestionList token={token} suggestions={suggestions} selected={selected} onAccept={accept} />
      )}

      <QuickActions info={info} running={running} enabled={Boolean(workspace)} />

      {attachments.length > 0 && (
        <AttachmentStrip attachments={attachments} onRemove={(index) => setAttachments((current) => current.filter((_, i) => i !== index))} />
      )}

      <textarea
        ref={field}
        value={draft}
        onChange={(e) => update(e.target.value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => window.setTimeout(() => setToken(null), 120)}
        rows={3}
        disabled={!workspace}
        placeholder={info.agent.placeholder ?? t('agent.placeholder', { name: info.agent.name })}
        className="lm-transition max-h-60 min-h-[60px] w-full resize-y rounded-lumen-sm border border-edge bg-input px-2 py-1.5 text-[12.5px] outline-none placeholder:text-subtle focus:border-accent disabled:opacity-50"
      />
      <ComposerBar
        info={info}
        running={running}
        canSend={draft.trim().length > 0 && Boolean(workspace)}
        canAttach={Boolean(workspace)}
        picker={picker}
        onFiles={(list) => void addImages(list)}
        onSend={submit}
      />
    </div>
  );
}
