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
 * Findings, fingerprints, the verdict and the report.
 *
 * Everything the other modules produce ends up here, so that sorting,
 * de-duplication and the cap on the number of findings are decided in exactly
 * one place.
 */

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

const RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** More findings than this tell the reader nothing new — and an attacker could flood the list. */
export const MAX_FINDINGS = 200;

export const EXCERPT_LENGTH = 160;

export function severityRank(severity) {
  return RANK[severity] ?? RANK.info;
}

/** The more severe of two severities. */
export function atLeast(severity, minimum) {
  if (severityRank(severity) <= severityRank(minimum)) {
    return severity;
  }
  return minimum;
}

/** One step up, stopping at `critical`. */
export function raise(severity) {
  return SEVERITIES[Math.max(0, severityRank(severity) - 1)];
}

/** A 53-bit string hash (cyrb53) — not a secret, only a stable fingerprint of a matched text. */
export function hashText(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** The part of a line around a match, trimmed to something a list can show. */
export function excerptOf(text, index = 0) {
  const start = Math.max(0, index - 24);
  const slice = text.slice(start, start + EXCERPT_LENGTH + 24).trim();
  return slice.slice(0, EXCERPT_LENGTH);
}

/**
 * Build a finding from a rule and where it matched.
 *
 * The fingerprint covers the rule, the file and the matched text — not the
 * line number — so that a finding a user has acknowledged stays acknowledged
 * when lines above it move.
 */
export function makeFinding(rule, details) {
  const matched = details.matched ?? details.excerpt ?? '';
  const finding = {
    id: rule.id,
    severity: details.severity ?? rule.severity,
    category: rule.category,
    title: rule.title,
    message: rule.message,
    target: details.target,
    fingerprint: `${rule.id}:${hashText(`${details.file ?? ''}\u0000${matched}`)}`,
  };
  if (details.file !== undefined) {
    finding.file = details.file;
  }
  if (details.line !== undefined) {
    finding.line = details.line;
  }
  if (details.column !== undefined) {
    finding.column = details.column;
  }
  if (details.excerpt) {
    finding.excerpt = details.excerpt.slice(0, EXCERPT_LENGTH);
  }
  return finding;
}

/** A finding for a hit the engine reported; `place` says where the scanned text came from. */
export function findingFromHit(hit, target, file) {
  return makeFinding(hit.rule, {
    severity: hit.severity,
    target,
    file,
    line: hit.line,
    column: hit.column,
    excerpt: hit.excerpt,
    matched: hit.matched,
  });
}

/** `critical` blocks; `high` and `medium` warn; `low` and `info` are listed only. */
export function verdictOf(findings) {
  let verdict = 'clean';
  for (const finding of findings) {
    if (finding.severity === 'critical') {
      return 'block';
    }
    if (finding.severity === 'high' || finding.severity === 'medium') {
      verdict = 'warn';
    }
  }
  return verdict;
}

export function summarize(report) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of report.findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

function compareFindings(a, b) {
  const bySeverity = severityRank(a.severity) - severityRank(b.severity);
  if (bySeverity !== 0) {
    return bySeverity;
  }
  const fileA = a.file ?? '';
  const fileB = b.file ?? '';
  if (fileA !== fileB) {
    return fileA < fileB ? -1 : 1;
  }
  const byLine = (a.line ?? 0) - (b.line ?? 0);
  if (byLine !== 0) {
    return byLine;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/** Sort, drop repeats of the same rule at the same place, cap, and put the verdict on top. */
export function buildReport(findings, { scanned = 0, rules = 0, truncated = false } = {}) {
  const seen = new Set();
  const unique = [];
  for (const finding of findings) {
    const key = `${finding.id}|${finding.file ?? ''}|${finding.line ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(finding);
  }
  unique.sort(compareFindings);
  const capped = unique.length > MAX_FINDINGS;
  const list = unique.slice(0, MAX_FINDINGS);
  const report = { findings: list, verdict: verdictOf(list), scanned, rules };
  if (capped || truncated) {
    report.truncated = true;
  }
  return report;
}
