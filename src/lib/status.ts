/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Presenting server and process states — in one place, rather than scattered conditionals. */

const DOT: Record<string, string> = {
  ready: 'bg-ok',
  failed: 'bg-bad',
  starting: 'lm-anim-pulse bg-warn',
  checking: 'lm-anim-pulse bg-warn',
};

/** The Tailwind class for a language server's status dot. */
export function statusDot(status: string): string {
  return DOT[status] ?? 'bg-subtle';
}

const TONE: Record<string, string> = { ready: 'text-ok', failed: 'text-bad' };

export function statusTone(status: string): string {
  return TONE[status] ?? 'text-subtle';
}
