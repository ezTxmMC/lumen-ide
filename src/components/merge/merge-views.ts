/**
 * The CodeMirror side of the merge editor.
 *
 * The two upper panes are read-only: the file with every block resolved to
 * one side, each block tinted and headed by a checkbox. The result pane is an
 * ordinary editor that also knows where each block's text sits and which
 * sides were chosen for it — mapped through every edit, and undone together
 * with the text (`invertedEffects`).
 */

import { EditorState, StateEffect, StateField, type Extension, type Range, type Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { invertedEffects } from '@codemirror/commands'
import { t } from '@/i18n'
import { choiceResolution, choiceText, UNTOUCHED, type Choice, type Conflict, type Span } from '@/core/merge/conflicts'

export type Side = 'current' | 'incoming'

const SIDE_CLASS: Record<Side, string> = { current: 'lm-merge-current', incoming: 'lm-merge-incoming' }

function tintLines(doc: Text, span: Span, className: string, out: Range<Decoration>[]) {
  const decoration = Decoration.line({ class: className })
  let pos = span.from
  while (pos < span.to) {
    const line = doc.lineAt(pos)
    out.push(decoration.range(line.from))
    pos = line.to + 1
  }
}

/* ------------------------------------------------------------------ *
 * The upper panes
 * ------------------------------------------------------------------ */

/** The choices as the result pane has them — mirrored into the upper panes. */
export const showChoices = StateEffect.define<Choice[]>()

const paneChoices = StateField.define<Choice[]>({
  create: () => [],
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(showChoices)) return effect.value
    }
    return value
  },
})

/** The checkbox above a block: take this side or not. */
class TakeSide extends WidgetType {
  constructor(
    readonly index: number,
    readonly side: Side,
    readonly taken: boolean,
    readonly onToggle: (index: number, side: Side) => void,
  ) {
    super()
  }

  eq(other: TakeSide) {
    return other.index === this.index && other.side === this.side && other.taken === this.taken
  }

  toDOM() {
    const label = document.createElement('label')
    label.className = `lm-merge-take lm-merge-take-${this.side}`
    label.setAttribute('data-conflict', String(this.index))
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.taken
    box.addEventListener('change', () => this.onToggle(this.index, this.side))
    const text = document.createElement('span')
    text.textContent = t(this.side === 'current' ? 'merge.lens.acceptCurrent' : 'merge.lens.acceptIncoming')
    const number = Object.assign(document.createElement('span'), { className: 'lm-merge-take-index', textContent: `#${this.index + 1}` })
    label.append(box, text, number)
    return label
  }

  ignoreEvent() {
    return true
  }
}

/** One upper pane: `ranges` are where each block's side sits in its text. */
export function sidePane(side: Side, ranges: Span[], onToggle: (index: number, side: Side) => void): Extension {
  const decorations = EditorView.decorations.compute([paneChoices], (state: EditorState): DecorationSet => {
    const choices = state.field(paneChoices)
    const out: Range<Decoration>[] = []
    ranges.forEach((range, index) => {
      const taken = Boolean(choices[index]?.[side])
      out.push(Decoration.widget({ widget: new TakeSide(index, side, taken, onToggle), block: true, side: -1 }).range(range.from))
      tintLines(state.doc, range, `${SIDE_CLASS[side]}${taken ? ' lm-merge-taken' : ''}`, out)
    })
    return Decoration.set(out, true)
  })
  return [paneChoices, decorations, EditorState.readOnly.of(true)]
}

/* ------------------------------------------------------------------ *
 * The result pane
 * ------------------------------------------------------------------ */

interface ResultState {
  ranges: Span[]
  choices: Choice[]
}

interface SetChoice {
  index: number
  choice: Choice
  /** Where the block's text sits after the transaction. */
  from: number
  to: number
}

const setChoice = StateEffect.define<SetChoice>({
  map: (value, mapping) => ({ ...value, from: mapping.mapPos(value.from, 1), to: Math.max(mapping.mapPos(value.from, 1), mapping.mapPos(value.to, -1)) }),
})

function mapSpan(span: Span, mapping: { mapPos(pos: number, assoc: number): number }): Span {
  const from = mapping.mapPos(span.from, 1)
  return { from, to: Math.max(from, mapping.mapPos(span.to, -1)) }
}

const resultField = StateField.define<ResultState>({
  create: () => ({ ranges: [], choices: [] }),
  update: (value, tr) => {
    let next = value
    if (tr.docChanged) next = { ...next, ranges: next.ranges.map((span) => mapSpan(span, tr.changes)) }
    for (const effect of tr.effects) {
      if (!effect.is(setChoice)) continue
      const { index, choice, from, to } = effect.value
      const ranges = [...next.ranges]
      const choices = [...next.choices]
      ranges[index] = { from, to }
      choices[index] = choice
      next = { ranges, choices }
    }
    return next
  },
})

