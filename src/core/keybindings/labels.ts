/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { getLanguage } from '@/i18n';
import { DOUBLE_SHIFT } from './presets';
import { parseChord } from './chords';
import { keybindings } from './store';

/* ------------------------------------------------------------------ *
 * Display
 * ------------------------------------------------------------------ */

const LABELS_DE: Record<string, string> = {
  Ctrl: 'Strg', Shift: 'Umschalt', Alt: 'Alt', Space: 'Leertaste', Enter: 'Eingabe', Escape: 'Esc',
  Delete: 'Entf', Insert: 'Einfg', Home: 'Pos1', End: 'Ende', PageUp: 'Bild↑', PageDown: 'Bild↓',
  Backspace: 'Rücktaste', Up: '↑', Down: '↓', Left: '←', Right: '→', Tab: 'Tab',
};

const LABELS_EN: Record<string, string> = {
  Ctrl: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Space: 'Space', Enter: 'Enter', Escape: 'Esc',
  Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Backspace: 'Backspace', Up: '↑', Down: '↓', Left: '←', Right: '→', Tab: 'Tab',
};

const LABELS_MAC: Record<string, string> = {
  ...LABELS_EN, Ctrl: '⌘', Shift: '⇧', Alt: '⌥', Enter: '↩', Backspace: '⌫', Delete: '⌦', Escape: '⎋', Tab: '⇥',
};

const NUMPAD_LABELS: Record<string, string> = {
  NumpadAdd: 'Num +', NumpadSubtract: 'Num −', NumpadMultiply: 'Num ×', NumpadDivide: 'Num ÷', NumpadDecimal: 'Num ,',
};

let platform = 'linux';

export function setKeybindingPlatform(value: string) {
  platform = value;
}

function labels() {
  if (platform === 'darwin') {
    return LABELS_MAC;
  }
  return getLanguage() === 'de' ? LABELS_DE : LABELS_EN;
}

function label(part: string) {
  if (NUMPAD_LABELS[part]) {
    return NUMPAD_LABELS[part];
  }
  if (part.startsWith('NumpadNumber')) {
    return `Num ${part.slice(12)}`;
  }
  return labels()[part] ?? part;
}

/** Readable form: `Ctrl+Shift+P` → “Strg+Umschalt+P” in German. */
export function formatBinding(binding: string): string {
  if (binding === DOUBLE_SHIFT) {
    return `${label('Shift')} ${label('Shift')}`;
  }
  const joiner = platform === 'darwin' ? '' : '+';
  return binding
    .split(/\s+/)
    .map((chord) => {
      const parsed = parseChord(chord);
      if (!parsed) {
        return chord;
      }
      return [parsed.ctrl && 'Ctrl', parsed.alt && 'Alt', parsed.shift && 'Shift', parsed.key]
        .filter((p): p is string => Boolean(p))
        .map(label)
        .join(joiner);
    })
    .join(' ');
}

/** Every binding of a command, readable and joined with “·”. */
export function formatBindingsFor(id: string): string | undefined {
  const list = keybindings.bindingsFor(id);
  if (!list.length) {
    return undefined;
  }
  return list.map(formatBinding).join(' · ');
}
