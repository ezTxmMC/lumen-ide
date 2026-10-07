/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { type Job } from '../jdk/types';

export interface Checksum {
  type: 'sha256' | 'sha512' | 'sha1';
  value?: string;
  /** A file that lists checksums (`SHASUMS256.txt`, `….sha512`). */
  url?: string;
  /** The line to pick from that list. */
  file?: string;
}

/** One plain file of a release that is not an archive: where it goes in the home, and where it comes from. */
export interface ReleaseFile {
  /** Path inside the home (`bin/novusc`). */
  dest: string;
  filename: string;
  url: string;
  size?: number;
  checksum?: Checksum;
  /** Needs the executable bit on Unix. */
  executable?: boolean;
}

export interface Release {
  version: string;
  url: string;
  filename: string;
  lts?: boolean;
  /** A pre-release of the project (`alpha`, `rc`). */
  prerelease?: boolean;
  /** Bytes to download — the sum of `files` when there are several. */
  size?: number;
  checksum?: Checksum;
  /** Plain files to download into the home, instead of one archive to unpack. */
  files?: ReleaseFile[];
}

export interface Platform {
  os: NodeJS.Platform;
  arch: string;
}

export interface ToolSpec {
  id: string;
  /** The executable inside an unpacked release, per platform. */
  bin(platform: NodeJS.Platform): string;
  /** What marks the unpacked folder before the tool is put in place, when that is not the executable (an `install.sh`). */
  archiveMarker?: string;
  /** Puts the unpacked release into `target` itself, instead of moving the folder there (Rust's installer script). */
  place?(job: Job, home: string, target: string): Promise<void>;
  versionArgs: string[];
  /** Picks the version out of the output of `versionArgs`, group 1; the plain `1.2.3` when left out. */
  versionPattern?: RegExp;
  releases(platform: Platform, signal: AbortSignal): Promise<Release[]>;
}

export interface ToolPackage {
  id: string;
  toolId: string;
  version: string;
  major: number;
  lts: boolean;
  prerelease: boolean;
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
