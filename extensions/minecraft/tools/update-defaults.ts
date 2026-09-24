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
 * Refreshes the offline defaults (`src/defaults.ts`) and the bundled copy of
 * Architectury's version table (`src/architectury-games.ts`) from the live
 * sources — run before a release:
 *
 *   node extensions/minecraft/tools/run.mjs tools/update-defaults.ts
 *
 * The defaults are deliberately small: the newest few versions per Minecraft
 * version, enough for the form to work offline on a first start.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Catalog, URLS, type Net, type ServerApi } from '../src/catalog';
import { fabricSupports, forgeToolchain, neoToolchain } from '../src/eras';
import {
  apiMinecraft, fabricApiFromMaven, forgeFor, forgeMavenVersion, mavenVersions, neoforgeFor, neoforgeGameVersions,
  type ArchitecturyList, type VersionEntry,
} from '../src/sources';
import { compareVersions, sortVersions } from '../src/semver';

const SRC = path.join(process.cwd(), 'extensions', 'minecraft', 'src');

const net: Net = {
  async fetchText(url) {
    const response = await fetch(url, { headers: { 'User-Agent': 'Lumen-IDE (minecraft extension defaults)' } });
    if (!response.ok) { throw new Error(`HTTP ${response.status} for ${url}`); }
    return response.text();
  },
  async fetchJson<T>(url: string) {
    return JSON.parse(await net.fetchText(url)) as T;
  },
};

const memory = new Map<string, unknown>();
const catalog = new Catalog(net, {
  get: <T>(key: string, fallback: T) => (memory.has(key) ? memory.get(key) as T : fallback),
  set: (key, value) => void memory.set(key, value),
}, { ttlHours: () => 0 });

const top = (entries: VersionEntry[], n = 3) => entries.slice(0, n);

/** The first entries plus the newest stable one, should it come later (loaders with betas on top). */
const topWithLatest = (entries: VersionEntry[], n = 3) => {
  const first = entries.slice(0, n);
  const latest = entries.find((e) => e.badge === 'latest');
  return latest && !first.includes(latest) ? [...first, latest] : first;
};

async function main() {
  const games = await catalog.games(true);

  const fabricGames = (await catalog.fabricGames(true)).releases.filter(fabricSupports);
  const fabricApiAll = mavenVersions(await net.fetchText(URLS.fabricApiMaven));
  const fabricApi: Record<string, VersionEntry[]> = {};
  for (const mc of fabricGames) {
    const list = top(fabricApiFromMaven(fabricApiAll, mc), 2);
    if (list.length) { fabricApi[mc] = list; }
  }

  const neo = await catalog.neoforgeLists(true);
  const neoGames = neoforgeGameVersions(neo.all, neo.legacy).filter((mc) => neoToolchain(mc));
  const neoAll: string[] = [];
  const neoLegacy: string[] = [];
  for (const mc of neoGames) {
    const list = top(neoforgeFor(neo.all, neo.legacy, mc), 3).map((e) => e.version);
    if (mc === '1.20.1') { neoLegacy.push(...list); }
    if (mc !== '1.20.1') { neoAll.push(...list); }
  }

  const forge = await catalog.forgeLists(true);
  const forgeAll: string[] = [];
  const promos: Record<string, string> = {};
  for (const [key, value] of Object.entries(forge.promos)) {
    const mc = key.replace(/-(latest|recommended)$/, '');
    if (!forgeToolchain(mc)) { continue; }
    promos[key] = value;
  }
  for (const mc of new Set(Object.keys(promos).map((k) => k.replace(/-(latest|recommended)$/, '')))) {
    const builds = forgeFor(forge.all, forge.promos, mc);
    const wanted = new Set([...builds.slice(0, 2).map((b) => b.version), promos[`${mc}-recommended`], promos[`${mc}-latest`]].filter(Boolean));
    for (const build of wanted) { forgeAll.push(forgeMavenVersion(forge.all, mc, build)); }
  }

  const serverApis = {} as Record<ServerApi, string[]>;
  for (const api of ['spigot', 'paper', 'folia', 'purpur', 'leaf'] as ServerApi[]) {
    const all = await catalog.serverApiList(api, true);
    const byMc = new Map<string, string[]>();
    for (const version of all) {
      const mc = apiMinecraft(version);
      if (!mc) { continue; }
      byMc.set(mc, [...(byMc.get(mc) ?? []), version]);
    }
    serverApis[api] = [...byMc.values()].flatMap((list) => sortVersions(list).slice(0, 2));
  }

  const architecturyGames = await catalog.architecturyGames(true);
  const archApi = mavenVersions(await net.fetchText(URLS.architecturyApi));
  const archLegacy = mavenVersions(await net.fetchText(URLS.architecturyApiLegacy));
  const archPicked: string[] = [];
  for (const game of architecturyGames.versions) {
    const major = game.architectury.api_version;
    if (!major) { continue; }
    const source = game.architectury.maven_group === 'me.shedaniel' ? archLegacy : archApi;
    const newest = sortVersions(source.filter((v) => v.startsWith(`${major}.`)))[0];
    if (newest) { archPicked.push(newest); }
  }

  const gradle = (await catalog.gradleReleases(true)).filter((v) => compareVersions(v, '8.4') >= 0);

  const defaults = {
    games,
    fabricLoaders: topWithLatest(await catalog.fabricLoaders(true)),
    fabricApi,
    loom: top(await catalog.loom('net.fabricmc.fabric-loom-remap'), 2),
    quiltLoaders: topWithLatest(await catalog.quiltLoaders()),
    quiltLoom: top(await catalog.quiltLoom(), 2),
    neoforge: { all: neoAll, legacy: neoLegacy },
    moddev: top(await catalog.moddev(), 2),
    forge: { all: forgeAll, promos },
    eventbusValidator: top(await catalog.eventbusValidator(), 2),
    rfg: top(await catalog.rfg(), 2),
    architecturyApi: sortVersions(archPicked),
    architecturyLoom: top(await catalog.architecturyLoom(false), 2),
    architecturyLoomNoRemap: top(await catalog.architecturyLoom(true), 2),
    architecturyPlugin: top(await catalog.architecturyPlugin(), 2),
    serverApis,
    purpurGames: (await net.fetchJson<{ versions: string[]; }>(URLS.purpurGames)).versions,
    velocity: top(await catalog.velocity(true), 6),
    bungee: top(await catalog.bungee(true), 4),
    runPaper: top(await catalog.runPaper(), 2),
    gradle,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const header = (what: string) => `/**\n * ${what}\n *\n * Generated by tools/update-defaults.ts on ${stamp} — do not edit by hand.\n */\n\n`;
  await fs.writeFile(path.join(SRC, 'defaults.ts'), `${header('Offline defaults: the newest versions per source, for a first start without network.')}import type { Defaults } from './defaults-type'\n\nexport const DEFAULTS: Defaults = ${JSON.stringify(defaults, null, 2)}\n`);
  await fs.writeFile(path.join(SRC, 'architectury-games.ts'), `${header("A copy of architectury/template-generator's minecraft_versions.json — the fallback when GitHub is out of reach.")}import type { ArchitecturyList } from './sources'\n\nexport const ARCHITECTURY_GAMES: ArchitecturyList = ${JSON.stringify(architecturyGames satisfies ArchitecturyList, null, 2)}\n`);
  process.stdout.write(`defaults written to ${path.relative(process.cwd(), SRC)} (${stamp})\n`);
}

await main();
