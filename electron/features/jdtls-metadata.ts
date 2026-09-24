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
 * The Eclipse metadata jdtls and its Gradle/Maven import leave in a project —
 * found and removed. No Electron in here, so `scripts/check-lsp.ts` runs it
 * against real folders.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false);
}

/* ------------------------------------------------------------------ *
 * Eclipse metadata in the project
 * ------------------------------------------------------------------ */

/** Folders never searched for module metadata. */
const METADATA_SKIP = new Set(['.git', '.gradle', '.idea', 'build', 'bin', 'out', 'target', 'node_modules']);

/** A `.project` that Buildship, m2e or jdtls wrote — not one somebody keeps for Eclipse on purpose. */
const GENERATED_PROJECT = /buildship|__CREATED_BY_JAVA_LANGUAGE_SERVER__|org\.eclipse\.m2e\.core/;

async function isGeneratedSettings(dir: string): Promise<boolean> {
  const names = await fs.readdir(dir).catch(() => null);
  if (!names?.length) {
    return false;
  }
  return names.every((name) => /^org\.eclipse\.[\w.]+\.prefs$/.test(name));
}

/** ModDevGradle's `.eclipse/configurations/*.launch` — the launch files it writes when it thinks it runs in Eclipse. */
async function isGeneratedLaunches(dir: string): Promise<boolean> {
  const names = await fs.readdir(dir).catch(() => null);
  if (!names || names.some((name) => name !== 'configurations')) {
    return false;
  }
  const launches = await fs.readdir(path.join(dir, 'configurations')).catch(() => [] as string[]);
  return launches.every((name) => name.endsWith('.launch'));
}

/** The preference files Buildship, m2e and jdtls write — a `.settings` of nothing else is theirs. */
const GENERATED_PREFS = /^org\.eclipse\.(buildship\.core|m2e\.core|jdt\.core)\.prefs$/;

async function isGeneratedPrefsOnly(dir: string): Promise<boolean> {
  const names = await fs.readdir(dir).catch(() => null);
  if (!names?.length) {
    return false;
  }
  return names.every((name) => GENERATED_PREFS.test(name));
}

/** A `.classpath` or `.factorypath` on its own — its `.project` is gone or never was — that a generator wrote. */
const GENERATED_CLASSPATH = /buildship|org\.eclipse\.m2e|JRE_CONTAINER|jdt\.ls|<factorypath>/;

/**
 * `bin/` of Buildship's model — nothing but `.class` files in folders, in a
 * module with a Gradle or Maven build (whose own output is `build/` or
 * `target/`). A hand-made `bin/` with anything else in it stays.
 */
async function isGeneratedBin(dir: string): Promise<boolean> {
  const build = await Promise.all(['build.gradle', 'build.gradle.kts', 'pom.xml'].map((name) => exists(path.join(dir, name))));
  if (!build.some(Boolean)) {
    return false;
  }
  let classes = 0;
  const pending = [path.join(dir, 'bin')];
  for (let visited = 0; pending.length && visited < 2000; visited++) {
    const current = pending.pop() as string;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => null);
    if (!entries) {
      return false;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        pending.push(path.join(current, entry.name));
        continue;
      }
      if (!entry.name.endsWith('.class')) {
        return false;
      }
      classes++;
    }
  }
  return classes > 0 && pending.length === 0;
}

/**
 * The metadata jdtls and its Gradle/Maven import left in a module folder:
 * `.project` (when generated), with it `.classpath`, `.factorypath` and a
 * `.settings` of Eclipse preferences only, ModDevGradle's `.eclipse` and
 * Buildship's `bin/`. `.classpath`, `.factorypath`, `.settings` and `bin/`
 * count on their own as well — annotation processing writes a lone
 * `.factorypath`, and a removed `.project` leaves the rest behind.
 */
async function moduleMetadata(dir: string): Promise<string[]> {
  const found: string[] = [];
  const project = await fs.readFile(path.join(dir, '.project'), 'utf8').catch(() => null);
  const generated = project !== null && GENERATED_PROJECT.test(project);
  if (generated) {
    found.push(path.join(dir, '.project'));
  }
  for (const name of ['.classpath', '.factorypath']) {
    const content = await fs.readFile(path.join(dir, name), 'utf8').catch(() => null);
    if (content === null) {
      continue;
    }
    if (generated || GENERATED_CLASSPATH.test(content)) {
      found.push(path.join(dir, name));
    }
  }
  const settings = path.join(dir, '.settings');
  if (generated ? await isGeneratedSettings(settings) : await isGeneratedPrefsOnly(settings)) {
    found.push(settings);
  }
  if (await isGeneratedLaunches(path.join(dir, '.eclipse'))) {
    found.push(path.join(dir, '.eclipse'));
  }
  if (await isGeneratedBin(dir)) {
    found.push(path.join(dir, 'bin'));
  }
  return found;
}

/** Generated metadata in the root and in module folders up to three levels down. */
export async function findMetadata(root: string, depth = 0): Promise<string[]> {
  const found = await moduleMetadata(root);
  if (depth >= 3) {
    return found;
  }
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || METADATA_SKIP.has(entry.name)) {
      continue;
    }
    found.push(...await findMetadata(path.join(root, entry.name), depth + 1));
  }
  return found;
}

/** Of `files`, those git tracks — they are part of the project and stay. */
export async function trackedByGit(root: string, files: string[]): Promise<Set<string>> {
  if (!files.length) {
    return new Set();
  }
  const relative = files.map((file) => path.relative(root, file));
  const result = await promisify(execFile)('git', ['-C', root, 'ls-files', '-z', '--', ...relative], { timeout: 10_000 })
    .catch(() => ({ stdout: '' }));
  const listed = String(result.stdout).split('\0').filter(Boolean);
  return new Set(files.filter((_file, index) => listed.some((entry) => entry === relative[index] || entry.startsWith(`${relative[index]}/`))));
}

/**
 * Remove what jdtls generated in the project, before it starts. jdtls now
 * keeps these files in its own workspace
 * (`-Djava.import.generatesMetadataFilesAtProjectRoot=false`), but files
 * already on disk win over that — so the old ones have to go once. Files git
 * tracks stay, and are reported.
 */
export async function cleanMetadata(root: string): Promise<{ removed: string[]; kept: string[]; }> {
  const found = await findMetadata(path.resolve(String(root)));
  const tracked = await trackedByGit(root, found);
  const removed: string[] = [];
  for (const file of found) {
    if (tracked.has(file)) {
      continue;
    }
    await fs.rm(file, { recursive: true, force: true });
    removed.push(file);
  }
  return { removed, kept: [...tracked] };
}
