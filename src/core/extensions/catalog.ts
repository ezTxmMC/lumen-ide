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
 * The catalogues of every enabled extension server, kept together.
 *
 * “Explore” shows what all servers offer in one list, “Updates” compares the
 * same data with what is installed — so both read from here instead of each
 * fetching on their own.
 */

import { fetchIndex } from './client';
import { extensions } from './manager';
import { isNewer } from './compat/version';
import { normalizeServerUrl } from './trust';
import type { ExtensionServer, ExtensionSummary } from './types';

export interface ServerCatalog {
  loading: boolean;
  error: string | null;
  /** The failure is a network problem (offline, unreachable, timeout), not an answer the server gave. */
  offline: boolean;
  /** The entries come from the last successful fetch, not from this attempt. */
  stale: boolean;
  /** When the entries were fetched (ms since epoch); 0 when never. */
  fetchedAt: number;
  /** Automatic retries made since the last success; 0 when not failing. */
  attempts: number;
  entries: ExtensionSummary[];
}

/** An extension as offered by one server. */
export interface CatalogEntry {
  summary: ExtensionSummary;
  server: ExtensionServer;
}

export interface AvailableUpdate {
  id: string;
  name: string;
  from: string;
  to: string;
  /** The Lumen version the newer release wants, when it names one. */
  minAppVersion?: string;
  server: ExtensionServer;
}

const CACHE_KEY = 'lumen.extensions.catalogCache';
/** Pause before automatic retry n (0-based); the last value repeats. */
const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000];
const MAX_ATTEMPTS = 6;

const listeners = new Set<() => void>();
const catalogs = new Map<string, ServerCatalog>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
let version = 0;
let generation = 0;
let lastServers: readonly ExtensionServer[] = [];
type CatalogCache = Record<string, { fetchedAt: number; entries: ExtensionSummary[]; }>;
let cache: CatalogCache | null = null;

/** The last good catalogue of every server, kept across restarts so the list is there offline. */
function readCache(): CatalogCache {
  if (cache) {
    return cache;
  }
  const loaded: CatalogCache = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.assign(loaded, parsed);
    }
  } catch {
    // Unreadable: start without a cache.
  }
  cache = loaded;
  return loaded;
}

function writeCache(url: string, entries: ExtensionSummary[], fetchedAt: number) {
  const store = readCache();
  store[url] = { fetchedAt, entries };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: the in-memory copy still serves this session.
  }
}

/** A failure of the connection itself, as opposed to a server that answered with an error. */
export function isNetworkError(message: string): boolean {
  return /fetch failed|ERR_|ENOTFOUND|ECONN|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|No answer from|network/i.test(message);
}

function backoffFor(attempt: number): number {
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
}

function clearRetry(url?: string) {
  if (url === undefined) {
    for (const timer of retryTimers.values()) {
      clearTimeout(timer);
    }
    retryTimers.clear();
    return;
  }
  clearTimeout(retryTimers.get(url));
  retryTimers.delete(url);
}

function emit() {
  version++;
  for (const fn of listeners) {
    fn();
  }
}

/** The same server, however the address was written down (trailing slash, case of the host). */
function sameServer(a: string, b: string): boolean {
  const key = (url: string) => {
    try {
      return normalizeServerUrl(url).toLowerCase();
    } catch {
      return url.trim().replace(/\/+$/, '').toLowerCase();
    }
  };
  return key(a) === key(b);
}

/**
 * The server an installed add-on's updates come from, with its catalogue entry.
 *
 * The origin counts. Only an add-on that recorded none (older installs) is
 * looked up on every enabled server, the newest version winning.
 */
function originOf(origin: string, id: string, servers: readonly ExtensionServer[]): { server: ExtensionServer; remote: ExtensionSummary; } | null {
  if (origin) {
    const server = servers.find((candidate) => sameServer(candidate.url, origin));
    const remote = server && catalogs.get(server.url)?.entries.find((entry) => entry.id === id);
    if (!server || !remote) {
      return null;
    }
    return { server, remote };
  }
  let best: { server: ExtensionServer; remote: ExtensionSummary; } | null = null;
  for (const server of servers) {
    const remote = catalogs.get(server.url)?.entries.find((entry) => entry.id === id);
    if (remote && (!best || isNewer(remote.version, best.remote.version))) {
      best = { server, remote };
    }
  }
  return best;
}

