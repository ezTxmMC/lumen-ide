/**
 * The minimap along the right edge of the editor.
 *
 * Draws the document shrunk onto a canvas — 2 px per line, words as blocks in
 * their token's colour — plus the visible region as a draggable slider,
 * diagnostics, search hits of the selection and the cursor line. Longer files
 * scroll proportionally, as in VS Code.
 */

import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { forEachDiagnostic } from '@codemirror/lint'
import { highlightTree, tagHighlighter } from '@lezer/highlight'
import { tokenTags } from '@/core/tokenizer'
import { TOKEN_KINDS, type Theme, type TokenKind } from '@/core/types'

export interface MinimapOptions {
  theme: Theme
  /** Width in CSS pixels. */
  width: number
  /** Letter-like strokes instead of solid blocks. */
  characters: boolean
}

const LINE_HEIGHT = 2
const CHAR_WIDTH = 1
const MAX_COLUMNS = 160

const highlighter = tagHighlighter(TOKEN_KINDS.map((kind) => ({ tag: tokenTags[kind], class: kind })))

function syntaxColor(theme: Theme, kind: TokenKind): string {
  const raw = theme.syntax[kind]
  if (!raw) return theme.ui.text
  return typeof raw === 'string' ? raw : raw.color
}

function withAlpha(color: string, alpha: number) {
  const hex = /^#([0-9a-f]{6})/i.exec(color)
  if (!hex) return color
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0')
  return `#${hex[1]}${a}`
}

class Minimap {
  private readonly dom: HTMLDivElement
  private readonly canvas: HTMLCanvasElement
  private readonly slider: HTMLDivElement
  private frame = 0
  private dragging: { startY: number; startScroll: number } | null = null
  private readonly colors: Record<string, string>

  constructor(private readonly view: EditorView, private readonly options: MinimapOptions) {
    this.colors = Object.fromEntries(TOKEN_KINDS.map((kind) => [kind, syntaxColor(options.theme, kind)]))

    this.dom = document.createElement('div')
    this.dom.className = 'lm-minimap'
    this.dom.style.width = `${options.width}px`
    this.dom.setAttribute('aria-hidden', 'true')

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'lm-minimap-canvas'
    this.slider = document.createElement('div')
    this.slider.className = 'lm-minimap-slider'
    this.dom.append(this.canvas, this.slider)

    view.dom.classList.add('lm-has-minimap')
    view.dom.style.setProperty('--minimap-width', `${options.width}px`)
    view.dom.append(this.dom)

    this.dom.addEventListener('pointerdown', this.onPointerDown)
    view.scrollDOM.addEventListener('scroll', this.schedule, { passive: true })
    this.resizeObserver.observe(this.dom)
    this.schedule()
  }

