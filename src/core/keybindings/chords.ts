/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { DOUBLE_SHIFT } from './presets';

/* ------------------------------------------------------------------ *
 * Chords
 * ------------------------------------------------------------------ */

export interface Chord {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Normalised key name (`A`, `F12`, `/`, `Up`, `NumpadAdd`). */
  key: string;
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS', 'CapsLock', 'Fn']);

const CODE_NAMES: Record<string, string> = {
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  IntlBackslash: '<', Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Escape',
  Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left',
  ArrowRight: 'Right', NumpadAdd: 'NumpadAdd', NumpadSubtract: 'NumpadSubtract',
  NumpadMultiply: 'NumpadMultiply', NumpadDivide: 'NumpadDivide', NumpadDecimal: 'NumpadDecimal',
};

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Esc: 'Escape', Del: 'Delete',
};

const NAMED_KEYS = new Set([
  'Space', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp',
  'PageDown', 'Up', 'Down', 'Left', 'Right', 'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply',
  'NumpadDivide', 'NumpadDecimal',
]);

function nameFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }
  if (/^Numpad\d$/.test(code)) {
    return `NumpadNumber${code.slice(6)}`;
  }
  if (/^F\d{1,2}$/.test(code)) {
    return code;
  }
  return CODE_NAMES[code] ?? null;
}

function nameFromKey(key: string): string | null {
  if (KEY_NAMES[key]) {
    return KEY_NAMES[key];
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  if (/^F\d{1,2}$/.test(key)) {
    return key;
  }
  if (NAMED_KEYS.has(key)) {
    return key;
  }
  return null;
}

/** The key of an event — both readings, by position and by character. */
export function eventKeys(event: KeyboardEvent): { code: string | null; key: string | null; } {
  return { code: nameFromCode(event.code), key: nameFromKey(event.key) };
}

export function isModifierOnly(event: KeyboardEvent) {
  return MODIFIER_KEYS.has(event.key);
}

/** A chord from one keypress — for recording new bindings. */
export function chordFromEvent(event: KeyboardEvent): Chord | null {
  if (isModifierOnly(event)) {
    return null;
  }
  const { code, key } = eventKeys(event);
  // Letters and digits by position, punctuation by the character produced (Ö, ß, +).
  const byCode = code && (/^[A-Z0-9]$/.test(code) || code.startsWith('F') || NAMED_KEYS.has(code) || code.startsWith('Numpad'));
  const name = byCode ? code : (key ?? code);
  if (!name) {
    return null;
  }
  return { ctrl: event.ctrlKey || event.metaKey, alt: event.altKey, shift: event.shiftKey, key: name };
}

/** `Ctrl+Shift+p` → a chord. */
export function parseChord(text: string): Chord | null {
  const parts = text.split('+');
  // `Ctrl++` → the “+” key.
  const merged: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '' && i === parts.length - 1 && merged.length) {
      merged.push('+');
      continue;
    }
    if (parts[i] === '') {
      continue;
    }
    merged.push(parts[i]);
  }
  const chord: Chord = { ctrl: false, alt: false, shift: false, key: '' };
  for (const raw of merged) {
    const part = raw.trim();
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'cmd' || lower === 'mod' || lower === 'meta') { chord.ctrl = true; continue; }
    if (lower === 'alt' || lower === 'option') { chord.alt = true; continue; }
    if (lower === 'shift') { chord.shift = true; continue; }
    chord.key = part.length === 1 ? part.toUpperCase() : part;
  }
  return chord.key ? chord : null;
}

export function chordToString(chord: Chord): string {
  return [chord.ctrl && 'Ctrl', chord.alt && 'Alt', chord.shift && 'Shift', chord.key].filter(Boolean).join('+');
}

/** Normalises a binding: modifier order and letter case. */
export function normalizeBinding(binding: string): string {
  if (binding.trim() === DOUBLE_SHIFT) {
    return DOUBLE_SHIFT;
  }
  return binding
    .trim()
    .split(/\s+/)
    .map((part) => parseChord(part))
    .filter((c): c is Chord => c !== null)
    .map(chordToString)
    .join(' ');
}

export const isSymbol = (key: string) => key.length === 1 && !/[A-Z0-9]/.test(key);

/** Does a keypress fit a chord? */
export function eventMatches(event: KeyboardEvent, chord: Chord): boolean {
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl !== chord.ctrl || event.altKey !== chord.alt) {
    return false;
  }
  const { code, key } = eventKeys(event);
  if (code === chord.key && event.shiftKey === chord.shift) {
    return true;
  }
  if (key !== chord.key) {
    return false;
  }
  if (event.shiftKey === chord.shift) {
    return true;
  }
  // Punctuation only reachable with Shift (`+`, `/` on German keyboards).
  return isSymbol(chord.key) && !chord.shift;
}
