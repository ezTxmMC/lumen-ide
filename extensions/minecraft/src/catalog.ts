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
 * The live version lists behind the template fields, fetched from the
 * official sources and kept in the add-on's storage.
 *
 * Every list is cached with a time stamp. A fresh entry is used as is; an old
 * one triggers a fetch, and when that fails (offline, a source down) the old
 * entry still serves — and without any entry the small defaults in
 * `defaults.ts` do. Only when there is nothing at all does a field show the
 * error with its retry button.
 */

import { DEFAULTS } from './defaults';
import { ARCHITECTURY_GAMES } from './architectury-games';
import {
  apiGameVersions, bungeeEntries, fabricApiFromMaven, fabricApiFromModrinth, forgeGameVersions, gradleReleases,
  isStable, loaderEntries, mavenVersions, metaGameVersions, mojangVersions, neoforgeGameVersions, qfapiFor,
  velocityEntries, versionEntries,
  type ArchitecturyList, type ForgePromotions, type GameVersions, type GradleRelease, type MetaGame, type MetaLoader,
  type MojangManifest, type ModrinthVersion, type VersionEntry,
} from './sources';
import { sortVersions } from './semver';

export interface Net {
  fetchJson<T>(url: string): Promise<T>;
  fetchText(url: string): Promise<string>;
}

export interface Store {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

interface Entry<T> {
  at: number;
  data: T;
}

export const URLS = {
  mojang: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
  fabricGames: 'https://meta.fabricmc.net/v2/versions/game',
  fabricLoaders: 'https://meta.fabricmc.net/v2/versions/loader',
  fabricYarn: (mc: string) => `https://meta.fabricmc.net/v2/versions/yarn/${encodeURIComponent(mc)}`,
  fabricApiMaven: 'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml',
  fabricApiModrinth: (mc: string) => `https://api.modrinth.com/v2/project/fabric-api/version?game_versions=${encodeURIComponent(JSON.stringify([mc]))}&loaders=${encodeURIComponent('["fabric"]')}`,
  quiltGames: 'https://meta.quiltmc.org/v3/versions/game',
  quiltLoaders: 'https://meta.quiltmc.org/v3/versions/loader',
  qfapi: 'https://maven.quiltmc.org/repository/release/org/quiltmc/quilted-fabric-api/quilted-fabric-api/maven-metadata.xml',
  quiltLoom: 'https://maven.quiltmc.org/repository/release/org/quiltmc/loom/maven-metadata.xml',
  neoforge: 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge',
  neoforgeLegacy: 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/forge',
  moddev: 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/moddev/net.neoforged.moddev.gradle.plugin',
  parchment: (mc: string) => `https://maven.parchmentmc.org/org/parchmentmc/data/parchment-${encodeURIComponent(mc)}/maven-metadata.xml`,
  forgePromotions: 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
  forgeMaven: 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
  eventbusValidator: 'https://maven.minecraftforge.net/net/minecraftforge/eventbus-validator/maven-metadata.xml',
  rfg: 'https://nexus.gtnewhorizons.com/repository/public/com/gtnewhorizons/retrofuturagradle/com.gtnewhorizons.retrofuturagradle.gradle.plugin/maven-metadata.xml',
  architecturyGames: 'https://raw.githubusercontent.com/architectury/template-generator/dev/src/minecraft_versions.json',
  architecturyApi: 'https://maven.architectury.dev/dev/architectury/architectury/maven-metadata.xml',
  architecturyApiLegacy: 'https://maven.architectury.dev/me/shedaniel/architectury/maven-metadata.xml',
  architecturyLoom: 'https://maven.architectury.dev/dev/architectury/loom/dev.architectury.loom.gradle.plugin/maven-metadata.xml',
  architecturyLoomNoRemap: 'https://maven.architectury.dev/dev/architectury/loom-no-remap/dev.architectury.loom-no-remap.gradle.plugin/maven-metadata.xml',
  architecturyPlugin: 'https://maven.architectury.dev/architectury-plugin/architectury-plugin.gradle.plugin/maven-metadata.xml',
  paper: 'https://repo.papermc.io/repository/maven-public/io/papermc/paper/paper-api/maven-metadata.xml',
  folia: 'https://repo.papermc.io/repository/maven-public/dev/folia/folia-api/maven-metadata.xml',
  purpurGames: 'https://api.purpurmc.org/v2/purpur',
  purpur: 'https://repo.purpurmc.org/snapshots/org/purpurmc/purpur/purpur-api/maven-metadata.xml',
  leaf: 'https://maven.leafmc.one/snapshots/cn/dreeam/leaf/leaf-api/maven-metadata.xml',
  spigot: 'https://hub.spigotmc.org/nexus/content/repositories/snapshots/org/spigotmc/spigot-api/maven-metadata.xml',
  velocity: 'https://repo.papermc.io/repository/maven-public/com/velocitypowered/velocity-api/maven-metadata.xml',
  bungee: 'https://repo1.maven.org/maven2/net/md-5/bungeecord-api/maven-metadata.xml',
  bungeeSnapshots: 'https://central.sonatype.com/repository/maven-snapshots/net/md-5/bungeecord-api/maven-metadata.xml',
  runPaper: 'https://plugins.gradle.org/m2/xyz/jpenilla/run-paper/xyz.jpenilla.run-paper.gradle.plugin/maven-metadata.xml',
  gradle: 'https://services.gradle.org/versions/all',
} as const;

/** The Maven path of a Gradle plugin marker: `net.fabricmc.fabric-loom` → `net/fabricmc/fabric-loom/net.fabricmc.fabric-loom.gradle.plugin`. */
export function markerPath(plugin: string): string {
  return `${plugin.replace(/\./g, '/')}/${plugin}.gradle.plugin`;
}

/** The server APIs of the Bukkit family and where their versions come from. */
export type ServerApi = 'spigot' | 'paper' | 'folia' | 'purpur' | 'leaf';

const HOUR = 3_600_000;
const PREFIX = 'v2:';

export interface CatalogOptions {
  /** How long a list counts as fresh. */
  ttlHours(): number;
  now?(): number;
}

export class Catalog {
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private net: Net, private store: Store, private options: CatalogOptions) {}

