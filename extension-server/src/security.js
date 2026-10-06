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
 * The server's side of the scanner: what is stored about a version and how it
 * is shown.
 *
 * The scanner itself lives in `scanner/` and knows nothing about storage. The
 * server keeps only a compact summary per version (verdict, counts, when,
 * which scanner version); the full findings are produced again on demand from
 * the stored manifest, which is cheap and always uses the current rules.
 */

import { SCANNER_VERSION, scanManifest, summarize } from './scanner/index.js';

/** A published version that blocks is never stored, so the list shows at most this many of its findings. */
export const MAX_BLOCK_FINDINGS = 20;

/** The compact form stored in `meta.json` and shown in the catalogue. */
export function securitySummary(report) {
  return {
    verdict: report.verdict,
    counts: summarize(report),
    scannedAt: new Date().toISOString(),
    scanner: SCANNER_VERSION,
  };
}

/** Is a stored summary still the work of the current scanner? */
export function isCurrentSummary(summary) {
  return Boolean(summary) && summary.scanner === SCANNER_VERSION && typeof summary.verdict === 'string';
}

/** Scan a manifest that is already on disk. A manifest the scanner chokes on must not take the server down. */
export function scanStored(manifest) {
  try {
    return scanManifest(manifest);
  } catch {
    return null;
  }
}

/** Scan a manifest and keep only the summary; `undefined` when it could not be scanned at all. */
export function summaryOf(manifest) {
  const report = scanStored(manifest);
  if (!report) {
    return undefined;
  }
  return securitySummary(report);
}

/** What the catalogue shows: the verdict and the counts, without timing. */
export function publicSummary(summary) {
  if (!summary) {
    return undefined;
  }
  return { verdict: summary.verdict, counts: summary.counts };
}

/** A line for the project pages: "Security: clean", "Security: 2 warnings". */
export function securityLabel(summary) {
  if (!summary) {
    return 'Security: not scanned';
  }
  if (summary.verdict === 'block') {
    return 'Security: blocked';
  }
  const warnings = (summary.counts?.high ?? 0) + (summary.counts?.medium ?? 0);
  if (summary.verdict === 'clean' || warnings === 0) {
    return 'Security: clean';
  }
  if (warnings === 1) {
    return 'Security: 1 warning';
  }
  return `Security: ${warnings} warnings`;
}
