/**
 * Draws every pop-out into its window and looks after what the windows
 * themselves cannot: an entry whose contents are gone (an extension switched
 * off, the group's last tab closed) is dropped and its window closed, and
 * focus moves between the windows the way the user expects.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { useStore } from '@/state/store'
import { overlayOpen } from '@/hooks/useEditorRefocus'
import { viewRegistry } from '@/core/views'
import { popoutWindow, setFocusedPopout } from '@/core/popout/windows'
import { visibleGroups } from '@/state/popout'
import { PopoutWindow } from './PopoutWindow'

export function PopoutHost() {
  const popouts = useStore((s) => s.popouts)
  const groups = useStore((s) => s.groups)
  const registryVersion = useSyncExternalStore(viewRegistry.subscribe, viewRegistry.getVersion)

  // Contents that no longer exist have nothing to show in a window.
  useEffect(() => {
    for (const entry of popouts) {
      const gone = entry.kind === 'view' ? !viewRegistry.has(entry.ref) : !groups.some((group) => group.id === entry.ref)
      // A window that was never opened (a stale entry) is dropped the same way.
      if (gone || !popoutWindow(entry.key)) useStore.getState().dockBack(entry.key)
    }
  }, [popouts, groups, registryVersion])

  // Back in the main window: files open here again rather than in a group that sits in another window.
  useEffect(() => {
    const onFocus = () => {
      setFocusedPopout(null)
      const s = useStore.getState()
      const shown = visibleGroups(s.groups, s.popouts)
      if (shown.some((group) => group.id === s.activeGroupId)) return
      const first = shown[0]
      if (first) s.focusGroup(s.groups.indexOf(first))
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Dialogs, the palette and the studios open in the main window — bring it in front when a pop-out asked for one.
  useEffect(() => useStore.subscribe((state, previous) => {
    if (!state.popouts.length || !overlayOpen(state) || overlayOpen(previous)) return
    window.focus()
  }), [])

  return <>{popouts.map((entry) => <PopoutWindow key={entry.key} entry={entry} />)}</>
}
