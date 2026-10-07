/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BIN } from '../../lsp-packages/places';
import { TOOL_ROOT } from '../jdk/places';
import { specOf } from './catalog';
import { compare } from './fetch';
import { DetectedTool, ToolSpec } from './types';

export const exists = (target: string) => fs.access(target).then(() => true, () => false);

function versionOf(spec: ToolSpec, bin: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(bin, spec.versionArgs, { timeout: 8000, windowsHide: true }, (error, stdout, stderr) => {
      const text = `${stdout}\n${stderr}`;
      const found = (spec.versionPattern ?? /(\d+\.\d+(?:\.\d+)?)/).exec(text)?.[1];
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

export async function detect(toolId: string): Promise<DetectedTool[]> {
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
    // A program the add-on installer put into ~/.lumen/lsp/bin is the add-on's, not the user's: listed, never removed here.
    const source = system.startsWith(BIN + path.sep) ? 'Lumen add-on' : 'PATH';
    found.push({ home: homeOf(spec, system), version: version || '?', managed: false, sources: [source] });
  }
  return found.sort((a, b) => compare(b.version, a.version));
}
