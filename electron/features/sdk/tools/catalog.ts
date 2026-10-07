/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { TOOLS } from './core-tools';
import { MORE_TOOLS } from './extra-tools';
import { NOVUS_TOOL } from './novus/spec';
import { Platform, ToolPackage, ToolSpec } from './types';

TOOLS.push(...MORE_TOOLS, NOVUS_TOOL);

export const specOf = (id: string): ToolSpec => {
  const spec = TOOLS.find((tool) => tool.id === id);
  if (!spec) {
    throw new Error(`Unknown SDK: ${id}`);
  }
  return spec;
};

export const platformNow = (): Platform => ({ os: process.platform, arch: process.arch });

const isSupported = (platform: Platform) => ['linux', 'darwin', 'win32'].includes(platform.os) && ['x64', 'arm64'].includes(platform.arch);

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

export async function catalog(toolId: string): Promise<ToolPackage[]> {
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
    prerelease: release.prerelease === true,
    size: release.size ?? 0,
    filename: release.filename,
  }));
}
