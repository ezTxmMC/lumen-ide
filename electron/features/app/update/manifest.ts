/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


const PLATFORM_KEYS: Record<string, string> = {
  'linux-x64': 'linux_amd64',
  'linux-arm64': 'linux_aarch64',
  'darwin-arm64': 'macos_arm64',
  'win32-x64': 'windows_x86_64',
  'win32-arm64': 'windows_arm64',
};

export interface ManifestFile {
  name: string;
  size: number;
  /** Base64, as with electron-builder. */
  sha512: string;
}

export interface PlatformRelease {
  version: string;
  releaseDate: string;
  /** The file the updater installs (an AppImage, a setup EXE, a ZIP). */
  update: ManifestFile | null;
  files: ManifestFile[];
}

export interface Manifest {
  product: string;
  version: string;
  releaseDate: string;
  notes?: string;
  platforms: Record<string, PlatformRelease>;
}

export function platformKey(): string | null {
  return PLATFORM_KEYS[`${process.platform}-${process.arch}`] ?? null;
}

/** `1.2.10` > `1.2.9`; a prerelease (`1.3.0-beta.1`) comes before its final version. */
export function compareVersions(a: string, b: string): number {
  const [coreA, preA = ''] = a.replace(/^v/, '').split('-', 2);
  const [coreB, preB = ''] = b.replace(/^v/, '').split('-', 2);
  const partsA = coreA.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const partsB = coreB.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) {
      return Math.sign(diff);
    }
  }
  if (preA === preB) {
    return 0;
  }
  if (!preA) {
    return 1;
  }
  if (!preB) {
    return -1;
  }
  return preA.localeCompare(preB, 'en', { numeric: true });
}
