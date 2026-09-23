import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { buildCommands } from '@/core/commands'
import {
  chordFromEvent, formatBinding, chordToString, isModifierOnly, keybindings, type Chord,
} from '@/core/keybindings'
import { t } from '@/i18n'
import type { Command } from '@/core/types'

/** The window for “shift twice” (IntelliJ: Search Everywhere). */
const DOUBLE_SHIFT_MS = 400
/** The window for the second chord of a sequence (`Ctrl+K Ctrl+S`). */
const SEQUENCE_MS = 2000

/** In the terminal the keys belong to the shell — only these commands stay global. */
const TERMINAL_COMMANDS = new Set([
  'view.commandPalette', 'terminal.toggle', 'terminal.new', 'view.panel', 'search.everywhere',
])

/** Editing shortcuts that always belong to the field when one has focus. */
const TEXT_EDITING = /^(Ctrl\+(A|C|V|X|Z|Y|Shift\+Z|Left|Right|Up|Down|Backspace|Delete|Home|End|Shift\+Left|Shift\+Right)|Shift\+(Left|Right|Up|Down|Home|End)|Home|End|Backspace|Delete)$/

const inTerminal = (target: EventTarget | null) =>
  Boolean((target as HTMLElement | null)?.closest?.('.lm-terminal'))

/**
 * Focus in the code itself — not in the search bar or another of the editor's
 * panels, and not in a small editor embedded as a field (`data-embedded-editor`,
 * an extension view's SQL input): those behave like any other input.
 */
const inEditor = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return Boolean(el?.closest?.('.cm-editor') && !el.closest('.cm-panels') && !el.closest('[data-embedded-editor]'))
}

/** Ordinary input fields (not the code editor). */
function inTextField(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el || inEditor(el)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/** An input that records shortcuts itself (the shortcut dialog). */
const recordingKeys = (target: EventTarget | null) =>
  Boolean((target as HTMLElement | null)?.closest?.('[data-keybinding-recorder]'))

/**
 * Picks the right one among several commands sharing a binding: commands whose
 * condition (`when`) holds come before unconditional ones, and editor commands
 * only with focus in the editor.
 */
function pick(ids: string[], target: EventTarget | null): Command | null {
  if (!ids.length) return null
  const commands = buildCommands({ includeHidden: true })
  const candidates = ids
    .map((id) => commands.find((c) => c.id === id))
    .filter((c): c is Command => Boolean(c))
    .filter((c) => c.scope !== 'editor' || inEditor(target))
    .filter((c) => !inTerminal(target) || TERMINAL_COMMANDS.has(c.id))
  const conditional = candidates.find((c) => c.when && c.when())
  if (conditional) return conditional
  return candidates.find((c) => !c.when) ?? null
}

/**
 * The global shortcuts — every binding comes from the shortcut system — bound
 * to one window. The main window has them all its life; a pop-out binds its
 * own while it is open, so the keys work wherever the user is typing.
 */
export function bindKeymap(target: Window): () => void {
  let shiftDown = false
  let shiftDirty = false
  let lastShiftTap = 0
  let pending: { chord: Chord; at: number } | null = null

  const clearPending = () => {
    if (!pending) return
    pending = null
    useStore.getState().setChordHint(null)
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== 'Shift') return
    const clean = shiftDown && !shiftDirty
    shiftDown = false
    if (!clean) {
      lastShiftTap = 0
      return
    }
    const now = Date.now()
    if (now - lastShiftTap > DOUBLE_SHIFT_MS) {
      lastShiftTap = now
      return
    }
    lastShiftTap = 0
    if (recordingKeys(event.target)) return
    const command = pick(keybindings.doubleShift(), event.target)
    if (!command) return
    if (command.id === 'search.everywhere' && useStore.getState().paletteOpen === 'everywhere') return
    void command.run()
  }

  const handler = (event: KeyboardEvent) => {
    const s = useStore.getState()

    // Shift twice: only plain shift presses count.
    if (event.key === 'Shift') {
      if (!event.repeat) {
        shiftDown = true
        shiftDirty = event.ctrlKey || event.metaKey || event.altKey
      }
      return
    }
    shiftDirty = true
    lastShiftTap = 0

    if (isModifierOnly(event)) return
    if (recordingKeys(event.target)) return

    const stop = () => { event.preventDefault(); event.stopPropagation() }

    if (event.key === 'Escape' && s.paletteOpen) {
      stop()
      s.setPalette(false)
      return
    }

    // The second chord of a sequence.
    if (pending && Date.now() - pending.at < SEQUENCE_MS) {
      const ids = keybindings.matchSequence(pending.chord, event)
      clearPending()
      stop()
      const command = pick(ids, event.target)
      if (command) void command.run()
      return
    }
    clearPending()

    const chord = chordFromEvent(event)
    if (!chord) return
    const plain = chordToString(chord)

    // Input fields keep their editing keys.
    if (inTextField(event.target) && (TEXT_EDITING.test(plain) || (!chord.ctrl && !chord.alt && !/^F\d/.test(chord.key)))) return

    if (keybindings.isPrefix(event) && !inTerminal(event.target)) {
      stop()
      pending = { chord, at: Date.now() }
      s.setChordHint(t('keybindings.chordPending', { chord: formatBinding(plain) }))
      target.setTimeout(() => {
        if (pending && Date.now() - pending.at >= SEQUENCE_MS) clearPending()
      }, SEQUENCE_MS + 50)
      return
    }

    const command = pick(keybindings.match(event), event.target)
    if (!command) return
    stop()
    void command.run()
  }

  // Clicks between two shift presses do not count as a double shift.
  const onPointer = () => { lastShiftTap = 0 }
  // The window loses focus mid-press: reset the state.
  const onBlur = () => { shiftDown = false; lastShiftTap = 0; clearPending() }

  target.addEventListener('keydown', handler, true)
  target.addEventListener('keyup', onKeyUp, true)
  target.addEventListener('pointerdown', onPointer, true)
  target.addEventListener('blur', onBlur)
  return () => {
    target.removeEventListener('keydown', handler, true)
    target.removeEventListener('keyup', onKeyUp, true)
    target.removeEventListener('pointerdown', onPointer, true)
    target.removeEventListener('blur', onBlur)
  }
}

export function useKeymap() {
  useEffect(() => bindKeymap(window), [])
}