async function fetchServer(server: ExtensionServer, run: number) {
  const before = catalogs.get(server.url);
  try {
    const index = await fetchIndex(server.url);
    if (run !== generation) {
      return;
    }
    const fetchedAt = Date.now();
    writeCache(server.url, index.extensions, fetchedAt);
    catalogs.set(server.url, { loading: false, error: null, offline: false, stale: false, fetchedAt, attempts: 0, entries: index.extensions });
  } catch (err) {
    if (run !== generation) {
      return;
    }
    const message = (err as Error).message;
    const attempts = (before?.attempts ?? 0) + 1;
    catalogs.set(server.url, {
      loading: false,
      error: message,
      offline: isNetworkError(message),
      stale: Boolean(before?.entries.length),
      fetchedAt: before?.fetchedAt ?? 0,
      attempts,
      entries: before?.entries ?? [],
    });
    scheduleRetry(server, run, attempts);
  }
  emit();
}

function scheduleRetry(server: ExtensionServer, run: number, attempts: number) {
  if (attempts >= MAX_ATTEMPTS) {
    return;
  }
  clearRetry(server.url);
  retryTimers.set(server.url, setTimeout(() => {
    retryTimers.delete(server.url);
    if (run !== generation) {
      return;
    }
    const current = catalogs.get(server.url);
    if (!current) {
      return;
    }
    catalogs.set(server.url, { ...current, loading: true });
    emit();
    void fetchServer(server, run);
  }, backoffFor(attempts - 1)));
}

if (typeof window !== 'undefined') {
  // Back online: failing servers are asked again at once instead of waiting out the backoff.
  window.addEventListener('online', () => {
    const failing = [...catalogs.values()].some((entry) => entry.error);
    if (failing) {
      void catalog.refresh(lastServers);
    }
  });
}

export const catalog = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  getVersion: () => version,

  of: (url: string): ServerCatalog | undefined => catalogs.get(url),

  /** True while any server is still being asked. */
  loading: () => [...catalogs.values()].some((entry) => entry.loading),

  /**
   * Fetch every enabled server. A later call supersedes an earlier one.
   * A server that cannot be reached keeps its last good catalogue (marked
   * stale) and is retried in the background with growing pauses.
   */
  async refresh(servers: readonly ExtensionServer[]) {
    const run = ++generation;
    clearRetry();
    lastServers = servers;
    const active = servers.filter((server) => !server.disabled);
    for (const url of [...catalogs.keys()]) {
      if (!active.some((server) => server.url === url)) {
        catalogs.delete(url);
      }
    }
    for (const server of active) {
      const known = catalogs.get(server.url);
      const saved = readCache()[server.url];
      catalogs.set(server.url, {
        loading: true,
        error: null,
        offline: false,
        stale: known?.stale ?? false,
        fetchedAt: known?.fetchedAt ?? saved?.fetchedAt ?? 0,
        attempts: 0,
        entries: known?.entries ?? saved?.entries ?? [],
      });
    }
    emit();
    await Promise.all(active.map((server) => fetchServer(server, run)));
  },

  /** Try the failing servers again right away, restarting their backoff. */
  retryNow() {
    return catalog.refresh(lastServers);
  },

  /**
   * Everything on offer, one entry per id.
   *
   * When several servers carry the same id the newest version wins; on a tie
   * the server listed first does, so the order in the server list decides.
   */
  explore(servers: readonly ExtensionServer[]): CatalogEntry[] {
    const best = new Map<string, CatalogEntry>();
    for (const server of servers) {
      for (const summary of catalogs.get(server.url)?.entries ?? []) {
        const known = best.get(summary.id);
        if (known && !isNewer(summary.version, known.summary.version)) {
          continue;
        }
        best.set(summary.id, { summary, server });
      }
    }
    return [...best.values()].sort((a, b) => a.summary.name.localeCompare(b.summary.name));
  },

  /**
   * Installed extensions with a newer version on the server they came from.
   *
   * Only the origin server counts: an update from another one would change
   * who vouches for the extension without anyone being asked.
   */
  updates(servers: readonly ExtensionServer[]): AvailableUpdate[] {
    const out: AvailableUpdate[] = [];
    for (const { manifest, server: origin } of extensions.list()) {
      const found = originOf(origin, manifest.id, servers);
      if (!found) {
        continue;
      }
      const { server, remote } = found;
      if (!isNewer(remote.version, manifest.version)) {
        continue;
      }
      out.push({ id: manifest.id, name: manifest.name, from: manifest.version, to: remote.version, minAppVersion: remote.minAppVersion, server });
    }
    return out;
  },
};