  /* ---------------------------------------------------------------- *
   * The cache
   * ---------------------------------------------------------------- */

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  private read<T>(key: string): Entry<T> | null {
    try {
      return this.store.get<Entry<T> | null>(PREFIX + key, null);
    } catch {
      return null;
    }
  }

  private write(key: string, data: unknown) {
    try {
      this.store.set(PREFIX + key, { at: this.now(), data });
      const keys = this.store.get<string[]>(`${PREFIX}keys`, []);
      if (!keys.includes(key)) { this.store.set(`${PREFIX}keys`, [...keys, key]); }
    } catch {
      // A full store (localStorage quota) only costs the next fetch.
    }
  }

  /**
   * The list under `key`: fresh from the cache, else fetched — and on a
   * failed fetch the stale entry, then `fallback`, before giving up.
   */
  async get<T>(key: string, load: () => Promise<T>, fallback?: () => T | undefined, force = false): Promise<T> {
    const entry = this.read<T>(key);
    const ttl = Math.max(0, this.options.ttlHours()) * HOUR;
    if (entry && !force && this.now() - entry.at < ttl) { return entry.data; }
    const running = this.inflight.get(key);
    if (running) { return running as Promise<T>; }
    const promise = this.load(key, load, entry?.data, fallback);
    this.inflight.set(key, promise);
    return promise;
  }

  /** Runs the loader, caches the result and falls back to stale data or `fallback` on failure. */
  private async load<T>(key: string, load: () => Promise<T>, stale: T | undefined, fallback?: () => T | undefined): Promise<T> {
    try {
      const data = await load();
      this.write(key, data);
      this.errors.delete(key);
      return data;
    } catch (err: unknown) {
      this.errors.set(key, err instanceof Error ? err.message : String(err));
      if (stale !== undefined) { return stale; }
      const spare = fallback?.();
      if (spare !== undefined) { return spare; }
      throw err;
    } finally {
      this.inflight.delete(key);
    }
  }

