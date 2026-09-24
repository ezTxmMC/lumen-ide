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
 * What changes with the Minecraft version: the Java release, the build
 * toolchain per platform, the APIs the example code may use, pack formats and
 * version syntax. Pure — no network, no Lumen — so every rule has a test.
 *
 * Where the numbers come from (checked 23.09.2026):
 *  - Java: the `javaVersion` of every version JSON in Mojang's piston-meta.
 *  - Forge: the MDK of the newest build per Minecraft version
 *    (maven.minecraftforge.net …/forge-<v>-mdk.zip) — its ForgeGradle and
 *    Gradle wrapper, pack format and loader range.
 *  - NeoForge: the MDKs under github.com/NeoForgeMDKs (ModDevGradle and the
 *    legacy plugin for 1.20.1).
 *  - Fabric: fabricmc.net's template generator (one Loom, Gradle 9.7.1, the
 *    feature cut-offs for slf4j, split sources and data generation).
 *  - Architectury: architectury/template-generator (Gradle 9.5.1).
 *  - RetroFuturaGradle: GTNewHorizons' example (Gradle 9.5.0; Forge builds pinned).
 */

import { compareVersions, isRelease, mcAtLeast, mcBetween, mcParts } from './semver';

/* ------------------------------------------------------------------ *
 * Java and obfuscation
 * ------------------------------------------------------------------ */

/** The Java release Mojang ships for this version: 8 ≤ 1.16.5, 16 for 1.17, 17 up to 1.20.4, 21 up to 1.21.11, 25 from 26.1. */
export function javaFor(mc: string): number {
  const [major, minor, patch] = mcParts(mc);
  if (major >= 26) { return 25; }
  if (minor <= 16) { return 8; }
  if (minor === 17) { return 16; }
  if (minor < 20) { return 17; }
  if (minor === 20 && patch <= 4) { return 17; }
  return 21;
}

/** From 26.1 Mojang ships Minecraft without obfuscation — no mappings, no remapping. */
export function isUnobfuscated(mc: string): boolean {
  return mcParts(mc)[0] >= 26;
}

/** Mixin's compatibility level for the Java release. */
export function mixinLevel(mc: string): string {
  return `JAVA_${javaFor(mc)}`;
}

/** `26.2` → `[26.2,26.3)`, `1.21.11` → `[1.21.11,1.21.12)` — the mod works on this version alone. */
export function mcRange(mc: string): string {
  const parts = mc.split('.');
  const last = parts.length - 1;
  const next = [...parts.slice(0, last), String(Number(parts[last]) + 1)].join('.');
  return `[${mc},${next})`;
}

/** The next patch release after `mc`: `26.2` → `26.2.1`, `1.21.11` → `1.21.12`. */
export function nextPatch(mc: string): string {
  const [major, minor, patch] = mcParts(mc);
  return `${major}.${minor}.${patch + 1}`;
}

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

/**
 * The Gradle versions offered for a toolchain: every stable release from the
 * recommended one up to (excluding) the next major — a toolchain made for
 * Gradle 8 does not survive Gradle 9. Newest first, the recommended one included.
 */
export function gradleChoicesFrom(releases: string[], recommended: string): string[] {
  const major = mcParts(recommended)[0];
  const fitting = releases.filter((v) => isRelease(v) && mcParts(v)[0] === major && compareVersions(v, recommended) >= 0);
  return [...new Set([...fitting, recommended])].sort((a, b) => compareVersions(b, a));
}

/** The foojay toolchain resolver that fits the Gradle major (1.0 needs Gradle 9). */
export function foojayFor(gradle: string): string {
  return mcParts(gradle)[0] >= 9 ? '1.0.0' : '0.10.0';
}

/**
 * The JDK Gradle itself runs on (`gradle-daemon-jvm.properties`): 21 serves
 * Gradle 8.5 to 9 and every plugin here except Fabric Loom 1.18+, which only
 * loads on 25.
 */
export const DAEMON_JAVA = 21;
export const LOOM_DAEMON_JAVA = 25;
/** RetroFuturaGradle 2.0 is compiled for Java 25 as well. */
export const RFG_DAEMON_JAVA = 25;

