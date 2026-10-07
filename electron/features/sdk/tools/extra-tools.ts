/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import fs from 'node:fs/promises';
import path from 'node:path';
import { runTool } from '../jdk/transfer';
import { compare, fetchJson, latestPerMinor, pick } from './fetch';
import { GithubRelease, RUST_ARCH, RUST_TRIPLE_OS, exe, githubReleases } from './platforms';
import { Release, ToolSpec } from './types';

const DOTNET_RID: Record<string, string> = { linux: 'linux', darwin: 'osx', win32: 'win' };
const DART_OS: Record<string, string> = { linux: 'linux', darwin: 'macos', win32: 'windows' };
const FLUTTER_OS: Record<string, string> = { linux: 'linux', darwin: 'macos', win32: 'windows' };
const RUST_DIST: Record<string, string> = { linux: 'unknown-linux-gnu', darwin: 'apple-darwin' };
const JULIA_OS: Record<string, string> = { linux: 'linux', darwin: 'mac', win32: 'winnt' };
const CMAKE_TARGET = (system: NodeJS.Platform, arch: string) => {
  if (system === 'linux') {
    return `linux-${arch === 'arm64' ? 'aarch64' : 'x86_64'}`;
  }
  if (system === 'darwin') {
    return 'macos-universal';
  }
  return `windows-${arch === 'arm64' ? 'arm64' : 'x86_64'}`;
};