/** Undo puts the old choices back along with the old text. */
const undoChoices = invertedEffects.of((tr) => {
  const before = tr.startState.field(resultField)
  const out: StateEffect<SetChoice>[] = []
  for (const effect of tr.effects) {
    if (!effect.is(setChoice)) continue
    const { index } = effect.value
    const range = before.ranges[index]
    out.push(setChoice.of({ index, choice: before.choices[index] ?? UNTOUCHED, from: range.from, to: range.to }))
  }
  return out
})

const RESULT_CLASS: Record<string, string> = {
  current: 'lm-merge-current',
  incoming: 'lm-merge-incoming',
  both: 'lm-merge-both',
  base: 'lm-merge-base',
}

/** A small caption above each block in the result: its number and state. */
class ResultCaption extends WidgetType {
  constructor(readonly index: number, readonly state: string) {
    super()
  }

  eq(other: ResultCaption) {
    return other.index === this.index && other.state === this.state
  }

  toDOM() {
    const row = document.createElement('div')
    row.className = `lm-merge-caption lm-merge-caption-${this.state}`
    row.setAttribute('data-conflict', String(this.index))
    row.textContent = `#${this.index + 1} · ${t(`merge.editor.state.${this.state}`)}`
    return row
  }
}

const resultDecorations = EditorView.decorations.compute([resultField], (state): DecorationSet => {
  const { ranges, choices } = state.field(resultField)
  const out: Range<Decoration>[] = []
  ranges.forEach((range, index) => {
    const resolution = choiceResolution(choices[index] ?? UNTOUCHED) ?? 'unresolved'
    out.push(Decoration.widget({ widget: new ResultCaption(index, resolution), block: true, side: -1 }).range(range.from))
    tintLines(state.doc, range, RESULT_CLASS[resolution] ?? 'lm-merge-unresolved', out)
  })
  return Decoration.set(out, true)
})

/** The result pane's bookkeeping, seeded with where each (still raw) block sits. */
export function resultPane(ranges: Span[]): Extension {
  return [
    resultField.init(() => ({ ranges, choices: ranges.map(() => UNTOUCHED) })),
    undoChoices,
    resultDecorations,
  ]
}

export const resultStateOf = (state: EditorState): ResultState => state.field(resultField)

/**
 * Apply several choices in one transaction — one undo step. `source` is the
 * text the merge editor opened with; `conflicts` its blocks.
 */
export function applyChoices(
  view: EditorView,
  source: string,
  conflicts: Conflict[],
  updates: { index: number; choice: Choice }[],
) {
  const { ranges } = view.state.field(resultField)
  const sorted = [...updates].sort((a, b) => ranges[a.index].from - ranges[b.index].from)
  let shift = 0
  const changes = []
  const effects = []
  for (const { index, choice } of sorted) {
    const range = ranges[index]
    const insert = choiceText(source, conflicts[index], choice)
    changes.push({ from: range.from, to: range.to, insert })
    const from = range.from + shift
    effects.push(setChoice.of({ index, choice, from, to: from + insert.length }))
    shift += insert.length - (range.to - range.from)
  }
  if (!changes.length) return
  view.dispatch({ changes, effects, userEvent: 'merge.choose' })
}

export const mergePaneTheme = EditorView.baseTheme({
  '.lm-merge-both': { backgroundColor: 'color-mix(in srgb, var(--c-accent) 8%, color-mix(in srgb, var(--c-success) 8%, transparent))' },
  '.lm-merge-unresolved': { backgroundColor: 'color-mix(in srgb, var(--c-warning) 12%, transparent)' },
  '.lm-merge-taken.lm-merge-current': { backgroundColor: 'color-mix(in srgb, var(--c-success) 24%, transparent)' },
  '.lm-merge-taken.lm-merge-incoming': { backgroundColor: 'color-mix(in srgb, var(--c-accent) 24%, transparent)' },
  '.lm-merge-take': {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px 2px', cursor: 'pointer', userSelect: 'none',
    fontFamily: 'system-ui, sans-serif', fontSize: '11px', lineHeight: '16px', color: 'var(--c-text-muted)',
  },
  '.lm-merge-take input': { margin: '0', accentColor: 'var(--c-accent)', cursor: 'pointer' },
  '.lm-merge-take-current input': { accentColor: 'var(--c-success)' },
  '.lm-merge-take:hover': { color: 'var(--c-text)' },
  '.lm-merge-take-index, .lm-merge-caption': { color: 'var(--c-text-subtle)' },
  '.lm-merge-caption': {
    padding: '3px 4px 2px', fontFamily: 'system-ui, sans-serif', fontSize: '11px', lineHeight: '16px',
  },
  '.lm-merge-caption-unresolved': { color: 'var(--c-warning)' },
})
