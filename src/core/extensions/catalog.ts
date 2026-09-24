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
import { isNewer } from './version';
import type { ExtensionServer, ExtensionSummary } from './types';

export interface ServerCatalog {
  loading: boolean;
  error: string | null;
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
  server: ExtensionServer;
}

const listeners = new Set<() => void>();
const catalogs = new Map<string, ServerCatalog>();
let version = 0;
let generation = 0;

function emit() {
  version++;
  for (const fn of listeners) {
    fn();
  }
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

  /** Fetch every enabled server. A later call supersedes an earlier one. */
  async refresh(servers: readonly ExtensionServer[]) {
    const run = ++generation;
    const active = servers.filter((server) => !server.disabled);
    for (const url of [...catalogs.keys()]) {
      if (!active.some((server) => server.url === url)) {
        catalogs.delete(url);
      }
    }
    for (const server of active) {
      catalogs.set(server.url, { loading: true, error: null, entries: catalogs.get(server.url)?.entries ?? [] });
    }
    emit();
    await Promise.all(active.map(async (server) => {
      try {
        const index = await fetchIndex(server.url);
        if (run !== generation) {
          return;
        }
        catalogs.set(server.url, { loading: false, error: null, entries: index.extensions });
      } catch (err) {
        if (run !== generation) {
          return;
        }
        catalogs.set(server.url, { loading: false, error: (err as Error).message, entries: [] });
      }
      emit();
    }));
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
      const server = servers.find((candidate) => candidate.url === origin);
      if (!server) {
        continue;
      }
      const remote = catalogs.get(server.url)?.entries.find((entry) => entry.id === manifest.id);
      if (!remote || !isNewer(remote.version, manifest.version)) {
        continue;
      }
      out.push({ id: manifest.id, name: manifest.name, from: manifest.version, to: remote.version, server });
    }
    return out;
  },
};