  /** Forget every cached list. */
  clear() {
    const keys = this.store.get<string[]>(`${PREFIX}keys`, []);
    for (const key of keys) { this.store.set(PREFIX + key, null); }
    this.store.set(`${PREFIX}keys`, []);
  }

  /**
   * Fetch the shared lists afresh (the per-version ones follow on their next
   * use). Returns the sources that could not be reached — their lists stay as
   * they were.
   */
  async refresh(): Promise<string[]> {
    const jobs: [string, string, () => Promise<unknown>][] = [
      ['Mojang', 'mojang', () => this.games(true)],
      ['Fabric', 'fabric-games', () => this.fabricGames(true)],
      ['Fabric Loader', 'fabric-loaders', () => this.fabricLoaders(true)],
      ['Quilt', 'quilt-games', () => this.quiltGames(true)],
      ['NeoForge', 'neoforge', () => this.neoforgeLists(true)],
      ['Forge', 'forge', () => this.forgeLists(true)],
      ['Architectury', 'architectury-games', () => this.architecturyGames(true)],
      ['Paper', 'api-paper', () => this.serverApiList('paper', true)],
      ['Spigot', 'api-spigot', () => this.serverApiList('spigot', true)],
      ['Velocity', 'velocity', () => this.velocity(true)],
      ['BungeeCord', 'bungee', () => this.bungee(true)],
      ['Gradle', 'gradle', () => this.gradleReleases(true)],
    ];
    // The per-version lists (`fabric-api@1.21.1` …) are dropped and fetched again on next use.
    const keys = this.store.get<string[]>(`${PREFIX}keys`, []);
    for (const key of keys.filter((k) => k.includes('@'))) { this.store.set(PREFIX + key, null); }
    await Promise.all(jobs.map(([, , job]) => job().catch(() => undefined)));
    return jobs.filter(([, key]) => this.errors.has(key)).map(([label, key]) => `${label}: ${this.errors.get(key)}`);
  }

  /** The last failure per list, cleared by the next success. */
  private errors = new Map<string, string>();

  private fetchText(url: string): Promise<string> {
    return this.net.fetchText(url);
  }

  private fetchJson<T>(url: string): Promise<T> {
    return this.net.fetchJson<T>(url);
  }

  private mavenList(key: string, url: string, force = false, fallback?: () => string[] | undefined): Promise<string[]> {
    return this.get(key, async () => mavenVersions(await this.fetchText(url)), fallback, force);
  }

  /* ---------------------------------------------------------------- *
   * Minecraft
   * ---------------------------------------------------------------- */

  games(force = false): Promise<GameVersions> {
    return this.get('mojang', async () => mojangVersions(await this.fetchJson<MojangManifest>(URLS.mojang)), () => DEFAULTS.games, force);
  }

  /* ---------------------------------------------------------------- *
   * Fabric and Quilt
   * ---------------------------------------------------------------- */

  fabricGames(force = false): Promise<GameVersions> {
    return this.get('fabric-games', async () => metaGameVersions(await this.fetchJson<MetaGame[]>(URLS.fabricGames)), () => ({ releases: DEFAULTS.games.releases, snapshots: [] }), force);
  }

  fabricLoaders(force = false): Promise<VersionEntry[]> {
    return this.get('fabric-loaders', async () => loaderEntries(await this.fetchJson<MetaLoader[]>(URLS.fabricLoaders)), () => DEFAULTS.fabricLoaders, force);
  }

  /** Fabric API for a version: Modrinth knows the exact game versions; Fabric's Maven is the fallback. */
  fabricApi(mc: string): Promise<VersionEntry[]> {
    return this.get(`fabric-api@${mc}`, async () => {
      try {
        const list = fabricApiFromModrinth(await this.fetchJson<ModrinthVersion[]>(URLS.fabricApiModrinth(mc)), mc);
        if (list.length) { return list; }
      } catch {
        // Modrinth out of reach — Fabric's own Maven follows.
      }
      return fabricApiFromMaven(await this.mavenList('fabric-api-maven', URLS.fabricApiMaven), mc);
    }, () => DEFAULTS.fabricApi[mc]);
  }

