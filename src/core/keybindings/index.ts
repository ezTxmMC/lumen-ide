/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export { type PresetId, PRESETS, type BindingMap, DOUBLE_SHIFT, presetBindings } from './presets';
export { type Chord, eventKeys, isModifierOnly, chordFromEvent, parseChord, chordToString, normalizeBinding, eventMatches } from './chords';
export { keybindings } from './store';
export { setKeybindingPlatform, formatBinding, formatBindingsFor } from './labels';
