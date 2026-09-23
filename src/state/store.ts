/**
 * The application state (zustand), put together from one slice per area:
 *
 *   slices/app.ts         startup, persistence, overlays, notifications, keys
 *   slices/workspace.ts   folders, workspaces, the detected project
 *   slices/editor.ts      tabs, editor groups, saving, disk changes
 *   slices/layout.ts      docks and views, output, terminals
 *   slices/appearance.ts  themes, effects, icon packs, add-ons on/off
 *   slices/extensions.ts  extension servers and settings
 *
 * The types live in `state/types.ts`; everything is re-exported here, so the
 * rest of the program imports from one place.
 */

import { create } from 'zustand'
import { createAppSlice } from './slices/app'
import { createWorkspaceSlice } from './slices/workspace'
import { createEditorSlice } from './slices/editor'
import { createLayoutSlice } from './slices/layout'
import { createPopoutSlice } from './slices/popout'
import { createAppearanceSlice } from './slices/appearance'
import { createExtensionSlice } from './slices/extensions'
import { rememberOpenFiles as rememberOpenFilesOf } from './session'
import type { State } from './types'

export type * from './types'
export { isDirty, parseExtensionView, relativeToWorkspace } from './helpers'

export const useStore = create<State>()((...args) => ({
  ...createAppSlice(...args),
  ...createWorkspaceSlice(...args),
  ...createEditorSlice(...args),
  ...createLayoutSlice(...args),
  ...createPopoutSlice(...args),
  ...createAppearanceSlice(...args),
  ...createExtensionSlice(...args),
}))

/** Write the open files of a working folder into its project configuration. */
export function rememberOpenFiles(root: string) {
  return rememberOpenFilesOf(useStore.getState, useStore.setState, root)
}

/* Keep track of the files opened most recently whenever a tab becomes active. */
useStore.subscribe((state, previous) => {
  if (state.activeTabId === previous.activeTabId) return
  const tab = state.tabs.find((open) => open.id === state.activeTabId)
  if (!tab?.path || tab.virtual) return
  if (state.recentFiles[0] === tab.path) return
  useStore.setState({ recentFiles: [tab.path, ...state.recentFiles.filter((p) => p !== tab.path)].slice(0, 50) })
})
