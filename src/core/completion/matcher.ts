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
 * The error-tolerant matcher behind completion.
 *
 * It scores how well a query (“VkKHR”, “cosnole”) fits a candidate
 * (“VkSurfaceCapabilitiesKHR”, “console”). One dynamic program covers:
 *
 * - prefixes, word starts (camelCase, `_`, `$`, digit boundaries, acronyms),
 *   contiguous runs, and arbitrary subsequences with a cost for jumping,
 * - typos: a wrong, surplus or transposed character; missing characters are
 *   gaps. The error budget is bounded by the query length, and the first
 *   character may only differ from four characters on, at a steep penalty.
 *
 * Candidates are prepared once (`prepare`); the matching itself (`score`)
 * allocates nothing and works over typed arrays set up in advance. No DOM
 * dependency, so `scripts/check-completion.ts` can test it.
 */

/** No match. */
export const NO_MATCH = -1_000_000;

const MAX_PATTERN = 48;
const MAX_WORD = 128;
const W = MAX_WORD + 1;
const NEG = -(1 << 29);
const LIMIT = -(1 << 28);

/* Scoring — whole numbers; the ratios matter, not the magnitudes. */
const BASE = 10;
/** Bonus per boundary kind: 0 none, 1 word boundary, 2 start. */
const BOUND_BONUS = [0, 7, 9, 0];
const PREFIX = 10;
const CONTIG = 6;
const CASE_UPPER = 3;
const CASE_MISS = 3;
const MID_START = 10;
const LEAD = 1;
const LEAD_CAP = 8;
const GAP_OPEN = 4;
const GAP_MID = 6;
const SUBST = 14;
const INS = 12;
const TRANS = 14;
const FIRST_ERROR = 16;
const PREFIX_ALL = 8;
const PREFIX_CASE = 4;
const EXACT = 12;

/** Flags per character: bits 0–1 boundary kind, bit 2 upper case. */
const FLAG_UPPER = 4;

/** A prepared candidate — computed once, matched as often as you like. */
export interface Prepared {
  readonly text: string;
  readonly lower: Uint16Array;
  readonly flags: Uint8Array;
  readonly mask: number;
}

/* Shared scratch space of the program (row i, column j). */
const SIZE = (MAX_PATTERN + 1) * W;
const A = new Int32Array(SIZE);
const N = new Int32Array(SIZE);
const AE = new Uint8Array(SIZE);
const NE = new Uint8Array(SIZE);
const AT = new Uint8Array(SIZE);
const NT = new Uint8Array(SIZE);

/** Error count of the most recently computed match. */
let lastErrors = 0;

function lowerCode(ch: string, code: number): number {
  if (code >= 65 && code <= 90) {
    return code + 32;
  }
  if (code < 128) {
    return code;
  }
  const lower = ch.toLowerCase();
  return lower.length === 1 ? lower.charCodeAt(0) : code;
}

