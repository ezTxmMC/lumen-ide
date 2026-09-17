/**
 * Syntax highlighting with no lag behind.
 *
 * CodeMirror parses stream languages only to the end of the viewport and notes
 * the rest as “skipped”. When such a region becomes visible — by scrolling, by
 * jumping to a definition or a search hit, or by switching to a tab with a
 * remembered scroll position — it only catches up in the next
 * `requestIdleCallback`: 100 ms at the earliest, and up to 500 ms with a busy
 * main thread. Until then the text sits there uncoloured.
 *
 * Our tokenizers manage roughly a microsecond per line, so this parses to the
 * end of the viewport right after the update — in a microtask, still before
 * paint. Only for very large files, where that would blow the time budget,
 * does CodeMirror's background parser take over again.
 */

import { forceParsing } from '@codemirror/language'
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view'

/** Cap per catch-up — beyond it, briefly uncoloured beats a stutter. */
const BUDGET_MS = 40

export const syntaxCatchUp = ViewPlugin.fromClass(class {
  private queued = false
  private destroyed = false

  constructor(private readonly view: EditorView) {
    this.schedule()
  }

  update(update: ViewUpdate) {
    if (update.viewportChanged || update.docChanged) this.schedule()
  }

  destroy() {
    this.destroyed = true
  }

  /**
   * Check only after the update: CodeMirror's parse worker releases skipped
   * regions of the new viewport inside *its* update, and dispatching during
   * an update is not allowed.
   */
  private schedule() {
    if (this.queued) return
    this.queued = true
    queueMicrotask(() => {
      this.queued = false
      if (this.destroyed) return
      forceParsing(this.view, this.view.viewport.to, BUDGET_MS)
    })
  }
})
