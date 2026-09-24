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
 * Trusting an extension server.
 *
 * Lumen knows exactly one verified server, `lumen-extensions.eztxm.de`, and
 * installs from it without asking. Every other server — including your own —
 * raises a prompt naming the host first; anyone using one regularly marks it
 * as trusted once.
 *
 * What this boundary does and does not do belongs in the same breath. It says
 * *where* an extension came from, not that anyone vetted it. That is also why
 * it is not the only safeguard: extensions carry no program code (see
 * `types.ts`). The prompt guards against adopting a language definition or a
 * page from a server you do not know — not against code running, which does
 * not happen either way.
 */

import { OFFICIAL_HOST, type ExtensionServer } from './types';

/** Host of an address in lower case, or `null` when it is unusable. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Reduce an address to its root — comparing and storing need one shape. */
export function normalizeServerUrl(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    throw new Error('Adresse fehlt');
  }
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('Extension servers have to be reachable over https');
  }
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${url.pathname}`;
}

/** The official server — never switched off, never removed. */
export function isOfficial(url: string): boolean {
  return hostOf(url) === OFFICIAL_HOST;
}

/**
 * May we install from this server without asking?
 *
 * The official one always; any other only once it has been marked trusted in
 * the settings.
 */
export function isTrusted(url: string, servers: readonly ExtensionServer[]): boolean {
  if (isOfficial(url)) {
    return true;
  }
  const host = hostOf(url);
  if (!host) {
    return false;
  }
  return servers.some((server) => hostOf(server.url) === host && server.trusted === true);
}
