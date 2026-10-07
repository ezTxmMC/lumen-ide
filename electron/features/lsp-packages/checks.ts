/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { PLATFORM } from './places';
import { LspPackage } from './types';

const NPM_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~<>=*|-]+)?$/i;
const PYPI_NAME = /^[A-Za-z0-9][\w.-]*(\[[\w,.-]+\])?([<>=!~]=?[\w.*+-]+(,[<>=!~]=?[\w.*+-]+)*)?$/;
const GO_MODULE = /^[\w.-]+(\/[\w.-]+)+@[\w.+-]+$/;
const DOTNET_NAME = /^[A-Za-z0-9][\w.-]*$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;
export const BIN_NAME = /^[\w.+-]+(\/[\w.+-]+)*$/;
const PYTHON = /^\d+\.\d+$/;
export const COMMAND_NAME = /^[\w.+-]+$/;

export function check(value: unknown, pattern: RegExp, what: string): string {
  const text = String(value ?? '');
  if (!pattern.test(text) || text.includes('..')) {
    throw new Error(`Invalid ${what}: ${text}`);
  }
  return text;
}

function slug(value: string) {
  return value.replace(/@[^/]*$/, '').replace(/^@/, '').replace(/[^\w.-]+/g, '-').toLowerCase();
}

/** The id — and with it the folder — of a package. */
export function packageId(spec: LspPackage): string {
  if (spec.type === 'npm') {
    return `npm-${slug(spec.packages[0])}`;
  }
  if (spec.type === 'pypi') {
    return `pypi-${slug(spec.package.replace(/[[<>=!~].*$/, ''))}`;
  }
  if (spec.type === 'go') {
    return `go-${slug(spec.module.split('/').slice(-2).join('-'))}`;
  }
  if (spec.type === 'dotnet') {
    return `dotnet-${slug(spec.package)}`;
  }
  if (spec.type === 'github') {
    // Two programs of one repository (novusc, novus-lsp) must not share — and wipe — a folder.
    const own = spec.bin && spec.bin !== spec.repo.split('/')[1] ? `-${slug(spec.bin)}` : '';
    return `github-${slug(spec.repo)}${own}`;
  }
  return `archive-${slug(spec.bin ?? 'server')}`;
}

/** The download address of an `archive` package for this platform. */
export function archiveUrl(spec: Extract<LspPackage, { type: 'archive'; }>): string {
  const url = typeof spec.url === 'string' ? spec.url : spec.url[PLATFORM];
  if (!url) {
    throw new Error(`No download for ${PLATFORM}`);
  }
  if (!/^https:\/\//.test(url)) {
    throw new Error('Only HTTPS downloads are allowed');
  }
  return url;
}

export function validate(spec: LspPackage, bin: string): LspPackage {
  check(bin, BIN_NAME, 'program name');
  if (spec.type === 'npm') {
    if (!Array.isArray(spec.packages) || !spec.packages.length) {
      throw new Error('No npm package given');
    }
    spec.packages.forEach((name) => check(name, NPM_NAME, 'npm package'));
    return spec;
  }
  if (spec.type === 'pypi') {
    check(spec.package, PYPI_NAME, 'Python package')
    ;(spec.with ?? []).forEach((name) => check(name, PYPI_NAME, 'Python package'));
    if (spec.python) {
      check(spec.python, PYTHON, 'Python version');
    }
    return spec;
  }
  if (spec.type === 'go') {
    check(spec.module, GO_MODULE, 'Go module');
    return spec;
  }
  if (spec.type === 'dotnet') {
    check(spec.package, DOTNET_NAME, '.NET tool');
    return spec;
  }
  if (spec.type === 'github') {
    check(spec.repo, REPO, 'repository');
    if (!spec.assets?.[PLATFORM]) {
      throw new Error(`No download for ${PLATFORM}`);
    }
    void new RegExp(spec.assets[PLATFORM]);
    if (spec.version) {
      check(spec.version, /^[\w.+-]+$/, 'version');
    }
    return spec;
  }
  if (spec.type === 'archive') {
    archiveUrl(spec);
    return spec;
  }
  throw new Error(`Unknown package type: ${(spec as { type: string; }).type}`);
}

/** A release asset of a `github` package. */
export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  digest?: string | null;
}

const COMPANION = /\.(sha\d+|sig|asc|txt)$/i;

export function selectAsset<T extends { name: string; }>(assets: T[], pattern: RegExp): T | null {
  return assets.find((candidate) => pattern.test(candidate.name) && !COMPANION.test(candidate.name)) ?? null;
}
