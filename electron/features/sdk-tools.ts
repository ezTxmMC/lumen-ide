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
 * Further SDKs beside Java: Node.js, Go, Gradle, Maven, Deno, Bun, Kotlin and
 * Zig. Each one is a small description of where its releases are listed and
 * what an unpacked release looks like; listing, downloading (with a checksum),
 * unpacking and detecting work the same for all of them.
 *
 * As with the JDKs, the renderer hands over only a tool id and a version —
 * addresses and checksums come from the release lists fetched here. Installs
 * land in `~/.lumen/sdks/<tool>/<version>`.
 */

import { BrowserWindow, ipcMain, net } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TOOL_ROOT, download, extract, jobs, runTool, type InstallProgress, type Job } from './sdk';

const MAX_RELEASES = 14;

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

interface Checksum {
  type: 'sha256' | 'sha512' | 'sha1';
  value?: string;
  /** A file that lists checksums (`SHASUMS256.txt`, `….sha512`). */
  url?: string;
  /** The line to pick from that list. */
  file?: string;
}

interface Release {
  version: string;
  url: string;
  filename: string;
  lts?: boolean;
  size?: number;
  checksum?: Checksum;
}

interface Platform {
  os: NodeJS.Platform;
  arch: string;
}

interface ToolSpec {
  id: string;
  /** The executable inside an unpacked release, per platform. */
  bin(platform: NodeJS.Platform): string;
  /** What marks the unpacked folder before the tool is put in place, when that is not the executable (an `install.sh`). */
  archiveMarker?: string;
  /** Puts the unpacked release into `target` itself, instead of moving the folder there (Rust's installer script). */
  place?(job: Job, home: string, target: string): Promise<void>;
  versionArgs: string[];
  releases(platform: Platform, signal: AbortSignal): Promise<Release[]>;
}

export interface ToolPackage {
  id: string;
  toolId: string;
  version: string;
  major: number;
  lts: boolean;
  size: number;
  filename: string;
}

export interface DetectedTool {
  home: string;
  version: string;
  managed: boolean;
  sources: string[];
}

