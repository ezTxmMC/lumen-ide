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
 * What the approval hash of an extension's program code is taken over.
 *
 * The user approves the code once and the SHA-256 is pinned; the main process
 * checks it again before saving and at every start. Main-process code alone
 * hashes as the plain module — as it always did, so approvals made before the
 * renderer part existed stay valid. With a renderer part both go in, in a
 * fixed shape. Shared by the renderer (`src/core/extensions/manager.ts`) and
 * the main process (`index.ts`), so both compute the same.
 */

export interface CodeParts {
  main?: string;
  renderer?: string;
}

export function codeHashInput(code: CodeParts): string {
  if (!code.renderer) {
    return code.main ?? '';
  }
  return JSON.stringify({ main: code.main ?? '', renderer: code.renderer });
}
