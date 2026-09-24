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
 * Turning what the version sources answer into version lists — pure, so each
 * rule is tested against recorded answers. Fetching happens in `catalog.ts`.
 */

import {
  fabricApiMatches, isBuildVersion, neoforgeMinecraft, qfapiMatches,
} from './eras';
import { compareVersions, isRelease, mcAtLeast, sortVersions } from './semver';

/* ------------------------------------------------------------------ *
 * Maven
 * ------------------------------------------------------------------ */

/** Every `<version>` of a maven-metadata.xml, in file order. */
export function mavenVersions(xml: string): string[] {
  return Array.from(xml.matchAll(/<version>\s*([^<\s]+)\s*<\/version>/g), (m) => m[1]);
}

const UNSTABLE = /alpha|beta|snapshot|rc|pre|experimental|nightly|dev/i;

export const isStable = (version: string) => !UNSTABLE.test(version);

/* ------------------------------------------------------------------ *
 * Mojang
 * ------------------------------------------------------------------ */

export interface MojangManifest {
  latest?: { release?: string; snapshot?: string; };
  versions: { id: string; type: string; releaseTime?: string; }[];
}

export interface GameVersions {
  /** Releases from 1.7.10 on, newest first. */
  releases: string[];
  /** Snapshots, pre-releases and candidates newer than the newest release, newest first. */
  snapshots: string[];
}

/** The oldest version any template supports. */
export const OLDEST = '1.7.10';

export function mojangVersions(manifest: MojangManifest): GameVersions {
  const releases: string[] = [];
  const snapshots: string[] = [];
  // The manifest lists newest first; snapshots count until the first release.
  let beforeRelease = true;
  for (const entry of manifest.versions) {
    if (entry.type === 'release') {
      beforeRelease = false;
      if (isRelease(entry.id) && mcAtLeast(entry.id, OLDEST)) { releases.push(entry.id); }
      continue;
    }
    if (entry.type === 'snapshot' && beforeRelease) { snapshots.push(entry.id); }
  }
  return { releases, snapshots };
}

/* ------------------------------------------------------------------ *
 * Fabric and Quilt
 * ------------------------------------------------------------------ */

export interface MetaGame { version: string; stable: boolean; }
export interface MetaLoader { version: string; stable?: boolean; }

/** Stable versions of a meta list (`/v2/versions/game`), and unstable ones newer than the newest stable. */
export function metaGameVersions(list: MetaGame[]): GameVersions {
  const releases = list.filter((g) => g.stable && isRelease(g.version)).map((g) => g.version);
  const snapshots: string[] = [];
  for (const game of list) {
    if (game.stable) { break; }
    snapshots.push(game.version);
  }
  return { releases, snapshots };
}

export interface VersionEntry {
  version: string;
  /** latest, recommended, beta, alpha … — a key of `badge.*`. */
  badge?: string;
}

/** Loader versions newest first; the first stable one is `latest`, unstable ones `beta`. */
export function loaderEntries(list: MetaLoader[]): VersionEntry[] {
  const versions = list.map((l) => ({ version: l.version, stable: l.stable ?? isStable(l.version) }));
  const sorted = [...versions].sort((a, b) => compareVersions(b.version, a.version));
  const latest = sorted.find((v) => v.stable)?.version;
  return sorted.map((v) => ({ version: v.version, badge: badgeOf(v.version, v.stable, latest) }));
}

function badgeOf(version: string, stable: boolean, latest: string | undefined): string | undefined {
  if (version === latest) { return 'latest'; }
  if (stable) { return undefined; }
  return prereleaseBadge(version);
}

/** `alpha`, `beta`, `snapshot` … from the version string itself. */
export function prereleaseBadge(version: string): string {
  const lower = version.toLowerCase();
  if (lower.includes('alpha')) { return 'alpha'; }
  if (lower.includes('snapshot')) { return 'snapshot'; }
  if (lower.includes('experimental')) { return 'experimental'; }
  return 'beta';
}

/** Versions newest first; the newest stable one is `latest`, unstable ones carry their kind. */
export function versionEntries(versions: string[], stable: (v: string) => boolean = isStable): VersionEntry[] {
  const sorted = sortVersions(versions);
  const latest = sorted.find(stable);
  return sorted.map((version) => ({ version, badge: badgeOf(version, stable(version), latest) }));
}

export interface ModrinthVersion {
  version_number: string;
  version_type: 'release' | 'beta' | 'alpha';
  game_versions: string[];
  loaders: string[];
  date_published?: string;
}

