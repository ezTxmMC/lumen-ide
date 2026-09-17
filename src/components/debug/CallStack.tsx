import { ChevronRight, Pause, Play, Square } from 'lucide-react'
import { useT } from '@/i18n'
import { debug } from '@/core/debug/manager'
import type { DebugSession, ThreadState } from '@/core/debug/session'
import { baseName } from '@/core/debug/paths'
import { DebugSection, IconButton } from './shared'

function Frames({ session, thread }: { session: DebugSession; thread: ThreadState }) {
  const t = useT()
  const focus = debug.focus
  const more = thread.totalFrames === undefined || thread.totalFrames > thread.frames.length
  return (
    <>
      {thread.frames.map((frame) => {
        const active = focus?.sessionId === session.id && focus.threadId === thread.id && focus.frameId === frame.id
        const source = frame.source?.name ?? (frame.source?.path ? baseName(frame.source.path) : '')
        const subtle = frame.presentationHint === 'subtle' || frame.source?.presentationHint === 'deemphasize' || !source
        return (
          <div
            key={frame.id}
            className={[
              'lm-row lm-transition mx-1 flex items-center gap-2 pr-1.5 text-[12px]',
              active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
              subtle && !active ? 'opacity-60' : '',
            ].join(' ')}
            style={{ paddingLeft: 22 }}
            onClick={() => void debug.selectFrame(session.id, thread.id, frame.id)}
            title={frame.source?.path ?? frame.name}
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{frame.name}</span>
            {source && <span className="shrink-0 truncate text-[11px] text-subtle">{source}:{frame.line}</span>}
          </div>
        )
      })}
      {thread.stopped && thread.frames.length > 0 && more && (
        <button
          className="lm-transition mx-1 w-[calc(100%-8px)] rounded-lumen-sm py-0.5 pl-[22px] text-left text-[11.5px] text-accent hover:bg-hover"
          onClick={() => void debug.loadMoreFrames(session.id, thread.id)}
        >
          {t('debug.stack.loadMore')}
        </button>
      )}
    </>
  )
}

const REASONS = new Set(['step', 'breakpoint', 'exception', 'pause', 'entry'])

/** Translate the stop reason; unknown reasons from the adapter stay as they are. */
function reasonLabel(t: (key: string) => string, reason?: string) {
  if (!reason) return t('debug.thread.paused')
  if (REASONS.has(reason)) return t(`debug.reason.${reason}`)
  return reason
}

function ThreadRow({ session, thread, showHeader }: { session: DebugSession; thread: ThreadState; showHeader: boolean }) {
  const t = useT()
  const focus = debug.focus
  const focused = focus?.sessionId === session.id && focus.threadId === thread.id
  const state = thread.stopped ? reasonLabel(t, thread.reason) : t('debug.thread.running')
  return (
    <>
      {showHeader && (
        <div
          className={`lm-row lm-transition mx-1 flex items-center gap-1.5 pr-1.5 text-[12px] ${focused ? 'text-fg' : 'text-muted'} hover:bg-hover`}
          style={{ paddingLeft: 8 }}
          onClick={() => void debug.selectThread(session.id, thread.id)}
          title={thread.description}
        >
          <ChevronRight size={11} className="shrink-0 opacity-70" style={{ transform: thread.stopped ? 'rotate(90deg)' : 'none' }} />
          <span className="min-w-0 flex-1 truncate">{thread.name}</span>
          <span className={`shrink-0 text-[10.5px] ${thread.stopped ? 'text-warn' : 'text-ok'}`}>{state}</span>
        </div>
      )}
      {thread.stopped && <Frames session={session} thread={thread} />}
    </>
  )
}

/** Sessions, threads and the call stack. */
export function CallStack() {
  const t = useT()
  const sessions = debug.sessions
  const threadCount = sessions.reduce((sum, s) => sum + s.threads.size, 0)
  const showSessions = sessions.length > 1
  const showThreads = showSessions || threadCount > 1

  return (
    <DebugSection id="stack" title={t('debug.section.callStack')} grow>
      {!sessions.length && <p className="px-3 py-1.5 text-[11.5px] text-subtle">{t('debug.stack.empty')}</p>}
      {sessions.map((session) => {
        const threads = [...session.threads.values()]
        const stopped = threads.some((th) => th.stopped)
        return (
          <div key={session.id}>
            {showSessions && (
              <div className="group mx-1 flex h-6 items-center gap-1.5 px-1.5 text-[12px] text-fg">
                <span className={`size-1.5 shrink-0 rounded-full ${stopped ? 'bg-warn' : 'bg-ok'}`} />
                <span className="min-w-0 flex-1 truncate" style={{ paddingLeft: session.parent ? 8 : 0 }}>{session.name}</span>
                <span className="flex opacity-0 group-hover:opacity-100">
                  {!stopped && threads[0] && (
                    <IconButton title={t('debug.cmd.pause')} onClick={() => void session.pause(threads[0].id).catch(() => {})}><Pause size={11} /></IconButton>
                  )}
                  {stopped && (
                    <IconButton title={t('debug.cmd.continue')} onClick={() => void debug.selectThread(session.id, threads.find((th) => th.stopped)!.id).then(() => debug.continue())}><Play size={11} /></IconButton>
                  )}
                  <IconButton title={t('debug.cmd.stop')} onClick={() => void debug.stopSession(session.id)} tone="hover:text-bad"><Square size={10} /></IconButton>
                </span>
              </div>
            )}
            {!threads.length && session.state !== 'terminated' && (
              <p className="px-4 py-0.5 text-[11.5px] text-subtle">{t(`debug.state.${session.state}`)}</p>
            )}
            {threads.map((thread) => <ThreadRow key={thread.id} session={session} thread={thread} showHeader={showThreads} />)}
          </div>
        )
      })}
    </DebugSection>
  )
}
