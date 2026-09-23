/**
 * “Shrink Selection”: steps back through the selections an expansion grew
 * out of. CodeMirror only expands (`selectParentSyntax`); each selection that
 * a later one encloses is kept here, per editor, until the text changes or the
 * cursor goes elsewhere.
 */

import { EditorSelection, StateEffect, StateField } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { registerEditorExtension } from '@/lib/editor-extensions'

const shrunk = StateEffect.define<null>()

/** Does `outer` enclose `inner` and reach further on at least one side? */
function grows(inner: { from: number; to: number }, outer: { from: number; to: number }) {
  if (outer.from > inner.from || outer.to < inner.to) return false
  return outer.from < inner.from || outer.to > inner.to
}

const history = StateField.define<EditorSelection[]>({
  create: () => [],
  update(stack, tr) {
    if (tr.effects.some((effect) => effect.is(shrunk))) return stack.slice(0, -1)
    if (tr.docChanged) return []
    if (!tr.selection) return stack
    if (!grows(tr.startState.selection.main, tr.selection.main)) return []
    return [...stack, tr.startState.selection]
  },
})

export function shrinkSelection(view: EditorView): boolean {
  const stack = view.state.field(history, false)
  const previous = stack?.[stack.length - 1]
  if (!previous) return false
  view.dispatch({ selection: previous, effects: shrunk.of(null), scrollIntoView: true, userEvent: 'select' })
  return true
}

let started = false

export function initSelectionHistory() {
  if (started) return
  started = true
  registerEditorExtension(() => history)
}
