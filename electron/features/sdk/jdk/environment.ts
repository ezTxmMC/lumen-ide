/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import { net } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { JDK_ROOT } from './places';
import { SdkEnvironment } from './types';

export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  if (!/^https:\/\//.test(url)) {
    throw new Error('Only HTTPS addresses are allowed');
  }
  const response = await net.fetch(url, { signal, headers: { 'User-Agent': 'Lumen-IDE' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

export function environment(): SdkEnvironment {
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  return {
    platform: process.platform,
    arch: process.arch,
    home: os.homedir(),
    pathKey,
    path: process.env[pathKey] ?? '',
    delimiter: path.delimiter,
    jdkRoot: JDK_ROOT,
  };
}
