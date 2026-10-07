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
 * Novus releases (https://github.com/ezTxmMC/novus/releases) as SDK packages.
 *
 * The releases are pre-releases with tags like `v0.1.0-pre.alpha.8`, and their
 * assets are bare programs, not archives: `novusc-<arch>-<os>` and, from
 * alpha.8 on, `novus-lsp-<arch>-<os>`. Everything here is pure: the list the
 * GitHub API returned goes in, the packages for one platform come out.
 */

import path from 'node:path';
import type { GithubRelease } from '../platforms';
import type { Platform, Release, ReleaseFile } from '../types';
import { compareSemver, isSafeVersion } from './version';

export const NOVUS_REPO = 'ezTxmMC/novus';
export const NOVUS_API = `https://api.github.com/repos/${NOVUS_REPO}/releases?per_page=100`;
const DOWNLOAD_PREFIX = `https://github.com/${NOVUS_REPO}/releases/download/`;
/** More than the API returns in one page of a young project; the dialog scrolls. */
const MAX_NOVUS_RELEASES = 40;

const ARCH: Record<string, string> = { x64: 'x86_64', arm64: 'aarch64' };

/**
 * The names a program has for a platform, best first: the current naming
 * (`<arch>-<os>`; gnu before musl on Linux), then the legacy one (`<os>-<arch>`).
 */
export function assetNames(program: string, { os, arch }: Platform): string[] {
  const cpu = ARCH[arch];
  if (!cpu) {
    return [];
  }
  const legacyCpu = arch === 'arm64' ? ['arm64', 'aarch64'] : ['x86_64'];
  if (os === 'linux') {
    return [`${program}-${cpu}-linux-gnu`, `${program}-${cpu}-linux-musl`, ...legacyCpu.map((name) => `${program}-linux-${name}`)];
  }
  if (os === 'darwin') {
    return [`${program}-${cpu}-macos`, ...legacyCpu.map((name) => `${program}-macos-${name}`)];
  }
  if (os === 'win32') {
    return [`${program}-${cpu}-windows-gnu.exe`, ...legacyCpu.map((name) => `${program}-windows-${name}.exe`)];
  }
  return [];
}

type Asset = GithubRelease['assets'][number];

/** The asset of a program for the platform, or undefined. */
export function pickAsset(assets: Asset[], program: string, platform: Platform): Asset | undefined {
  for (const name of assetNames(program, platform)) {
    const hit = assets.find((asset) => asset.name === name && asset.browser_download_url.startsWith(DOWNLOAD_PREFIX));
    if (hit) {
      return hit;
    }
  }
  return undefined;
}

const exeName = (program: string, os: string) => (os === 'win32' ? `${program}.exe` : program);

function fileOf(asset: Asset, program: string, os: string): ReleaseFile {
  const digest = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? '')?.[1];
  return {
    dest: `bin/${exeName(program, os)}`,
    filename: asset.name,
    url: asset.browser_download_url,
    size: asset.size,
    executable: true,
    ...(digest ? { checksum: { type: 'sha256' as const, value: digest.toLowerCase() } } : {}),
  };
}

/**
 * Every finished release (pre-releases included) that has a compiler for the
 * platform, newest first. `novus-lsp` comes along when the release has it.
 */
export function novusReleases(list: GithubRelease[], platform: Platform): Release[] {
  const found = new Map<string, Release>();
  for (const entry of list) {
    const version = entry.tag_name.replace(/^v/, '');
    if (entry.draft || !isSafeVersion(version) || found.has(version)) {
      continue;
    }
    const compiler = pickAsset(entry.assets, 'novusc', platform);
    if (!compiler) {
      continue;
    }
    const server = pickAsset(entry.assets, 'novus-lsp', platform);
    const files = [fileOf(compiler, 'novusc', platform.os), ...(server ? [fileOf(server, 'novus-lsp', platform.os)] : [])];
    found.set(version, {
      version,
      url: compiler.browser_download_url,
      filename: compiler.name,
      lts: false,
      prerelease: entry.prerelease,
      size: files.reduce((sum, file) => sum + (file.size ?? 0), 0),
      files,
    });
  }
  return [...found.values()].sort((a, b) => compareSemver(b.version, a.version)).slice(0, MAX_NOVUS_RELEASES);
}

/** A sentence for the dialog instead of `HTTP 403 for https://…`. */
export function describeGithubError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = /^HTTP (\d+)/.exec(message)?.[1];
  if (status === '403' || status === '429') {
    return 'GitHub refused the request: the hourly limit for anonymous API calls is used up. Try again later.';
  }
  if (status === '404') {
    return 'GitHub does not know the Novus releases (HTTP 404).';
  }
  if (status) {
    return `GitHub answered with HTTP ${status} while listing the Novus releases.`;
  }
  return `The Novus releases could not be loaded: ${message}`;
}

/** What goes where for one release: the files of a bare-binary install and the mode they get. */
export interface PlacedFile {
  file: ReleaseFile;
  /** The download, before it is verified. */
  download: string;
  /** The place in the finished home. */
  target: string;
  /** `chmod` mode, or null where the platform has no executable bit. */
  mode: number | null;
}

export function planFiles(files: ReleaseFile[], home: string, downloads: string, platform: NodeJS.Platform): PlacedFile[] {
  return files.map((file, index) => ({
    file,
    download: path.join(downloads, `${index}-${path.basename(file.filename)}`),
    target: path.join(home, file.dest),
    mode: file.executable && platform !== 'win32' ? 0o755 : null,
  }));
}
