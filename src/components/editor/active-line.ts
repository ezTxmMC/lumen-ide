/**
 * Highlighting the cursor line — only for cursors without a selection.
 *
 * CodeMirror paints the selection in a layer behind the text, and the
 * background of `.cm-activeLine` sits above it, which would hide the selection
 * on that line. As in VS Code, the line highlight therefore drops out as soon
 * as something on the line is selected.
 */

import { RangeSetBuilder, type EditorState } from '@codemirror/state'
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view'

const lineDeco = Decoration.line({ class: 'cm-activeLine' })

function build(state: EditorState): DecorationSet {
  const selected = new Set<number>()
  const cursors = new Set<number>()
  for (const range of state.selection.ranges) {
    if (range.empty) {
      cursors.add(state.doc.lineAt(range.head).from)
      continue
    }
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) selected.add(state.doc.line(n).from)
  }
  const builder = new RangeSetBuilder<Decoration>()
  for (const from of [...cursors].sort((a, b) => a - b)) {
    if (selected.has(from)) continue
    builder.add(from, from, lineDeco)
  }
  return builder.finish()
}

export const activeLineHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view.state)
    }
    update(update: ViewUpdate) {
      if (!update.docChanged && !update.selectionSet) return
      this.decorations = build(update.state)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