  yarn(mc: string): Promise<VersionEntry[]> {
    return this.get(`yarn@${mc}`, async () => {
      const list = await this.fetchJson<{ version: string; }[]>(URLS.fabricYarn(mc));
      return list.map((y, i) => ({ version: y.version, badge: i === 0 ? 'latest' : undefined }));
    });
  }

  /** Loom versions for the plugin id — the remapping and the plain plugin have their own markers. */
  loom(plugin: string): Promise<VersionEntry[]> {
    return this.get(`loom@${plugin}`, async () => {
      const all = mavenVersions(await this.fetchText(`https://maven.fabricmc.net/${markerPath(plugin)}/maven-metadata.xml`));
      return versionEntries(all.filter((v) => !v.endsWith('-SNAPSHOT')));
    }, () => DEFAULTS.loom);
  }

  quiltGames(force = false): Promise<GameVersions> {
    return this.get('quilt-games', async () => metaGameVersions(await this.fetchJson<MetaGame[]>(URLS.quiltGames)), () => ({ releases: DEFAULTS.games.releases, snapshots: [] }), force);
  }

  quiltLoaders(): Promise<VersionEntry[]> {
    return this.get('quilt-loaders', async () => loaderEntries((await this.fetchJson<MetaLoader[]>(URLS.quiltLoaders)).map((l) => ({ version: l.version, stable: isStable(l.version) }))), () => DEFAULTS.quiltLoaders);
  }

  async qfapi(mc: string): Promise<VersionEntry[]> {
    return qfapiFor(await this.mavenList('qfapi', URLS.qfapi, false, () => []), mc);
  }

  quiltLoom(): Promise<VersionEntry[]> {
    return this.get('quilt-loom', async () => versionEntries(mavenVersions(await this.fetchText(URLS.quiltLoom)).filter(isStable)), () => DEFAULTS.quiltLoom);
  }

  /* ---------------------------------------------------------------- *
   * NeoForge
   * ---------------------------------------------------------------- */

  neoforgeLists(force = false): Promise<{ all: string[]; legacy: string[]; }> {
    return this.get('neoforge', async () => {
      const [all, legacy] = await Promise.all([
        this.fetchJson<{ versions: string[]; }>(URLS.neoforge),
        this.fetchJson<{ versions: string[]; }>(URLS.neoforgeLegacy),
      ]);
      return { all: all.versions, legacy: legacy.versions };
    }, () => DEFAULTS.neoforge, force);
  }

  async neoforgeGames(): Promise<string[]> {
    const { all, legacy } = await this.neoforgeLists();
    return neoforgeGameVersions(all, legacy);
  }

  moddev(): Promise<VersionEntry[]> {
    return this.get('moddev', async () => versionEntries((await this.fetchJson<{ versions: string[]; }>(URLS.moddev)).versions), () => DEFAULTS.moddev);
  }

  parchment(mc: string): Promise<VersionEntry[]> {
    return this.get(`parchment@${mc}`, async () => versionEntries(mavenVersions(await this.fetchText(URLS.parchment(mc))).filter((v) => !v.includes('nightly'))));
  }

  /* ---------------------------------------------------------------- *
   * Forge
   * ---------------------------------------------------------------- */

  forgeLists(force = false): Promise<{ all: string[]; promos: ForgePromotions; }> {
    return this.get('forge', async () => {
      const [xml, promos] = await Promise.all([
        this.fetchText(URLS.forgeMaven),
        this.fetchJson<{ promos: ForgePromotions; }>(URLS.forgePromotions),
      ]);
      // Only what a template can use: 1.7.10 and newer.
      const all = mavenVersions(xml).filter((v) => !/^1\.([0-6])(\.|-)|^1\.7\.[0-9]-|^1\.7-/.test(v));
      return { all, promos: promos.promos };
    }, () => DEFAULTS.forge, force);
  }

  async forgeGames(): Promise<string[]> {
    return forgeGameVersions((await this.forgeLists()).promos);
  }

