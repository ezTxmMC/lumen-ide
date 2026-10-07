/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { MAX_RELEASES, fetchJson } from './fetch';
import { Release } from './types';

export const exe = (name: string, platform: NodeJS.Platform, windows = '.exe') => (platform === 'win32' ? `${name}${windows}` : name);

export interface GithubRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  assets: { name: string; browser_download_url: string; size: number; digest?: string; }[];
}

/** Releases of a GitHub project: the first `MAX_RELEASES` finished ones that carry the wanted file. */
export async function githubReleases(
  repo: string, signal: AbortSignal, asset: (version: string) => string, version: (tag: string) => string,
  /** The name of a release file that lists checksums, when the assets carry no digest. */
  sums?: (version: string) => string,
): Promise<Release[]> {
  const list = await fetchJson<GithubRelease[]>(`https://api.github.com/repos/${repo}/releases?per_page=40`, signal);
  const out: Release[] = [];
  for (const entry of list) {
    if (entry.prerelease || entry.draft) {
      continue;
    }
    const v = version(entry.tag_name);
    if (!/^\d+\.\d+(\.\d+)?$/.test(v)) {
      continue;
    }
    const file = entry.assets.find((candidate) => candidate.name === asset(v));
    if (!file) {
      continue;
    }
    const digest = /^sha256:([0-9a-f]{64})$/i.exec(file.digest ?? '')?.[1];
    const sumsFile = sums ? entry.assets.find((candidate) => candidate.name === sums(v)) : undefined;
    out.push({
      version: v,
      url: file.browser_download_url,
      filename: file.name,
      size: file.size,
      ...(digest ? { checksum: { type: 'sha256' as const, value: digest.toLowerCase() } } : {}),
      ...(!digest && sumsFile ? { checksum: { type: 'sha256' as const, url: sumsFile.browser_download_url, file: file.name } } : {}),
    });
  }
  return out.slice(0, MAX_RELEASES);
}

export const NODE_OS: Record<string, string> = { linux: 'linux', darwin: 'darwin', win32: 'win' };
export const GO_OS: Record<string, string> = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
export const GO_ARCH: Record<string, string> = { x64: 'amd64', arm64: 'arm64' };
export const ZIG_OS: Record<string, string> = { linux: 'linux', darwin: 'macos', win32: 'windows' };
export const ZIG_ARCH: Record<string, string> = { x64: 'x86_64', arm64: 'aarch64' };
export const RUST_TRIPLE_OS: Record<string, string> = { linux: 'unknown-linux-gnu', darwin: 'apple-darwin', win32: 'pc-windows-msvc' };
export const RUST_ARCH: Record<string, string> = { x64: 'x86_64', arm64: 'aarch64' };
export const BUN_OS: Record<string, string> = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
export const BUN_ARCH: Record<string, string> = { x64: 'x64', arm64: 'aarch64' };
