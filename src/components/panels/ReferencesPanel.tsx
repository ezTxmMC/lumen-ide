import { useMemo } from 'react'
import { Link2, Loader2, X } from 'lucide-react'
import { useStore, relativeToWorkspace, type ReferenceHit } from '@/state/store'
import { fileGlyph } from '@/lib/file-icon'
import { IconGlyph } from '../icons/FileIcon'
import { locale, useT } from '@/i18n'
import { formatBindingsFor } from '@/core/keybindings'
import { Button, Empty } from '../ui'

export function ReferencesPanel() {
  const t = useT()
  const references = useStore((s) => s.references)
  const workspace = useStore((s) => s.workspace)
  const openAt = useStore((s) => s.openAt)
  const setReferences = useStore((s) => s.setReferences)

  const grouped = useMemo(() => {
    const map = new Map<string, ReferenceHit[]>()
    for (const hit of references?.hits ?? []) {
      const list = map.get(hit.path) ?? []
      list.push(hit)
      map.set(hit.path, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], locale()))
  }, [references])

  if (!references) {
    return (
      <Empty
        icon={<Link2 size={22} strokeWidth={1.4} />}
        title={t('panels.references.empty')}
        hint={t('panels.references.emptyHint', { keys: formatBindingsFor('editor.references') ?? '—' })}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-1 text-[11.5px]">
        {references.loading ? <Loader2 size={11} className="lm-anim-spin text-accent" /> : <Link2 size={11} className="text-subtle" />}
        <span className="min-w-0 flex-1 truncate text-fg">{references.title}</span>
        <span className="text-subtle">{t('search.hits', { count: references.hits.length })} {t('search.inFiles', { count: grouped.length })}</span>
        <Button size="sm" title={t('panels.references.clear')} onClick={() => setReferences(null)}>
          <X size={12} />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {grouped.map(([path, hits]) => {
          const glyph = fileGlyph(path.split(/[\\/]/).pop() ?? path)
          return (
            <div key={path} className="mb-1">
              <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-0.5 text-[11px] font-medium text-muted" title={path}>
                <IconGlyph icon={glyph} size={12} />
                <span className="truncate">{relativeToWorkspace(path, workspace)}</span>
                <span className="text-subtle">{hits.length}</span>
              </div>
              {hits.map((hit, i) => (
                <button
                  key={`${hit.line}-${hit.character}-${i}`}
                  onClick={() => void openAt(hit.path, hit.line, hit.character, hit.endLine, hit.endCharacter)}
                  className="lm-transition flex w-full items-baseline gap-2 px-3 py-[3px] text-left hover:bg-hover"
                >
                  <span className="w-8 shrink-0 text-right font-mono text-[10.5px] text-subtle tabular-nums">
                    {hit.line + 1}
                  </span>
                  <span className="truncate font-mono text-[11.5px] text-muted">
                    {hit.preview ?? '…'}
                  </span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
