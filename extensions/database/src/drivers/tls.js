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
 * TLS options of a connection, as the drivers take them: off, encrypted
 * without checking the certificate, or verified — optionally against a CA file.
 */

import fs from 'node:fs/promises';

/** `false`, or options for `tls.connect`. */
export async function sslOptions(connection) {
  const mode = connection.ssl ?? 'off';
  if (mode === 'off' || !mode) {
    return false;
  }
  const ca = connection.sslCa ? await fs.readFile(connection.sslCa, 'utf8') : undefined;
  return { rejectUnauthorized: mode === 'verify', ...(ca ? { ca } : {}) };
}