  eventbusValidator(): Promise<VersionEntry[]> {
    return this.get('eventbus-validator', async () => versionEntries(mavenVersions(await this.fetchText(URLS.eventbusValidator))), () => DEFAULTS.eventbusValidator);
  }

  rfg(): Promise<VersionEntry[]> {
    return this.get('rfg', async () => versionEntries(mavenVersions(await this.fetchText(URLS.rfg)).filter(isStable)), () => DEFAULTS.rfg);
  }

  /* ---------------------------------------------------------------- *
   * Architectury
   * ---------------------------------------------------------------- */

  architecturyGames(force = false): Promise<ArchitecturyList> {
    return this.get('architectury-games', () => this.fetchJson<ArchitecturyList>(URLS.architecturyGames), () => ARCHITECTURY_GAMES, force);
  }

  architecturyApi(legacy: boolean): Promise<string[]> {
    return legacy
      ? this.mavenList('architectury-api-legacy', URLS.architecturyApiLegacy, false, () => DEFAULTS.architecturyApi)
      : this.mavenList('architectury-api', URLS.architecturyApi, false, () => DEFAULTS.architecturyApi);
  }

  /** Architectury Loom — the plugin without remapping (26.x) has a marker of its own. */
  architecturyLoom(noRemap: boolean): Promise<VersionEntry[]> {
    if (noRemap) { return this.get('architectury-loom-no-remap', async () => versionEntries(mavenVersions(await this.fetchText(URLS.architecturyLoomNoRemap)).filter(isStable)), () => DEFAULTS.architecturyLoomNoRemap); }
    return this.get('architectury-loom', async () => versionEntries(mavenVersions(await this.fetchText(URLS.architecturyLoom)).filter(isStable)), () => DEFAULTS.architecturyLoom);
  }

  architecturyPlugin(): Promise<VersionEntry[]> {
    return this.get('architectury-plugin', async () => versionEntries(mavenVersions(await this.fetchText(URLS.architecturyPlugin)).filter(isStable)), () => DEFAULTS.architecturyPlugin);
  }

  /* ---------------------------------------------------------------- *
   * Server APIs
   * ---------------------------------------------------------------- */

  serverApiList(api: ServerApi, force = false): Promise<string[]> {
    const url = URLS[api];
    return this.mavenList(`api-${api}`, url, force, () => DEFAULTS.serverApis[api]);
  }

  /** Minecraft versions a server API is published for. */
  async serverApiGames(api: ServerApi): Promise<string[]> {
    const listed = apiGameVersions(await this.serverApiList(api));
    if (api === 'paper') { return sortVersions([...listed, '1.16.5']); }
    if (api !== 'purpur') { return listed; }
    // Purpur's metadata lists only the new builds; its API names every version.
    const games = await this.get('purpur-games', async () => (await this.fetchJson<{ versions: string[]; }>(URLS.purpurGames)).versions, () => DEFAULTS.purpurGames);
    return sortVersions([...listed, ...games]);
  }

  velocity(force = false): Promise<VersionEntry[]> {
    return this.get('velocity', async () => velocityEntries(mavenVersions(await this.fetchText(URLS.velocity))), () => DEFAULTS.velocity, force);
  }

  bungee(force = false): Promise<VersionEntry[]> {
    return this.get('bungee', async () => {
      const releases = mavenVersions(await this.fetchText(URLS.bungee));
      const snapshots = await this.fetchText(URLS.bungeeSnapshots).then(mavenVersions, () => []);
      return bungeeEntries(releases, snapshots);
    }, () => DEFAULTS.bungee, force);
  }

  runPaper(): Promise<VersionEntry[]> {
    return this.get('run-paper', async () => versionEntries(mavenVersions(await this.fetchText(URLS.runPaper)).filter(isStable)), () => DEFAULTS.runPaper);
  }

  /* ---------------------------------------------------------------- *
   * Gradle
   * ---------------------------------------------------------------- */

  gradleReleases(force = false): Promise<string[]> {
    return this.get('gradle', async () => gradleReleases(await this.fetchJson<GradleRelease[]>(URLS.gradle)), () => DEFAULTS.gradle, force);
  }
}
