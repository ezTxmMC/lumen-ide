import type { Tab } from '@/state/store'
import { ImageViewer } from './ImageViewer'
import { PlayerViewer } from './PlayerViewer'
import { PdfViewer } from './PdfViewer'
import { FontViewer } from './FontViewer'
import { HexViewer } from './HexViewer'

/** The non-text viewer of a tab; keyed by the tab so zoom and playback start fresh per file. */
export function MediaViewer({ tab }: { tab: Tab }) {
  if (tab.viewer === 'image') return <ImageViewer key={tab.id} tab={tab} />
  if (tab.viewer === 'video') return <PlayerViewer key={tab.id} tab={tab} kind="video" />
  if (tab.viewer === 'audio') return <PlayerViewer key={tab.id} tab={tab} kind="audio" />
  if (tab.viewer === 'pdf') return <PdfViewer key={tab.id} tab={tab} />
  if (tab.viewer === 'font') return <FontViewer key={tab.id} tab={tab} />
  return <HexViewer key={tab.id} tab={tab} />
}