export function loomDaemonJava(loom: string): number {
  return compareVersions(loom, '1.18') >= 0 ? LOOM_DAEMON_JAVA : DAEMON_JAVA;
}

/* ------------------------------------------------------------------ *
 * Fabric and Quilt
 * ------------------------------------------------------------------ */

export const FABRIC_GRADLE = '9.7.1';
export const QUILT_GRADLE = '9.2.1';

/** Fabric's generator starts at 1.14.4 — the versions before need v1 Yarn and Mojang published no mappings for them. */
export function fabricSupports(mc: string): boolean {
  return mcAtLeast(mc, '1.14.4');
}

/** Quilt's templates cover 1.18.2 to 1.21.x; Quilt Loom cannot build the unobfuscated 26.x. */
export function quiltSupports(mc: string): boolean {
  return mcBetween(mc, '1.18.2', '1.21.11');
}

export interface FabricFeatures {
  /** slf4j's logger; log4j before 1.18. */
  slf4j: boolean;
  /** Separate client sources (`src/client`). */
  splitSources: boolean;
  /** The datagen entrypoint of the Fabric API. */
  datagen: boolean;
  /** Server lifecycle events (fabric-lifecycle-events-v1). */
  listener: boolean;
  /** The /hello example: command API v2 and `sendSuccess(Supplier, …)` exist. */
  command: boolean;
}

export function fabricFeatures(mc: string): FabricFeatures {
  return {
    slf4j: mcAtLeast(mc, '1.18'),
    splitSources: mcAtLeast(mc, '1.19'),
    datagen: mcAtLeast(mc, '1.17'),
    listener: mcAtLeast(mc, '1.16'),
    command: mcAtLeast(mc, '1.20'),
  };
}

/** The Loom plugin id: without remapping for the unobfuscated versions. */
export function loomPluginId(mc: string): string {
  return isUnobfuscated(mc) ? 'net.fabricmc.fabric-loom' : 'net.fabricmc.fabric-loom-remap';
}

/** The mod id of the Fabric API in fabric.mod.json: `fabric` before API 0.59. */
export function fabricApiModId(apiVersion: string): string {
  const minor = Number(apiVersion.split('.')[1]);
  return Number.isFinite(minor) && minor < 59 ? 'fabric' : 'fabric-api';
}

/**
 * The branch suffix of Fabric API builds for a version (`0.42.0+1.16`): the
 * minor line up to 1.17, `1.18` for 1.18/1.18.1, the exact version after that.
 * Used when Modrinth is out of reach and the Maven list has to do.
 */
export function fabricApiBranch(mc: string): string {
  const [major, minor, patch] = mcParts(mc);
  if (major >= 26) { return mc; }
  if (minor <= 17) { return `1.${minor}`; }
  if (minor === 18 && patch < 2) { return '1.18'; }
  return mc;
}

/** Does a Fabric API version belong to this Minecraft version? */
export function fabricApiMatches(apiVersion: string, mc: string): boolean {
  const branch = fabricApiBranch(mc);
  if (mc === '1.18') { return apiVersion === '0.44.0+1.18'; }
  return apiVersion.endsWith(`+${branch}`) || apiVersion.endsWith(`-${branch}`);
}

/** Quilted Fabric API builds end in the Minecraft version: `7.7.0+0.92.2-1.20.1`. */
export function qfapiMatches(version: string, mc: string): boolean {
  return version.endsWith(`-${mc}`);
}

/* ------------------------------------------------------------------ *
 * NeoForge
 * ------------------------------------------------------------------ */

export const NEOFORGE_GRADLE = '9.2.1';

/** NeoForge's version scheme: 1.21.1 → `21.1.`, 1.21 → `21.0.`, 26.2 → `26.2.0.`, 26.1.2 → `26.1.2.` */
export function neoforgePrefix(mc: string): string {
  const [major, minor, patch] = mcParts(mc);
  if (major >= 26) { return `${major}.${minor}.${patch}.`; }
  return `${minor}.${patch}.`;
}

