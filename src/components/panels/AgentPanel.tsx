/**
 * The chat of an agent an extension registers: messages, the tools it runs,
 * and — above all — the question “may it?” before each of them. Nothing here
 * knows which product answers; the state lives in `core/agent/chat.ts`.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, ChevronRight, Loader2, Plus, Send, ShieldQuestion, Sparkles, Square, X } from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { agentChat, type ChatItem } from '@/core/agent/chat'
import { Button } from '../ui'

/** The one line that says what a tool call is about. */
function summarize(input: Record<string, unknown>): string {
  for (const key of ['file_path', 'notebook_path', 'command', 'pattern', 'url', 'query', 'path', 'description']) {
    const value = input[key]
    if (typeof value === 'string' && value) return value
  }
  return ''
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** What the user should see before deciding: the diff, the file, the command. */
function Preview({ tool, input }: { tool: string; input: Record<string, unknown> }) {
  const oldText = text(input.old_string)
  const newText = text(input.new_string)
  if (tool === 'Edit' && (oldText || newText)) {
    return (
      <div className="mt-1.5 overflow-hidden rounded-lumen-sm border border-edge font-mono text-[11px] leading-snug">
        {oldText && <pre className="max-h-32 overflow-auto whitespace-pre-wrap bg-bad/10 px-2 py-1 text-bad">{oldText}</pre>}
        {newText && <pre className="max-h-32 overflow-auto whitespace-pre-wrap bg-good/10 px-2 py-1 text-good">{newText}</pre>}
      </div>
    )
  }
  const body = text(input.content) || text(input.command)
  if (!body) return null
  return <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-lumen-sm border border-edge bg-input px-2 py-1 font-mono text-[11px] leading-snug text-muted">{body}</pre>
}

function StatusIcon({ status }: { status: 'running' | 'done' | 'error' }) {
  if (status === 'running') return <Loader2 size={11} className="lm-anim-spin shrink-0 text-subtle" />
  if (status === 'error') return <X size={11} className="shrink-0 text-bad" />
  return <Check size={11} className="shrink-0 text-good" />
}

function ToolRow({ item }: { item: Extract<ChatItem, { role: 'tool' }> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-[11.5px]">
      <button onClick={() => setOpen(!open)} className="lm-transition flex w-full items-center gap-1.5 rounded-lumen-sm px-1 py-0.5 text-left text-muted hover:bg-hover">
        <ChevronRight size={11} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <StatusIcon status={item.status} />
        <span className="shrink-0 font-medium text-fg">{item.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-subtle">{summarize(item.input)}</span>
      </button>
      {open && (
        <div className="ml-4">
          <Preview tool={item.name} input={item.input} />
          {item.output && <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-lumen-sm border border-edge px-2 py-1 font-mono text-[11px] leading-snug text-subtle">{item.output}</pre>}
        </div>
      )}
    </div>
  )
}

function PermissionCard({ agentKey, item }: { agentKey: string; item: Extract<ChatItem, { role: 'permission' }> }) {
  const t = useT()
  const pendingNow = item.state === 'pending'
  const summary = summarize(item.input)
  return (
    <div className={`rounded-lumen border p-2.5 ${pendingNow ? 'border-accent bg-active' : 'border-edge bg-surface'}`}>
      <div className="flex items-center gap-1.5 text-[12px] text-fg">
        <ShieldQuestion size={13} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">{t('agent.wantsToUse', { tool: item.tool })}</span>
        {!pendingNow && <span className={`text-[10.5px] ${item.state === 'allowed' ? 'text-good' : 'text-bad'}`}>{t(item.state === 'allowed' ? 'agent.allowed' : 'agent.denied')}</span>}
      </div>
      {summary && <div className="mt-1 break-all font-mono text-[11px] text-muted">{summary}</div>}
      {item.blockedPath && <div className="mt-1 text-[11px] text-warn">{t('agent.outside', { path: item.blockedPath })}</div>}
      <Preview tool={item.tool} input={item.input} />
      {pendingNow && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="solid" onClick={() => void agentChat.answer(agentKey, item.requestId, true)}>{t('agent.allow')}</Button>
          {item.canRemember && <Button size="sm" variant="outline" onClick={() => void agentChat.answer(agentKey, item.requestId, true, true)}>{t('agent.allowAlways')}</Button>}
          <Button size="sm" variant="danger" onClick={() => void agentChat.answer(agentKey, item.requestId, false)}>{t('agent.deny')}</Button>
        </div>
      )}
    </div>
  )
}

function Message({ agentKey, item }: { agentKey: string; item: ChatItem }) {
  if (item.role === 'user') {
    return (
      <div className="ml-6 rounded-lumen bg-active px-2.5 py-1.5 text-[12.5px] text-fg">
        <div className="whitespace-pre-wrap break-words">{item.text}</div>
        {item.context && <div className="mt-1 truncate font-mono text-[10px] text-subtle">@{item.context}</div>}
      </div>
    )
  }
  if (item.role === 'assistant') return <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-fg">{item.text}</div>
  if (item.role === 'tool') return <ToolRow item={item} />
  if (item.role === 'permission') return <PermissionCard agentKey={agentKey} item={item} />
  return <div className={`rounded-lumen-sm border border-dashed border-edge px-2 py-1.5 text-[11.5px] ${item.error ? 'text-bad' : 'text-subtle'}`}>{item.text}</div>
}

export function AgentPanel({ agentKey }: { agentKey: string }) {
  const t = useT()
  useSyncExternalStore(agentChat.subscribe, agentChat.getVersion)
  const workspace = useStore((s) => s.workspace)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const info = agentChat.find(agentKey)
  const items = agentChat.items(agentKey)
  const running = agentChat.isRunning(agentKey)
  const mode = agentChat.mode(agentKey)
  const modes = info?.agent.modes ?? []

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [items, running])

  if (!info) return null

  const submit = () => {
    if (!draft.trim() || running) return
    void agentChat.send(agentKey, draft)
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-edge px-2 py-1.5">
        {modes.map((entry) => (
          <button
            key={entry.id}
            title={entry.description}
            onClick={() => agentChat.setMode(agentKey, entry.id)}
            className={[
              'lm-transition rounded-full border px-2 py-0.5 text-[11px]',
              entry.id === mode ? 'border-accent bg-active text-fg' : 'border-edge text-muted hover:border-edge-strong',
            ].join(' ')}
          >
            {entry.label}
          </button>
        ))}
        <span className="flex-1" />
        <Button size="sm" title={t('agent.newChat')} disabled={running} onClick={() => agentChat.reset(agentKey)}>
          <Plus size={12} />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {items.length === 0 && (
          <div className="m-auto max-w-[240px] text-center text-[12px] leading-relaxed text-subtle">
            <Sparkles size={22} strokeWidth={1.4} className="mx-auto mb-2 text-accent" />
            {workspace ? (info.agent.description ?? t('agent.empty', { name: info.agent.name })) : t('agent.noProject')}
          </div>
        )}
        {items.map((item) => <Message key={item.id} agentKey={agentKey} item={item} />)}
        {running && (
          <div className="flex items-center gap-1.5 text-[11.5px] text-subtle">
            <Loader2 size={11} className="lm-anim-spin" /> {t('agent.working')}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-edge p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
            e.preventDefault()
            submit()
          }}
          rows={3}
          disabled={!workspace}
          placeholder={info.agent.placeholder ?? t('agent.placeholder', { name: info.agent.name })}
          className="lm-transition w-full resize-none rounded-lumen-sm border border-edge bg-input px-2 py-1.5 text-[12.5px] outline-none placeholder:text-subtle focus:border-accent disabled:opacity-50"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-[11px] text-muted">
            <input
              type="checkbox"
              className="accent-[var(--c-accent)]"
              checked={agentChat.includeFile(agentKey)}
              onChange={(e) => agentChat.setIncludeFile(agentKey, e.target.checked)}
            />
            <span className="truncate">{t('agent.includeFile')}</span>
          </label>
          {running && (
            <Button size="sm" variant="outline" onClick={() => void agentChat.interrupt(agentKey)}>
              <Square size={11} /> {t('agent.stop')}
            </Button>
          )}
          {!running && (
            <Button size="sm" variant="solid" disabled={!draft.trim() || !workspace} onClick={submit}>
              <Send size={11} /> {t('agent.send')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
