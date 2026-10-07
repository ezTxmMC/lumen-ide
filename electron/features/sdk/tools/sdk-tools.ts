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
 * Further SDKs beside Java: Node.js, Go, Gradle, Maven, Deno, Bun, Kotlin and
 * Zig. Each one is a small description of where its releases are listed and
 * what an unpacked release looks like; listing, downloading (with a checksum),
 * unpacking and detecting work the same for all of them.
 *
 * As with the JDKs, the renderer hands over only a tool id and a version —
 * addresses and checksums come from the release lists fetched here. Installs
 * land in `~/.lumen/sdks/<tool>/<version>`.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { catalog } from './catalog';
import { detect } from './detect';
import { install } from './install';
import { ToolInstallRequest } from './types';

export function registerSdkToolIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('sdk:tools:catalog', (_e, toolId: string) => catalog(String(toolId)));
  ipcMain.handle('sdk:tools:detect', (_e, toolId: string) => detect(String(toolId)));
  ipcMain.handle('sdk:tools:install', (e, request: ToolInstallRequest) => install(request, BrowserWindow.fromWebContents(e.sender) ?? getWindow()));
}
