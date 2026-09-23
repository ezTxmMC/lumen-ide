/**
 * The folders currently open, for main-process features that need to know —
 * extension code asking for the project root, say. `main.ts` sets them
 * whenever the renderer changes the workspace.
 */

type Listener = (root: string | null, extras: string[]) => void

let current: string | null = null
let extraFolders: string[] = []
const listeners = new Set<Listener>()

export function setWorkspaceRoots(root: string | null, extras: string[] = []) {
  if (root === current && extras.join('\n') === extraFolders.join('\n')) return
  current = root
  extraFolders = [...extras]
  for (const fn of listeners) fn(current, extraFolders)
}

export const workspaceRoot = () => current
export const workspaceFolders = () => (current ? [current, ...extraFolders] : [])

export function onWorkspaceRoots(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
