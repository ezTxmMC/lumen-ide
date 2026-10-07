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
import os from 'node:os';
import path from 'node:path';
import { environment } from './environment';
import { IS_WINDOWS, JAVA_EXE, JDK_ROOT, exists, isInside } from './places';
import { DetectedJdk } from './types';

function parseRelease(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=\"?(.*?)\"?\s*$/.exec(line);
    if (match) {
      out[match[1]] = match[2];
    }
  }
  return out;
}

/** `1.8.0_392` → 8, `21.0.2` → 21, `25` → 25. */
function majorOf(version: string): number {
  const legacy = /^1\.(\d+)/.exec(version);
  if (legacy) {
    return Number(legacy[1]);
  }
  const modern = /^(\d+)/.exec(version);
  return modern ? Number(modern[1]) : 0;
}

/** Is `dir` the root of a JDK (bin/java present)? Checks macOS bundles too. */
export async function javaHomeIn(dir: string): Promise<string | null> {
  const variants = [dir, path.join(dir, 'Contents', 'Home'), path.join(dir, 'libexec', 'openjdk.jdk', 'Contents', 'Home')];
  for (const variant of variants) {
    if (await exists(path.join(variant, 'bin', JAVA_EXE))) {
      return variant;
    }
  }
  return null;
}

export async function subdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.'))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** The children of a collecting folder — one level deeper where the child is not a JDK itself (Gradle, archives). */
async function scanCollection(root: string, match?: RegExp): Promise<string[]> {
  const homes: string[] = [];
  for (const child of await subdirectories(root)) {
    if (match && !match.test(path.basename(child))) {
      continue;
    }
    const direct = await javaHomeIn(child);
    if (direct) {
      homes.push(direct);
      continue;
    }
    for (const grandchild of await subdirectories(child)) {
      const nested = await javaHomeIn(grandchild);
      if (nested) {
        homes.push(nested);
      }
    }
  }
  return homes;
}

interface CollectionRoot {
  dir: string;
  label: string;
  /** Check only children whose name fits (Homebrew has hundreds of formulae). */
  match?: RegExp;
}

function collectionRoots(): CollectionRoot[] {
  const home = os.homedir();
  const common = [
    { dir: JDK_ROOT, label: 'Lumen' },
    { dir: path.join(home, '.sdkman', 'candidates', 'java'), label: 'SDKMAN!' },
    { dir: path.join(home, '.jdks'), label: 'IntelliJ' },
    { dir: path.join(home, '.gradle', 'jdks'), label: 'Gradle' },
    { dir: path.join(home, '.asdf', 'installs', 'java'), label: 'asdf' },
    { dir: path.join(home, '.local', 'share', 'mise', 'installs', 'java'), label: 'mise' },
    { dir: path.join(home, '.jbang', 'cache', 'jdks'), label: 'JBang' },
  ];
  if (IS_WINDOWS) {
    const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432]
      .filter((dir): dir is string => Boolean(dir));
    const vendors = ['Java', 'Eclipse Adoptium', 'Amazon Corretto', 'Zulu', 'Microsoft', 'BellSoft', 'SapMachine', 'Semeru', 'OpenJDK'];
    return [
      ...common,
      ...programFiles.flatMap((base) => vendors.map((vendor) => ({ dir: path.join(base, vendor), label: vendor }))),
    ];
  }
  if (process.platform === 'darwin') {
    return [
      ...common,
      { dir: '/Library/Java/JavaVirtualMachines', label: 'macOS' },
      { dir: path.join(home, 'Library', 'Java', 'JavaVirtualMachines'), label: 'macOS' },
      { dir: '/opt/homebrew/opt', label: 'Homebrew', match: /openjdk/ },
      { dir: '/usr/local/opt', label: 'Homebrew', match: /openjdk/ },
    ];
  }
  return [
    ...common,
    { dir: '/usr/lib/jvm', label: '/usr/lib/jvm' },
    { dir: '/usr/lib64/jvm', label: '/usr/lib64/jvm' },
    { dir: '/usr/java', label: '/usr/java' },
    { dir: '/opt', label: '/opt' },
    { dir: '/opt/java', label: '/opt/java' },
  ];
}

/** `java` from the PATH → the root of a JDK (symlinks resolved, Java 8's `jre` skipped). */
async function homesFromPath(): Promise<string[]> {
  const env = environment();
  const homes: string[] = [];
  for (const dir of env.path.split(path.delimiter)) {
    if (!dir) {
      continue;
    }
    const candidate = path.join(dir, JAVA_EXE);
    const real = await fs.realpath(candidate).catch(() => null);
    if (!real) {
      continue;
    }
    const home = path.dirname(path.dirname(real));
    homes.push(path.basename(home) === 'jre' ? path.dirname(home) : home);
  }
  return homes;
}

async function describeJdk(home: string): Promise<Omit<DetectedJdk, 'sources'> | null> {
  if (!(await exists(path.join(home, 'bin', JAVA_EXE)))) {
    return null;
  }
  const release = parseRelease(await fs.readFile(path.join(home, 'release'), 'utf8').catch(() => ''));
  const fromName = /(\d+(?:\.\d+)*)/.exec(path.basename(home))?.[1] ?? '';
  const version = release.JAVA_VERSION || fromName;
  const marker = await fs.readFile(path.join(home, '.lumen-sdk.json'), 'utf8')
    .then((text) => JSON.parse(text) as { distribution?: string; })
    .catch(() => null);
  return {
    home,
    version,
    major: majorOf(version),
    implementor: release.IMPLEMENTOR ?? '',
    implementorVersion: release.IMPLEMENTOR_VERSION ?? '',
    arch: release.OS_ARCH ?? '',
    managed: isInside(JDK_ROOT, home),
    jreOnly: !(await exists(path.join(home, 'bin', IS_WINDOWS ? 'javac.exe' : 'javac'))),
    distribution: marker?.distribution,
  };
}

export async function detectJava(): Promise<DetectedJdk[]> {
  const found: { home: string; source: string; }[] = [];
  if (process.env.JAVA_HOME) {
    found.push({ home: process.env.JAVA_HOME, source: 'JAVA_HOME' });
  }
  for (const home of await homesFromPath()) {
    found.push({ home, source: 'PATH' });
  }
  for (const root of collectionRoots()) {
    for (const home of await scanCollection(root.dir, root.match)) {
      found.push({ home, source: root.label });
    }
  }

  const byHome = new Map<string, DetectedJdk>();
  for (const { home, source } of found) {
    const real = await fs.realpath(home).catch(() => null);
    if (!real) {
      continue;
    }
    const known = byHome.get(real);
    if (known) {
      if (!known.sources.includes(source)) {
        known.sources.push(source);
      }
      continue;
    }
    const info = await describeJdk(real);
    if (!info) {
      continue;
    }
    byHome.set(real, { ...info, sources: [source] });
  }
  return [...byHome.values()].sort((a, b) => b.major - a.major || b.version.localeCompare(a.version, 'en', { numeric: true }));
}
