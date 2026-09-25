#!/usr/bin/env node
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
 * Uploads the built packages to the CDN and updates `latest.json`, which the
 * updater in Lumen reads from.
 *
 *   npm run publish:cdn                       # everything in release/ that fits the version
 *   npm run publish:cdn -- --dry-run          # only show, upload nothing
 *   npm run publish:cdn -- --only linux_amd64,windows_x86_64 --notes "Bug fixes"
 *
 * The layout on the CDN (`LUMEN_CDN_ROOT`):
 *   version/latest/latest.json
 *   version/latest/<platform>/<files>         ← the updater and the download links
 *   version/<version>/<platform>/<files>      ← the archive (switch off with --no-archive)
 *
 * Platforms not uploaded keep their entry in `latest.json`. Old files in
 * `latest/` are removed only after the new manifest — updates under way
 * therefore always find their files.
 *
 * The transfer runs over a single sftp session (a key or a password prompt).
 * The environment variables:
 *   LUMEN_CDN_HOST  (10.52.20.251)           LUMEN_CDN_USER  (the ssh default)
 *   LUMEN_CDN_PORT  (22)                     LUMEN_CDN_ROOT  (/var/www/cdn.eztxm.de/download/lumen-ide/version)
 *   LUMEN_CDN_URL   (https://cdn.eztxm.de/download/lumen-ide/version)
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const HOST = process.env.LUMEN_CDN_HOST ?? '10.52.20.251';
const USER = process.env.LUMEN_CDN_USER ?? 'root';
const PORT = process.env.LUMEN_CDN_PORT ?? '22';
const REMOTE_ROOT = (process.env.LUMEN_CDN_ROOT ?? '/var/www/cdn.eztxm.de/download/lumen-ide/version').replace(/\/+$/, '');
const PUBLIC_URL = (process.env.LUMEN_CDN_URL ?? 'https://cdn.eztxm.de/download/lumen-ide/version').replace(/\/+$/, '');

/**
 * The files per platform; `update` is what the updater installs. `{v}` is the
 * version. The names follow `artifactName` in package.json.
 */
// Older builds are named `Lumen-…`, later ones `Lumen IDE-…` (the product name) — both are taken.
const APP = 'Lumen(?:[ -]IDE)?';

const PLATFORMS = {
  linux_amd64: { update: new RegExp(`^${APP}-{v}-linux-x86_64\\.AppImage$`), extra: [/^(?:lumen-ide_{v}_amd64|Lumen(?:[ -]IDE)?-{v}-linux-amd64)\.deb$/] },
  linux_aarch64: { update: new RegExp(`^${APP}-{v}-linux-(?:arm64|aarch64)\\.AppImage$`), extra: [/^(?:lumen-ide_{v}_arm64|Lumen(?:[ -]IDE)?-{v}-linux-arm64)\.deb$/] },
  macos_arm64: { update: new RegExp(`^${APP}-{v}-mac-arm64\\.zip$`), extra: [new RegExp(`^${APP}-{v}-mac-arm64\\.dmg$`)] },
  windows_x86_64: { update: new RegExp(`^${APP}-{v}-win-x64-setup\\.exe$`), extra: [new RegExp(`^${APP}-{v}-win-x64\\.zip$`)] },
  windows_arm64: { update: new RegExp(`^${APP}-{v}-win-arm64-setup\\.exe$`), extra: [new RegExp(`^${APP}-{v}-win-arm64\\.zip$`)] },
};

/** The name a file gets on the CDN: no spaces, so download links and the updater need no escaping. */
const remoteName = (file) => path.basename(file).replace(/^Lumen[ -]IDE-/, 'Lumen-').replace(/\s+/g, '-');

function parseArgs(argv) {
  const options = { dir: 'release', version: pkg.version, only: null, notes: '', dryRun: false, archive: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    }
    if (arg === '--no-archive') {
      options.archive = false;
    }
    if (arg === '--dir') {
      options.dir = argv[++i];
    }
    if (arg === '--version') {
      options.version = argv[++i];
    }
    if (arg === '--only') {
      options.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (arg === '--notes') {
      options.notes = argv[++i];
    }
    if (arg === '--help' || arg === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n/, '').replace(/^ \* ?/gm, ''));
      process.exit(0);
    }
  }
  return options;
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function withVersion(pattern, version) {
  return new RegExp(pattern.source.replace('{v}', escapeRegex(version)));
}

/** Every file under `dir` (two levels, downloaded CI artefacts for instance), without unpacked builds. */
function listFiles(dir, depth = 2) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile()) {
      out.push(full);
    }
    if (!entry.isDirectory() || depth <= 1) {
      continue;
    }
    if (entry.name.endsWith('-unpacked') || entry.name.endsWith('.app') || entry.name === 'cdn' || /^mac(-\w+)?$/.test(entry.name)) {
      continue;
    }
    out.push(...listFiles(full, depth - 1));
  }
  return out;
}

function describe(file) {
  const hash = crypto.createHash('sha512');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(8 * 1024 * 1024);
  for (;;) {
    const read = fs.readSync(fd, buffer, 0, buffer.length, null);
    if (read === 0) {
      break;
    }
    hash.update(buffer.subarray(0, read));
  }
  fs.closeSync(fd);
  return { name: remoteName(file), size: fs.statSync(file).size, sha512: hash.digest('base64') };
}

function findRelease(files, platform, version) {
  const spec = PLATFORMS[platform];
  const pick = (pattern) => files.find((file) => withVersion(pattern, version).test(path.basename(file)));
  const update = pick(spec.update);
  if (!update) {
    return null;
  }
  const extras = spec.extra.map(pick).filter(Boolean);
  return { platform, local: [update, ...extras] };
}