function isUpper(ch: string, code: number): boolean {
  if (code < 128) {
    return code >= 65 && code <= 90;
  }
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isAlnum(ch: string, code: number): boolean {
  if (code < 128) {
    return isDigit(code) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  }
  return WORD_CHAR.test(ch);
}

/** Character → bit of the character set (a–z each their own, the rest pooled). */
function charBit(lower: number): number {
  if (lower >= 97 && lower <= 122) {
    return 1 << (lower - 97);
  }
  if (isDigit(lower)) {
    return 1 << 26;
  }
  if (lower === 95) {
    return 1 << 27;
  }
  if (lower === 36) {
    return 1 << 28;
  }
  return 1 << (29 + (lower % 3));
}

function popcount(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Boundary kind at position `j`: 2 start, 1 word boundary, 0 none. */
function boundaryAt(text: string, j: number, upper: boolean[], alnum: boolean[]): number {
  if (j === 0) {
    return 2;
  }
  if (!alnum[j]) {
    return 0;
  }
  if (!alnum[j - 1]) {
    return 1;
  }
  const code = text.charCodeAt(j);
  const prev = text.charCodeAt(j - 1);
  if (isDigit(code) !== isDigit(prev)) {
    return 1;
  }
  if (upper[j] && !upper[j - 1]) {
    return 1;
  }
  // End of an acronym: “HTMLElement” — the “E”.
  const nextLower = j + 1 < text.length && alnum[j + 1] && !upper[j + 1] && !isDigit(text.charCodeAt(j + 1));
  if (upper[j] && upper[j - 1] && nextLower) {
    return 1;
  }
  return 0;
}

export function prepare(text: string): Prepared {
  const length = text.length;
  const lower = new Uint16Array(length);
  const flags = new Uint8Array(length);
  const upper: boolean[] = new Array(length);
  const alnum: boolean[] = new Array(length);
  let mask = 0;
  for (let j = 0; j < length; j++) {
    const ch = text[j];
    const code = text.charCodeAt(j);
    upper[j] = isUpper(ch, code);
    alnum[j] = isAlnum(ch, code);
    lower[j] = lowerCode(ch, code);
    mask |= charBit(lower[j]);
  }
  for (let j = 0; j < length; j++) {
    flags[j] = boundaryAt(text, j, upper, alnum) | (upper[j] ? FLAG_UPPER : 0);
  }
  return { text, lower, flags, mask };
}

/** The query, prepared for many candidates. */
export class Query {
  readonly text: string;
  readonly n: number;
  readonly lower: Uint16Array;
  readonly upper: Uint8Array;
  readonly mask: number;
  /** Typos allowed at this length. */
  readonly maxErrors: number;
  /** May the first character differ? */
  readonly firstError: boolean;
  /** Minimum score for a match without and with typos. */
  readonly minScore: number;
  readonly minTypoScore: number;

  constructor(text: string) {
    const raw = text.length > MAX_PATTERN ? text.slice(0, MAX_PATTERN) : text;
    this.text = raw;
    this.n = raw.length;
    this.lower = new Uint16Array(this.n);
    this.upper = new Uint8Array(this.n);
    let mask = 0;
    for (let i = 0; i < this.n; i++) {
      const code = raw.charCodeAt(i);
      this.lower[i] = lowerCode(raw[i], code);
      this.upper[i] = isUpper(raw[i], code) ? 1 : 0;
      mask |= charBit(this.lower[i]);
    }
    this.mask = mask;
    this.maxErrors = maxErrorsFor(this.n);
    this.firstError = this.n >= 4;
    const ideal = idealScore(this.n);
    this.minScore = Math.ceil(ideal * 0.36);
    this.minTypoScore = Math.ceil(ideal * 0.55);
  }
}

/** 0 errors up to 2 characters, 1 at 3–5, 2 from 6. */
export function maxErrorsFor(length: number): number {
  if (length <= 2) {
    return 0;
  }
  if (length <= 5) {
    return 1;
  }
  return 2;
}

/** Score of a perfect prefix match — the yardstick for the minimums. */
export function idealScore(length: number): number {
  if (length === 0) {
    return 0;
  }
  return BASE + BOUND_BONUS[2] + PREFIX + (length - 1) * (BASE + CONTIG);
}

/**
 * The raw score without a threshold; `NO_MATCH` when the prefilters or the
 * program find nothing. Use `accepts` for the threshold.
 */
export function rawScore(q: Query, c: Prepared): number {
  const n = q.n;
  if (n === 0) {
    return 0;
  }
  const wl = c.lower;
  const m = wl.length < MAX_WORD ? wl.length : MAX_WORD;
  const maxErr = q.maxErrors;
  if (m < n - maxErr) {
    return NO_MATCH;
  }
  if (popcount(q.mask & ~c.mask) > maxErr) {
    return NO_MATCH;
  }

  // Fast path: a subsequence with no errors?
  const pl = q.lower;
  let i = 0;
  for (let j = 0; j < m && i < n; j++) {
    if (wl[j] === pl[i]) {
      i++;
    }
  }
  if (i === n) {
    return finish(q, c, m, align(q, c, m, 0));
  }
  if (maxErr === 0) {
    return NO_MATCH;
  }

  // A greedy estimate of the errors — it only ever overestimates — to prefilter generously.
  let errors = 0;
  let from = 0;
  for (let k = 0; k < n; k++) {
    let found = -1;
    for (let j = from; j < m; j++) {
      if (wl[j] !== pl[k]) {
        continue;
      }
      found = j;
      break;
    }
    if (found < 0) {
      errors++;
      if (errors > maxErr + 1) {
        return NO_MATCH;
      }
      continue;
    }
    from = found + 1;
  }
  return finish(q, c, m, align(q, c, m, maxErr));
}

/** Threshold depending on the query length and on whether typos were needed. */
export function accepts(q: Query, raw: number, errors = lastErrors): boolean {
  if (raw <= NO_MATCH) {
    return false;
  }
  return raw >= (errors > 0 ? q.minTypoScore : q.minScore);
}

/** Score with the threshold applied: `NO_MATCH`, or the raw score. */
export function score(q: Query, c: Prepared): number {
  const raw = rawScore(q, c);
  return accepts(q, raw) ? raw : NO_MATCH;
}

/** Error count of the last `rawScore`/`score` call. */
export function errorsOfLastMatch(): number {
  return lastErrors;
}

/** Bonuses for an exact prefix and for equality. */
function finish(q: Query, c: Prepared, m: number, value: number): number {
  if (value <= NO_MATCH) {
    return NO_MATCH;
  }
  if (lastErrors > 0) {
    return value;
  }
  const n = q.n;
  const wl = c.lower;
  for (let k = 0; k < n; k++) {
    if (wl[k] !== q.lower[k]) {
      return value;
    }
  }
  let bonus = PREFIX_ALL;
  if (c.text.startsWith(q.text)) {
    bonus += PREFIX_CASE;
  }
  if (m === n && c.text.length === n) {
    bonus += EXACT;
  }
  return value + bonus;
}

/** Row 0 of the tables: leading jumps only. */
function initFirstRow(m: number) {
  A[0] = NEG;
  N[0] = 0;
  NE[0] = 0;
  NT[0] = 0;
  for (let j = 1; j <= m; j++) {
    A[j] = NEG;
    N[j] = -(j < LEAD_CAP ? j : LEAD_CAP) * LEAD;
    NE[j] = 0;
    NT[j] = 2;
  }
}

/** Column 0 of a row: only a surplus query character is possible. */
function initFirstColumn(row: number, prev: number, maxErr: number, errAllowed: boolean, errPenalty: number) {
  A[row] = NEG;
  N[row] = NEG;
  if (errAllowed && A[prev] > LIMIT && AE[prev] < maxErr) {
    A[row] = A[prev] - INS - errPenalty;
    AE[row] = AE[prev] + 1;
    AT[row] = 5;
  }
  if (errAllowed && N[prev] > LIMIT && NE[prev] < maxErr) {
    N[row] = N[prev] - INS - errPenalty;
    NE[row] = NE[prev] + 1;
    NT[row] = 3;
  }
}

/** Where the row being filled stands: which mistakes are still allowed and what they cost. */
interface RowRules {
  maxErr: number;
  errAllowed: boolean;
  errPenalty: number;
  transAllowed: boolean;
  transPenalty: number;
  /** Not the last query character — only then does opening a gap cost extra. */
  inner: boolean;
}

/** A[i][j]: query character i-1 sits on word character j-1. Returns the best score. */
function fillMatchCell(q: Query, c: Prepared, i: number, j: number, prev: number, rules: RowRules): number {
  const { maxErr, errAllowed, errPenalty, transAllowed, transPenalty } = rules;
  const pl = q.lower;
  const wl = c.lower;
  const pc = pl[i - 1];
  const cell = i * W + j;
  const diag = prev + j - 1;
  const up = prev + j;
  const wc = wl[j - 1];
  let best = NEG;
  let bestErr = 0;
  let bestFrom = 0;

  if (wc === pc) {
    const f = c.flags[j - 1];
    const pUpper = q.upper[i - 1];
    const bound = f & 3;
    let s = BASE + BOUND_BONUS[bound];
    if (j === 1 && i === 1) {
      s += PREFIX;
    }
    if (pUpper && (f & FLAG_UPPER)) {
      s += CASE_UPPER;
    }
    if (pUpper && !(f & FLAG_UPPER)) {
      s -= CASE_MISS;
    }
    const fromA = A[diag] > LIMIT ? A[diag] + CONTIG : NEG;
    let fromN = N[diag];
    // Entering mid-word, after a gap, costs extra.
    if (fromN > LIMIT && bound === 0 && j > 1) {
      fromN -= i === 1 ? MID_START : GAP_MID;
    }
    if (fromA > LIMIT && fromA >= fromN) {
      best = fromA + s;
      bestErr = AE[diag];
      bestFrom = 1;
    }
    if (fromN > LIMIT && fromN > fromA) {
      best = fromN + s;
      bestErr = NE[diag];
      bestFrom = 2;
    }
  }

  if (errAllowed) {
    // Wrong character.
    if (wc !== pc) {
      if (A[diag] > LIMIT && AE[diag] < maxErr && A[diag] - SUBST - errPenalty > best) {
        best = A[diag] - SUBST - errPenalty;
        bestErr = AE[diag] + 1;
        bestFrom = 3;
      }
      if (N[diag] > LIMIT && NE[diag] < maxErr && N[diag] - SUBST - errPenalty > best) {
        best = N[diag] - SUBST - errPenalty;
        bestErr = NE[diag] + 1;
        bestFrom = 4;
      }
    }
    // Surplus character in the query.
    if (A[up] > LIMIT && AE[up] < maxErr && A[up] - INS - errPenalty > best) {
      best = A[up] - INS - errPenalty;
      bestErr = AE[up] + 1;
      bestFrom = 5;
    }
  }

  // Transposed neighbours.
  if (transAllowed && j >= 2 && pc === wl[j - 2] && pl[i - 2] === wc) {
    const d2 = prev - W + j - 2;
    const gain = 2 * BASE + CONTIG - TRANS - transPenalty;
    if (A[d2] > LIMIT && AE[d2] < maxErr && A[d2] + CONTIG + gain > best) {
      best = A[d2] + CONTIG + gain;
      bestErr = AE[d2] + 1;
      bestFrom = 6;
    }
    if (N[d2] > LIMIT && NE[d2] < maxErr && N[d2] + gain > best) {
      best = N[d2] + gain;
      bestErr = NE[d2] + 1;
      bestFrom = 7;
    }
  }

  A[cell] = best;
  AE[cell] = bestErr;
  AT[cell] = bestFrom;
  return best;
}

/** N[i][j]: word character j-1 was skipped. Returns the best score. */
function fillSkipCell(cell: number, up: number, rules: RowRules): number {
  const { maxErr, errAllowed, errPenalty, inner } = rules;
  const left = cell - 1;
  let skip = NEG;
  let skipErr = 0;
  let skipFrom = 0;
  if (A[left] > LIMIT) {
    skip = A[left] - (inner ? GAP_OPEN : 0);
    skipErr = AE[left];
    skipFrom = 1;
  }
  if (N[left] > LIMIT && N[left] > skip) {
    skip = N[left];
    skipErr = NE[left];
    skipFrom = 2;
  }
  if (errAllowed && N[up] > LIMIT && NE[up] < maxErr && N[up] - INS - errPenalty > skip) {
    skip = N[up] - INS - errPenalty;
    skipErr = NE[up] + 1;
    skipFrom = 3;
  }
  N[cell] = skip;
  NE[cell] = skipErr;
  NT[cell] = skipFrom;
  return skip;
}

/**
 * The alignment itself. A[i][j]: query character i-1 sits on word character
 * j-1; N[i][j]: word character j-1 was skipped. Error counts travel with
 * whichever path is best (AE/NE), and where each came from is kept in AT/NT
 * for `matchRanges`.
 */
function align(q: Query, c: Prepared, m: number, maxErr: number): number {
  const n = q.n;
  const pl = q.lower;
  const firstError = q.firstError;

  initFirstRow(m);

  for (let i = 1; i <= n; i++) {
    const row = i * W;
    const prev = row - W;
    const pc = pl[i - 1];
    const errAllowed = maxErr > 0 && (i > 1 || firstError);
    const rules: RowRules = {
      maxErr,
      errAllowed,
      errPenalty: i === 1 ? FIRST_ERROR : 0,
      transAllowed: maxErr > 0 && i >= 2 && (i > 2 || firstError) && pc !== pl[i - 2],
      transPenalty: i === 2 ? FIRST_ERROR : 0,
      inner: i < n,
    };

    initFirstColumn(row, prev, maxErr, errAllowed, rules.errPenalty);

    let rowBest = NEG;
    for (let j = 1; j <= m; j++) {
      const best = fillMatchCell(q, c, i, j, prev, rules);
      const skip = fillSkipCell(row + j, prev + j, rules);
      if (best > rowBest) {
        rowBest = best;
      }
      if (skip > rowBest) {
        rowBest = skip;
      }
    }
    if (rowBest <= LIMIT) {
      return NO_MATCH;
    }
  }

  const end = n * W + m;
  if (A[end] > LIMIT && A[end] >= N[end]) {
    lastErrors = AE[end];
    return A[end];
  }
  if (N[end] <= LIMIT) {
    return NO_MATCH;
  }
  lastErrors = NE[end];
  return N[end];
}

/**
 * The matched ranges as pairs `[from, to, from, to …]` for `getMatch`.
 * Empty when nothing fits.
 */
export function matchRanges(q: Query, c: Prepared): number[] {
  if (rawScore(q, c) <= NO_MATCH) {
    return [];
  }
  const n = q.n;
  const m = c.lower.length < MAX_WORD ? c.lower.length : MAX_WORD;
  const positions: number[] = [];
  let i = n;
  let j = m;
  let inA = A[n * W + m] > LIMIT && A[n * W + m] >= N[n * W + m];
  while (i > 0) {
    const cell = i * W + j;
    if (!inA) {
      const from = NT[cell];
      if (from === 0) {
        break;
      }
      if (from === 3) {
        i--;
        continue;
      }
      j--;
      inA = from === 1;
      continue;
    }
    const from = AT[cell];
    if (from === 1 || from === 2) {
      positions.push(j - 1);
    }
    if (from === 6 || from === 7) {
      positions.push(j - 1, j - 2);
    }
    if (from === 0) {
      break;
    }
    if (from === 5) {
      i--;
      continue;
    }
    const step = from >= 6 ? 2 : 1;
    i -= step;
    j -= step;
    inA = from === 1 || from === 3 || from === 6;
  }
  return toRanges(positions);
}

function toRanges(positions: number[]): number[] {
  positions.sort((a, b) => a - b);
  const out: number[] = [];
  for (const p of positions) {
    if (out.length && out[out.length - 1] === p) {
      out[out.length - 1] = p + 1;
      continue;
    }
    out.push(p, p + 1);
  }
  return out;
}

/** A convenient one-shot call for tests and rare cases. */
export function matchText(pattern: string, text: string): { score: number; errors: number; ranges: number[]; } | null {
  const q = new Query(pattern);
  const c = prepare(text);
  const value = score(q, c);
  if (value <= NO_MATCH) {
    return null;
  }
  const errors = lastErrors;
  return { score: value, errors, ranges: matchRanges(q, c) };
}
