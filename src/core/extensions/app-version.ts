/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The running Lumen's version, read once at startup — extension compatibility is decided against it. */

let current = '0.0.0';

export const appVersion = () => current;

export async function loadAppVersion(): Promise<string> {
  const info = await window.lumen.app.info().catch(() => null);
  if (info?.version) {
    current = info.version;
  }
  return current;
}
