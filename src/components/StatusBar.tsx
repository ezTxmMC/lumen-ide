import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, ArrowUpCircle, Blocks, CircleDot, FolderKanban, Loader2, Zap, ZapOff, ChevronRight, Lock,
} from 'lucide-react'
import { useStore, isDirty } from '@/state/store'
import { registry } from '@/core/registry'
import { lsp } from '@/core/lsp/manager'
import { symbolStore, symbolPathAt } from '@/lib/symbols'
import { SYMBOL_GLYPH } from '@/core/lsp/protocol'
import { formatBindingsFor } from '@/core/keybindings'
import { useT } from '@/i18n'
import { useUpdater } from '@/features/updater'
import { symbolTone } from './panels/OutlinePanel'

/** A label with the command's shortcut, when it has one. */
function withKeys(label: string, commandId: string) {
  const keys = formatBindingsFor(commandId)
  if (!keys) return label
  return `${label} (${keys})`
}

export function StatusBar() {
  const t = useT()
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
  const effects = useStore((s) => s.effects)
  const running = useStore((s) => s.runningId !== null)
  const runningLabel = useStore((s) => s.runningLabel)
  const registryVersion = useStore((s) => s.registryVersion)
  const openDialog = useStore((s) => s.openDialog)
  const chordHint = useStore((s) => s.chordHint)
  const showSidebar = useStore((s) => s.showSidebar)
  const showPanel = useStore((s) => s.showPanel)
  const setPalette = useStore((s) => s.setPalette)
  const workspace = useStore((s) => s.workspace)
  const project = useStore((s) => s.project)
  const cursor = useStore((s) => s.cursor)

  const language = useStore((s) => s.languageFor(tab))
  const lspVersion = useStore((s) => s.lspVersion)
  const addonCount = useMemo(() => registry.activeIds().length, [registryVersion])
  const server = useMemo(() => lsp.status(language), [language, lspVersion])
  const busy = useMemo(() => lsp.anyBusy(), [lspVersion])
  const counts = useMemo(() => lsp.diagnosticCounts(), [lspVersion])
  const fileErrors = useMemo(
    () => lsp.diagnostics(tab?.path ?? null),
    [tab?.path, lspVersion],
  )
  const fileErrorCount = fileErrors.filter((d) => (d.severity ?? 1) === 1).length
  const fileWarnCount = fileErrors.filter((d) => d.severity === 2).length

  const [symbolVersion, setSymbolVersion] = useState(0)
  useEffect(() => symbolStore.subscribe(() => setSymbolVersion(symbolStore.getVersion())), [])
  const breadcrumb = useMemo(
    () => symbolPathAt(symbolStore.get(tab?.path ?? null), cursor).slice(-3),
    [tab?.path, cursor, symbolVersion],
  )

  const lines = tab ? tab.content.split('\n').length : 0

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-edge bg-surface px-3 text-[11px] text-subtle">
      {workspace && (
        <button
          className="lm-transition flex items-center gap-1 rounded px-1 hover:bg-hover hover:text-fg"
          title={project?.primary ? `${project.primary.kind.name} · ${workspace}` : workspace}
          onClick={() => showSidebar('project')}
        >
          <FolderKanban size={10} style={project?.primary?.kind.color ? { color: project.primary.kind.color } : undefined} />
          <span className="max-w-[180px] truncate">
            {project?.name ?? workspace.split(/[\\/]/).filter(Boolean).pop()}
          </span>
          {project?.primary && <span className="text-subtle">· {project.primary.kind.name}</span>}
        </button>
      )}

      {running && (
        <span className="flex items-center gap-1 text-accent" title={runningLabel ?? undefined}>
          <Loader2 size={10} className="lm-anim-spin" />
          <span className="max-w-[160px] truncate">{runningLabel ?? t('statusbar.running')}</span>
        </span>
      )}

      {busy && (
        <span className="flex max-w-[280px] items-center gap-1 truncate text-subtle" title={busy}>
          <Loader2 size={10} className="lm-anim-spin" />
          <span className="truncate">{busy}</span>
        </span>
      )}

      {(counts.errors > 0 || counts.warnings > 0) && (
        <button
          onClick={() => showPanel('problems')}
          className="lm-transition flex items-center gap-2 rounded px-1 hover:bg-hover"
          title={t('statusbar.problemsWorkspace')}
        >
          {counts.errors > 0 && <span className="text-bad">✗ {counts.errors}</span>}
          {counts.warnings > 0 && <span className="text-warn">▲ {counts.warnings}</span>}
        </button>
      )}

      {breadcrumb.length > 0 && (
        <span className="flex min-w-0 items-center gap-0.5 truncate" title={t('statusbar.symbolAtCursor')}>
          {breadcrumb.map((node, i) => (
            <span key={`${node.name}-${i}`} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight size={9} className="opacity-60" />}
              <span className="font-mono text-[9px] font-bold" style={{ color: symbolTone(node.kind) }}>{SYMBOL_GLYPH[node.kind] ?? '·'}</span>
              <span className="max-w-[140px] truncate text-muted">{node.name}</span>
            </span>
          ))}
        </span>
      )}

      <span className="flex-1" />

      {tab && server.status !== 'none' && !tab.virtual && <LspBadge server={server} />}

      {tab && (fileErrorCount > 0 || fileWarnCount > 0) && (
        <button
          onClick={() => showPanel('problems')}
          className="lm-transition flex items-center gap-2 rounded px-1 hover:bg-hover"
          title={t('statusbar.problemsFile')}
        >
          {fileErrorCount > 0 && <span className="text-bad">✗ {fileErrorCount}</span>}
          {fileWarnCount > 0 && <span className="text-warn">▲ {fileWarnCount}</span>}
        </button>
      )}

      {tab && (
        <>
          {tab.readonly && (
            <span className="flex items-center gap-1" title={t('statusbar.readonlyTitle')}>
              <Lock size={9} /> {t('statusbar.readonly')}
            </span>
          )}
          {isDirty(tab) && (
            <span className="flex items-center gap-1 text-warn" title={t('statusbar.unsavedTitle')}>
              <CircleDot size={10} /> {t('statusbar.unsaved')}
            </span>
          )}
          <button
            onClick={() => setPalette('symbols')}
            className="lm-transition rounded px-1 tabular-nums hover:bg-hover hover:text-fg"
            title={`${t('statusbar.lines', { count: lines })} — ${withKeys(t('statusbar.gotoSymbol'), 'editor.symbols')}`}
          >
            {t('statusbar.position', { line: String(cursor.line + 1), column: String(cursor.character + 1) })}
          </button>
          <span>{t('statusbar.indent', { size: language?.indentUnit ?? 2 })}</span>
          <button
            onClick={() => setPalette('commands')}
            className="lm-transition rounded px-1 hover:bg-hover hover:text-fg"
            title={t('statusbar.languageTitle')}
            style={language?.color ? { color: language.color } : undefined}
          >
            {language?.name ?? t('statusbar.plainText')}
          </button>
        </>
      )}

      {chordHint && <span className="lm-anim-fade rounded bg-active px-1.5 text-fg">{chordHint}</span>}

      {!tab && (
        <span className="flex items-center gap-1">
          <AlertCircle size={10} /> {t('statusbar.noFile')}
        </span>
      )}

      <UpdateBadge />

      <button
        onClick={() => openDialog('addons')}
        className="lm-transition flex items-center gap-1 rounded px-1 hover:bg-hover hover:text-fg"
        title={t('statusbar.manageAddons')}
      >
        <Blocks size={10} /> {addonCount}
      </button>

      <span title={t('statusbar.fontSize')}>{effects.fontSize}px</span>
    </footer>
  )
}

