/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { WebContents } from 'electron';
import { IGNORED } from './entries';
import { isInside } from './paths';

interface FsChange {
  path: string;
  /** 1 created · 2 changed · 3 deleted */
  type: 1 | 2 | 3;
}

/** Dot folders watched all the same (the project configuration). */
const WATCHED_DOT_DIRS = new Set(['.vscode', '.github']);
const MAX_WATCHED_DIRS = 12_000;
/** Quiet time before a batch goes out … */
const BATCH_QUIET_MS = 150;
/** … and the longest a change waits: a log written every few ms must not hold the rest back. */
const BATCH_MAX_DELAY_MS = 600;
/** Files reported for a folder that appeared with contents already inside. */
const MAX_FOUND_IN_NEW_DIR = 500;

function ignoredSegment(segment: string) {
  if (IGNORED.has(segment)) {
    return true;
  }
  return segment.startsWith('.') && segment.length > 1 && !WATCHED_DOT_DIRS.has(segment) && segment !== '.env';
}

/**
 * Is a change to this entry worth reporting? Hidden folders are not descended
 * into, but a dot *file* (.gitignore, .eslintrc) is shown and edited like any
 * other — only the heavy folders themselves are dropped.
 */
function ignoredLeaf(name: string) {
  return IGNORED.has(name);
}

/**
 * Watches the working folder and reports changes to the renderer in batches.
 *
 * macOS and Windows can watch recursively. Under Linux that would be expensive
 * over node_modules and its like through inotify, and soon runs into limits —
 * there every folder that matters gets a watcher of its own, and new folders
 * are taken on as they appear.
 */
export class WorkspaceWatcher {
  private watchers = new Map<string, fsSync.FSWatcher>();
  private pending = new Map<string, 'rename' | 'change'>();
  private timer: NodeJS.Timeout | null = null;
  private firstPending = 0;
  private closed = false;

  constructor(private readonly root: string, private readonly owner: WebContents) {
    if (process.platform === 'linux') {
      void this.watchTree(root);
      return;
    }
    this.watchRecursive();
  }

  private watchRecursive() {
    try {
      const watcher = fsSync.watch(this.root, { recursive: true }, (event, filename) => {
        const name = filename?.toString() ?? '';
        if (!name) {
          return;
        }
        const parts = name.split(/[\\/]/);
        if (parts.slice(0, -1).some(ignoredSegment) || ignoredLeaf(parts[parts.length - 1])) {
          return;
        }
        this.record(path.join(this.root, name), event);
      });
      watcher.on('error', () => this.close());
      this.watchers.set(this.root, watcher);
    } catch {
      // Without a watcher, refreshing waits for window focus.
    }
  }

  /**
   * `found` collects the files already inside — for a folder that appeared
   * with contents (an agent creating a package and its first class at once),
   * whose files were written before this watcher existed.
   */
  private async watchTree(dir: string, found?: string[]) {
    if (this.closed || this.watchers.has(dir) || this.watchers.size >= MAX_WATCHED_DIRS) {
      return;
    }
    if (dir !== this.root && ignoredSegment(path.basename(dir))) {
      return;
    }
    try {
      const watcher = fsSync.watch(dir, (event, filename) => {
        const name = filename?.toString() ?? '';
        if (!name || ignoredLeaf(name)) {
          return;
        }
        this.record(path.join(dir, name), event);
      });
      watcher.on('error', () => this.unwatch(dir));
      this.watchers.set(dir, watcher);
    } catch {
      return;
    }
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found && entry.isFile() && found.length < MAX_FOUND_IN_NEW_DIR && !ignoredLeaf(entry.name)) {
        found.push(path.join(dir, entry.name));
      }
      if (!entry.isDirectory() || ignoredSegment(entry.name)) {
        continue;
      }
      await this.watchTree(path.join(dir, entry.name), found);
    }
  }

  /** Does a change to this file reach the renderer through this watcher? */
  covers(file: string) {
    if (this.closed || !isInside(this.root, file) || ignoredLeaf(path.basename(file))) {
      return false;
    }
    if (process.platform === 'linux') {
      return this.watchers.has(path.dirname(file));
    }
    if (!this.watchers.size) {
      return false;
    }
    return !path.relative(this.root, path.dirname(file)).split(/[\\/]/).some(ignoredSegment);
  }

  private unwatch(dir: string) {
    for (const [watched, watcher] of this.watchers) {
      if (watched !== dir && !watched.startsWith(`${dir}${path.sep}`)) {
        continue;
      }
      watcher.close();
      this.watchers.delete(watched);
    }
  }

  private record(file: string, event: string) {
    const previous = this.pending.get(file);
    this.pending.set(file, event === 'rename' || previous === 'rename' ? 'rename' : 'change');
    const now = Date.now();
    if (!this.timer) {
      this.firstPending = now;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    // Debounced, but never beyond the cap — continuous writes elsewhere would
    // otherwise keep every change (an agent's edit included) waiting.
    const wait = Math.max(0, Math.min(BATCH_QUIET_MS, this.firstPending + BATCH_MAX_DELAY_MS - now));
    this.timer = setTimeout(() => void this.flush(), wait);
  }

  private async flush() {
    this.timer = null;
    const batch = [...this.pending];
    this.pending.clear();
    const changes: FsChange[] = [];
    for (const [file, kind] of batch) {
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) {
        this.unwatch(file);
        changes.push({ path: file, type: 3 });
        continue;
      }
      if (stat.isDirectory() && process.platform === 'linux') {
        const found: string[] = [];
        await this.watchTree(file, kind === 'rename' ? found : undefined);
        for (const inner of found) {
          changes.push({ path: inner, type: 1 });
        }
      }
      changes.push({ path: file, type: kind === 'rename' ? 1 : 2 });
    }
    if (this.closed || !changes.length || this.owner.isDestroyed()) {
      return;
    }
    this.owner.send('fs:changed', changes);
  }

  close() {
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}
