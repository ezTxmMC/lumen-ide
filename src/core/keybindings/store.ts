/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { type PresetId, type BindingMap, DOUBLE_SHIFT, LUMEN, presetBindings } from './presets';
import { type Chord, parseChord, normalizeBinding, isSymbol, eventMatches } from './chords';

/* ------------------------------------------------------------------ *
 * The active binding
 * ------------------------------------------------------------------ */

interface Compiled {
  id: string;
  binding: string;
  chords: Chord[];
}

let effective: BindingMap = { ...LUMEN };

let compiled: Compiled[] = [];

let version = 0;

const listeners = new Set<() => void>();

export function compile() {
  compiled = [];
  for (const [id, bindings] of Object.entries(effective)) {
    for (const binding of bindings) {
      if (binding === DOUBLE_SHIFT) {
        compiled.push({ id, binding, chords: [] });
        continue;
      }
      const chords = binding.split(/\s+/).map(parseChord).filter((c): c is Chord => c !== null);
      if (chords.length) {
        compiled.push({ id, binding: normalizeBinding(binding), chords });
      }
    }
  }
}

export const keybindings = {
  /** Preset plus custom bindings; an empty array means a command with no shortcut. */
  configure(preset: PresetId, overrides: BindingMap, defaults: BindingMap = {}) {
    effective = { ...defaults, ...presetBindings(preset) };
    for (const [id, bindings] of Object.entries(overrides)) {
      effective[id] = bindings.map(normalizeBinding);
    }
    compile();
    version++;
    for (const fn of listeners) {
      fn();
    }
  },

  bindingsFor(id: string): string[] {
    return effective[id] ?? [];
  },

  all(): BindingMap {
    return effective;
  },

  /** Commands whose first chord matches and that consist of one chord only. */
  match(event: KeyboardEvent): string[] {
    return compiled
      .filter((c) => c.chords.length === 1 && eventMatches(event, c.chords[0]))
      .map((c) => c.id);
  },

  /** Are there bindings that start with this chord and run longer? */
  isPrefix(event: KeyboardEvent): boolean {
    return compiled.some((c) => c.chords.length > 1 && eventMatches(event, c.chords[0]));
  },

  /** Second chord of a sequence whose first chord was `first`. */
  matchSequence(first: Chord, event: KeyboardEvent): string[] {
    return compiled
      .filter((c) => c.chords.length === 2 && sameChord(c.chords[0], first))
      .filter((c) => eventMatches(event, c.chords[1]))
      .map((c) => c.id);
  },

  doubleShift(): string[] {
    return compiled.filter((c) => c.binding === DOUBLE_SHIFT).map((c) => c.id);
  },

  /** Other commands carrying the same binding. */
  conflicts(binding: string, exceptId?: string): string[] {
    const normalized = normalizeBinding(binding);
    return Object.entries(effective)
      .filter(([id, list]) => id !== exceptId && list.some((b) => normalizeBinding(b) === normalized))
      .map(([id]) => id);
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  getVersion: () => version,
};

function sameChord(a: Chord, b: Chord) {
  if (a.ctrl !== b.ctrl || a.alt !== b.alt) {
    return false;
  }
  if (a.key === b.key && a.shift === b.shift) {
    return true;
  }
  return a.key === b.key && isSymbol(a.key) && !a.shift;
}

compile();
