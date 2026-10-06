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
 * Asking formatters to format.
 *
 * Lumen formats nothing on its own. Formatters come from add-ons — extension
 * code in the main process (`ctx.formatters`) and add-ons of the window
 * (`Addon.formatters`) — and this module is the one place that knows how to
 * ask them:
 *
 *   1. `replace` formatters: the first that claims the file formats it. Those
 *      of extensions come first, then the window's own by priority.
 *   2. when none claims the file, or the one that did failed, the caller falls
 *      back on the language server.
 *   3. `after` formatters polish the result, whoever produced it.
 */

import { registry } from '@/core/registry';
import type { FormatRequest } from '../../../electron/features/extension-host/contract';

export type FormatRun =
  /** A formatter produced new text — possibly the very same text. */
  | { status: 'formatted'; text: string; engine?: string; notes: string[]; }
  /** A formatter claimed the file and decided to leave it alone. */
  | { status: 'unchanged'; notes: string[]; }
  /** Nobody claims the file. */
  | { status: 'none'; }
  /** A formatter claimed the file and broke. */
  | { status: 'failed'; message: string; };

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function runWindowFormatters(request: FormatRequest): Promise<FormatRun> {
  const file = { path: request.path, languageId: request.languageId };
  for (const formatter of registry.formatters()) {
    if (formatter.phase === 'after' || !formatter.supports(file)) {
      continue;
    }
    try {
      const result = await formatter.format(request);
      if (!result) {
        return { status: 'unchanged', notes: [] };
      }
      return { status: 'formatted', text: result.text, engine: result.engine, notes: result.notes ?? [] };
    } catch (err) {
      return { status: 'failed', message: `${formatter.id}: ${errorMessage(err)}` };
    }
  }
  return { status: 'none' };
}

/** Format with the formatter that claims the file — extensions first, then add-ons of the window. */
export async function runFormatters(request: FormatRequest): Promise<FormatRun> {
  try {
    const outcome = await window.lumen.extensionHost.format(request);
    if (outcome.status === 'formatted') {
      return { status: 'formatted', text: outcome.result.text, engine: outcome.result.engine, notes: outcome.result.notes ?? [] };
    }
    if (outcome.status === 'unchanged') {
      return { status: 'unchanged', notes: outcome.notes };
    }
  } catch (err) {
    return { status: 'failed', message: errorMessage(err) };
  }
  return runWindowFormatters(request);
}

/** Run the `after` formatters over `text`; the same text comes back when none had anything to do. */
export async function runAfterFormatters(request: FormatRequest): Promise<string> {
  const file = { path: request.path, languageId: request.languageId };
  let text = request.text;
  for (const formatter of registry.formatters()) {
    if (formatter.phase !== 'after' || !formatter.supports(file)) {
      continue;
    }
    try {
      const result = await formatter.format({ ...request, text });
      text = result?.text ?? text;
    } catch (err) {
      console.error(`[lumen] formatter ${formatter.id} failed:`, errorMessage(err));
    }
  }
  return text;
}
