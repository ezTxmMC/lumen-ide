import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown, Play, Square, Trash2, X, Hammer, FlaskConical, TerminalSquare,
  CircleAlert, Link2, Zap, SquareTerminal, Bug,
} from 'lucide-react'
import { useStore, type PanelTab } from '@/state/store'
import { lsp } from '@/core/lsp/manager'
import { runWithConfig, runTask, stopRun, defaultTask } from '@/lib/run'
import { t, tr, useT } from '@/i18n'
import { formatBindingsFor } from '@/core/keybindings'
import { Button, Empty } from './ui'
import { ProblemsPanel } from './panels/ProblemsPanel'
import { ReferencesPanel } from './panels/ReferencesPanel'
import { LspPanel } from './panels/LspPanel'
import { DebugPanel } from './panels/DebugPanel'
import { TerminalPanel, TerminalToolbar, useTerminals } from './panels/TerminalPanel'

/** The bottom panel: output, problems, references, language servers. */
export function OutputPanel() {
  const t = useT()
  const height = useStore((s) => s.panelHeight)
  const setHeight = useStore((s) => s.setPanelHeight)
  const togglePanel = useStore((s) => s.togglePanel)
  const tab = useStore((s) => s.panelTab)
  const setTab = useStore((s) => s.setPanelTab)
  const lspVersion = useStore((s) => s.lspVersion)
  const references = useStore((s) => s.references)
  const running = useStore((s) => s.runningId !== null)
  const debugging = useStore((s) => s.debugActive)

  const { sessions } = useTerminals()
  const counts = useMemo(() => lsp.diagnosticCounts(), [lspVersion])
  const servers = useMemo(() => lsp.list().filter((s) => s.status === 'ready').length, [lspVersion])

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height
    document.body.classList.add('lm-resizing-row')
    const move = (e: PointerEvent) => setHeight(startHeight + (startY - e.clientY))
    const up = () => {
      document.body.classList.remove('lm-resizing-row')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      useStore.getState().persist()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const tabs: { id: PanelTab; label: string; icon: typeof Play; badge?: string; tone?: string }[] = [
    { id: 'output', label: t('panels.tabs.output'), icon: TerminalSquare, badge: running ? '●' : undefined, tone: 'text-accent' },
    { id: 'terminal', label: t('panels.tabs.terminal'), icon: SquareTerminal, badge: sessions.length ? String(sessions.length) : undefined, tone: 'text-ok' },
    {
      id: 'problems', label: t('panels.tabs.problems'), icon: CircleAlert,
      badge: counts.errors + counts.warnings > 0 ? String(counts.errors + counts.warnings) : undefined,
      tone: counts.errors > 0 ? 'text-bad' : 'text-warn',
    },
    { id: 'references', label: t('panels.tabs.references'), icon: Link2, badge: references ? String(references.hits.length) : undefined },
    { id: 'debug', label: t('panels.tabs.debug'), icon: Bug, badge: debugging ? '●' : undefined, tone: 'text-warn' },
    { id: 'lsp', label: t('panels.tabs.lsp'), icon: Zap, badge: servers ? String(servers) : undefined, tone: 'text-ok' },
  ]

  return (
    <div
      className="lm-anim-panel flex shrink-0 flex-col border-t border-edge bg-surface"
      style={{ height }}
    >
      <div
        onPointerDown={startDrag}
        className="lm-transition h-[3px] shrink-0 cursor-row-resize hover:bg-accent"
      />

      <div className="flex h-8 shrink-0 items-center gap-0.5 px-2">
        {tabs.map(({ id, label, icon: Icon, badge, tone }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={[
              'lm-transition flex h-6 items-center gap-1.5 rounded-lumen-sm px-2 text-[11px] font-semibold uppercase tracking-[0.06em]',
              tab === id ? 'bg-active text-fg' : 'text-subtle hover:bg-hover hover:text-muted',
            ].join(' ')}
          >
            <Icon size={11} />
            {label}
            {badge && <span className={`rounded-full bg-bg px-1.5 text-[10px] font-normal tracking-normal ${tone ?? 'text-muted'}`}>{badge}</span>}
          </button>
        ))}

        <span className="min-w-2 flex-1" />

        {tab === 'output' && <OutputToolbar />}
        {tab === 'terminal' && <TerminalToolbar />}
        <Button size="sm" title={withKeys(t('common.close'), 'view.panel')} onClick={() => togglePanel(false)}>
          <X size={13} />
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'output' && <OutputBody />}
        {tab === 'terminal' && <TerminalPanel />}
        {tab === 'problems' && <ProblemsPanel />}
        {tab === 'references' && <ReferencesPanel />}
        {tab === 'lsp' && <LspPanel />}
        {tab === 'debug' && <DebugPanel />}
      </div>
    </div>
  )
}

