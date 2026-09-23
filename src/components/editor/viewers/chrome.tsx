import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, FileCode2, FileQuestion, FolderSearch } from 'lucide-react'
import { useStore, type Tab } from '@/state/store'
import { formatBytes, isSvgPath } from '@/lib/media-kind'
import { useT } from '@/i18n'
import { Button } from '../../ui'

export interface FileInfo {
  size: number
  mtime: number
}

/** Size and modification time of a viewer's file, fetched again whenever it changes on disk. */
export function useFileInfo(path: string, revision: number): FileInfo | null {
  const [info, setInfo] = useState<FileInfo | null>(null)
  useEffect(() => {
    let alive = true
    window.lumen.media.inspect(path, 0)
      .then((result) => { if (alive) setInfo({ size: result.size, mtime: result.mtime }) })
      .catch(() => { if (alive) setInfo(null) })
    return () => { alive = false }
  }, [path, revision])
  return info
}

export function openWithSystem(path: string) {
  window.lumen.media.openWithSystem(path).catch((err: Error) => {
    useStore.getState().notify(err.message, 'error')
  })
}

/** One “label value” pair in the info bar. */
export function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="text-subtle">{label}</span>
      <span className="tabular-nums text-muted">{value}</span>
    </span>
  )
}

/** The strip below every viewer: facts on the left, file actions on the right. */
export function InfoBar({ tab, info, children, tools }: {
  tab: Tab
  info: FileInfo | null
  children?: ReactNode
  tools?: ReactNode
}) {
  const t = useT()
  const setTextMode = useStore((s) => s.setTabTextMode)
  const path = tab.path ?? ''
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 overflow-x-auto border-t border-edge bg-surface px-3 text-[11.5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {info && <InfoItem label={t('media.size')} value={formatBytes(info.size)} />}
      {children}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {tools}
        {tools && <span className="mx-1 h-4 w-px bg-edge" />}
        {isSvgPath(path) && (
          <Button size="sm" title={t('media.openAsText')} onClick={() => void setTextMode(tab.id, true)}>
            <FileCode2 size={12} /> {t('media.openAsText')}
          </Button>
        )}
        <Button size="sm" title={t('media.revealInFolder')} onClick={() => void window.lumen.shell.showItemInFolder(path)}>
          <FolderSearch size={12} />
        </Button>
        <Button size="sm" title={t('media.openWithSystem')} onClick={() => openWithSystem(path)}>
          <ExternalLink size={12} /> {t('media.openExternally')}
        </Button>
      </div>
    </div>
  )
}

/** Shown when a file cannot be previewed here (an unsupported codec, TIFF, a broken file). */
export function ViewerFallback({ path, title, hint }: { path: string; title: string; hint?: string }) {
  const t = useT()
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="lm-glass lm-shadow lm-anim-fade flex max-w-sm flex-col items-center gap-3 rounded-lumen border border-edge px-8 py-7 text-center">
        <FileQuestion size={30} className="text-subtle" />
        <div className="text-[13px] font-medium text-fg">{title}</div>
        {hint && <div className="text-[12px] leading-snug text-subtle">{hint}</div>}
        <Button variant="outline" onClick={() => openWithSystem(path)}>
          <ExternalLink size={12} /> {t('media.openWithSystem')}
        </Button>
      </div>
    </div>
  )
}
