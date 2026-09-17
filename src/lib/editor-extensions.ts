/**
 * The editor's extension points: features such as the debugger — breakpoints
 * in the gutter, the current line — contribute CodeMirror extensions here
 * without touching `Editor.tsx`. Each factory is called once per tab.
 */

import type { Extension } from '@codemirror/state'

export interface EditorContext {
  tabId: string
  groupId: string
  /** File path or virtual URI; `null` for unnamed tabs. */
  path: string | null
  languageId: string | null
  readonly: boolean
}

type Factory = (ctx: EditorContext) => Extension

const factories = new Set<Factory>()
const listeners = new Set<() => void>()
let version = 0

export function registerEditorExtension(factory: Factory) {
  factories.add(factory)
  version++
  for (const fn of listeners) fn()
  return () => {
    factories.delete(factory)
    version++
    for (const fn of listeners) fn()
  }
}

export function editorExtensions(ctx: EditorContext): Extension[] {
  return [...factories].map((factory) => {
    try {
      return factory(ctx)
    } catch (err) {
      console.error('[lumen] Editor-Erweiterung fehlgeschlagen:', err)
      return []
    }
  })
}

export const subscribeEditorExtensions = (fn: () => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export const getEditorExtensionVersion = () => version
