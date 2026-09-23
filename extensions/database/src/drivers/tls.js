/**
 * TLS options of a connection, as the drivers take them: off, encrypted
 * without checking the certificate, or verified — optionally against a CA file.
 */

import fs from 'node:fs/promises'

/** `false`, or options for `tls.connect`. */
export async function sslOptions(connection) {
  const mode = connection.ssl ?? 'off'
  if (mode === 'off' || !mode) return false
  const ca = connection.sslCa ? await fs.readFile(connection.sslCa, 'utf8') : undefined
  return { rejectUnauthorized: mode === 'verify', ...(ca ? { ca } : {}) }
}