/** Visible only when an update is available, downloading, or ready. */
function UpdateBadge() {
  const t = useT()
  const openDialog = useStore((s) => s.openDialog)
  const update = useUpdater()
  if (!update.version) return null
  if (update.status !== 'available' && update.status !== 'downloading' && update.status !== 'ready') return null
  const percent = update.total ? Math.round(((update.received ?? 0) / update.total) * 100) : 0
  const tone = update.status === 'ready' ? 'text-ok' : 'text-accent'

  return (
    <button
      onClick={() => openDialog('settings', 'updates')}
      className={`lm-transition flex items-center gap-1 rounded px-1 hover:bg-hover ${tone}`}
      title={t('updater.badge.title')}
    >
      {update.status === 'downloading' ? <Loader2 size={10} className="lm-anim-spin" /> : <ArrowUpCircle size={10} />}
      {t(`updater.badge.${update.status}`, { version: update.version, percent })}
    </button>
  )
}

function LspIcon({ busy, active }: { busy: boolean; active: boolean }) {
  if (busy) return <Loader2 size={10} className="lm-anim-spin" />
  if (active) return <Zap size={10} />
  return <ZapOff size={10} />
}

/** `text` is a key. */
const LSP_LABEL: Record<string, { text: string; tone: string }> = {
  idle: { text: 'statusbar.lsp.idle', tone: 'text-subtle' },
  checking: { text: 'statusbar.lsp.checking', tone: 'text-subtle' },
  starting: { text: 'statusbar.lsp.starting', tone: 'text-warn' },
  ready: { text: 'statusbar.lsp.ready', tone: 'text-ok' },
  unavailable: { text: 'statusbar.lsp.unavailable', tone: 'text-subtle' },
  failed: { text: 'statusbar.lsp.failed', tone: 'text-bad' },
  stopped: { text: 'statusbar.lsp.stopped', tone: 'text-subtle' },
}

function LspBadge({ server }: { server: ReturnType<typeof lsp.status> }) {
  const t = useT()
  const showPanel = useStore((s) => s.showPanel)
  const info = LSP_LABEL[server.status] ?? LSP_LABEL.idle
  const text = t(info.text)
  const active = server.status === 'ready'
  const busy = server.status === 'starting' || server.status === 'checking'

  const title = [
    server.label,
    server.detail,
    server.status === 'unavailable' && server.install
      ? t('statusbar.lsp.install', { command: server.install })
      : '',
    t('statusbar.lsp.clickPanel'),
  ].filter(Boolean).join(' — ')

  return (
    <button
      title={title || text}
      onClick={() => showPanel('lsp')}
      className={`lm-transition flex items-center gap-1 rounded px-1 hover:bg-hover ${info.tone}`}
    >
      <LspIcon busy={busy} active={active} />
      {active ? server.label.split(/[\s-]/)[0] : text}
    </button>
  )
}
