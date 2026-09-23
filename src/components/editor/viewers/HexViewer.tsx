import { useEffect, useMemo, useState } from 'react'
import { Binary } from 'lucide-react'
import type { Tab } from '@/state/store'
import { extensionOf, formatBytes, hexRows } from '@/lib/media-kind'
import { useT } from '@/i18n'
import { InfoBar, InfoItem, ViewerFallback } from './chrome'

/** How much of a binary file the hex view shows. */
const HEX_BYTES = 64 * 1024

interface Loaded {
  size: number
  mtime: number
  head: Uint8Array
}

/** Everything else binary: the first bytes as offset | hex | ASCII, plus the facts. */
export function HexViewer({ tab }: { tab: Tab }) {
  const t = useT()
  const path = tab.path ?? ''
  const revision = tab.revision ?? 0
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    window.lumen.media.inspect(path, HEX_BYTES)
      .then((result) => { if (alive) { setLoaded(result); setFailed(false) } })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [path, revision])

  const rows = useMemo(() => (loaded ? hexRows(loaded.head) : []), [loaded])
  const extension = extensionOf(path)
  const type = extension ? t('media.binaryType', { ext: extension.toUpperCase() }) : t('media.binaryFile')
  const info = loaded ? { size: loaded.size, mtime: loaded.mtime } : null

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg" data-viewer="binary">
      {failed && (
        <div className="min-h-0 flex-1">
          <ViewerFallback path={path} title={t('media.readFailed')} />
        </div>
      )}
      {!failed && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex items-center gap-3 border-b border-edge px-4 py-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lumen-sm bg-accent/15 text-accent">
              <Binary size={18} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-fg">{type}</div>
              <div className="text-[11.5px] text-subtle">{t('media.binaryHint')}</div>
            </div>
          </div>
          <div className="w-max min-w-full px-4 py-3 font-mono text-[12px] leading-[1.55] whitespace-pre" data-testid="hex-rows">
            {rows.map((row) => (
              <div key={row.offset} className="flex gap-5 hover:bg-hover">
                <span className="shrink-0 select-none text-subtle">{row.offset}</span>
                <span className="shrink-0 text-fg">{row.hex}</span>
                <span className="shrink-0 text-muted">{row.ascii}</span>
              </div>
            ))}
            {loaded && loaded.size > loaded.head.length && (
              <div className="mt-2 font-sans text-[11.5px] text-subtle">
                {t('media.truncated', { shown: formatBytes(loaded.head.length), total: formatBytes(loaded.size) })}
              </div>
            )}
          </div>
        </div>
      )}
      <InfoBar tab={tab} info={info}>
        <InfoItem label={t('media.type')} value={type} />
      </InfoBar>
    </div>
  )
}
