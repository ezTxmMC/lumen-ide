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
 * Novus as a chosen SDK: where its programs are when one is the default, and
 * how that reaches the language server and the tool check.
 *
 * Two installers can put Novus on the machine — the SDK dialog (a release
 * folder under `~/.lumen/sdks/novus/<version>`, `bin/novusc` + `bin/novus-lsp`)
 * and the add-on installer (a pinned release in `~/.lumen/lsp/bin`). Precedence:
 *   1. the Novus chosen as default in the SDK dialog (its `bin` is first on the
 *      PATH of tasks, terminals and servers, and first among the candidates);
 *   2. the add-on's copy in `~/.lumen/lsp/bin`;
 *   3. a build from source or the PATH.
 * An SDK install therefore also satisfies the `novusc` tool check — only a
 * Novus nobody chose leaves the add-on's install prompt in place.
 */

import type { LspConfig } from '@/core/types';
import { activeSdk, baseEnvironment, sdkEnvironment, type ActiveSdk } from './env';

const NOVUS_PROGRAMS = new Set(['novusc', 'novus-lsp']);

/** `<home>/bin/<program>` of the chosen Novus, or null without a choice or for a program Novus does not bring. */
export function novusProgramPath(program: string, active: Pick<ActiveSdk, 'home' | 'bin'> | null, platform: string): string | null {
  if (!active || !NOVUS_PROGRAMS.has(program)) {
    return null;
  }
  const windows = platform === 'win32';
  const dir = (active.bin ?? `${active.home.replace(/[\\/]+$/, '')}${windows ? '\\' : '/'}bin`).replace(/[\\/]+$/, '');
  return `${dir}${windows ? '\\' : '/'}${windows ? `${program}.exe` : program}`;
}

/** Where to look first for the program of a server or tool: the chosen Novus. */
export function novusCandidates(command: string): string[] {
  const path = novusProgramPath(command, activeSdk('novus'), baseEnvironment()?.platform ?? 'linux');
  return path ? [path] : [];
}

/** `lsp.addCandidateProvider`: `novus-lsp` of the chosen SDK is found before the add-on's copy. */
export const novusServerCandidates = (config: LspConfig) => novusCandidates(config.command);

/**
 * `lsp.addConfigDecorator`: the Novus server starts with the chosen SDK ahead
 * on its PATH, so the `novusc` it calls is the SDK's too.
 */
export function createNovusServerDecorator() {
  return (given: LspConfig, languageId: string): LspConfig => {
    if (!['novus', 'novus-html'].includes(languageId) || !activeSdk('novus')) {
      return given;
    }
    return { ...given, env: { ...sdkEnvironment(), ...(given.env ?? {}) } };
  };
}
