/** Indent guides as a lightweight ViewPlugin. */

import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

function buildGuides(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tabSize = view.state.tabSize

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos)
      const indent = /^[ \t]*/.exec(line.text)![0]
      const columns = indent.replace(/\t/g, ' '.repeat(tabSize)).length
      if (columns > 0 && indent.length < line.text.length) {
        builder.add(
          line.from,
          line.from,
          Decoration.line({
            attributes: { 'data-indent': '', style: `--indent-w: ${columns}ch` },
          }),
        )
      }
      pos = line.to + 1
    }
  }
  return builder.finish()
}

export const indentGuides = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildGuides(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildGuides(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