export interface ToolInstallRequest {
  jobId: string;
  toolId: string;
  version: string;
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  if (!/^https:\/\//.test(url)) {
    throw new Error('Only HTTPS addresses are allowed');
  }
  const response = await net.fetch(url, { signal, headers: { 'User-Agent': 'Lumen-IDE', Accept: 'application/json, text/plain, */*' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

const fetchJson = async <T>(url: string, signal?: AbortSignal) => JSON.parse(await fetchText(url, signal)) as T;

/** The newest version of each `major.minor`, newest first — a list of every patch release boiled down. */
function latestPerMinor<T extends { version: string; }>(releases: T[], minMajor = 0): T[] {
  const best = new Map<string, T>();
  for (const release of releases) {
    const [major, minor] = release.version.split('.').map(Number);
    if (!Number.isFinite(major) || major < minMajor) {
      continue;
    }
    const key = `${major}.${minor ?? 0}`;
    const known = best.get(key);
    if (!known || compare(release.version, known.version) > 0) {
      best.set(key, release);
    }
  }
  return [...best.values()].sort((a, b) => compare(b.version, a.version)).slice(0, MAX_RELEASES);
}

function compare(a: string, b: string): number {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

const pick = <T>(table: Record<string, T>, key: string): T | undefined => table[key];

/* ------------------------------------------------------------------ *
 * The tools
 * ------------------------------------------------------------------ */

const exe = (name: string, platform: NodeJS.Platform, windows = '.exe') => (platform === 'win32' ? `${name}${windows}` : name);

interface GithubRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  assets: { name: string; browser_download_url: string; size: number; digest?: string; }[];
}

/** Releases of a GitHub project: the first `MAX_RELEASES` finished ones that carry the wanted file. */
async function githubReleases(
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

const NODE_OS: Record<string, string> = { linux: 'linux', darwin: 'darwin', win32: 'win' };
const GO_OS: Record<string, string> = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
const GO_ARCH: Record<string, string> = { x64: 'amd64', arm64: 'arm64' };
const ZIG_OS: Record<string, string> = { linux: 'linux', darwin: 'macos', win32: 'windows' };
const ZIG_ARCH: Record<string, string> = { x64: 'x86_64', arm64: 'aarch64' };
const RUST_TRIPLE_OS: Record<string, string> = { linux: 'unknown-linux-gnu', darwin: 'apple-darwin', win32: 'pc-windows-msvc' };
const RUST_ARCH: Record<string, string> = { x64: 'x86_64', arm64: 'aarch64' };
const BUN_OS: Record<string, string> = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
const BUN_ARCH: Record<string, string> = { x64: 'x64', arm64: 'aarch64' };

const TOOLS: ToolSpec[] = [
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

const MORE_TOOLS: ToolSpec[] = [
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

TOOLS.push(...MORE_TOOLS);

const specOf = (id: string): ToolSpec => {
  const spec = TOOLS.find((tool) => tool.id === id);
  if (!spec) {
    throw new Error(`Unknown SDK: ${id}`);
  }
  return spec;
};

const platformNow = (): Platform => ({ os: process.platform, arch: process.arch });

const isSupported = (platform: Platform) => ['linux', 'darwin', 'win32'].includes(platform.os) && ['x64', 'arm64'].includes(platform.arch);

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

async function catalog(toolId: string): Promise<ToolPackage[]> {
  const spec = specOf(toolId);
  const platform = platformNow();
  if (!isSupported(platform)) {
    return [];
  }
  const releases = await spec.releases(platform, new AbortController().signal);
  return releases.map((release) => ({
    id: `${toolId}@${release.version}`,
    toolId,
    version: release.version,
    major: Number(release.version.split('.')[0]) || 0,
    lts: release.lts === true,
    size: release.size ?? 0,
    filename: release.filename,
  }));
}

/* ------------------------------------------------------------------ *
 * Detection
 * ------------------------------------------------------------------ */

const exists = (target: string) => fs.access(target).then(() => true, () => false);

function versionOf(spec: ToolSpec, bin: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(bin, spec.versionArgs, { timeout: 8000, windowsHide: true }, (error, stdout, stderr) => {
      const text = `${stdout}\n${stderr}`;
      const found = /(\d+\.\d+(?:\.\d+)?)/.exec(text)?.[1];
      resolve(error && !found ? '' : (found ?? ''));
    });
  });
}

/** The tool's own folder for an executable: two levels up for `bin/<exe>` layouts, one for a bare executable. */
const homeOf = (spec: ToolSpec, binFile: string) => {
  const rel = spec.bin(process.platform);
  const depth = rel.split('/').length;
  let home = binFile;
  for (let i = 0; i < depth; i++) {
    home = path.dirname(home);
  }
  return home;
};

async function fromPath(spec: ToolSpec): Promise<string | null> {
  const name = path.basename(spec.bin(process.platform));
  const dirs = (process.env[Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'] ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (await exists(candidate)) {
      return fs.realpath(candidate).catch(() => candidate);
    }
  }
  return null;
}

async function detect(toolId: string): Promise<DetectedTool[]> {
  const spec = specOf(toolId);
  const found: DetectedTool[] = [];
  const root = path.join(TOOL_ROOT, toolId);
  for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
    const home = path.join(root, entry.name);
    if (!entry.isDirectory() || entry.name.startsWith('.') || !(await exists(path.join(home, spec.bin(process.platform))))) {
      continue;
    }
    found.push({ home, version: entry.name, managed: true, sources: ['Lumen'] });
  }
  const system = await fromPath(spec);
  if (system && !system.startsWith(root + path.sep)) {
    const version = await versionOf(spec, system);
    found.push({ home: homeOf(spec, system), version: version || '?', managed: false, sources: ['PATH'] });
  }
  return found.sort((a, b) => compare(b.version, a.version));
}

/* ------------------------------------------------------------------ *
 * Installation
 * ------------------------------------------------------------------ */

async function expectedChecksum(checksum: Checksum | undefined, signal: AbortSignal): Promise<string> {
  if (!checksum) {
    return '';
  }
  if (checksum.value) {
    return checksum.value.toLowerCase();
  }
  if (!checksum.url) {
    return '';
  }
  const text = await fetchText(checksum.url, signal);
  const hex = checksum.type === 'sha512' ? /\b[0-9a-f]{128}\b/i : /\b[0-9a-f]{64}\b/i;
  const line = checksum.file ? text.split('\n').find((entry) => entry.includes(checksum.file!)) ?? '' : text;
  return hex.exec(line)?.[0].toLowerCase() ?? '';
}

/** The folder inside an unpacked archive that holds the tool (`bin/go` below it), looking a couple of levels down. */
async function findHome(dir: string, spec: ToolSpec, depth = 0): Promise<string | null> {
  if (await exists(path.join(dir, spec.archiveMarker ?? spec.bin(process.platform)))) {
    return dir;
  }
  if (depth >= 2) {
    return null;
  }
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name === '__MACOSX') {
      continue;
    }
    const hit = await findHome(path.join(dir, entry.name), spec, depth + 1);
    if (hit) {
      return hit;
    }
  }
  return null;
}

async function install(request: ToolInstallRequest, window: BrowserWindow | null): Promise<string> {
  const spec = specOf(request.toolId);
  if (!/^\d+\.\d+(\.\d+)?$/.test(request.version)) {
    throw new Error('Invalid version');
  }
  if (jobs.has(request.jobId)) {
    throw new Error('An installation is already running');
  }
  const job: Job = { controller: new AbortController(), child: null, cancelled: false };
  jobs.set(request.jobId, job);
  const safeJob = request.jobId.replace(/[^A-Za-z0-9_-]/g, '');
  const target = path.join(TOOL_ROOT, spec.id, request.version);
  const staging = path.join(TOOL_ROOT, `.extract-${safeJob}`);
  const archive = path.join(TOOL_ROOT, '.downloads', `${safeJob}-${spec.id}`);
  let state: InstallProgress = { jobId: request.jobId, phase: 'resolve', received: 0, total: 0, speed: 0 };
  const send = (patch: Partial<InstallProgress>) => {
    state = { ...state, ...patch };
    window?.webContents.send('sdk:progress', state);
  };

  try {
    send({});
    if (await exists(target)) {
      throw new Error(`Already installed: ${target}`);
    }
    const release = (await spec.releases(platformNow(), job.controller.signal)).find((entry) => entry.version === request.version);
    if (!release) {
      throw new Error(`${spec.id} ${request.version} is not offered for this system`);
    }
    await fs.mkdir(path.dirname(archive), { recursive: true });
    const file = `${archive}-${path.basename(release.filename)}`;

    send({ phase: 'download', total: release.size ?? 0 });
    const expected = await expectedChecksum(release.checksum, job.controller.signal);
    const digest = await download(job, release.url, file, release.checksum?.type ?? '', (received, total, speed) => send({ received, total, speed }));

    send({ phase: 'verify', speed: 0 });
    const verified = Boolean(expected && digest);
    if (verified && digest !== expected) {
      await fs.rm(file, { force: true });
      throw new Error('Checksum does not match — the download is damaged');
    }

    send({ phase: 'extract', verified });
    await fs.rm(staging, { recursive: true, force: true });
    await extract(job, file, staging);
    await fs.rm(file, { force: true });
    const home = await findHome(staging, spec);
    if (!home) {
      throw new Error(`No ${spec.id} found in the archive`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (spec.place) {
      await spec.place(job, home, target);
    }
    if (!spec.place) {
      await fs.rename(home, target);
    }
    await fs.writeFile(path.join(target, '.lumen-sdk.json'), JSON.stringify({ tool: spec.id, version: request.version, installedAt: new Date().toISOString() }, null, 2)).catch(() => {});
    send({ phase: 'done', home: target });
    return target;
  } catch (err) {
    const cancelled = job.cancelled;
    send({ phase: cancelled ? 'cancelled' : 'error', error: cancelled ? undefined : (err as Error).message, speed: 0 });
    if (cancelled) {
      throw new Error('Cancelled');
    }
    throw err;
  } finally {
    jobs.delete(request.jobId);
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

export function registerSdkToolIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('sdk:tools:catalog', (_e, toolId: string) => catalog(String(toolId)));
  ipcMain.handle('sdk:tools:detect', (_e, toolId: string) => detect(String(toolId)));
  ipcMain.handle('sdk:tools:install', (e, request: ToolInstallRequest) => install(request, BrowserWindow.fromWebContents(e.sender) ?? getWindow()));
}

