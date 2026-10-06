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
 * Scanning a text or a command: what `scanText` and `scanCommand` do, and the
 * building block the project and extension scanners reuse.
 */

import {
  MAX_TEXT, countRules, ruleSetsFor, scanCommandText, scanLinesAndText,
} from './engine.js';
import { quoteArgument } from './normalize.js';
import { buildReport, findingFromHit } from './report.js';

/**
 * Run every applicable rule over a text. Returns the raw hits; the callers
 * decide what they are called and where they came from.
 *
 * `kinds` are the file kinds the text counts as (`['shell', 'shell-hook']`);
 * the first one decides how comments are recognised.
 */
export function scanBody(text, { file, kinds, target, extraRules, force = false, lineOffset = 0, minSeverity }) {
  const pipeline = target !== 'extension';
  const sets = ruleSetsFor({ target, kinds, pipeline, force }, extraRules);
  const hits = [];
  const ctx = { file, kind: kinds[0], target, ruleTarget: target, lineOffset, minSeverity };
  let scanned = 0;
  if (sets.some((set) => set.command.hinted.length || set.command.plain.length)) {
    scanned = scanCommandText(text, sets, ctx, hits);
  }
  scanned = Math.max(scanned, scanLinesAndText(text, sets, ctx, hits));
  return { hits, scanned, rules: countRules(sets) };
}

/** Hits as findings of one target, in one file. */
export function toFindings(hits, target, file) {
  return hits.map((hit) => findingFromHit(hit, target, file));
}

/** Analyse a command line or an argv-style command. */
export function scanCommand(input, options = {}) {
  let command = '';
  if (typeof input === 'string') {
    command = input;
  }
  if (input && typeof input === 'object' && typeof input.command === 'string') {
    const args = Array.isArray(input.args) ? input.args.map(quoteArgument) : [];
    command = [input.command, ...args].join(' ');
  }
  const truncated = command.length > MAX_TEXT;
  const run = scanBody(command.slice(0, MAX_TEXT), {
    file: 'command', kinds: ['shell'], target: 'command', extraRules: options.extraRules, force: true,
  });
  return buildReport(toFindings(run.hits, 'command', 'command'), { scanned: run.scanned, rules: run.rules, truncated });
}

/** Analyse the text of a file. */
export function scanText(text, options = {}) {
  const kind = options.kind ?? 'any';
  const target = options.target ?? 'project';
  const input = typeof text === 'string' ? text : '';
  const truncated = input.length > MAX_TEXT;
  const run = scanBody(input.slice(0, MAX_TEXT), {
    file: options.file, kinds: [kind], target, extraRules: options.extraRules,
  });
  return buildReport(toFindings(run.hits, target, options.file), { scanned: run.scanned, rules: run.rules, truncated });
}
