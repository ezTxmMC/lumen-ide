/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { LspPackage } from '@/core/types';

/** TypeScript 7 is the native compiler without tsserver.js — the servers need the JavaScript one. */
function npmPackage(name: string): string {
  return name === 'typescript' ? 'typescript@6' : name;
}

/** Servers built on the TypeScript API; npm would otherwise fill their peer dependency with TypeScript 7. */
const NEEDS_TYPESCRIPT = /^(@vue\/language-server|@astrojs\/language-server|@angular\/language-server|typescript-language-server|@mdx-js\/language-server)$/;

function npmPackages(names: string[]): string[] {
  const packages = names.filter((name) => !name.startsWith('-')).map(npmPackage);
  if (!packages.some((name) => NEEDS_TYPESCRIPT.test(name))) {
    return packages;
  }
  if (packages.some((name) => name.startsWith('typescript@'))) {
    return packages;
  }
  return [...packages, 'typescript@6'];
}

/**
 * A package from a plain, global install command — the kinds Lumen can run in
 * its own environment instead. Anything else (a pipe, several commands,
 * `sudo`) gives `null` and stays a shell command.
 */
export function packageFromCommand(command: string): LspPackage | null {
  const text = command.trim();
  if (!text || /[|&;<>`$]/.test(text)) {
    return null;
  }
  const npm = /^npm (?:i|install|add) (?:-g|--global) ([^-].*)$/.exec(text);
  if (npm) {
    return { type: 'npm', packages: npmPackages(npm[1].split(/\s+/)) };
  }
  const python = /^(?:pipx install|pip3? install(?: --user)?|uv tool install) ([A-Za-z0-9][\w.[\],-]*)$/.exec(text);
  if (python) {
    return { type: 'pypi', package: python[1] };
  }
  const go = /^go install (\S+@\S+)$/.exec(text);
  if (go) {
    return { type: 'go', module: go[1] };
  }
  const dotnet = /^dotnet tool install (?:-g|--global) ([\w.-]+)$/.exec(text);
  if (dotnet) {
    return { type: 'dotnet', package: dotnet[1] };
  }
  return null;
}

/** Where a package comes from: `npm typescript-language-server`, `GitHub clangd/clangd` … */
export function packageSource(spec: LspPackage): string {
  if (spec.type === 'npm') {
    return `npm ${spec.packages.join(' ')}`;
  }
  if (spec.type === 'pypi') {
    return `PyPI ${spec.package}${spec.python ? ` (Python ${spec.python})` : ''}`;
  }
  if (spec.type === 'go') {
    return `go ${spec.module}`;
  }
  if (spec.type === 'dotnet') {
    return `dotnet ${spec.package}`;
  }
  if (spec.type === 'github') {
    return `GitHub ${spec.repo}`;
  }
  return typeof spec.url === 'string' ? spec.url : 'download';
}
