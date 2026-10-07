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
import { Job } from './types';

export const DISCO = 'https://api.foojay.io/disco/v3.0';
export const JDK_ROOT = path.join(os.homedir(), '.lumen', 'jdks');
/** Where the other SDKs (Node, Go, Gradle …) are installed — see `sdk-tools.ts`. */
export const TOOL_ROOT = path.join(os.homedir(), '.lumen', 'sdks');
export const IS_WINDOWS = process.platform === 'win32';
export const JAVA_EXE = IS_WINDOWS ? 'java.exe' : 'java';
export const PROGRESS_INTERVAL_MS = 150;
export const HASH_TYPES = new Set(['sha1', 'sha256', 'sha512']);

/** Running installations, of JDKs and of the other SDKs. */
export const jobs = new Map<string, Job>();

export function isInside(parent: string, target: string) {
  const rel = path.relative(parent, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export const exists = (target: string) => fs.access(target).then(() => true, () => false);

/** Our own write access: only below ~/.lumen/jdks. */
export function assertJdkPath(target: string) {
  if (isInside(JDK_ROOT, path.resolve(target)) || isInside(TOOL_ROOT, path.resolve(target))) {
    return;
  }
  throw new Error('Path lies outside ~/.lumen/jdks and ~/.lumen/sdks');
}

/** A folder name from the distribution and the version, without special characters. */
export function folderName(distribution: string, version: string) {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9._+-]+/g, '_').replace(/^[._]+/, '');
  return `${clean(distribution) || 'jdk'}-${clean(version) || 'unknown'}`;
}