/** Fabric API builds from Modrinth's answer, already filtered to the version. */
export function fabricApiFromModrinth(list: ModrinthVersion[], mc: string): VersionEntry[] {
  const fitting = list.filter((v) => v.game_versions.includes(mc));
  return versionEntries(fitting.map((v) => v.version_number), (v) => fitting.find((f) => f.version_number === v)?.version_type === 'release');
}

/** The same from Fabric's Maven, by the branch in the build suffix. */
export function fabricApiFromMaven(all: string[], mc: string): VersionEntry[] {
  return versionEntries(all.filter((v) => fabricApiMatches(v, mc)), (v) => !/pre|alpha|beta|rc/i.test(v.split('+')[0]));
}

export function qfapiFor(all: string[], mc: string): VersionEntry[] {
  return versionEntries(all.filter((v) => qfapiMatches(v, mc)));
}

/* ------------------------------------------------------------------ *
 * NeoForge
 * ------------------------------------------------------------------ */

/** Minecraft versions with NeoForge builds. 1.20.1 comes from the legacy `net.neoforged:forge` list. */
export function neoforgeGameVersions(all: string[], legacy: string[]): string[] {
  const found = new Set<string>();
  for (const version of all) {
    const mc = neoforgeMinecraft(version);
    if (mc) { found.add(mc); }
  }
  if (legacy.some((v) => v.startsWith('1.20.1-'))) { found.add('1.20.1'); }
  return sortVersions(found);
}

/** NeoForge builds for a version, newest first — plain versions, or `1.20.1-47.1.x` for the legacy fork. */
export function neoforgeFor(all: string[], legacy: string[], mc: string): VersionEntry[] {
  if (mc === '1.20.1') { return versionEntries(legacy.filter((v) => v.startsWith('1.20.1-'))); }
  return versionEntries(all.filter((v) => neoforgeMinecraft(v) === mc));
}

/* ------------------------------------------------------------------ *
 * Forge
 * ------------------------------------------------------------------ */

export type ForgePromotions = Record<string, string>;

/** Minecraft versions Forge has promoted builds for. */
export function forgeGameVersions(promos: ForgePromotions): string[] {
  const found = new Set<string>();
  for (const key of Object.keys(promos)) {
    const mc = key.replace(/-(latest|recommended)$/, '');
    if (isRelease(mc)) { found.add(mc); }
  }
  return sortVersions(found);
}

/**
 * Forge builds for a version from the Maven list (`1.20.1-47.4.23`,
 * `1.7.10-10.13.4.1614-1.7.10`) — the build number alone, newest first, with
 * the promotions as badges.
 */
export function forgeFor(all: string[], promos: ForgePromotions, mc: string): VersionEntry[] {
  const prefix = `${mc}-`;
  const builds = all
    .filter((v) => v.startsWith(prefix))
    .map((v) => v.slice(prefix.length).split('-')[0])
    .filter((v) => /^\d+(\.\d+)+$/.test(v));
  const recommended = promos[`${mc}-recommended`];
  const latest = promos[`${mc}-latest`];
  return sortVersions(builds).map((version) => ({ version, badge: forgeBadge(version, recommended, latest) }));
}

function forgeBadge(version: string, recommended: string | undefined, latest: string | undefined): string | undefined {
  if (version === recommended) { return 'recommended'; }
  if (version === latest) { return 'latest'; }
  return undefined;
}

/** The Maven version of a Forge build — old ones carry a branch suffix (`…-1.7.10`). */
export function forgeMavenVersion(all: string[], mc: string, build: string): string {
  const exact = `${mc}-${build}`;
  return all.find((v) => v === exact || v.startsWith(`${exact}-`)) ?? exact;
}

/* ------------------------------------------------------------------ *
 * Paper and its family, Spigot
 * ------------------------------------------------------------------ */

/** Minecraft versions of an API list: `1.21.11-R0.1-SNAPSHOT` and `26.2.build.128-stable` both count. */
export function apiGameVersions(all: string[]): string[] {
  const found = new Set<string>();
  for (const version of all) {
    const mc = apiMinecraft(version);
    if (mc) { found.add(mc); }
  }
  return sortVersions(found);
}

