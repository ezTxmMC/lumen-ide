import { useEffect, useState } from 'react'
import type { Tab } from '@/state/store'
import { mediaUrl } from '@/lib/media-kind'
import { useT } from '@/i18n'
import { InfoBar, InfoItem, useFileInfo, ViewerFallback } from './chrome'

const SIZES = [12, 16, 20, 28, 36, 48, 64]
const CHARSETS = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789 ÄÖÜäöüß ÀÉÈÇÑ',
  '!?.,;:\'"()[]{}<>/\\|@#$%&*+-=_~^`',
]

let fontCounter = 0

/** Loads a font file under a family name of its own for as long as the viewer shows it. */
function useFontFace(url: string): { family: string | null; failed: boolean } {
  const [state, setState] = useState<{ family: string | null; failed: boolean }>({ family: null, failed: false })
  useEffect(() => {
    const family = `lumen-font-preview-${++fontCounter}`
    const face = new FontFace(family, `url("${url}")`)
    let alive = true
    face.load()
      .then((loaded) => {
        if (!alive) return
        document.fonts.add(loaded)
        setState({ family, failed: false })
      })
      .catch(() => { if (alive) setState({ family: null, failed: true }) })
    return () => {
      alive = false
      document.fonts.delete(face)
    }
  }, [url])
  return state
}

/** Fonts: an editable sample line in several sizes and the common characters. */
export function FontViewer({ tab }: { tab: Tab }) {
  const t = useT()
  const path = tab.path ?? ''
  const revision = tab.revision ?? 0
  const info = useFileInfo(path, revision)
  const { family, failed } = useFontFace(mediaUrl(path, revision))
  const [sample, setSample] = useState(() => t('media.fontSample'))
  const style = family ? { fontFamily: `"${family}", var(--font-mono)` } : undefined

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg" data-viewer="font" data-font-ready={family ? 'true' : 'false'}>
      {failed && (
        <div className="min-h-0 flex-1">
          <ViewerFallback path={path} title={t('media.fontUnsupported')} />
        </div>
      )}
      {!failed && (
        <div className="min-h-0 flex-1 overflow-auto px-8 py-6">
          <input
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            placeholder={t('media.fontSamplePlaceholder')}
            aria-label={t('media.fontSamplePlaceholder')}
            className="lm-transition mb-6 w-full rounded-lumen-sm border border-edge bg-input px-3 py-1.5 text-[12.5px] text-fg outline-none focus:border-accent"
          />
          <div className="flex flex-col gap-3" style={style}>
            {SIZES.map((size) => (
              <div key={size} className="flex items-baseline gap-4">
                <span className="w-10 shrink-0 text-right font-sans text-[10.5px] tabular-nums text-subtle">{size}</span>
                <span className="min-w-0 truncate text-fg" style={{ fontSize: size, lineHeight: 1.25 }}>{sample || tab.name}</span>
              </div>
            ))}
          </div>
          <div className="lm-glass mt-8 flex flex-col gap-2 rounded-lumen border border-edge px-5 py-4 text-[26px] leading-snug text-fg" style={style}>
            {CHARSETS.map((line) => <div key={line} className="break-all">{line}</div>)}
          </div>
        </div>
      )}
      <InfoBar tab={tab} info={info}>
        {family && <InfoItem label={t('media.format')} value={(path.split('.').pop() ?? '').toUpperCase()} />}
      </InfoBar>
    </div>
  )
}
