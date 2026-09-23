/**
 * One pop-out: React rendered into the document of a native window.
 *
 * The window shares this renderer's JavaScript — the store, the terminals, the
 * language servers — so what it shows is live without any synchronising. What
 * a new document lacks is set up here: the stylesheets and theme (mirrored,
 * and followed live), the keyboard shortcuts, and the knowledge of which
 * window is in front.
 */

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/state/store'
import { bindKeymap } from '@/hooks/useKeymap'
import { OwnerContext } from '@/hooks/useOwner'
import { mirrorDocument } from '@/core/popout/mirror'
import { boundsOf, popoutWindow, saveBounds, setFocusedPopout } from '@/core/popout/windows'
import { boundsChanged, type PopoutBounds, type PopoutEntry } from '@/state/popout'
import { PopoutFrame, useFrameTitle } from './PopoutFrame'

/** How often the window's position and size are noted down. */
const BOUNDS_MS = 1000

export function PopoutWindow({ entry }: { entry: PopoutEntry }) {
  const win = popoutWindow(entry.key)
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const title = useFrameTitle(entry)

  useLayoutEffect(() => {
    if (!win || win.closed) return
    const doc = win.document
    doc.body.textContent = ''
    // The same id as the main window's mount point: the stylesheet sizes it.
    const mount = doc.createElement('div')
    mount.id = 'root'
    doc.body.append(mount)
    const stopMirror = mirrorDocument(document, doc)
    const stopKeymap = bindKeymap(win)
    setRoot(mount)
    return () => {
      stopMirror()
      stopKeymap()
      mount.remove()
      setRoot(null)
    }
  }, [win])

  useEffect(() => {
    if (!win) return
    win.document.title = title
  }, [win, title])

  useEffect(() => {
    if (!win) return
    const onFocus = () => setFocusedPopout(entry.key)
    win.addEventListener('focus', onFocus)
    if (win.document.hasFocus()) onFocus()
    let last: PopoutBounds | null = entry.bounds
    const timer = setInterval(() => {
      if (win.closed) return
      const bounds = boundsOf(win)
      if (!bounds || !boundsChanged(last, bounds)) return
      last = bounds
      saveBounds(entry.key, bounds)
      useStore.getState().setPopoutBounds(entry.key, bounds)
    }, BOUNDS_MS)
    return () => {
      win.removeEventListener('focus', onFocus)
      clearInterval(timer)
    }
    // The bounds the entry opened with are only the starting point of the comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, entry.key])

  const owner = useMemo(() => (win ? { win, doc: win.document } : null), [win])
  if (!root || !owner) return null
  return createPortal(
    <OwnerContext.Provider value={owner}>
      <PopoutFrame entry={entry} />
    </OwnerContext.Provider>,
    root,
  )
}
