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
 * Where the extensions are stored on disk.
 *
 * The layout under the data folder:
 *   extensions/<id>/<version>.json   one manifest that has been checked
 *   extensions/<id>/meta.json        the publishing data per version
 *   index.json                       the catalogue Lumen reads from
 *
 * The catalogue is written afresh after every change and built once from the
 * files at start. The disk is therefore the only truth: whoever backs up the
 * folder backs up the server; whoever puts a file in there by hand sees it in
 * the catalogue after a restart. No database is needed for that — a server with
 * a few hundred extensions reads its stock in milliseconds.
 *
 * Writing always goes to a `.tmp` file first and is then renamed. A crash in
 * the middle of writing thus never leaves half a manifest behind.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ID_PATTERN, VERSION_PATTERN, compareVersions } from './manifest.js';

/** The fields that go into the catalogue — the rest comes only when a version is fetched. */
function summarize(manifest, meta) {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    icon: manifest.icon,
    color: manifest.color,
    category: manifest.category,
    keywords: manifest.keywords,
    license: manifest.license,
    homepage: manifest.homepage,
    repository: manifest.repository,
    minAppVersion: manifest.minAppVersion,
    /** What the extension contributes — for the list, without loading it. */
    provides: provides(manifest),
    versions: meta.versions,
    preview: meta.preview,
    publishedAt: meta.publishedAt,
    updatedAt: meta.updatedAt,
  };
}

/** A short overview of the contents, for the catalogue and the project page. */
export function provides(manifest) {
  const addon = manifest.addon ?? {};
  const count = (value) => (Array.isArray(value) ? value.length : 0);
  return {
    languages: count(addon.languages),
    themes: count(addon.themes),
    commands: count(addon.commands),
    templates: count(addon.templates),
    projectKinds: count(addon.projectKinds),
    snippets: count(addon.snippets),
    settings: count(manifest.settings),
    pages: count(manifest.pages),
    agents: count(manifest.agents),
    code: manifest.code ? 1 : 0,
  };
}

export class Store {
  /** @param {string} root The server's data folder. */
  constructor(root) {
    this.root = root;
    this.extensionsDir = path.join(root, 'extensions');
    this.indexFile = path.join(root, 'index.json');
    /** @type {Map<string, { manifest: object, meta: object }>} The newest version per id. */
    this.latest = new Map();
  }

  /** The path of a version — only ids that have been checked, never outside the folder. */
  file(id, version) {
    if (!ID_PATTERN.test(id)) {
      throw new Error(`Invalid id: ${id}`);
    }
    if (!VERSION_PATTERN.test(version)) {
      throw new Error(`Invalid version: ${version}`);
    }
    return path.join(this.extensionsDir, id, `${version}.json`);
  }

  metaFile(id) {
    if (!ID_PATTERN.test(id)) {
      throw new Error(`Invalid id: ${id}`);
    }
    return path.join(this.extensionsDir, id, 'meta.json');
  }

  async readJson(file) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      return null;
    }
  }

  /** Write atomically: beside it first, then into place. */
  async writeJson(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  }

  /** Read the stock from disk and build the catalogue afresh. */
  async load() {
    await fs.mkdir(this.extensionsDir, { recursive: true });
    this.latest.clear();
    let ids = [];
    try {
      ids = (await fs.readdir(this.extensionsDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && ID_PATTERN.test(entry.name))
        .map((entry) => entry.name);
    } catch {
      ids = [];
    }
    for (const id of ids) {
      await this.reload(id);
    }
    await this.writeIndex();
    return this.latest.size;
  }

  /** Read one id afresh — after publishing or removing. */
  async reload(id) {
    const dir = path.join(this.extensionsDir, id);
    let files = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      this.latest.delete(id);
      return;
    }
    const versions = files
      .filter((name) => name.endsWith('.json') && VERSION_PATTERN.test(name.slice(0, -5)))
      .map((name) => name.slice(0, -5))
      .sort(compareVersions);

    if (!versions.length) {
      this.latest.delete(id);
      return;
    }
    // A prerelease does not become the recommended version of its own accord:
    // it stays available, but whoever installs the extension without naming a
    // version gets the last finished one.
    const stable = versions.find((version) => !version.includes('-'));
    const current = stable ?? versions[0];
    const manifest = await this.readJson(this.file(id, current));
    if (!manifest) {
      this.latest.delete(id);
      return;
    }
    const stored = (await this.readJson(this.metaFile(id))) ?? {};
    const meta = {
      versions,
      /** The version installed when none is named. */
      latest: current,
      /** The newest prerelease, where there is one newer than `latest`. */
      preview: versions[0] !== current ? versions[0] : undefined,
      publishedAt: stored.publishedAt ?? stored.updatedAt ?? new Date().toISOString(),
      updatedAt: stored.updatedAt ?? new Date().toISOString(),
    };
    this.latest.set(id, { manifest, meta });
  }

  /** Store a version that has been checked. */
  async publish(manifest) {
    const { id, version } = manifest;
    const file = this.file(id, version);
    const existed = await fs.access(file).then(() => true, () => false);
    await this.writeJson(file, manifest);

    const stored = (await this.readJson(this.metaFile(id))) ?? {};
    const now = new Date().toISOString();
    await this.writeJson(this.metaFile(id), {
      publishedAt: stored.publishedAt ?? now,
      updatedAt: now,
    });
    await this.reload(id);
    await this.writeIndex();
    return { replaced: existed };
  }

  /** Remove a version; if it was the last, the extension disappears. */
  async remove(id, version) {
    await fs.rm(this.file(id, version), { force: true });
    const dir = path.join(this.extensionsDir, id);
    const rest = (await fs.readdir(dir).catch(() => []))
      .filter((name) => name.endsWith('.json') && VERSION_PATTERN.test(name.slice(0, -5)));
    if (!rest.length) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    await this.reload(id);
    await this.writeIndex();
  }

  get(id) {
    return this.latest.get(id) ?? null;
  }

  /** One particular manifest — an older version too. */
  async manifest(id, version) {
    const entry = this.get(id);
    if (!entry) {
      return null;
    }
    if (!version || version === 'latest') {
      return entry.manifest;
    }
    if (!entry.meta.versions.includes(version)) {
      return null;
    }
    return this.readJson(this.file(id, version));
  }

  /** The catalogue as Lumen fetches it. */
  index(server) {
    const extensions = [...this.latest.values()]
      .map(({ manifest, meta }) => summarize(manifest, meta))
      .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
    return { schema: 1, server, updatedAt: new Date().toISOString(), extensions };
  }

  async writeIndex() {
    await this.writeJson(this.indexFile, this.index({ name: '', url: '' }));
  }

  /** A full-text search over the name, the id, the description and the keywords. */
  search(query) {
    const all = [...this.latest.values()].map(({ manifest, meta }) => summarize(manifest, meta));
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return all.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
    }
    const hits = all.filter((entry) => [entry.name, entry.id, entry.description, ...entry.keywords]
      .join(' ')
      .toLowerCase()
      .includes(needle));
    return hits.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  }
}
