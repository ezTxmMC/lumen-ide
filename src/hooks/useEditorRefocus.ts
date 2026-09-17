/**
 * Hands keyboard focus back to the editor once the last overlay closes.
 *
 * Dialogs, palettes and studios render at app level and take focus when they
 * open. On closing, the focused element disappears along with the overlay —
 * focus falls to `<body>` and every keystroke goes nowhere until the editor is
 * clicked again. This hook closes that gap centrally, rather than in each
 * dialog separately.
 */

import { useEffect, useRef } from 'react'
import { useStore, type State } from '@/state/store'
import { editorBridge } from '@/lib/editor-bridge'

/** Elements allowed to keep focus — someone is typing there on purpose. */
const KEEPS_FOCUS = 'input, textarea, select, [contenteditable="true"], .lm-terminal, [role="dialog"], [role="menu"]'

/** True for as long as any overlay lies over the interface. */
export function overlayOpen(state: State): boolean {
  return Boolean(
    state.dialog ||
    state.paletteOpen ||
    state.newProjectOpen ||
    state.formDialog ||
    state.editingThemeId ||
    state.iconStudio ||
    state.addonStudio,
  )
}

export function useEditorRefocus() {
  const open = useStore(overlayOpen)
  const wasOpen = useRef(open)

  useEffect(() => {
    const closed = wasOpen.current && !open
    wasOpen.current = open
    if (!closed) return

    // A frame's grace: the overlay is only gone once unmounted, and some
    // dialogs hand focus on themselves while closing.
    const frame = requestAnimationFrame(() => {
      if (overlayOpen(useStore.getState())) return
      const active = document.activeElement as HTMLElement | null
      if (active?.closest(KEEPS_FOCUS)) return
      editorBridge.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])
}
