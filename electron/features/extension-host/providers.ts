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
 * Formatters and checkers that extension code registers.
 *
 * Lumen itself knows nothing about any style: it asks the registered
 * providers, highest priority first, and takes the first one that claims the
 * file. What comes back is checked and clamped here — a provider is foreign
 * code, so a runaway one cannot flood the interface or hang a save.
 */

import type {
  CheckDiagnostic, CheckRequest, CheckSeverity, DiagnosticProvider, FileRef, FormatRequest, FormatResult, FormatterProvider,
} from './contract';

const PROVIDER_ID = /^[a-z][a-z0-9.-]{0,63}$/;
const MAX_TEXT_CHARS = 16 * 1024 * 1024;
const MAX_DIAGNOSTICS = 2000;
const MAX_NOTES = 8;
const FORMAT_TIMEOUT_MS = 30_000;
const CHECK_TIMEOUT_MS = 15_000;
const SEVERITIES = new Set<CheckSeverity>(['error', 'warning', 'info', 'hint']);

interface Entry<P> {
  extensionId: string;
  id: string;
  provider: P;
  priority: number;
}

const formatters: Entry<FormatterProvider>[] = [];
const checkers: Entry<DiagnosticProvider>[] = [];

export type FormatOutcome =
  | { status: 'formatted'; result: FormatResult; by: string; }
  | { status: 'unchanged'; by: string; notes: string[]; }
  | { status: 'none'; };

function checkId(id: string, what: string) {
  if (typeof id !== 'string' || !PROVIDER_ID.test(id)) {
    throw new Error(`Invalid ${what} id: ${id}`);
  }
}

function insert<P>(list: Entry<P>[], entry: Entry<P>) {
  const known = list.findIndex((item) => item.extensionId === entry.extensionId && item.id === entry.id);
  if (known >= 0) {
    list.splice(known, 1);
  }
  list.push(entry);
  list.sort((a, b) => b.priority - a.priority);
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000} s`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

function fileRef(value: unknown): FileRef {
  const file = (value ?? {}) as Partial<FileRef>;
  return {
    path: typeof file.path === 'string' ? file.path : null,
    languageId: typeof file.languageId === 'string' ? file.languageId : null,
  };
}

async function claims(entry: Entry<{ supports(file: FileRef): boolean | Promise<boolean>; }>, file: FileRef): Promise<boolean> {
  try {
    return (await entry.provider.supports(file)) === true;
  } catch (err) {
    console.error(`[lumen] ${entry.extensionId}/${entry.id}: supports() failed:`, (err as Error).message);
    return false;
  }
}

function cleanNotes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((note): note is string => typeof note === 'string').slice(0, MAX_NOTES).map((note) => note.slice(0, 400));
}

function cleanResult(raw: FormatResult | null | undefined): FormatResult | null {
  if (!raw || typeof raw.text !== 'string' || raw.text.length > MAX_TEXT_CHARS) {
    return null;
  }
  return {
    text: raw.text,
    engine: typeof raw.engine === 'string' ? raw.engine.slice(0, 80) : undefined,
    notes: cleanNotes(raw.notes),
  };
}

const position = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

function cleanDiagnostic(raw: CheckDiagnostic, source: string): CheckDiagnostic | null {
  if (!raw || typeof raw.message !== 'string' || !SEVERITIES.has(raw.severity)) {
    return null;
  }
  const out: CheckDiagnostic = {
    line: position(raw.line),
    column: position(raw.column),
    severity: raw.severity,
    message: raw.message.slice(0, 600),
    source: typeof raw.source === 'string' ? raw.source.slice(0, 40) : source,
  };
  if (typeof raw.endLine === 'number') {
    out.endLine = position(raw.endLine);
  }
  if (typeof raw.endColumn === 'number') {
    out.endColumn = position(raw.endColumn);
  }
  if (typeof raw.code === 'string') {
    out.code = raw.code.slice(0, 40);
  }
  if (typeof raw.suggestion === 'string') {
    out.suggestion = raw.suggestion.slice(0, 400);
  }
  return out;
}

export const providers = {
  registerFormatter(extensionId: string, id: string, provider: FormatterProvider, priority = 0) {
    checkId(id, 'formatter');
    if (typeof provider?.format !== 'function' || typeof provider?.supports !== 'function') {
      throw new Error('A formatter needs supports() and format()');
    }
    insert(formatters, { extensionId, id, provider, priority: Number.isFinite(priority) ? priority : 0 });
  },

  registerChecker(extensionId: string, id: string, provider: DiagnosticProvider) {
    checkId(id, 'checker');
    if (typeof provider?.check !== 'function' || typeof provider?.supports !== 'function') {
      throw new Error('A checker needs supports() and check()');
    }
    insert(checkers, { extensionId, id, provider, priority: 0 });
  },

  removeExtension(extensionId: string) {
    for (const list of [formatters, checkers]) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].extensionId === extensionId) {
          list.splice(i, 1);
        }
      }
    }
  },

  /** Which formatter would take this file — `null` when none claims it. */
  async formatterFor(file: FileRef): Promise<string | null> {
    const ref = fileRef(file);
    for (const entry of formatters) {
      if (await claims(entry, ref)) {
        return `${entry.extensionId}/${entry.id}`;
      }
    }
    return null;
  },

  async format(request: FormatRequest): Promise<FormatOutcome> {
    if (typeof request?.text !== 'string' || request.text.length > MAX_TEXT_CHARS) {
      throw new Error('The document is missing or too large to format');
    }
    const ref = fileRef(request);
    for (const entry of formatters) {
      if (!(await claims(entry, ref))) {
        continue;
      }
      const by = `${entry.extensionId}/${entry.id}`;
      const raw = await withTimeout(entry.provider.format({ ...request, ...ref }), FORMAT_TIMEOUT_MS, `${by} formatting`);
      const result = cleanResult(raw);
      if (!result) {
        return { status: 'unchanged', by, notes: cleanNotes((raw as Partial<FormatResult> | null)?.notes) };
      }
      return { status: 'formatted', result, by };
    }
    return { status: 'none' };
  },

  async check(request: CheckRequest): Promise<CheckDiagnostic[]> {
    if (typeof request?.text !== 'string' || request.text.length > MAX_TEXT_CHARS) {
      return [];
    }
    const ref = fileRef(request);
    const out: CheckDiagnostic[] = [];
    for (const entry of checkers) {
      if (!(await claims(entry, ref))) {
        continue;
      }
      try {
        const found = await withTimeout(entry.provider.check({ ...request, ...ref }), CHECK_TIMEOUT_MS, `${entry.id} check`);
        for (const raw of Array.isArray(found) ? found : []) {
          const clean = cleanDiagnostic(raw, entry.id);
          if (clean && out.length < MAX_DIAGNOSTICS) {
            out.push(clean);
          }
        }
      } catch (err) {
        console.error(`[lumen] ${entry.extensionId}/${entry.id}: check failed:`, (err as Error).message);
      }
    }
    return out;
  },
};
