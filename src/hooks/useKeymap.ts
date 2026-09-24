/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect } from 'react';
import { useStore } from '@/state/store';
import { buildCommands } from '@/core/commands';
import {
  chordFromEvent, formatBinding, chordToString, isModifierOnly, keybindings, type Chord,
} from '@/core/keybindings';
import { t } from '@/i18n';
import type { Command } from '@/core/types';

/** The window for “shift twice” (IntelliJ: Search Everywhere). */
const DOUBLE_SHIFT_MS = 400;
/** The window for the second chord of a sequence (`Ctrl+K Ctrl+S`). */
const SEQUENCE_MS = 2000;

/** In the terminal the keys belong to the shell — only these commands stay global. */
const TERMINAL_COMMANDS = new Set([
  'view.commandPalette', 'terminal.toggle', 'terminal.new', 'view.panel', 'search.everywhere',
]);

/** Editing shortcuts that always belong to the field when one has focus. */
const TEXT_EDITING = /^(Ctrl\+(A|C|V|X|Z|Y|Shift\+Z|Left|Right|Up|Down|Backspace|Delete|Home|End|Shift\+Left|Shift\+Right)|Shift\+(Left|Right|Up|Down|Home|End)|Home|End|Backspace|Delete)$/;

const inTerminal = (target: EventTarget | null) =>
  Boolean((target as HTMLElement | null)?.closest?.('.lm-terminal'));

/**
 * Focus in the code itself — not in the search bar or another of the editor's
 * panels, and not in a small editor embedded as a field (`data-embedded-editor`,
 * an extension view's SQL input): those behave like any other input.
 */
const inEditor = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.('.cm-editor') && !el.closest('.cm-panels') && !el.closest('[data-embedded-editor]'));
};

/** Ordinary input fields (not the code editor). */
function inTextField(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || inEditor(el)) {
    return false;
  }
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** An input that records shortcuts itself (the shortcut dialog). */
const recordingKeys = (target: EventTarget | null) =>
  Boolean((target as HTMLElement | null)?.closest?.('[data-keybinding-recorder]'));

/**
 * Picks the right one among several commands sharing a binding: commands whose
 * condition (`when`) holds come before unconditional ones, and editor commands
 * only with focus in the editor.
 */
function pick(ids: string[], target: EventTarget | null): Command | null {
  if (!ids.length) {
    return null;
  }
  const commands = buildCommands({ includeHidden: true });
  const candidates = ids
    .map((id) => commands.find((c) => c.id === id))
    .filter((c): c is Command => Boolean(c))
    .filter((c) => c.scope !== 'editor' || inEditor(target))
    .filter((c) => !inTerminal(target) || TERMINAL_COMMANDS.has(c.id));
  const conditional = candidates.find((c) => c.when && c.when());
  if (conditional) {
    return conditional;
  }
  return candidates.find((c) => !c.when) ?? null;
}

/** What the keyboard handlers of one window remember between events. */
interface KeymapState {
  shiftDown: boolean;
  shiftDirty: boolean;
  lastShiftTap: number;
  pending: { chord: Chord; at: number; } | null;
}

function clearPending(km: KeymapState) {
  if (!km.pending) {
    return;
  }
  km.pending = null;
  useStore.getState().setChordHint(null);
}

/** Shift released: two clean taps in a row run the double-shift command. */
function onShiftUp(km: KeymapState, event: KeyboardEvent) {
  if (event.key !== 'Shift') {
    return;
  }
  const clean = km.shiftDown && !km.shiftDirty;
  km.shiftDown = false;
  if (!clean) {
    km.lastShiftTap = 0;
    return;
  }
  const now = Date.now();
  if (now - km.lastShiftTap > DOUBLE_SHIFT_MS) {
    km.lastShiftTap = now;
    return;
  }
  km.lastShiftTap = 0;
  if (recordingKeys(event.target)) {
    return;
  }
  const command = pick(keybindings.doubleShift(), event.target);
  if (!command) {
    return;
  }
  if (command.id === 'search.everywhere' && useStore.getState().paletteOpen === 'everywhere') {
    return;
  }
  void command.run();
}

const stopEvent = (event: KeyboardEvent) => { event.preventDefault(); event.stopPropagation(); };

/** The first chord of a sequence: remember it and show the hint until the second one comes. */
function startSequence(km: KeymapState, target: Window, chord: Chord, plain: string) {
  km.pending = { chord, at: Date.now() };
  useStore.getState().setChordHint(t('keybindings.chordPending', { chord: formatBinding(plain) }));
  target.setTimeout(() => {
    if (km.pending && Date.now() - km.pending.at >= SEQUENCE_MS) {
      clearPending(km);
    }
  }, SEQUENCE_MS + 50);
}

function onKeyDown(km: KeymapState, target: Window, event: KeyboardEvent) {
  const s = useStore.getState();

  // Shift twice: only plain shift presses count.
  if (event.key === 'Shift') {
    if (!event.repeat) {
      km.shiftDown = true;
      km.shiftDirty = event.ctrlKey || event.metaKey || event.altKey;
    }
    return;
  }
  km.shiftDirty = true;
  km.lastShiftTap = 0;

  if (isModifierOnly(event)) {
    return;
  }
  if (recordingKeys(event.target)) {
    return;
  }

  if (event.key === 'Escape' && s.paletteOpen) {
    stopEvent(event);
    s.setPalette(false);
    return;
  }

  // The second chord of a sequence.
  if (km.pending && Date.now() - km.pending.at < SEQUENCE_MS) {
    const ids = keybindings.matchSequence(km.pending.chord, event);
    clearPending(km);
    stopEvent(event);
    const command = pick(ids, event.target);
    if (command) {
      void command.run();
    }
    return;
  }
  clearPending(km);

  const chord = chordFromEvent(event);
  if (!chord) {
    return;
  }
  const plain = chordToString(chord);

  // Input fields keep their editing keys.
  if (inTextField(event.target) && (TEXT_EDITING.test(plain) || (!chord.ctrl && !chord.alt && !/^F\d/.test(chord.key)))) {
    return;
  }

  if (keybindings.isPrefix(event) && !inTerminal(event.target)) {
    stopEvent(event);
    startSequence(km, target, chord, plain);
    return;
  }

  const command = pick(keybindings.match(event), event.target);
  if (!command) {
    return;
  }
  stopEvent(event);
  void command.run();
}

/**
 * The global shortcuts — every binding comes from the shortcut system — bound
 * to one window. The main window has them all its life; a pop-out binds its
 * own while it is open, so the keys work wherever the user is typing.
 */
export function bindKeymap(target: Window): () => void {
  const km: KeymapState = { shiftDown: false, shiftDirty: false, lastShiftTap: 0, pending: null };

  const handler = (event: KeyboardEvent) => onKeyDown(km, target, event);
  const onKeyUp = (event: KeyboardEvent) => onShiftUp(km, event);
  // Clicks between two shift presses do not count as a double shift.
  const onPointer = () => { km.lastShiftTap = 0; };
  // The window loses focus mid-press: reset the state.
  const onBlur = () => { km.shiftDown = false; km.lastShiftTap = 0; clearPending(km); };

  target.addEventListener('keydown', handler, true);
  target.addEventListener('keyup', onKeyUp, true);
  target.addEventListener('pointerdown', onPointer, true);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', handler, true);
    target.removeEventListener('keyup', onKeyUp, true);
    target.removeEventListener('pointerdown', onPointer, true);
    target.removeEventListener('blur', onBlur);
  };
}

export function useKeymap() {
  useEffect(() => bindKeymap(window), []);
}
