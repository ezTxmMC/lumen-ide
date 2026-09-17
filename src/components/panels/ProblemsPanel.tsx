import { useMemo, useState } from 'react'
import { CircleAlert, TriangleAlert, Info, Lightbulb, Filter } from 'lucide-react'
import { useStore, relativeToWorkspace } from '@/state/store'
import { lsp } from '@/core/lsp/manager'
import { fileGlyph } from '@/lib/file-icon'
import { IconGlyph } from '../icons/FileIcon'
import { useT } from '@/i18n'
import { Empty } from '../ui'

const SEVERITY = {
  1: { icon: CircleAlert, tone: 'text-bad', label: 'panels.problems.error' },
  2: { icon: TriangleAlert, tone: 'text-warn', label: 'panels.problems.warning' },
  3: { icon: Info, tone: 'text-accent', label: 'panels.problems.info' },
  4: { icon: Lightbulb, tone: 'text-subtle', label: 'panels.problems.hint' },
} as const

export function ProblemsPanel() {
  const t = useT()
  const lspVersion = useStore((s) => s.lspVersion)
  const workspace = useStore((s) => s.workspace)
  const activePath = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null)
  const openAt = useStore((s) => s.openAt)
  const [onlyActive, setOnlyActive] = useState(false)
  const [hideHints, setHideHints] = useState(true)

  const files = useMemo(() => lsp.allDiagnostics(), [lspVersion])
  const visible = useMemo(
    () => files
      .filter((f) => !onlyActive || f.path === activePath)
      .map((f) => ({
        ...f,
        diagnostics: f.diagnostics
          .filter((d) => !hideHints || (d.severity ?? 1) <= 3)
          .sort((a, b) => (a.severity ?? 1) - (b.severity ?? 1) || a.range.start.line - b.range.start.line),
      }))
      .filter((f) => f.diagnostics.length > 0),
    [files, onlyActive, hideHints, activePath],
  )
  const total = visible.reduce((n, f) => n + f.diagnostics.length, 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-1 text-[11px] text-subtle">
        <Filter size={11} />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          {t('panels.problems.onlyActive')}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={hideHints} onChange={(e) => setHideHints(e.target.checked)} />
          {t('panels.problems.hideHints')}
        </label>
        <span className="ml-auto">{t('panels.problems.messages', { count: total })} {t('search.inFiles', { count: visible.length })}</span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {visible.length === 0 && (
          <Empty
            title={t('panels.problems.empty')}
            hint={t('panels.problems.emptyHint')}
          />
        )}
        {visible.map((file) => {
          const glyph = fileGlyph(file.path.split(/[\\/]/).pop() ?? file.path)
          return (
            <div key={file.path} className="mb-1">
              <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-0.5 text-[11px] font-medium text-muted" title={file.path}>
                <IconGlyph icon={glyph} size={12} />
                <span className="truncate">{relativeToWorkspace(file.path, workspace)}</span>
                <span className="text-subtle">{file.diagnostics.length}</span>
              </div>
              {file.diagnostics.map((d, i) => {
                const sev = SEVERITY[(d.severity ?? 1) as 1 | 2 | 3 | 4]
                const Icon = sev.icon
                return (
                  <button
                    key={`${d.range.start.line}-${d.range.start.character}-${i}`}
                    onClick={() => void openAt(
                      file.path, d.range.start.line, d.range.start.character,
                      d.range.end.line, d.range.end.character,
                    )}
                    className="lm-transition flex w-full items-start gap-2 px-3 py-[3px] text-left hover:bg-hover"
                    title={`${t(sev.label)}${d.source ? ` · ${d.source}` : ''}${d.code ? ` [${d.code}]` : ''}`}
                  >
                    <Icon size={12} className={`mt-[3px] shrink-0 ${sev.tone}`} />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
                      {d.message.split('\n')[0]}
                      {d.code !== undefined && <span className="ml-1.5 text-[10px] text-subtle">[{d.code}]</span>}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-subtle tabular-nums">
                      {d.range.start.line + 1}:{d.range.start.character + 1}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
