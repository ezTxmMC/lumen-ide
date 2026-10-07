/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { MAX_RELEASES, compare, fetchJson, fetchText, latestPerMinor, pick } from './fetch';
import { BUN_ARCH, BUN_OS, GO_ARCH, GO_OS, NODE_OS, RUST_ARCH, RUST_TRIPLE_OS, ZIG_ARCH, ZIG_OS, exe, githubReleases } from './platforms';
import { Release, ToolSpec } from './types';

export const TOOLS: ToolSpec[] = [
  {
    id: 'node',
    bin: (platform) => (platform === 'win32' ? 'node.exe' : 'bin/node'),
    versionArgs: ['--version'],
    async releases({ os: system, arch }, signal) {
      const list = await fetchJson<{ version: string; lts: string | false; }[]>('https://nodejs.org/dist/index.json', signal);
      const mapped = list.map((entry) => ({ version: entry.version.replace(/^v/, ''), lts: entry.lts !== false }));
      // The newest release of each major from 18 on.
      const perMajor = new Map<number, (typeof mapped)[number]>();
      for (const entry of mapped) {
        const major = Number(entry.version.split('.')[0]);
        const known = perMajor.get(major);
        if (major >= 18 && (!known || compare(entry.version, known.version) > 0)) {
          perMajor.set(major, entry);
        }
      }
      return [...perMajor.values()].sort((a, b) => compare(b.version, a.version)).slice(0, MAX_RELEASES).map((entry) => {
        const filename = `node-v${entry.version}-${pick(NODE_OS, system)}-${arch}.${system === 'win32' ? 'zip' : 'tar.gz'}`;
        return {
          version: entry.version,
          lts: entry.lts,
          filename,
          url: `https://nodejs.org/dist/v${entry.version}/${filename}`,
          checksum: { type: 'sha256' as const, url: `https://nodejs.org/dist/v${entry.version}/SHASUMS256.txt`, file: filename },
        };
      });
    },
  },
  {
    id: 'go',
    bin: (platform) => exe('bin/go', platform),
    versionArgs: ['version'],
    async releases({ os: system, arch }, signal) {
      const list = await fetchJson<{ version: string; stable: boolean; files: { filename: string; os: string; arch: string; sha256: string; size: number; kind: string; }[]; }[]>(
        'https://go.dev/dl/?mode=json&include=all', signal);
      const found: Release[] = [];
      for (const entry of list) {
        const file = entry.stable ? entry.files.find((candidate) => candidate.kind === 'archive' && candidate.os === pick(GO_OS, system) && candidate.arch === pick(GO_ARCH, arch)) : undefined;
        if (!file) {
          continue;
        }
        found.push({
          version: entry.version.replace(/^go/, ''),
          filename: file.filename,
          url: `https://go.dev/dl/${file.filename}`,
          size: file.size,
          checksum: { type: 'sha256', value: file.sha256 },
        });
      }
      return latestPerMinor(found);
    },
  },
  {
    id: 'gradle',
    bin: (platform) => exe('bin/gradle', platform, '.bat'),
    versionArgs: ['--version'],
    async releases(_platform, signal) {
      const list = await fetchJson<{ version: string; downloadUrl: string; checksumUrl: string; snapshot: boolean; nightly: boolean; releaseNightly: boolean; broken: boolean; rcFor: string; milestoneFor: string; }[]>(
        'https://services.gradle.org/versions/all', signal);
      const finished = list
        .filter((entry) => !entry.snapshot && !entry.nightly && !entry.releaseNightly && !entry.broken && !entry.rcFor && !entry.milestoneFor)
        .map((entry) => ({
          version: entry.version,
          filename: entry.downloadUrl.split('/').pop() ?? `gradle-${entry.version}-bin.zip`,
          url: entry.downloadUrl,
          checksum: { type: 'sha256' as const, url: entry.checksumUrl },
        }));
      return latestPerMinor(finished, 7);
    },
  },
  {
    id: 'maven',
    bin: (platform) => exe('bin/mvn', platform, '.cmd'),
    versionArgs: ['--version'],
    async releases({ os: system }, signal) {
      const xml = await fetchText('https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/maven-metadata.xml', signal);
      const versions = [...xml.matchAll(/<version>(3\.\d+\.\d+)<\/version>/g)].map((m) => ({ version: m[1] }));
      return latestPerMinor(versions, 3).filter((entry) => compare(entry.version, '3.6.0') >= 0).map((entry) => {
        const filename = `apache-maven-${entry.version}-bin.${system === 'win32' ? 'zip' : 'tar.gz'}`;
        const url = `https://archive.apache.org/dist/maven/maven-3/${entry.version}/binaries/${filename}`;
        return { version: entry.version, filename, url, checksum: { type: 'sha512' as const, url: `${url}.sha512` } };
      });
    },
  },
  {
    id: 'deno',
    bin: (platform) => exe('deno', platform),
    versionArgs: ['--version'],
    releases: ({ os: system, arch }, signal) => githubReleases(
      'denoland/deno', signal,
      () => `deno-${pick(RUST_ARCH, arch)}-${pick(RUST_TRIPLE_OS, system)}.zip`,
      (tag) => tag.replace(/^v/, ''),
    ),
  },
  {
    id: 'bun',
    bin: (platform) => `${exe('bun', platform)}`,
    versionArgs: ['--version'],
    releases: ({ os: system, arch }, signal) => githubReleases(
      'oven-sh/bun', signal,
      () => `bun-${pick(BUN_OS, system)}-${pick(BUN_ARCH, arch)}.zip`,
      (tag) => tag.replace(/^bun-v/, ''),
    ),
  },
  {
    id: 'kotlin',
    bin: (platform) => exe('bin/kotlinc', platform, '.bat'),
    versionArgs: ['-version'],
    releases: (_platform, signal) => githubReleases(
      'JetBrains/kotlin', signal,
      (version) => `kotlin-compiler-${version}.zip`,
      (tag) => tag.replace(/^v/, ''),
    ),
  },
  {
    id: 'zig',
    bin: (platform) => exe('zig', platform),
    versionArgs: ['version'],
    async releases({ os: system, arch }, signal) {
      const index = await fetchJson<Record<string, Record<string, { tarball?: string; shasum?: string; size?: string; }>>>('https://ziglang.org/download/index.json', signal);
      const key = `${pick(ZIG_ARCH, arch)}-${pick(ZIG_OS, system)}`;
      const found: Release[] = [];
      for (const [version, files] of Object.entries(index)) {
        const file = /^\d+\.\d+\.\d+$/.test(version) ? files[key] : undefined;
        if (!file?.tarball) {
          continue;
        }
        found.push({
          version,
          filename: file.tarball.split('/').pop() ?? `zig-${version}`,
          url: file.tarball,
          size: Number(file.size) || undefined,
          checksum: file.shasum ? { type: 'sha256', value: file.shasum } : undefined,
        });
      }
      return found.slice(0, MAX_RELEASES);
    },
  },
];
