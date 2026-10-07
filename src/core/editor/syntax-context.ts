/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * The syntax context at a position (`LanguageSpec.syntaxContext`) as the
 * editor and the completion source use it: cached per document and position,
 * so that the several callers of one keystroke scan the text once.
 *
 * Detectors that ship with Lumen are registered here under a name, the
 * counterpart of `core/user-addons/tokenizers.ts`: a detector is a program (it
 * scans text) and a manifest carries data, so an add-on writes
 * `"syntaxContext": "nvmd"`. The names are part of the extension format; the
 * implementations live in `src/addons/lib/contexts/` and register from there.
 */

import type { EditorState, Text } from '@codemirror/state';
import type { ContextDetector, LanguageSpec, SyntaxContext } from '../types';

interface Remembered {
  detector: ContextDetector;
  pos: number;
  context: SyntaxContext;
}

const last = new WeakMap<Text, Remembered>();

/** The context at `pos`, or null when the language detects none. Scans only the text before `pos`. */
export function syntaxContextAt(detector: ContextDetector | undefined, state: EditorState, pos: number): SyntaxContext | null {
  if (!detector) {
    return null;
  }
  const hit = last.get(state.doc);
  if (hit && hit.pos === pos && hit.detector === detector) {
    return hit.context;
  }
  const context = detector(state.sliceDoc(0, pos));
  last.set(state.doc, { detector, pos, context });
  return context;
}

/** The scope name at `pos`; null without a detector. */
export function scopeAt(spec: Pick<LanguageSpec, 'syntaxContext'> | null | undefined, state: EditorState, pos: number): string | null {
  return syntaxContextAt(spec?.syntaxContext, state, pos)?.scope ?? null;
}

/**
 * Which word pattern applies at `pos`: `codePattern` inside code (`<?nv ?>`,
 * `{expr}`), else `pattern`. Without a code pattern or a detector the scan is
 * skipped altogether.
 */
export function wordPatternAt(
  pattern: RegExp | null | undefined, codePattern: RegExp | null | undefined, detector: ContextDetector | undefined,
  state: EditorState, pos: number,
): RegExp | null {
  if (!pattern) {
    return null;
  }
  if (!codePattern || !detector) {
    return pattern;
  }
  if (syntaxContextAt(detector, state, pos)?.code) {
    return codePattern;
  }
  return pattern;
}

/* ------------------------------------------------------------------ *
 * Named detectors
 * ------------------------------------------------------------------ */

const detectors = new Map<string, ContextDetector>();

export function registerContextDetectors(entries: Record<string, ContextDetector>) {
  for (const [name, detector] of Object.entries(entries)) {
    detectors.set(name, detector);
  }
}

/** The names an extension may use, sorted — for validation and the studio. */
export function contextDetectorNames(): string[] {
  return [...detectors.keys()].sort();
}

export function isContextDetectorName(name: string): boolean {
  return detectors.has(name);
}

/** `undefined` for an unknown name; the language then detects no context. */
export function resolveContextDetector(name: string | undefined): ContextDetector | undefined {
  return name ? detectors.get(name) : undefined;
}

/** The registered name of a detector — for turning a compiled language back into data. */
export function contextDetectorName(detector: ContextDetector | undefined): string | undefined {
  if (!detector) {
    return undefined;
  }
  return [...detectors.entries()].find(([, known]) => known === detector)?.[0];
}
