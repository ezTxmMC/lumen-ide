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
 * Environment of the active SDK (JAVA_HOME, PATH) — available synchronously to
 * tasks, runners, terminals and language servers.
 *
 * The main process merges the values passed in over `process.env`, so PATH has
 * to be assembled in full here: `<sdk>/bin` plus the main process's PATH.
 * Deliberately independent of the store, so `lib/run.ts` and friends can use it
 * without an import cycle; `features/sdk.ts` is what sets it.
 */

import type { InstalledSdk, SdkEnvironment } from './types';

export interface ActiveSdk {
  providerId: string;
  home: string;
  major: number;
  /** Where the choice came from. */
  origin: 'project' | 'default';
  variables: Record<string, string>;
  /** The folder for PATH, when it is not `<home>/bin`. */
  bin?: string;
}

let base: SdkEnvironment | null = null;
let active: ActiveSdk[] = [];
let cached: Record<string, string> = {};
let version = 0;
const listeners = new Set<() => void>();

function separator(platform: string) {
  return platform === 'win32' ? '\\' : '/';
}

export function binDir(home: string, platform = base?.platform ?? 'linux') {
  return `${home.replace(/[\\/]+$/, '')}${separator(platform)}bin`;
}

function compose(): Record<string, string> {
  if (!base || !active.length) {
    return {};
  }
  const env: Record<string, string> = {};
  for (const sdk of active) {
    Object.assign(env, sdk.variables);
  }
  const current = base.path.split(base.delimiter).filter(Boolean);
  const bins = active.map((sdk) => sdk.bin ?? binDir(sdk.home, base!.platform));
  const rest = current.filter((dir) => !bins.includes(dir));
  env[base.pathKey] = [...bins, ...rest].join(base.delimiter);
  return env;
}

export function setBaseEnvironment(env: SdkEnvironment) {
  base = env;
  cached = compose();
  version++;
  for (const fn of listeners) {
    fn();
  }
}

export function setActiveSdks(next: ActiveSdk[]) {
  active = next;
  cached = compose();
  version++;
  for (const fn of listeners) {
    fn();
  }
}

export function baseEnvironment(): SdkEnvironment | null {
  return base;
}

/** The active SDKs, the project's ahead of the default. */
export function activeSdks(): ActiveSdk[] {
  return active;
}

export function activeSdk(providerId: string): ActiveSdk | null {
  return active.find((sdk) => sdk.providerId === providerId) ?? null;
}

/** Environment variables of every active SDK including PATH — empty when none is chosen. */
export function sdkEnvironment(): Record<string, string> {
  return { ...cached };
}

/** A counter for `useSyncExternalStore`. */
export const getSdkEnvironmentVersion = () => version;

export function subscribeSdkEnvironment(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Resolves a stored value against the installed SDKs: a path
 * (`/usr/lib/jvm/java-21`), a major version (`21`), or a distribution with a
 * major version (`temurin-21`).
 */
export function resolveSdk(value: string | undefined, installed: InstalledSdk[]): Pick<InstalledSdk, 'home' | 'major'> | null {
  const wanted = value?.trim();
  if (!wanted) {
    return null;
  }
  const usable = installed.filter((sdk) => !sdk.runtimeOnly);
  if (/[\\/]/.test(wanted)) {
    const hit = installed.find((sdk) => sdk.home === wanted);
    return hit ?? { home: wanted, major: 0 };
  }
  const byNewest = (list: InstalledSdk[]) =>
    [...list].sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }))[0] ?? null;
  const major = /^(\d+)$/.exec(wanted);
  if (major) {
    return byNewest(usable.filter((sdk) => sdk.major === Number(major[1])));
  }
  const named = /^(.+)-(\d+)$/.exec(wanted);
  if (!named) {
    return null;
  }
  return byNewest(usable.filter((sdk) => sdk.distribution === named[1] && sdk.major === Number(named[2])));
}