  private readonly resizeObserver = new ResizeObserver(() => this.schedule())

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.geometryChanged || update.selectionSet || update.transactions.length) {
      this.schedule()
    }
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.view.scrollDOM.removeEventListener('scroll', this.schedule)
    this.dom.removeEventListener('pointerdown', this.onPointerDown)
    this.dom.remove()
    this.view.dom.classList.remove('lm-has-minimap')
  }

  private readonly schedule = () => {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.draw()
    })
  }

  /** Geometry: total height, our own scroll offset, the visible lines. */
  private metrics() {
    const { view } = this
    const doc = view.state.doc
    const scroller = view.scrollDOM
    const height = this.dom.clientHeight
    const total = doc.lines * LINE_HEIGHT
    const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight)
    const fraction = Math.min(1, Math.max(0, scroller.scrollTop / maxScroll))
    const offset = Math.max(0, total - height) * fraction

    const top = scroller.scrollTop
    const firstBlock = view.lineBlockAtHeight(Math.max(0, top))
    const lastBlock = view.lineBlockAtHeight(Math.max(0, top + scroller.clientHeight - 1))
    const firstLine = doc.lineAt(Math.min(firstBlock.from, doc.length)).number
    const lastLine = doc.lineAt(Math.min(lastBlock.to, doc.length)).number
    return { height, total, offset, firstLine, lastLine }
  }

  private draw() {
    const { view, canvas, options } = this
    const ratio = window.devicePixelRatio || 1
    const width = options.width
    const { height, total, offset, firstLine, lastLine } = this.metrics()
    if (height <= 0) return

    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const state = view.state
    const doc = state.doc
    const startLine = Math.max(1, Math.floor(offset / LINE_HEIGHT) + 1)
    const endLine = Math.min(doc.lines, Math.ceil((offset + height) / LINE_HEIGHT) + 1)
    const from = doc.line(startLine).from
    const to = doc.line(endLine).to
    const tree = ensureSyntaxTree(state, to, 15) ?? syntaxTree(state)
    const tabSize = state.tabSize
    const theme = options.theme
    const plain = withAlpha(theme.ui.text, 0.55)

    // Tint the current line.
    const cursorLine = doc.lineAt(state.selection.main.head).number
    if (cursorLine >= startLine && cursorLine <= endLine) {
      ctx.fillStyle = withAlpha(theme.ui.accent, 0.22)
      ctx.fillRect(0, (cursorLine - 1) * LINE_HEIGHT - offset, width, LINE_HEIGHT)
    }

    // Collect token colours per range.
    const spans: { from: number; to: number; color: string }[] = []
    highlightTree(tree, highlighter, (start, end, classes) => {
      const kind = classes.split(' ')[0]
      spans.push({ from: start, to: end, color: this.colors[kind] ?? plain })
    }, from, to)

    let spanIndex = 0
    for (let n = startLine; n <= endLine; n++) {
      const line = doc.line(n)
      const y = (n - 1) * LINE_HEIGHT - offset
      let column = 0
      let runStart = -1
      let runColor = ''
      const flush = (endColumn: number) => {
        if (runStart < 0) return
        ctx.fillStyle = runColor
        const x = runStart * CHAR_WIDTH
        const w = Math.max(CHAR_WIDTH, (endColumn - runStart) * CHAR_WIDTH - (options.characters ? 0.35 : 0))
        ctx.fillRect(x, y, w, LINE_HEIGHT - 0.6)
        runStart = -1
      }
      for (let i = 0; i < line.length && column < MAX_COLUMNS; i++) {
        const ch = line.text.charCodeAt(i)
        if (ch === 9) {
          flush(column)
          column += tabSize - (column % tabSize)
          continue
        }
        if (ch === 32) {
          flush(column)
          column++
          continue
        }
        const pos = line.from + i
        while (spanIndex < spans.length && spans[spanIndex].to <= pos) spanIndex++
        const span = spans[spanIndex]
        const color = span && span.from <= pos ? span.color : plain
        if (runStart >= 0 && (color !== runColor || options.characters)) flush(column)
        if (runStart < 0) {
          runStart = column
          runColor = color
        }
        column++
      }
      flush(column)
    }

    // Diagnostics as marks along the right edge, over the full height.
    const scale = total > height ? height / total : 1
    forEachDiagnostic(state, (diagnostic, start) => {
      const line = doc.lineAt(Math.min(start, doc.length)).number
      const color = ({ error: theme.ui.danger, warning: theme.ui.warning } as Record<string, string>)[diagnostic.severity]
      if (!color) return
      ctx.fillStyle = color
      ctx.fillRect(width - 3, (line - 1) * LINE_HEIGHT * scale, 3, Math.max(2, LINE_HEIGHT * scale))
    })

    // The slider for the visible region.
    const sliderTop = (firstLine - 1) * LINE_HEIGHT - offset
    const sliderHeight = Math.max(10, (lastLine - firstLine + 1) * LINE_HEIGHT)
    this.slider.style.transform = `translateY(${sliderTop}px)`
    this.slider.style.height = `${sliderHeight}px`
    this.slider.style.display = total <= 0 ? 'none' : 'block'
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    const { view } = this
    const rect = this.dom.getBoundingClientRect()
    const y = event.clientY - rect.top
    const sliderRect = this.slider.getBoundingClientRect()
    const onSlider = event.clientY >= sliderRect.top && event.clientY <= sliderRect.bottom

    if (!onSlider) {
      const { offset } = this.metrics()
      const lineNumber = Math.min(view.state.doc.lines, Math.max(1, Math.floor((y + offset) / LINE_HEIGHT) + 1))
      const target = view.lineBlockAt(view.state.doc.line(lineNumber).from)
      view.scrollDOM.scrollTop = Math.max(0, target.top - view.scrollDOM.clientHeight / 2)
    }

    this.dragging = { startY: event.clientY, startScroll: view.scrollDOM.scrollTop }
    this.dom.classList.add('lm-minimap-dragging')
    this.dom.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => this.onDrag(e)
    const up = (e: PointerEvent) => {
      this.dragging = null
      this.dom.classList.remove('lm-minimap-dragging')
      this.dom.releasePointerCapture(e.pointerId)
      this.dom.removeEventListener('pointermove', move)
      this.dom.removeEventListener('pointerup', up)
    }
    this.dom.addEventListener('pointermove', move)
    this.dom.addEventListener('pointerup', up)
  }

  private onDrag(event: PointerEvent) {
    if (!this.dragging) return
    const scroller = this.view.scrollDOM
    const { height, total } = this.metrics()
    const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight)
    const sliderHeight = this.slider.offsetHeight
    // The slider follows the mouse: the ratio of the minimap's travel to the editor's.
    const track = Math.max(1, Math.min(height, total) - sliderHeight)
    const delta = event.clientY - this.dragging.startY
    scroller.scrollTop = Math.min(maxScroll, Math.max(0, this.dragging.startScroll + delta * (maxScroll / track)))
  }
}

export function minimap(options: MinimapOptions): Extension {
  return [
    ViewPlugin.define((view) => new Minimap(view, options)),
    EditorView.baseTheme({
      '&.lm-has-minimap .cm-scroller': { marginRight: 'var(--minimap-width)' },
      // Opaque: the minimap sits over the scroller — without a background of
      // its own, long lines of code shimmered through behind it.
      '.lm-minimap': {
        position: 'absolute',
        top: '0',
        right: '0',
        bottom: '0',
        overflow: 'hidden',
        cursor: 'default',
        zIndex: '3',
        backgroundColor: options.theme.ui.bg,
        boxShadow: `inset 1px 0 0 ${withAlpha(options.theme.ui.border, 0.6)}`,
      },
      '.lm-minimap-canvas': { display: 'block', opacity: '0.92' },
      '.lm-minimap-slider': {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        backgroundColor: withAlpha(options.theme.ui.text, 0.07),
        opacity: '0',
        transition: 'opacity var(--duration) ease, background-color var(--duration) ease',
        willChange: 'transform',
      },
      '&:hover .lm-minimap-slider': { opacity: '1' },
      '.lm-minimap:hover .lm-minimap-slider': { backgroundColor: withAlpha(options.theme.ui.text, 0.12) },
      '.lm-minimap-dragging .lm-minimap-slider': { opacity: '1', backgroundColor: withAlpha(options.theme.ui.text, 0.18) },
    }),
  ]
}
