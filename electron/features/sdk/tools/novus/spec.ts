/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { fetchJson } from '../fetch';
import { exe } from '../platforms';
import type { GithubRelease } from '../platforms';
import type { Platform, Release, ToolSpec } from '../types';
import { NOVUS_API, describeGithubError, novusReleases } from './model';
import { PRERELEASE_VERSION_PATTERN } from './version';

/** GitHub allows 60 anonymous calls an hour; the dialog asks for the list on every visit. */
const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; list: GithubRelease[]; } | null = null;

/**
 * The release list of the Novus project, kept for a few minutes. A failed
 * request answers from the older list when there is one; without, it throws
 * a sentence the dialog can show. No token is sent.
 */
export async function loadNovusList(signal: AbortSignal, now = Date.now()): Promise<GithubRelease[]> {
  if (cache && now - cache.at < CACHE_MS) {
    return cache.list;
  }
  try {
    const list = await fetchJson<GithubRelease[]>(NOVUS_API, signal);
    cache = { at: now, list };
    return list;
  } catch (error) {
    if (cache) {
      return cache.list;
    }
    throw new Error(describeGithubError(error));
  }
}

/**
 * Novus: `novusc` (compiler) and `novus-lsp` (language server) as bare
 * programs into `<home>/bin`. Every release is offered, pre-releases too —
 * Novus has no other kind yet.
 */
export const NOVUS_TOOL: ToolSpec = {
  id: 'novus',
  bin: (platform) => exe('bin/novusc', platform),
  versionArgs: ['version'],
  versionPattern: PRERELEASE_VERSION_PATTERN,
  async releases(platform: Platform, signal): Promise<Release[]> {
    return novusReleases(await loadNovusList(signal), platform);
  },
};
