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
 * Checker add-ons: what they find in a document shows up as diagnostics.
 *
 * Checkers are registered by extension code (`ctx.diagnostics`) and by
 * add-ons of the window (`Addon.checkers`). This module asks them about the
 * file in the active tab — after the text settled for a moment, when the tab
 * changes, and when the add-ons change — and hands what they report to the
 * language-server manager, which already knows how to put diagnostics into the
 * editor, the problems panel and the status bar.
 */

import { lsp } from '@/core/lsp/manager';
import type { Diagnostic } from '@/core/lsp/protocol';
import { registry } from '@/core/registry';
import { useStore } from '@/state/store';
import type { Tab } from '@/state/types';
import type { CheckDiagnostic, CheckRequest } from '../../../electron/features/extension-host/contract';

const SETTLE_MS = 700;
/** Bigger files are not sent over every time the text settles. */
const MAX_CHECKED_CHARS = 512 * 1024;
const HOST_SOURCE = 'extensions';
const SEVERITY = { error: 1, warning: 2, info: 3, hint: 4 } as const;

let timer: ReturnType<typeof setTimeout> | undefined;
/** The paths that carry diagnostics of checkers — to withdraw them when a tab goes or a checker is switched off. */
const reported = new Map<string, Set<string>>();
let generation = 0;

function toLsp(diagnostics: CheckDiagnostic[], lines: string[]): Diagnostic[] {
  return diagnostics.map((entry) => {
    const endLine = entry.endLine ?? entry.line;
    const endColumn = entry.endColumn ?? lines[endLine]?.length ?? entry.column + 1;
    const message = entry.suggestion ? `${entry.message}\n→ ${entry.suggestion}` : entry.message;
    return {
      range: { start: { line: entry.line, character: entry.column }, end: { line: endLine, character: endColumn } },
      severity: SEVERITY[entry.severity],
      message,
      code: entry.code,
      source: entry.source,
    };
  });
}

function remember(path: string, source: string) {
  const sources = reported.get(path) ?? new Set<string>();
  sources.add(source);
  reported.set(path, sources);
}

function report(path: string, source: string, diagnostics: Diagnostic[]) {
  lsp.setExternalDiagnostics(path, source, diagnostics);
  if (diagnostics.length) {
    remember(path, source);
  }
}

async function askHost(request: CheckRequest): Promise<CheckDiagnostic[]> {
  try {
    return await window.lumen.extensionHost.check(request);
  } catch {
    return [];
  }
}

async function askWindow(checker: ReturnType<typeof registry.checkers>[number], request: CheckRequest): Promise<CheckDiagnostic[]> {
  if (!checker.supports({ path: request.path, languageId: request.languageId })) {
    return [];
  }
  try {
    return await checker.check(request);
  } catch (err) {
    console.error(`[lumen] checker ${checker.id} failed:`, err);
    return [];
  }
}

async function checkTab(tab: Tab) {
  const path = tab.path;
  if (!path || tab.virtual || tab.viewer || tab.content.length > MAX_CHECKED_CHARS) {
    return;
  }
  const run = ++generation;
  const state = useStore.getState();
  const request: CheckRequest = { path, languageId: state.languageFor(tab)?.id ?? null, text: tab.content, workspace: state.workspace };
  const lines = tab.content.split('\n');

  const checkers = registry.checkers();
  const [hostFound, ...windowFound] = await Promise.all([askHost(request), ...checkers.map((checker) => askWindow(checker, request))]);
  // A newer run, or a different tab, has overtaken this one.
  if (run !== generation || useStore.getState().activeTab()?.path !== path) {
    return;
  }
  report(path, HOST_SOURCE, toLsp(hostFound, lines));
  checkers.forEach((checker, index) => report(path, `window:${checker.id}`, toLsp(windowFound[index], lines)));
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tab = useStore.getState().activeTab();
    if (tab) {
      void checkTab(tab);
    }
  }, SETTLE_MS);
}

/** Withdraw the diagnostics of files that are no longer open. */
function forgetClosed() {
  const open = new Set(useStore.getState().tabs.map((tab) => tab.path));
  for (const path of [...reported.keys()]) {
    if (open.has(path)) {
      continue;
    }
    reported.delete(path);
    lsp.clearExternalDiagnostics(path);
  }
}

let started = false;

export function initChecks() {
  if (started) {
    return;
  }
  started = true;
  let known = { id: '', content: '', registry: -1 };
  useStore.subscribe((state) => {
    const tab = state.activeTab();
    const next = { id: tab?.id ?? '', content: tab?.content ?? '', registry: state.registryVersion };
    const same = next.id === known.id && next.content === known.content && next.registry === known.registry;
    known = next;
    if (same) {
      return;
    }
    forgetClosed();
    schedule();
  });
  schedule();
}
