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
 * The matching itself: rule sets, line scanning, text scanning and the command
 * pipeline (normalise, unwrap, decode, then match).
 *
 * All limits that keep the scanner fast on hostile input live here: lines are
 * cut into windows before a rule sees them, input is capped, and the number of
 * raw hits is capped so a file made of matches cannot make the scan run away.
 */

import { RULES, DECODED_DANGEROUS, DECODED_EXECUTED, DISGUISED_COMMAND } from './rules/index.js';
import {
  MAX_COMMAND_LENGTH, dequote, extractEncodedPayloads, extractPayloads, extractSubshells, normalizeBase, splitSegments,
} from './normalize.js';
import { atLeast, excerptOf, raise } from './report.js';

/** The longest text the scanner reads; the rest is ignored and the report says so. */
export const MAX_TEXT = 2 * 1024 * 1024;
/** Rules see lines in windows of this size, so no pattern can run for long on one line. */
export const MAX_LINE = 400;
const LINE_STEP = 300;
const COMMAND_STEP = MAX_COMMAND_LENGTH - 200;
const MAX_RAW_HITS = 3000;
const MAX_PAYLOAD_DEPTH = 3;
const MAX_TEXT_MATCHES = 200;

const SUDO_PREFIX = /(?:^|[;&|(]\s*)(?:sudo|doas)\b[^;&|]*$/;
const OBFUSCATION_TRICK = /[A-Za-z]["'][A-Za-z]|[A-Za-z]["']{2}|["']{2}[A-Za-z]|(?:^|[\s;|&])\\[A-Za-z]/;
const UNWRAP_HINT = /[-/][ck]\b|\beval\b|\$\(|`|<\(|>\(|\bsu\b/i;
const TRICK_MARKS = /\$'|\$\{?IFS|(?:^|\s)\{[^{}\s]*,/;
const ENCODED_HINT = /base64|\b(?:powershell|pwsh)\b/i;

/** @typedef {{ rule: object, severity: string, line?: number, column?: number, excerpt: string, matched: string }} Hit */

function execOnce(pattern, text) {
  if (pattern.global || pattern.sticky) {
    pattern.lastIndex = 0;
  }
  return pattern.exec(text);
}

function matchesKind(rule, kinds) {
  if (!rule.languages) {
    return true;
  }
  return rule.languages.some((language) => kinds.includes(language));
}

function isUsableRule(rule) {
  return Boolean(rule) && rule.pattern instanceof RegExp && typeof rule.id === 'string' && Array.isArray(rule.targets);
}

function partition(rules) {
  const hinted = rules.filter((rule) => rule.hint);
  const plain = rules.filter((rule) => !rule.hint);
  const hint = hinted.length ? new RegExp(hinted.map((rule) => `(?:${rule.hint})`).join('|'), 'i') : null;
  return { hinted, plain, hint };
}

/**
 * Pick the rules that apply and sort them by how they are run.
 *
 * `pipeline`: command-scope rules run through the command normaliser instead
 * of raw. `force`: every line rule does (a command scan treats the extra rules
 * of an extension the same as the built-in ones).
 */
export function buildRuleSet(rules, { target, kinds, pipeline = false, force = false }) {
  const command = [];
  const line = [];
  const text = [];
  let count = 0;
  for (const rule of rules) {
    if (!isUsableRule(rule) || !rule.targets.includes(target) || !matchesKind(rule, kinds)) {
      continue;
    }
    count++;
    if (rule.synthetic) {
      continue;
    }
    if (rule.scope === 'text') {
      text.push(rule);
      continue;
    }
    if (pipeline && (rule.scope === 'command' || force)) {
      command.push(rule);
      continue;
    }
    line.push(rule);
  }
  return { command: partition(command), line, text, count, target };
}

const cache = new Map();

/** The built-in rules for a scan, built once per combination. */
function builtinSet(options) {
  const key = `${options.target}|${options.kinds.join(',')}|${options.pipeline}|${options.force}`;
  let set = cache.get(key);
  if (!set) {
    set = buildRuleSet(RULES, options);
    cache.set(key, set);
  }
  return set;
}

/** Built-in and extra rules together, as a list of sets to run one after the other. */
export function ruleSetsFor(options, extraRules) {
  const sets = [builtinSet(options)];
  if (Array.isArray(extraRules) && extraRules.length) {
    sets.push(buildRuleSet(extraRules, options));
  }
  return sets;
}

export function countRules(sets) {
  return sets.reduce((total, set) => total + set.count, 0);
}

function makeHit(rule, text, match, extra = {}) {
  return {
    rule,
    severity: extra.severity ?? rule.severity,
    column: match.index + 1,
    excerpt: excerptOf(text, match.index),
    matched: match[0].slice(0, 200),
    ...extra.fields,
  };
}

/** Cut a long line into overlapping windows. */
function* windows(text, size, step) {
  if (text.length <= size) {
    yield { text, offset: 0 };
    return;
  }
  for (let offset = 0; offset < text.length; offset += step) {
    yield { text: text.slice(offset, offset + size), offset };
    if (offset + size >= text.length) {
      return;
    }
  }
}

/* ---------------------------------------------------------------------- *
 * Line and text rules
 * ---------------------------------------------------------------------- */

function lineStartsOf(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineAt(starts, index) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= index) {
      low = mid;
      continue;
    }
    high = mid - 1;
  }
  return low + 1;
}

const globalCopies = new WeakMap();

function globalCopy(pattern) {
  let copy = globalCopies.get(pattern);
  if (!copy) {
    copy = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    globalCopies.set(pattern, copy);
  }
  return copy;
}

/** Rules that look at the whole text at once. */
function scanWholeText(text, rules, ctx, hits) {
  const starts = lineStartsOf(text);
  for (const rule of rules) {
    const pattern = globalCopy(rule.pattern);
    pattern.lastIndex = 0;
    const needed = rule.minMatches ?? 1;
    let first;
    let count = 0;
    let match = pattern.exec(text);
    while (match && count < MAX_TEXT_MATCHES) {
      if (match[0] === '') {
        pattern.lastIndex++;
      }
      const lineNumber = lineAt(starts, match.index);
      const lineStart = starts[lineNumber - 1];
      // A window around the match, never the whole line: minified bundles are one line of megabytes.
      const from = Math.max(lineStart, match.index - 300);
      const tail = text.slice(match.index, match.index + 300);
      const newline = tail.indexOf('\n');
      const line = text.slice(from, match.index + (newline === -1 ? tail.length : newline));
      if (!rule.confirm || rule.confirm(match, line, ctx)) {
        count++;
        first ??= { match, line, from, lineNumber, lineStart };
      }
      match = pattern.exec(text);
    }
    if (!first || count < needed) {
      continue;
    }
    hits.push({
      rule,
      severity: rule.severity,
      line: first.lineNumber + (ctx.lineOffset ?? 0),
      column: first.match.index - first.lineStart + 1,
      excerpt: excerptOf(first.line, first.match.index - first.from),
      matched: first.match[0].slice(0, 200),
    });
  }
}

/** Rules that look at a line at a time, in windows of at most `MAX_LINE`. */
function scanEachLine(text, rules, ctx, hits) {
  let start = 0;
  let line = 1;
  let lines = 0;
  while (start <= text.length && hits.length < MAX_RAW_HITS) {
    let end = text.indexOf('\n', start);
    if (end === -1) {
      end = text.length;
    }
    const lineText = text.slice(start, end);
    if (lineText.trim()) {
      lines++;
      const found = new Set();
      for (const part of windows(lineText, MAX_LINE, LINE_STEP)) {
        for (const rule of rules) {
          if (found.has(rule)) {
            continue;
          }
          const match = execOnce(rule.pattern, part.text);
          if (!match || (rule.confirm && !rule.confirm(match, part.text, ctx))) {
            continue;
          }
          found.add(rule);
          hits.push({
            rule,
            severity: rule.severity,
            line: line + (ctx.lineOffset ?? 0),
            column: part.offset + match.index + 1,
            excerpt: excerptOf(part.text, match.index),
            matched: match[0].slice(0, 200),
          });
        }
      }
    }
    start = end + 1;
    line++;
  }
  return lines;
}

/**
 * Run the line rules and the whole-text rules of every set over a text.
 * @returns {number} How many non-empty lines were looked at.
 */
export function scanLinesAndText(text, sets, ctx, hits) {
  let lines = 0;
  for (const set of sets) {
    const withContext = { ...ctx, text };
    if (set.line.length) {
      lines = Math.max(lines, scanEachLine(text, set.line, withContext, hits));
    }
    if (set.text.length) {
      scanWholeText(text, set.text, withContext, hits);
    }
  }
  return lines;
}

/* ---------------------------------------------------------------------- *
 * The command pipeline
 * ---------------------------------------------------------------------- */

function unique(list) {
  return [...new Set(list)];
}

/** Does the text before a match start with `sudo`/`doas` in the same command? */
function isElevated(text, match) {
  return SUDO_PREFIX.test(text.slice(0, match.index)) || /^(?:sudo|doas)\b/.test(match[0]);
}

function emitSynthetic(rule, ctx, hits, text, matched) {
  if (!rule.targets.includes(ctx.ruleTarget)) {
    return;
  }
  hits.push({
    rule,
    severity: atLeast(rule.severity, ctx.minSeverity ?? 'info'),
    column: 1,
    excerpt: excerptOf(text, 0),
    matched: matched.slice(0, 200),
  });
}

/**
 * The cheap first look: does the text contain any word a rule is interested in?
 * Quotes and backslashes are ignored for this look, so `r""m` still counts;
 * the tricks that need decoding first are recognised by their marks.
 */
function worthScanning(raw, sets) {
  if (sets.some((set) => set.command.plain.length)) {
    return true;
  }
  if (TRICK_MARKS.test(raw) || ENCODED_HINT.test(raw)) {
    return true;
  }
  const bare = raw.replace(/["'\\]/g, '');
  return sets.some((set) => set.command.hint?.test(bare));
}

/**
 * Scan one command line against the command rules of every set.
 *
 * A rule is looked for in the line as written, with its quotes removed, in each
 * piece between `;`, `&&`, `||` and `&`, and again in everything the line hands
 * to another interpreter (`sh -c`, `eval`, `$(…)`, Base64). That is a lot of
 * ground, so the cheap `hint` of each rule decides first whether it is worth
 * running at all.
 */
export function scanCommandLine(raw, sets, ctx, depth = 0) {
  const hits = [];
  if (!worthScanning(raw, sets)) {
    return hits;
  }
  const { text: base, tricks } = normalizeBase(raw);
  if (!base) {
    return hits;
  }
  const plain = dequote(base);
  const variants = [{ text: base, plain: false }];
  if (plain !== base) {
    variants.push({ text: plain, plain: true });
  }
  const pieces = [];
  for (const variant of variants) {
    pieces.push(variant);
    if (/[;&|\n]/.test(variant.text)) {
      for (const segment of splitSegments(variant.text)) {
        if (segment !== variant.text) {
          pieces.push({ text: segment, plain: variant.plain });
        }
      }
    }
  }

  const found = new Map();
  const onBase = new Set();
  for (const piece of pieces) {
    for (const set of sets) {
      const { hinted, plain: always, hint } = set.command;
      const candidates = hint && hint.test(piece.text) ? [...hinted, ...always] : always;
      for (const rule of candidates) {
        if (found.has(rule) && (piece.plain || onBase.has(rule))) {
          continue;
        }
        const match = execOnce(rule.pattern, piece.text);
        if (!match || (rule.confirm && !rule.confirm(match, piece.text, ctx.context))) {
          continue;
        }
        if (!piece.plain) {
          onBase.add(rule);
        }
        if (found.has(rule)) {
          continue;
        }
        let severity = atLeast(rule.severity, ctx.minSeverity ?? 'info');
        if (isElevated(piece.text, match) && rule.severity !== 'critical') {
          severity = raise(severity);
        }
        found.set(rule, makeHit(rule, piece.text, match, { severity }));
      }
    }
  }
  hits.push(...found.values());

  const disguised = [...found.keys()].some((rule) => !onBase.has(rule)) && OBFUSCATION_TRICK.test(base);
  if ((disguised || (tricks && found.size)) && found.size) {
    emitSynthetic(DISGUISED_COMMAND, ctx, hits, base, raw);
  }

  if (depth >= MAX_PAYLOAD_DEPTH) {
    return hits;
  }
  if (UNWRAP_HINT.test(base)) {
    const inner = unique([...extractPayloads(base), ...extractSubshells(base)]);
    for (const payload of inner) {
      if (payload !== base) {
        hits.push(...scanCommandLine(payload, sets, ctx, depth + 1));
      }
    }
  }
  if (ENCODED_HINT.test(base)) {
    for (const encoded of extractEncodedPayloads(base)) {
      const decodedHits = scanCommandLine(encoded.text, sets, ctx, depth + 1);
      hits.push(...decodedHits);
      if (decodedHits.length) {
        emitSynthetic(DECODED_DANGEROUS, ctx, hits, encoded.text, encoded.text);
        continue;
      }
      if (encoded.executed) {
        emitSynthetic(DECODED_EXECUTED, ctx, hits, encoded.text, encoded.text);
      }
    }
  }
  return hits;
}

const COMMENT_PREFIX = { shell: /^\s*#/, python: /^\s*#/, powershell: /^\s*#/, batch: /^\s*(?:rem\b|::)/i };

/**
 * Lines of a script as the shell sees them: continuation lines joined, comment
 * lines dropped. `line` is where each logical line starts, 1-based.
 */
export function* logicalLines(text, kind) {
  const comment = COMMENT_PREFIX[kind];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const startLine = i + 1;
    let current = lines[i];
    while (/\\\s*$/.test(current) && i + 1 < lines.length) {
      current = `${current.replace(/\\\s*$/, ' ')}${lines[++i]}`;
    }
    if (!current.trim() || (comment && comment.test(current))) {
      continue;
    }
    yield { text: current, line: startLine };
  }
}

/**
 * Scan a script or a terminal command line by line through the command pipeline.
 * @returns {number} How many logical lines were scanned.
 */
export function scanCommandText(text, sets, ctx, hits) {
  let scanned = 0;
  const context = { file: ctx.file, text, kind: ctx.kind };
  for (const entry of logicalLines(text, ctx.kind)) {
    if (hits.length >= MAX_RAW_HITS) {
      break;
    }
    scanned++;
    for (const part of windows(entry.text, MAX_COMMAND_LENGTH, COMMAND_STEP)) {
      const found = scanCommandLine(part.text, sets, { ...ctx, context }, 0);
      for (const hit of found) {
        hits.push({ ...hit, line: entry.line + (ctx.lineOffset ?? 0), column: part.offset + (hit.column ?? 1) });
      }
    }
  }
  return scanned;
}