/** The release a server API version is for, null for pre-releases and odd builds. */
export function apiMinecraft(version: string): string | null {
  const build = /^(\d+\.\d+(?:\.\d+)?)\.build\.\d+/.exec(version);
  if (build) { return build[1]; }
  const snapshot = /^(\d+\.\d+(?:\.\d+)?)-R\d+\.\d+-SNAPSHOT$/.exec(version);
  if (snapshot) { return snapshot[1]; }
  return null;
}

/**
 * The API versions for a Minecraft version, newest first: builds of the new
 * scheme with their channel as badge, or the one `-R0.x-SNAPSHOT`.
 */
export function apiVersionsFor(all: string[], mc: string): VersionEntry[] {
  const fitting = all.filter((v) => apiMinecraft(v) === mc);
  const builds = fitting.filter(isBuildVersion);
  if (builds.length) { return versionEntries(builds, (v) => /-stable$/.test(v)); }
  return sortVersions(fitting).map((version, i) => ({ version, badge: i === 0 ? 'latest' : undefined }));
}

/* ------------------------------------------------------------------ *
 * Proxies
 * ------------------------------------------------------------------ */

/** Velocity API: releases newest first, then the snapshot of each line that has no release yet. */
export function velocityEntries(all: string[]): VersionEntry[] {
  const releases = all.filter((v) => isRelease(v) && !v.startsWith('2.'));
  const released = new Set(releases);
  const snapshots = all.filter((v) => v.endsWith('-SNAPSHOT') && !released.has(v.replace(/-SNAPSHOT$/, '')));
  const newestRelease = sortVersions(releases)[0];
  const aheadOfReleases = snapshots.filter((v) => newestRelease && compareVersions(v.replace(/-SNAPSHOT$/, ''), newestRelease) > 0);
  return versionEntries([...releases, ...aheadOfReleases], (v) => !v.endsWith('-SNAPSHOT'));
}

/** BungeeCord API: Maven Central releases and the snapshots of lines not released yet. */
export function bungeeEntries(releases: string[], snapshots: string[]): VersionEntry[] {
  const lines = new Set(releases.map((v) => v.split('-')[0]));
  const ahead = snapshots.filter((v) => !lines.has(v.split('-')[0]));
  return versionEntries([...releases, ...ahead], (v) => !v.endsWith('-SNAPSHOT'));
}

/* ------------------------------------------------------------------ *
 * Architectury
 * ------------------------------------------------------------------ */

/** One entry of the template generator's `minecraft_versions.json`. */
export interface ArchitecturyGame {
  version: string;
  java_version: number;
  unobfuscated?: boolean;
  /** Whether the generator offers Quilt for the version (unused here). */
  quilt?: boolean;
  architectury: { api_version?: string; package?: string; maven_group?: string; };
  fabric?: { fabric_api_branch?: string; fabric_api_mod_id?: string; };
  forge?: { major_version: number; pack_version: number; server_pack_version?: [string, string]; };
  neoforge?: { loader_major_version: string; neoforge_major_version: string; yarn_patch_version?: string; };
}

export interface ArchitecturyList {
  latest_version: string;
  versions: ArchitecturyGame[];
}

/** Architectury API builds for a version: the major from the generator's table, newest first. */
export function architecturyApiFor(all: string[], game: ArchitecturyGame): VersionEntry[] {
  const api = game.architectury.api_version;
  if (!api) { return []; }
  return versionEntries(all.filter((v) => v.startsWith(`${api}.`)));
}

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

export interface GradleRelease {
  version: string;
  snapshot?: boolean;
  nightly?: boolean;
  releaseNightly?: boolean;
  broken?: boolean;
  rcFor?: string;
  milestoneFor?: string;
}

/** Final, unbroken Gradle releases from services.gradle.org/versions/all, newest first. */
export function gradleReleases(list: GradleRelease[]): string[] {
  return sortVersions(list
    .filter((g) => !g.snapshot && !g.nightly && !g.releaseNightly && !g.broken && !g.rcFor && !g.milestoneFor)
    .map((g) => g.version)
    .filter(isRelease));
}

/* ------------------------------------------------------------------ *
 * Intersections
 * ------------------------------------------------------------------ */

/**
 * The versions a platform offers, in the order of Mojang's releases when that
 * list is known — it drops what Mojang never released (`1.21.5-no-moonrise`).
 */
export function supportedReleases(mojang: string[] | null, platform: string[], filter: (mc: string) => boolean = () => true): string[] {
  const available = new Set(platform.filter(isRelease));
  const base = mojang && mojang.length ? mojang.filter((mc) => available.has(mc)) : sortVersions(available);
  return base.filter(filter);
}