/** A title with its shortcut, when the command has one. */
function withKeys(label: string, command: string) {
  const keys = formatBindingsFor(command)
  if (!keys) return label
  return `${label} (${keys})`
}

function OutputToolbar() {
  const t = useT()
  const running = useStore((s) => s.runningId !== null)
  const runningLabel = useStore((s) => s.runningLabel)
  const clearOutput = useStore((s) => s.clearOutput)
  const tab = useStore((s) => s.tabs.find((open) => open.id === s.activeTabId) ?? null)
  const language = useStore((s) => s.languageFor(tab))
  const project = useStore((s) => s.project)
  const config = useStore((s) => s.projectConfig)
  const [menuOpen, setMenuOpen] = useState(false)

  const runners = language?.run ?? []
  const build = defaultTask('build')
  const test = defaultTask('test')
  const allTasks = [...config.tasks, ...(project?.tasks ?? [])]

  return (
    <>
      {running ? (
        <Button size="sm" variant="danger" onClick={stopRun} title={t('project.cancelRun', { label: tr(runningLabel ?? '') })}>
          <Square size={11} className="fill-current" />
          <span className="max-w-[160px] truncate">{runningLabel ? tr(runningLabel) : t('panels.output.stop')}</span>
        </Button>
      ) : (
        <>
          {build && (
            <Button size="sm" onClick={() => void runTask(build)} title={t('panels.output.buildNamed', { label: tr(build.label) })}>
              <Hammer size={11} />
            </Button>
          )}
          {test && (
            <Button size="sm" onClick={() => void runTask(test)} title={t('panels.output.testNamed', { label: tr(test.label) })}>
              <FlaskConical size={11} />
            </Button>
          )}
          {(runners.length > 0 || allTasks.length > 0) && (
            <div className="relative">
              <Button size="sm" onClick={() => setMenuOpen((v) => !v)} title={t('panels.output.chooseRunner')}>
                <Play size={11} />
                <span className="max-w-[140px] truncate">{runners[0] ? tr(runners[0].label) : t('project.groups.run')}</span>
                <ChevronDown size={11} />
              </Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="lm-glass lm-shadow lm-anim-pop absolute top-full right-0 z-20 mt-1 max-h-[320px] min-w-[220px] overflow-auto rounded-lumen border border-edge">
                    {runners.length > 0 && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">
                        {t('panels.output.fileSection', { name: language?.name ?? '' })}
                      </div>
                    )}
                    {runners.map((cfg) => (
                      <button
                        key={cfg.label}
                        onClick={() => { setMenuOpen(false); void runWithConfig(cfg) }}
                        className="lm-transition block w-full px-3 py-1.5 text-left text-[12px] text-muted hover:bg-hover hover:text-fg"
                      >
                        <div>{tr(cfg.label)}</div>
                        <div className="truncate font-mono text-[10px] text-subtle">
                          {cfg.command} {cfg.args.join(' ')}
                        </div>
                      </button>
                    ))}
                    {allTasks.length > 0 && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">
                        {t('panels.output.projectSection', { name: project?.name ?? '' })}
                      </div>
                    )}
                    {allTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => { setMenuOpen(false); void runTask(task) }}
                        className="lm-transition block w-full px-3 py-1.5 text-left text-[12px] text-muted hover:bg-hover hover:text-fg"
                      >
                        <div>{tr(task.label)}</div>
                        <div className="truncate font-mono text-[10px] text-subtle">
                          {task.command} {task.args.join(' ')}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
      <Button size="sm" title={t('panels.output.clear')} onClick={clearOutput}>
        <Trash2 size={12} />
      </Button>
    </>
  )
}

const STREAM_TONE: Record<'stdout' | 'stderr' | 'system', string> = {
  stdout: 'text-muted',
  stderr: 'text-bad',
  system: 'text-accent',
}

/**
 * Compilers write everything to stderr — errors, warnings *and* notes. Without
 * reading the line, a run of pure warnings would come out entirely red. The
 * kind is recognised for gcc/clang (`file:1:2: warning: …`) and MSVC
 * (`C4101:`).
 */
const SEVERITY_TONE: [RegExp, string][] = [
  [/\berrors?\s+generated\b|\b(?:fatal error|error|Fehler)\b\s*(?:[A-Z]+\d+\s*)?:/i, 'text-bad'],
  [/\bwarnings?\s+generated\b|\b(?:warning|Warnung)\b\s*(?:[A-Z]+\d+\s*)?:/i, 'text-warn'],
  [/\b(?:note|Hinweis|remark)\b\s*:/i, 'text-subtle'],
]

/** A context line from gcc/clang (“In function …”, “In file included from …”). */
const CONTEXT_LINE = /^(?:In file included from |\s+from )|:\s+In (?:function|member function|constructor|destructor|instantiation of|lambda function)\b/

/** A continuation of the previous message: a source excerpt, a column marker, “ | ”. */
const CONTINUATION_LINE = /^\s*(?:\d+\s*\||\||[\s^~+-]*$)/

/**
 * Tinting per output line. Continuation lines inherit their message's tint, so
 * a source excerpt does not look louder than the message itself.
 */
function outputTones(lines: { stream: 'stdout' | 'stderr' | 'system'; text: string }[]): string[] {
  let carried: string | null = null
  return lines.map((line) => {
    if (line.stream === 'system') {
      carried = null
      return STREAM_TONE.system
    }
    const hit = SEVERITY_TONE.find(([re]) => re.test(line.text))
    if (hit) {
      carried = hit[1]
      return hit[1]
    }
    if (CONTEXT_LINE.test(line.text)) {
      carried = null
      return 'text-subtle'
    }
    if (carried && CONTINUATION_LINE.test(line.text)) return carried
    carried = null
    return STREAM_TONE[line.stream]
  })
}

function emptyHint(hasTasks: boolean, runner: string | undefined): string {
  const run = formatBindingsFor('project.run') ?? '—'
  if (hasTasks) return t('panels.output.hintTasks', { run, build: formatBindingsFor('project.build') ?? '—' })
  if (runner) return t('panels.output.hintRunner', { run, runner: tr(runner) })
  return t('panels.output.hintNoRunner')
}

function OutputBody() {
  const t = useT()
  const output = useStore((s) => s.output)
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
  const language = useStore((s) => s.languageFor(tab))
  const project = useStore((s) => s.project)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [output])

  const runners = language?.run ?? []
  const tones = useMemo(() => outputTones(output), [output])

  return (
    <div className="h-full overflow-auto px-3 pb-2 font-mono text-[11.5px] leading-[1.55]">
      {output.length === 0 ? (
        <Empty
          title={t('panels.output.empty')}
          hint={emptyHint(Boolean(project?.tasks.length), runners[0]?.label)}
        />
      ) : (
        output.map((line, index) => (
          <div
            key={index}
            className={`whitespace-pre-wrap break-all ${tones[index]}`}
          >
            <OutputLine text={line.text} />
          </div>
        ))
      )}
      <div ref={bottom} />
    </div>
  )
}

/** Make file:line patterns in the output clickable (compiler errors). */
function OutputLine({ text }: { text: string }) {
  const openAt = useStore((s) => s.openAt)
  const workspace = useStore((s) => s.workspace)
  const parts = useMemo(() => {
    const re = /((?:[A-Za-z]:)?[\w./\\+-]+\.(?:java|kt|kts|c|h|cpp|cc|cxx|c\+\+|hpp|hh|hxx|ipp|inl|tcc|ts|tsx|js|jsx|mjs|cjs|py|rs|go|nv))[(:](\d+)(?:[,:](\d+))?\)?/g
    const out: { text: string; path?: string; line?: number; col?: number }[] = []
    let last = 0
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0
      if (index > last) out.push({ text: text.slice(last, index) })
      out.push({ text: m[0], path: m[1], line: Number(m[2]), col: m[3] ? Number(m[3]) : 1 })
      last = index + m[0].length
    }
    if (last < text.length) out.push({ text: text.slice(last) })
    return out
  }, [text])

  if (parts.length === 1 && !parts[0].path) return <>{text || ' '}</>
  return (
    <>
      {parts.map((p, i) =>
        p.path ? (
          <button
            key={i}
            className="underline decoration-dotted underline-offset-2 hover:text-fg"
            onClick={() => {
              const path = p.path!.startsWith('/') || /^[A-Za-z]:/.test(p.path!)
                ? p.path!
                : `${workspace ?? ''}/${p.path!.replace(/^\.\//, '')}`
              void openAt(path, Math.max(0, p.line! - 1), Math.max(0, (p.col ?? 1) - 1))
            }}
          >
            {p.text}
          </button>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}