/** The Minecraft version of a NeoForge build — the inverse of `neoforgePrefix`; null for oddities (`0.25w14craftmine.3-beta`). */
export function neoforgeMinecraft(version: string): string | null {
  const parts = version.split('-')[0].split('.').map(Number);
  if (parts.some((p) => !Number.isInteger(p))) { return null; }
  if (parts[0] >= 26 && parts.length >= 4) { return parts[2] ? `${parts[0]}.${parts[1]}.${parts[2]}` : `${parts[0]}.${parts[1]}`; }
  if (parts[0] >= 20 && parts[0] < 26 && parts.length === 3) { return parts[1] ? `1.${parts[0]}.${parts[1]}` : `1.${parts[0]}`; }
  return null;
}

export type NeoToolchain =
  /** ModDevGradle Legacy with `net.neoforged:forge` — the 1.20.1 fork of Forge. */
  | { plugin: 'mdg-legacy'; gradle: string; }
  | { plugin: 'mdg'; gradle: string; };

/**
 * How a NeoForge mod builds. 1.20.2 and 1.20.3 are left out: ModDevGradle has
 * no MDK for them (only the retired NeoGradle does).
 */
export function neoToolchain(mc: string): NeoToolchain | null {
  if (mc === '1.20.1') { return { plugin: 'mdg-legacy', gradle: NEOFORGE_GRADLE }; }
  if (!mcAtLeast(mc, '1.20.4')) { return null; }
  return { plugin: 'mdg', gradle: NEOFORGE_GRADLE };
}

export interface NeoFeatures {
  /** `neoforge.mods.toml` from 20.5, `mods.toml` before. */
  metadataFile: string;
  /** The mod constructor also receives the ModContainer (20.5+). */
  modContainer: boolean;
  /** A separate client class with `@Mod(dist = Dist.CLIENT)` (as in the 1.21.1+ MDKs). */
  clientClass: boolean;
  /** Data generation is `clientData()` and `GatherDataEvent.Client` from 1.21.4. */
  clientData: boolean;
  /** The 1.20.1 fork keeps Forge's packages (`net.minecraftforge`). */
  legacy: boolean;
}

export function neoFeatures(mc: string): NeoFeatures {
  return {
    metadataFile: mcAtLeast(mc, '1.20.5') ? 'neoforge.mods.toml' : 'mods.toml',
    modContainer: mcAtLeast(mc, '1.20.5'),
    clientClass: mcAtLeast(mc, '1.21.1'),
    clientData: mcAtLeast(mc, '1.21.4'),
    legacy: mc === '1.20.1',
  };
}

/* ------------------------------------------------------------------ *
 * Forge
 * ------------------------------------------------------------------ */

export type ForgeCode = 'fml-1.7' | 'fml-1.12' | 'classic' | 'eventbus7';

export interface ForgeToolchain {
  /** RetroFuturaGradle, ModDevGradle Legacy, ForgeGradle 6 or ForgeGradle 7. */
  plugin: 'rfg' | 'mdg-legacy' | 'fg6' | 'fg7';
  /** The recommended Gradle. */
  gradle: string;
  code: ForgeCode;
  /** Remapping the jar to SRG names — needed up to 1.20.4; later Forge runs on Mojang's names. */
  reobf: boolean;
}

/** The Forge build RetroFuturaGradle is pinned to. */
export const RFG_FORGE: Record<string, string> = {
  '1.7.10': '10.13.4.1614',
  '1.12.2': '14.23.5.2847',
};

/**
 * Versions whose newest MDK builds with ForgeGradle 6. The MDKs ship Gradle
 * 8.4 to 8.12.1; the last Gradle 8 (8.14.5) builds them as well and, unlike
 * those, can start on a current JDK through the daemon toolchain.
 */
const FG6 = new Set(['1.16.5', '1.18.2', '1.19.2', '1.19.4', '1.20', '1.20.1', '1.20.2', '1.20.3', '1.20.4', '1.21', '1.21.6', '1.21.7', '1.21.9']);
export const FG6_GRADLE = '8.14.5';

/**
 * Versions Forge left on ForgeGradle 5 (Gradle 7), which ModDevGradle Legacy
 * — NeoForged's plugin for Forge 1.17 to 1.20.1 — builds on Gradle 9.
 */
const MDG_LEGACY = new Set(['1.17.1', '1.18', '1.18.1', '1.19', '1.19.1', '1.19.3']);

