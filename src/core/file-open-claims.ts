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
 * A hook for files something other than the text editor should open — a
 * database an extension shows in its own view, say. The editor asks before
 * reading a file; whoever registered here may take it over.
 *
 * Kept free of imports on purpose: the store calls it, and the extensions
 * that answer live far above the store.
 */

/** `true`: the file was taken care of (or the user cancelled) — the editor does nothing. */
type Claim = (path: string) => Promise<boolean>;

let claim: Claim = async () => false;

export function setFileOpenClaim(fn: Claim) {
  claim = fn;
}

export function claimFileOpen(path: string): Promise<boolean> {
  return claim(path).catch(() => false);
}