async function fetchPreviousManifest() {
  try {
    const response = await fetch(`${PUBLIC_URL}/latest/latest.json?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.warn(`! The existing latest.json cannot be read (${err.message}) — a new one is created.`);
    return null;
  }
}

const quote = (text) => `"${text.replace(/(["\\])/g, '\\$1')}"`;

function sftpBatch({ releases, version, manifestFile, previous, archive }) {
  const lines = ['progress', `-mkdir ${quote(REMOTE_ROOT)}`, `-mkdir ${quote(`${REMOTE_ROOT}/latest`)}`];
  if (archive) {
    lines.push(`-mkdir ${quote(`${REMOTE_ROOT}/${version}`)}`);
  }
  for (const release of releases) {
    const targets = [`${REMOTE_ROOT}/latest/${release.platform}`];
    if (archive) {
      targets.push(`${REMOTE_ROOT}/${version}/${release.platform}`);
    }
    for (const target of targets) {
      lines.push(`-mkdir ${quote(target)}`);
      for (const file of release.local) {
        lines.push(`put ${quote(file)} ${quote(`${target}/${remoteName(file)}`)}`);
      }
    }
  }
  // The manifest only once every file is in place; then clear the old out of latest/.
  lines.push(`put ${quote(manifestFile)} ${quote(`${REMOTE_ROOT}/latest/latest.json.part`)}`);
  lines.push(`-rm ${quote(`${REMOTE_ROOT}/latest/latest.json`)}`);
  lines.push(`rename ${quote(`${REMOTE_ROOT}/latest/latest.json.part`)} ${quote(`${REMOTE_ROOT}/latest/latest.json`)}`);
  for (const release of releases) {
    const keep = new Set(release.local.map((file) => remoteName(file)));
    const old = previous?.platforms?.[release.platform]?.files ?? [];
    for (const file of old) {
      if (keep.has(file.name)) {
        continue;
      }
      lines.push(`-rm ${quote(`${REMOTE_ROOT}/latest/${release.platform}/${file.name}`)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function runSftp(batchFile) {
  const destination = USER ? `${USER}@${HOST}` : HOST;
  // `-oBatchMode=no` before `-b`, so that sftp may ask for the password despite the batch file.
  const args = ['-oBatchMode=no', '-P', PORT, '-b', batchFile, destination];
  return new Promise((resolve, reject) => {
    const child = spawn('sftp', args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`sftp endete mit Code ${code}`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dir = path.resolve(ROOT, options.dir);
  if (!fs.existsSync(dir)) {
    throw new Error(`${dir} does not exist — build first (npm run dist:…)`);
  }

  const unknown = (options.only ?? []).filter((platform) => !PLATFORMS[platform]);
  if (unknown.length) {
    throw new Error(`Unknown platform: ${unknown.join(', ')} (known: ${Object.keys(PLATFORMS).join(', ')})`);
  }

  const files = listFiles(dir);
  const wanted = options.only ?? Object.keys(PLATFORMS);
  const releases = [];
  for (const platform of wanted) {
    const release = findRelease(files, platform, options.version);
    if (!release) {
      console.log(`- ${platform}: no package for ${options.version} found, skipped`);
      continue;
    }
    releases.push(release);
  }
  if (!releases.length) {
    throw new Error(`No packages for version ${options.version} in ${dir}`);
  }

  const releaseDate = new Date().toISOString();
  const previous = await fetchPreviousManifest();
  const manifest = {
    product: 'lumen-ide',
    version: options.version,
    releaseDate,
    notes: options.notes || undefined,
    platforms: { ...(previous?.platforms ?? {}) },
  };
  for (const release of releases) {
    console.log(`• ${release.platform}: checksums…`);
    const described = release.local.map(describe);
    manifest.platforms[release.platform] = { version: options.version, releaseDate, update: described[0], files: described };
    for (const file of described) {
      console.log(`    ${file.name}  ${(file.size / 1024 / 1024).toFixed(1)} MB`);
    }
  }
  // The topmost version = the highest of all the platforms, so that `version` never jumps back.
  const highest = Object.values(manifest.platforms).map((entry) => entry.version).sort(compareVersions).pop();
  manifest.version = highest ?? options.version;

  const staging = path.join(dir, 'cdn');
  fs.mkdirSync(staging, { recursive: true });
  const manifestFile = path.join(staging, 'latest.json');
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const batchFile = path.join(staging, 'upload.sftp');
  fs.writeFileSync(batchFile, sftpBatch({ releases, version: options.version, manifestFile, previous, archive: options.archive }));

  console.log(`\nManifest: ${path.relative(ROOT, manifestFile)}`);
  console.log(`Target:   ${USER ? `${USER}@` : ''}${HOST}:${REMOTE_ROOT}`);
  if (options.dryRun) {
    console.log(`\n--dry-run: sftp commands in ${path.relative(ROOT, batchFile)}\n`);
    console.log(fs.readFileSync(batchFile, 'utf8'));
    return;
  }
  await runSftp(batchFile);
  console.log(`\n✓ Lumen ${options.version} published: ${PUBLIC_URL}/latest/latest.json`);
}

function compareVersions(a, b) {
  const [coreA, preA = ''] = a.split('-', 2);
  const [coreB, preB = ''] = b.split('-', 2);
  const partsA = coreA.split('.').map(Number);
  const partsB = coreB.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) {
      return Math.sign(diff);
    }
  }
  if (preA === preB) {
    return 0;
  }
  if (!preA) {
    return 1;
  }
  if (!preB) {
    return -1;
  }
  return preA.localeCompare(preB, 'en', { numeric: true });
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