/** ForgeGradle 7 per version (its MDK's Gradle); later versions take the newest entry's Gradle. */
const FG7: Record<string, string> = {
  '1.20.6': '9.3.1',
  '1.21.1': '9.3.1',
  '1.21.3': '9.3.1',
  '1.21.4': '9.3.1',
  '1.21.5': '9.3.1',
  '1.21.8': '9.3.1',
  '1.21.10': '9.3.1',
  '1.21.11': '9.5.0',
  '26.1': '9.3.1',
  '26.1.1': '9.3.1',
  '26.1.2': '9.5.0',
  '26.2': '9.5.0',
  '26.3': '9.7.1',
};

const FG7_LATEST = '26.3';

function forgeCode(mc: string): ForgeCode {
  if (mc === '1.7.10') { return 'fml-1.7'; }
  if (mc === '1.12.2') { return 'fml-1.12'; }
  if (mcAtLeast(mc, '1.21.6')) { return 'eventbus7'; }
  return 'classic';
}

export function forgeToolchain(mc: string): ForgeToolchain | null {
  if (mc in RFG_FORGE) { return { plugin: 'rfg', gradle: '9.5.0', code: forgeCode(mc), reobf: true }; }
  if (MDG_LEGACY.has(mc)) { return { plugin: 'mdg-legacy', gradle: NEOFORGE_GRADLE, code: forgeCode(mc), reobf: true }; }
  if (FG6.has(mc)) { return { plugin: 'fg6', gradle: FG6_GRADLE, code: forgeCode(mc), reobf: !mcAtLeast(mc, '1.20.5') }; }
  if (mc in FG7) { return { plugin: 'fg7', gradle: FG7[mc], code: forgeCode(mc), reobf: false }; }
  // Versions after the table: Forge moved to ForgeGradle 7 for good.
  if (isRelease(mc) && compareVersions(mc, FG7_LATEST) > 0) { return { plugin: 'fg7', gradle: FG7[FG7_LATEST], code: forgeCode(mc), reobf: false }; }
  return null;
}

export interface ForgeFeatures {
  /** slf4j through LogUtils from 1.18.2; log4j before. */
  logUtils: boolean;
  /** `ServerStartingEvent` in `net.minecraftforge.event.server` from 1.17; `FMLServerStartingEvent` before. */
  modernServerEvent: boolean;
  /** The mod constructor takes FMLJavaModLoadingContext (the MDKs from 1.20.6). */
  contextConstructor: boolean;
  /** The DeferredRegister item example (Item.Properties without creative tabs, 1.19+). */
  item: boolean;
  /** Items need `setId` from 1.21.2. */
  itemId: boolean;
  /** The /hello example (`sendSuccess(Supplier, …)` from 1.20). */
  command: boolean;
}

export function forgeFeatures(mc: string): ForgeFeatures {
  return {
    logUtils: mcAtLeast(mc, '1.18.2'),
    modernServerEvent: mcAtLeast(mc, '1.17'),
    contextConstructor: mcAtLeast(mc, '1.20.6'),
    item: mcAtLeast(mc, '1.19'),
    itemId: mcAtLeast(mc, '1.21.2'),
    command: mcAtLeast(mc, '1.20'),
  };
}

/** Resource pack formats of the Forge MDKs; newer versions take the newest entry. */
const PACK_FORMAT: [string, number][] = [
  ['1.16.5', 6], ['1.17', 7], ['1.18', 8], ['1.18.2', 9], ['1.19.3', 12], ['1.19.4', 13], ['1.20', 15], ['1.20.2', 18], ['1.20.3', 22],
  ['1.20.6', 32], ['1.21', 34], ['1.21.3', 42], ['1.21.4', 46], ['1.21.5', 55], ['1.21.6', 63], ['1.21.7', 64],
  ['1.21.9', 88], ['1.21.11', 94], ['26.1', 101], ['26.2', 107], ['26.3', 121],
];

export function packFormat(mc: string): number {
  let format = PACK_FORMAT[0][1];
  for (const [version, value] of PACK_FORMAT) {
    if (mcAtLeast(mc, version)) { format = value; }
  }
  return format;
}