export const MORE_TOOLS: ToolSpec[] = [
  {
    id: 'python',
    bin: (platform) => (platform === 'win32' ? 'python.exe' : 'bin/python3'),
    versionArgs: ['--version'],
    async releases({ os: system, arch }, signal) {
      const release = await fetchJson<GithubRelease>('https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest', signal);
      const triple = `${pick(RUST_ARCH, arch)}-${pick(RUST_TRIPLE_OS, system)}`;
      const sums = release.assets.find((asset) => asset.name === 'SHA256SUMS');
      const found: Release[] = [];
      for (const asset of release.assets) {
        const version = new RegExp(`^cpython-(\\d+\\.\\d+\\.\\d+)\\+\\d+-${triple}-install_only\\.tar\\.gz$`).exec(asset.name)?.[1];
        if (!version) {
          continue;
        }
        found.push({
          version,
          filename: asset.name,
          url: asset.browser_download_url,
          size: asset.size,
          checksum: sums ? { type: 'sha256', url: sums.browser_download_url, file: asset.name } : undefined,
        });
      }
      return latestPerMinor(found, 3).filter((entry) => compare(entry.version, '3.9.0') >= 0);
    },
  },
  {
    id: 'dotnet',
    bin: (platform) => exe('dotnet', platform),
    versionArgs: ['--version'],
    async releases({ os: system, arch }, signal) {
      const rid = `${pick(DOTNET_RID, system)}-${arch}`;
      const index = await fetchJson<{ 'releases-index': { 'channel-version': string; 'releases.json': string; 'support-phase': string; 'latest-sdk': string; }[]; }>(
        'https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json', signal);
      const channels = index['releases-index']
        .filter((channel) => ['active', 'maintenance'].includes(channel['support-phase']) && compare(channel['channel-version'], '6.0') >= 0)
        .slice(0, 5);
      const found = await Promise.all(channels.map(async (channel): Promise<Release | null> => {
        const data = await fetchJson<{ releases: { sdk?: { version: string; files: { name: string; rid?: string; url: string; hash?: string; }[]; }; }[]; }>(channel['releases.json'], signal).catch(() => null);
        const sdk = data?.releases.map((entry) => entry.sdk).find((entry) => entry?.version === channel['latest-sdk']);
        const file = sdk?.files.find((candidate) => candidate.rid === rid && /\.(tar\.gz|zip)$/.test(candidate.name) && candidate.name.startsWith('dotnet-sdk'));
        if (!sdk || !file) {
          return null;
        }
        return { version: sdk.version, filename: file.name, url: file.url, checksum: file.hash ? { type: 'sha512', value: file.hash.toLowerCase() } : undefined };
      }));
      // Finished releases only — a channel in preview reports an `-rc` or `-preview` build.
      return found.filter((entry): entry is Release => entry !== null && /^\d+\.\d+\.\d+$/.test(entry.version));
    },
  },
  {
    id: 'rust',
    bin: (platform) => exe('bin/rustc', platform),
    versionArgs: ['--version'],
    archiveMarker: 'install.sh',
    async releases({ os: system, arch }) {
      const dist = pick(RUST_DIST, system);
      if (!dist) {
        // Windows gets its Rust from the installer (rustup); there is no plain archive to unpack.
        return [];
      }
      const list = await fetchJson<{ tag_name: string; prerelease: boolean; }[]>('https://api.github.com/repos/rust-lang/rust/releases?per_page=40');
      const versions = list.filter((entry) => !entry.prerelease && /^\d+\.\d+\.\d+$/.test(entry.tag_name)).map((entry) => ({ version: entry.tag_name }));
      return latestPerMinor(versions).map((entry) => {
        const filename = `rust-${entry.version}-${pick(RUST_ARCH, arch)}-${dist}.tar.gz`;
        const url = `https://static.rust-lang.org/dist/${filename}`;
        return { version: entry.version, filename, url, checksum: { type: 'sha256' as const, url: `${url}.sha256`, file: filename } };
      });
    },
    async place(job, home, target) {
      await fs.mkdir(target, { recursive: true });
      await runTool(job, 'sh', [path.join(home, 'install.sh'), `--prefix=${target}`, '--without=rust-docs', '--disable-ldconfig']);
    },
  },
  {
    id: 'dart',
    bin: (platform) => exe('bin/dart', platform),
    versionArgs: ['--version'],
    async releases({ os: system, arch }, signal) {
      const listing = await fetchJson<{ prefixes?: string[]; }>('https://storage.googleapis.com/storage/v1/b/dart-archive/o?prefix=channels/stable/release/&delimiter=/&fields=prefixes&maxResults=1000', signal);
      const versions = (listing.prefixes ?? [])
        .map((prefix) => /release\/(\d+\.\d+\.\d+)\/$/.exec(prefix)?.[1])
        .filter((version): version is string => Boolean(version))
        .map((version) => ({ version }));
      return latestPerMinor(versions, 2).filter((entry) => compare(entry.version, '2.19.0') >= 0).map((entry) => {
        const filename = `dartsdk-${pick(DART_OS, system)}-${arch}-release.zip`;
        const url = `https://storage.googleapis.com/dart-archive/channels/stable/release/${entry.version}/sdk/${filename}`;
        return { version: entry.version, filename, url, checksum: { type: 'sha256' as const, url: `${url}.sha256sum` } };
      });
    },
  },
  {
    id: 'flutter',
    bin: (platform) => exe('bin/flutter', platform, '.bat'),
    versionArgs: ['--version'],
    async releases({ os: system, arch }, signal) {
      if (system === 'linux' && arch !== 'x64') {
        return [];
      }
      const data = await fetchJson<{ base_url: string; releases: { channel: string; version: string; archive: string; sha256: string; dart_sdk_arch?: string; }[]; }>(
        `https://storage.googleapis.com/flutter_infra_release/releases/releases_${pick(FLUTTER_OS, system)}.json`, signal);
      const wanted = arch === 'arm64' ? 'arm64' : 'x64';
      const found: Release[] = [];
      for (const entry of data.releases) {
        if (entry.channel !== 'stable' || !/^\d+\.\d+\.\d+$/.test(entry.version)) {
          continue;
        }
        if (system === 'darwin' && (entry.dart_sdk_arch ?? 'x64') !== wanted) {
          continue;
        }
        found.push({ version: entry.version, filename: entry.archive.split('/').pop() ?? entry.archive, url: `${data.base_url}/${entry.archive}`, checksum: { type: 'sha256', value: entry.sha256 } });
      }
      return latestPerMinor(found, 2);
    },
  },
  {
    id: 'sbt',
    bin: (platform) => exe('bin/sbt', platform, '.bat'),
    versionArgs: ['-version'],
    releases: (_platform, signal) => githubReleases('sbt/sbt', signal, (version) => `sbt-${version}.zip`, (tag) => tag.replace(/^v/, '')),
  },
  {
    id: 'cmake',
    bin: (platform) => (platform === 'darwin' ? 'CMake.app/Contents/bin/cmake' : exe('bin/cmake', platform)),
    versionArgs: ['--version'],
    releases: ({ os: system, arch }, signal) => githubReleases(
      'Kitware/CMake', signal,
      (version) => `cmake-${version}-${CMAKE_TARGET(system, arch)}.${system === 'win32' ? 'zip' : 'tar.gz'}`,
      (tag) => tag.replace(/^v/, ''),
      (version) => `cmake-${version}-SHA-256.txt`,
    ),
  },
  {
    id: 'ninja',
    bin: (platform) => exe('ninja', platform),
    versionArgs: ['--version'],
    releases: ({ os: system, arch }, signal) => githubReleases(
      'ninja-build/ninja', signal,
      () => {
        if (system === 'darwin') {
          return 'ninja-mac.zip';
        }
        if (system === 'win32') {
          return arch === 'arm64' ? 'ninja-winarm64.zip' : 'ninja-win.zip';
        }
        return arch === 'arm64' ? 'ninja-linux-aarch64.zip' : 'ninja-linux.zip';
      },
      (tag) => tag.replace(/^v/, ''),
    ),
  },
  {
    id: 'julia',
    bin: (platform) => exe('bin/julia', platform),
    versionArgs: ['--version'],
    async releases({ os: system, arch }, signal) {
      const data = await fetchJson<Record<string, { stable?: boolean; files: { os: string; arch: string; kind: string; extension: string; url: string; sha256: string; size: number; }[]; }>>('https://julialang-s3.julialang.org/bin/versions.json', signal);
      const found: Release[] = [];
      for (const [version, entry] of Object.entries(data)) {
        if (!entry.stable || !/^\d+\.\d+\.\d+$/.test(version)) {
          continue;
        }
        const file = entry.files.find((candidate) => candidate.kind === 'archive' && candidate.os === pick(JULIA_OS, system) && candidate.arch === (arch === 'arm64' ? 'aarch64' : 'x86_64') && ['tar.gz', 'zip'].includes(candidate.extension));
        if (file) {
          found.push({ version, filename: file.url.split('/').pop() ?? `julia-${version}`, url: file.url, size: file.size, checksum: { type: 'sha256', value: file.sha256 } });
        }
      }
      return latestPerMinor(found, 1).filter((entry) => compare(entry.version, '1.6.0') >= 0);
    },
  },
];
