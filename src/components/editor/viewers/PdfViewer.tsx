import type { Tab } from '@/state/store'
import { mediaUrl } from '@/lib/media-kind'
import { InfoBar, useFileInfo } from './chrome'

/** PDFs in Chromium's own viewer (search, zoom, print and page thumbnails come with it). */
export function PdfViewer({ tab }: { tab: Tab }) {
  const path = tab.path ?? ''
  const revision = tab.revision ?? 0
  const info = useFileInfo(path, revision)
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg" data-viewer="pdf">
      <iframe key={revision} src={mediaUrl(path, revision)} title={tab.name} className="min-h-0 w-full flex-1 border-0" />
      <InfoBar tab={tab} info={info} />
    </div>
  )
}
