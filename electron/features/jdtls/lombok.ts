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
 * Lombok for the Java language server.
 *
 * Lombok writes getters, setters and builders into the compiler's syntax tree
 * while it compiles. jdtls only sees them when the Lombok jar is attached to
 * its own JVM as a `-javaagent` — without it every generated `getName()` is a
 * "cannot be resolved" error. The jar is taken from the build tool's cache
 * (Gradle or Maven), in the version the project asks for when that is known.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const BUILD_FILES = ['build.gradle', 'build.gradle.kts', 'pom.xml', 'gradle/libs.versions.toml', 'settings.gradle', 'settings.gradle.kts'];
/** How deep below the root build files are looked for (modules). */
const MODULE_DEPTH = 2;
const SKIPPED = new Set(['node_modules', '.git', '.gradle', 'build', 'out', 'target', 'run', 'bin']);

async function readText(file: string): Promise<string | null> {
  return fs.readFile(file, 'utf8').catch(() => null);
}

/** Build files of the root and its modules that mention Lombok; the version they name, when they do. */
async function lombokUse(dir: string, depth: number): Promise<{ used: boolean; version: string | null; }> {
  let used = false;
  let version: string | null = null;
  for (const name of BUILD_FILES) {
    const text = await readText(path.join(dir, name));
    if (!text || !/lombok/i.test(text)) {
      continue;
    }
    used = true;
    version = version ?? /lombok[^\n]*?(\d+\.\d+\.\d+)/i.exec(text)?.[1] ?? null;
  }
  if (depth >= MODULE_DEPTH) {
    return { used, version };
  }
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED.has(entry.name) || entry.name.startsWith('.')) {
      continue;
    }
    const inner = await lombokUse(path.join(dir, entry.name), depth + 1);
    used = used || inner.used;
    version = version ?? inner.version;
  }
  return { used, version };
}

const compareVersions = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/** Jars of Lombok in a cache folder, without sources and javadoc: `[version, path]`. */
async function jarsIn(folder: string, layout: 'gradle' | 'maven'): Promise<[string, string][]> {
  const versions = await fs.readdir(folder).catch(() => [] as string[]);
  const found: [string, string][] = [];
  for (const version of versions) {
    const base = path.join(folder, version);
    if (layout === 'maven') {
      const jar = path.join(base, `lombok-${version}.jar`);
      if (await fs.access(jar).then(() => true, () => false)) {
        found.push([version, jar]);
      }
      continue;
    }
    for (const hash of await fs.readdir(base).catch(() => [] as string[])) {
      const files = await fs.readdir(path.join(base, hash)).catch(() => [] as string[]);
      const jar = files.find((file) => file === `lombok-${version}.jar`);
      if (jar) {
        found.push([version, path.join(base, hash, jar)]);
      }
    }
  }
  return found;
}

async function cachedJars(): Promise<[string, string][]> {
  const home = os.homedir();
  const gradleHome = process.env.GRADLE_USER_HOME ?? path.join(home, '.gradle');
  const mavenHome = process.env.M2_REPO ?? path.join(home, '.m2', 'repository');
  const [gradle, maven] = await Promise.all([
    jarsIn(path.join(gradleHome, 'caches', 'modules-2', 'files-2.1', 'org.projectlombok', 'lombok'), 'gradle'),
    jarsIn(path.join(mavenHome, 'org', 'projectlombok', 'lombok'), 'maven'),
  ]);
  return [...gradle, ...maven];
}

/** The Lombok jar to attach to jdtls for the project at `root`, or null when it does not use Lombok or no jar is cached. */
export async function lombokAgent(root: string): Promise<string | null> {
  const use = await lombokUse(path.resolve(String(root)), 0);
  if (!use.used) {
    return null;
  }
  const jars = await cachedJars();
  const exact = use.version ? jars.find(([version]) => version === use.version) : undefined;
  if (exact) {
    return exact[1];
  }
  const newest = jars.sort((a, b) => compareVersions(b[0], a[0]))[0];
  return newest?.[1] ?? null;
}