/** pack.mcmeta: `pack_format` up to 1.21.8, `min_format`/`max_format` after. */
export function packMeta(mc: string, description: string): { pack: Record<string, unknown>; } {
  const format = packFormat(mc);
  if (mcAtLeast(mc, '1.21.9')) { return { pack: { description, min_format: format, max_format: format } }; }
  return { pack: { description, pack_format: format } };
}

/** `loaderVersion` in mods.toml: the MDKs use `[0,)` from 1.20.3 to 1.21.7, the Forge major otherwise. */
export function forgeLoaderRange(mc: string, forgeVersion: string): string {
  if (mcBetween(mc, '1.20.3', '1.21.7')) { return '[0,)'; }
  return `[${forgeVersion.split('.')[0]},)`;
}

/* ------------------------------------------------------------------ *
 * Architectury
 * ------------------------------------------------------------------ */

export const ARCHITECTURY_GRADLE = '9.5.1';

/** The Shadow plugin the generator pins. */
export const ARCHITECTURY_SHADOW = '9.4.3';

/* ------------------------------------------------------------------ *
 * Plugins
 * ------------------------------------------------------------------ */

export const PLUGIN_GRADLE = '9.7.1';

/**
 * `api-version` in plugin.yml: none before 1.13 (Bukkit rejects it), the
 * minor line up to 1.20.4, the full version from 1.20.5.
 */
export function bukkitApiVersion(mc: string): string | null {
  if (!mcAtLeast(mc, '1.13')) { return null; }
  if (!mcAtLeast(mc, '1.20.5')) {
    const [major, minor] = mcParts(mc);
    return `${major}.${minor}`;
  }
  return mc;
}

export interface BukkitFeatures {
  /** Paper's Brigadier command API (LifecycleEvents.COMMANDS) from 1.20.6. */
  paperCommands: boolean;
  /** paper-plugin.yml — only with the command API, since a Paper plugin has no plugin.yml commands. */
  paperManifest: boolean;
}

export function bukkitFeatures(mc: string): BukkitFeatures {
  const modern = mcAtLeast(mc, '1.20.6');
  return { paperCommands: modern, paperManifest: modern };
}

/** Builds named `26.2.build.128-stable` — the scheme Paper and its forks use from 26.1. */
export function isBuildVersion(version: string): boolean {
  return /\.build\.\d+/.test(version);
}

/**
 * The version range for “always the newest build of this Minecraft version”:
 * `[26.2.build,26.2.1)`. An open range `[26.2.build,)` (Paper's docs) also
 * matches 26.3 builds and pre-releases once they exist — checked against the
 * repository with Maven — so it is capped before the next patch release.
 */
export function latestBuildRange(mc: string): string {
  return `[${mc}.build,${nextPatch(mc)})`;
}

/** Is this value a latest-build range made by `latestBuildRange`? Then the Minecraft version it belongs to. */
export function rangeMinecraft(value: string): string | null {
  const match = /^\[(\d+(?:\.\d+)+)\.build,[^)\]]*\)$/.exec(value);
  return match ? match[1] : null;
}

/**
 * The dependency version as written in a Gradle build. A latest-build range
 * becomes `26.2.build.+` — the form PaperMC documents for Gradle; Gradle's
 * ordering would rank `26.2-rc-2.build.9-alpha` above the stable builds in a range.
 */
export function gradleDependencyVersion(value: string): string {
  const mc = rangeMinecraft(value);
  return mc ? `${mc}.build.+` : value;
}

/**
 * The Java release of a Velocity API: 3.4 → 17, 3.5 → 21, 4.x → 25 (their
 * class files), 3.0–3.3 → 11 (what the proxy needs), 1.x → 8.
 */
export function velocityJava(api: string): number {
  const [major, minor] = mcParts(api);
  if (major >= 4) { return 25; }
  if (major === 3 && minor >= 5) { return 21; }
  if (major === 3 && minor >= 4) { return 17; }
  if (major === 3) { return 11; }
  return 8;
}

/** BrigadierCommand and CommandManager#metaBuilder arrived with Velocity 3.0. */
export function velocityHasBrigadier(api: string): boolean {
  return mcParts(api)[0] >= 3;
}
