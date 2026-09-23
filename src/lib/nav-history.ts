/**
 * Back and forward through the places the cursor jumped from — into another
 * file, or far within one (go to definition, go to line, a click further
 * down) — as VS Code's “Go Back” / “Go Forward”.
 *
 * The place of the active editor is followed through a CodeMirror update
 * listener; a switch of editor (the bridge attaching another view) or a jump
 * of `JUMP_LINES` or more turns the previous place into history.
 */

import { EditorView } from '@codemirror/view'
import { useStore } from '@/state/store'
import { editorBridge } from '@/lib/editor-bridge'
import { registerEditorExtension } from '@/lib/editor-extensions'

interface Place {
  path: string
  /** 0-based, as `openAt` takes them. */
  line: number
  character: number
}

const MAX_ENTRIES = 50
/** A cursor move of this many lines at once counts as a jump. */
const JUMP_LINES = 10
/** How long a navigation's own cursor moves are kept out of the history. */
const SETTLE_MS = 250

const backStack: Place[] = []
const forwardStack: Place[] = []
let current: Place | null = null
let navigatingUntil = 0
let started = false

const near = (a: Place, b: Place) => a.path === b.path && Math.abs(a.line - b.line) < JUMP_LINES

function placeOf(view: EditorView, path: string): Place {
  const head = view.state.selection.main.head
  const line = view.state.doc.lineAt(head)
  return { path, line: line.number - 1, character: head - line.from }
}

function pathOfTab(tabId: string | null): string | null {
  if (!tabId) return null
  return useStore.getState().tabs.find((tab) => tab.id === tabId)?.path ?? null
}

/** The place being left becomes history; a new jump clears what lay ahead. */
function leave(place: Place) {
  if (Date.now() < navigatingUntil) return
  const last = backStack[backStack.length - 1]
  if (last && near(last, place)) return
  backStack.push(place)
  if (backStack.length > MAX_ENTRIES) backStack.shift()
  forwardStack.length = 0
}

function follow(next: Place) {
  if (current && !near(current, next)) leave(current)
  current = next
}

export const navHistory = {
  canGoBack: () => backStack.length > 0,
  canGoForward: () => forwardStack.length > 0,
  back: () => go(backStack, forwardStack),
  forward: () => go(forwardStack, backStack),
}

async function go(from: Place[], to: Place[]) {
  const target = from.pop()
  if (!target) return
  if (current) to.push(current)
  navigatingUntil = Date.now() + 60_000
  current = target
  try {
    await useStore.getState().openAt(target.path, target.line, target.character)
  } finally {
    navigatingUntil = Date.now() + SETTLE_MS
  }
}

export function initNavHistory() {
  if (started) return
  started = true
  registerEditorExtension((ctx) => {
    if (!ctx.path) return []
    const path = ctx.path
    return EditorView.updateListener.of((update) => {
      if (update.view !== editorBridge.view || !update.selectionSet || update.docChanged) return
      // “Select All” moves the cursor to the end without going anywhere.
      const main = update.state.selection.main
      if (!main.empty && main.from === 0 && main.to === update.state.doc.length) return
      follow(placeOf(update.view, path))
    })
  })
  // Another editor in front: remember where the previous one stood.
  editorBridge.subscribe(() => {
    const view = editorBridge.view
    const path = pathOfTab(editorBridge.tabId)
    if (!view || !path) return
    follow(placeOf(view, path))
  })
}
