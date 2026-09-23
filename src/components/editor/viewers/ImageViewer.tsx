import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus, Scan } from 'lucide-react'
import type { Tab } from '@/state/store'
import { mediaUrl } from '@/lib/media-kind'
import { useT } from '@/i18n'
import { Button } from '../../ui'
import { InfoBar, InfoItem, useFileInfo, ViewerFallback } from './chrome'
import { windowOf } from '@/hooks/useOwner'

interface View {
  scale: number
  /** The image's top-left corner inside the viewport, in CSS pixels. */
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

const MIN_SCALE = 0.02
const MAX_SCALE = 64
const STEP = 1.25
/** SVGs without an intrinsic size report 0 — they get a sensible canvas instead. */
const FALLBACK_SIZE = 512

/** Behind transparent pixels, in the theme's own greys. */
const CHECKERBOARD: React.CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(var(--c-bg-active) 0 25%, var(--c-bg-hover) 0 50%)',
  backgroundSize: '16px 16px',
}

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

/** Shrink to fit, never enlarge — small icons stay crisp at 100 %. */
function fitView(image: Size, viewport: Size): View {
  const room = { width: Math.max(1, viewport.width - 32), height: Math.max(1, viewport.height - 32) }
  const scale = Math.min(1, room.width / image.width, room.height / image.height)
  return centered(image, viewport, scale)
}

function centered(image: Size, viewport: Size, scale: number): View {
  return {
    scale,
    x: Math.round((viewport.width - image.width * scale) / 2),
    y: Math.round((viewport.height - image.height * scale) / 2),
  }
}

/** Zoom to `scale` keeping the image point under (`ax`, `ay`) where it is. */
function zoomAround(view: View, scale: number, ax: number, ay: number): View {
  const next = clampScale(scale)
  const ratio = next / view.scale
  return { scale: next, x: ax - (ax - view.x) * ratio, y: ay - (ay - view.y) * ratio }
}

function useElementSize(ref: React.RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new (windowOf(element).ResizeObserver)(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

/**
 * Images: fit to the window or 100 %, zoom with Ctrl+wheel and the buttons,
 * pan by dragging or scrolling, a checkerboard behind transparent pixels.
 * An SVG with unsaved edits previews the edited text rather than the file.
 */
export function ImageViewer({ tab }: { tab: Tab }) {
  const t = useT()
  const path = tab.path ?? ''
  const revision = tab.revision ?? 0
  const info = useFileInfo(path, revision)
  const viewport = useRef<HTMLDivElement>(null)
  const size = useElementSize(viewport)
  const [natural, setNatural] = useState<Size | null>(null)
  const [failed, setFailed] = useState(false)
  const [fit, setFit] = useState(true)
  const [manual, setManual] = useState<View>({ scale: 1, x: 0, y: 0 })

  const edited = !tab.readonly && tab.content !== tab.saved
  const src = edited
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tab.content)}`
    : mediaUrl(path, revision)

  useEffect(() => { setFailed(false) }, [src])

  const image = natural ?? { width: FALLBACK_SIZE, height: FALLBACK_SIZE }
  const view = useMemo(
    () => (fit ? fitView(image, size) : manual),
    [fit, manual, image.width, image.height, size.width, size.height],
  )
  // Handlers attached outside React read the latest view through this.
  const viewRef = useRef(view)
  viewRef.current = view
  const failedRef = useRef(failed)
  failedRef.current = failed

  const zoomTo = (scale: number, anchor?: { x: number; y: number }) => {
    const ax = anchor?.x ?? size.width / 2
    const ay = anchor?.y ?? size.height / 2
    setManual(zoomAround(viewRef.current, scale, ax, ay))
    setFit(false)
  }

  const actualSize = () => {
    setManual(centered(image, size, 1))
    setFit(false)
  }

  /* Ctrl+wheel zooms around the pointer, the plain wheel pans; both must be able to prevent the default. */
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (failedRef.current) return
      event.preventDefault()
      const current = viewRef.current
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect()
        const factor = Math.exp(-event.deltaY * 0.0025)
        setManual(zoomAround(current, current.scale * factor, event.clientX - rect.left, event.clientY - rect.top))
        setFit(false)
        return
      }
      const dx = event.shiftKey ? event.deltaY : event.deltaX
      const dy = event.shiftKey ? 0 : event.deltaY
      setManual({ ...current, x: current.x - dx, y: current.y - dy })
      setFit(false)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const target: HTMLDivElement = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const origin = { x: event.clientX, y: event.clientY, view: viewRef.current }
    target.classList.add('cursor-grabbing')
    const move = (e: PointerEvent) => {
      setManual({ ...origin.view, x: origin.view.x + e.clientX - origin.x, y: origin.view.y + e.clientY - origin.y })
      setFit(false)
    }
    const up = () => {
      target.classList.remove('cursor-grabbing')
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const percent = `${Math.round(view.scale * 100)} %`
  const tools = (
    <>
      <Button size="sm" title={t('media.zoomOut')} onClick={() => zoomTo(view.scale / STEP)}><Minus size={12} /></Button>
      <span className="w-12 text-center text-[11px] tabular-nums text-muted" data-testid="media-zoom">{percent}</span>
      <Button size="sm" title={t('media.zoomIn')} onClick={() => zoomTo(view.scale * STEP)}><Plus size={12} /></Button>
      <Button size="sm" title={t('media.fit')} onClick={() => setFit(true)} className={fit ? 'text-accent' : ''}>
        <Maximize size={12} /> {t('media.fitShort')}
      </Button>
      <Button size="sm" title={t('media.actualSize')} onClick={actualSize}>
        <Scan size={12} /> 100 %
      </Button>
    </>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg" data-viewer="image">
      <div
        ref={viewport}
        className={`relative min-h-0 flex-1 overflow-hidden select-none ${failed ? '' : 'cursor-grab touch-none'}`}
        onPointerDown={failed ? undefined : startPan}
        onDoubleClick={failed ? undefined : () => (fit ? actualSize() : setFit(true))}
      >
        {failed && <ViewerFallback path={path} title={t('media.imageUnsupported')} hint={t('media.imageUnsupportedHint')} />}
        {!failed && (
          <img
            key={src}
            src={src}
            alt={tab.name}
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget
              setNatural({ width: img.naturalWidth || FALLBACK_SIZE, height: img.naturalHeight || FALLBACK_SIZE })
            }}
            onError={() => setFailed(true)}
            className="absolute top-0 left-0 max-w-none origin-top-left"
            style={{
              ...CHECKERBOARD,
              width: image.width * view.scale,
              height: image.height * view.scale,
              transform: `translate(${view.x}px, ${view.y}px)`,
              imageRendering: view.scale >= 3 ? 'pixelated' : 'auto',
              visibility: natural ? 'visible' : 'hidden',
            }}
          />
        )}
      </div>
      <InfoBar tab={tab} info={info} tools={failed ? undefined : tools}>
        {natural && <InfoItem label={t('media.dimensions')} value={`${natural.width} × ${natural.height}`} />}
        {edited && <span className="shrink-0 text-warn">{t('media.unsavedPreview')}</span>}
      </InfoBar>
    </div>
  )
}
