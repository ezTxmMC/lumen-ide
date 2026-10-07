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
import path from 'node:path';
import { BIN_NAME } from './checks';
import { BIN, IS_WINDOWS, MANIFEST, ROOT } from './places';
import { InstalledPackage, LspPackage } from './types';

export async function readManifest(): Promise<Record<string, InstalledPackage>> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST, 'utf8')) as Record<string, InstalledPackage>;
  } catch {
    return {};
  }
}

export async function writeManifest(data: Record<string, InstalledPackage>) {
  await fs.mkdir(ROOT, { recursive: true });
  await fs.writeFile(MANIFEST, `${JSON.stringify(data, null, 2)}\n`);
}

export async function record(id: string, type: LspPackage['type'], bin: string, version?: string) {
  const data = await readManifest();
  const bins = new Set(data[id]?.bins ?? []);
  bins.add(bin);
  data[id] = { id, type, bins: [...bins], installedAt: new Date().toISOString(), version };
  await writeManifest(data);
}

export const exists = (target: string) => fs.access(target).then(() => true, () => false);

/** The launcher of a server in `bin/`, if Lumen installed one. */
export async function managedCommand(command: string): Promise<string | null> {
  if (!BIN_NAME.test(command) || command.includes('/')) {
    return null;
  }
  const names = IS_WINDOWS ? [`${command}.cmd`, `${command}.exe`, command] : [command];
  for (const name of names) {
    const file = path.join(BIN, name);
    if (await exists(file)) {
      return file;
    }
  }
  return null;
}

/** A launcher that starts `target`, through `runtime` where one is needed. */
export async function writeLauncher(bin: string, target: string, runtime: string[] = [], env: Record<string, string> = {}) {
  await fs.mkdir(BIN, { recursive: true });
  const command = [...runtime, target];
  if (IS_WINDOWS) {
    const lines = ['@echo off', ...Object.entries(env).map(([key, value]) => `set "${key}=${value}"`)];
    lines.push(`${command.map((part) => `"${part}"`).join(' ')} %*`);
    await fs.writeFile(path.join(BIN, `${bin}.cmd`), `${lines.join('\r\n')}\r\n`);
    return;
  }
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  const lines = ['#!/bin/sh', ...Object.entries(env).map(([key, value]) => `export ${key}=${quote(value)}`)];
  lines.push(`exec ${command.map(quote).join(' ')} "$@"`);
  const file = path.join(BIN, bin);
  await fs.writeFile(file, `${lines.join('\n')}\n`);
  await fs.chmod(file, 0o755);
}
