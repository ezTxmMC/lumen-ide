/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import {
  app, BrowserWindow, ipcMain, dialog, shell, nativeTheme,
  type OpenDialogOptions, type SaveDialogOptions, type WebContents,
} from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  createTerminal, detectExternalTerminals, detectShells, killAllTerminals, killTerminal, killTerminalsOf,
  openExternalTerminal, resizeTerminal, terminalKey, writeTerminal, type TerminalOptions,
} from './terminal';
import { registerSdkIpc } from './features/sdk';
import { registerDapIpc, stopAllDebugAdapters, stopDebugAdaptersOf } from './features/dap';
import { registerUserAddonIpc } from './features/user-addons';
import { registerNetIpc } from './features/net';
import { registerUpdaterIpc } from './features/updater';
import { registerExtensionHostIpc } from './features/extension-host';
import { applyWindowSystem, currentWindowSystem, isWaylandSession, relaunchApp } from './features/window-system';
import { folderFromArgv, registerRecentProjectsIpc } from './features/recent-projects';
import { registerLocalRepoIpc } from './features/local-repos';
import { registerCaptureIpc } from './features/capture';
import { registerExtensionIpc } from './features/extensions';
import { registerMediaIpc } from './features/media';
import { managedCommand, registerLspPackageIpc } from './features/lsp-packages';
import { registerPrivilegedIpc } from './features/privileged';
import { isProjectDataPath, registerProjectDataIpc } from './features/project-data';
import { registerJdtlsIpc } from './features/jdtls-support';
import { setWorkspaceRoots } from './features/workspace-roots';
import { registerOpenFileWatchIpc } from './features/open-file-watch';
import { popoutOpenResult, registerPopoutIpc, trackPopouts } from './features/popout';
import { applyWindowState, loadWindowState, trackWindowState, type WindowState } from './features/window-state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

/**
 * Every window holds a project of its own: its folders, the watchers on them,
 * and the processes it started. Events go back to the window that owns them —
 * never to whichever window happens to have focus.
 */
interface WindowContext {
  win: BrowserWindow;
  /** `webContents.id`, kept because the contents are gone by the time the window has closed. */
  id: number;
  workspaceRoot: string | null;
  /** Further folders of a workspace (multi-root). */
  extraRoots: string[];
  watchers: WorkspaceWatcher[];
  /** The renderer has settled unsaved changes — close without asking again. */
  forceClose: boolean;
}

const contexts = new Map<number, WindowContext>();
/** The window focused last: dialogs, the jump list and features without an owner of their own go there. */
let lastFocused: BrowserWindow | null = null;
/** Quitting for an update or a relaunch: every window closes without asking. */
let forceClose = false;

function activeWindow(): BrowserWindow | null {
  if (lastFocused && !lastFocused.isDestroyed()) {
    return lastFocused;
  }
  for (const ctx of contexts.values()) {
    if (!ctx.win.isDestroyed()) {
      return ctx.win;
    }
  }
  return null;
}

const contextOf = (contents: WebContents) => contexts.get(contents.id) ?? null;

/** Process ids come from the renderer, and every window counts from the same start — scope them per window. */
const scopedId = (contents: WebContents, id: string) => `${contents.id}:${id}`;

/** Features outside this file learn the folders of the window in front. */
function syncWorkspaceRoots() {
  const win = activeWindow();
  const ctx = win ? contexts.get(win.webContents.id) : undefined;
  setWorkspaceRoots(ctx?.workspaceRoot ?? null, ctx?.extraRoots ?? []);
}

function setContextRoots(ctx: WindowContext, root: string, extras: string[]) {
  ctx.workspaceRoot = root;
  ctx.extraRoots = extras;
  for (const existing of ctx.watchers) {
    existing.close();
  }
  ctx.watchers = [root, ...extras.filter((extra) => extra !== root)].map((dir) => new WorkspaceWatcher(dir, ctx.win.webContents));
  syncWorkspaceRoots();
}

/** A window has gone: end everything it started. */
function releaseWindow(ctx: WindowContext) {
  const prefix = `${ctx.id}:`;
  for (const key of [...running.keys()]) {
    if (key.startsWith(prefix)) {
      killCommand(key);
    }
  }
  for (const key of [...servers.keys()]) {
    if (key.startsWith(prefix)) {
      stopLsp(key);
    }
  }
  for (const existing of ctx.watchers) {
    existing.close();
  }
  ctx.watchers = [];
  killTerminalsOf(ctx.id);
  stopDebugAdaptersOf(ctx.id);
  contexts.delete(ctx.id);
  if (lastFocused === ctx.win) {
    lastFocused = null;
  }
  syncWorkspaceRoots();
}

/** Dialogs sit on the window that asked for them. */
function showOpen(contents: WebContents, options: OpenDialogOptions) {
  const parent = BrowserWindow.fromWebContents(contents);
  if (parent) {
    return dialog.showOpenDialog(parent, options);
  }
  return dialog.showOpenDialog(options);
}

function showSave(contents: WebContents, options: SaveDialogOptions) {
  const parent = BrowserWindow.fromWebContents(contents);
  if (parent) {
    return dialog.showSaveDialog(parent, options);
  }
  return dialog.showSaveDialog(options);
}

/* ------------------------------------------------------------------ *
 * The window
 * ------------------------------------------------------------------ */

/** Where a further window goes: a little below and to the right of the one in front. */
function nextBounds(): { x?: number; y?: number; width: number; height: number; } {
  const front = activeWindow();
  if (!front || front.isDestroyed() || front === projectsWindow) {
    return { width: 1440, height: 900 };
  }
  const bounds = front.getNormalBounds();
  return { x: bounds.x + 28, y: bounds.y + 28, width: bounds.width, height: bounds.height };
}

/** What a window starts with — the renderer reads it from the query string. */
interface Launch {
  /** Opens this folder straight away. */
  project?: string;
  /** Opens this saved workspace (several folders), by id. */
  workspace?: string;
  /** Starts at the project screen even when “open last project on start” is on — that setting is about starting the app. */
  fresh?: boolean;
  /** Starts in the editor without a project. */
  empty?: boolean;
  /** The small window that shows nothing but the project screen. */
  view?: 'projects';
  /** The main window: it comes up where it was last and remembers where it goes. */
  primary?: boolean;
}

const PROJECTS_SIZE = { width: 980, height: 640, minWidth: 720, minHeight: 480 };

function windowGeometry(launch: Launch, saved: WindowState | null) {
  if (launch.view === 'projects') {
    return PROJECTS_SIZE;
  }
  const bounds = saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : nextBounds();
  return { ...bounds, minWidth: 820, minHeight: 520 };
}

/** The small project-screen window, while it is open. */
let projectsWindow: BrowserWindow | null = null;

function createWindow(launch: Launch = {}) {
  const projects = launch.view === 'projects';
  const saved = launch.primary ? loadWindowState() : null;
  const win = new BrowserWindow({
    ...windowGeometry(launch, saved),
    show: false,
    frame: false,
    maximizable: !projects,
    fullscreenable: !projects,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#0b0d10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  if (saved) {
    trackWindowState(win);
  }
  if (projects) {
    projectsWindow = win;
    win.once('closed', () => { projectsWindow = null; });
  }

  const contents = win.webContents;
  // Nothing to save in the project screen: it closes without asking.
  const ctx: WindowContext = { win, id: contents.id, workspaceRoot: null, extraRoots: [], watchers: [], forceClose: projects };
  contexts.set(ctx.id, ctx);
  lastFocused = win;

  // Under Wayland `ready-to-show` does not always arrive for hidden windows —
  // show it anyway once loading is through, or after a short wait.
  const reveal = () => {
    if (win.isDestroyed() || win.isVisible()) {
      return;
    }
    // Maximizing a hidden window shows it at once (Linux), so it waits until the page is ready.
    if (saved) {
      applyWindowState(win, saved);
    }
    win.show();
  };
  win.once('ready-to-show', reveal);
  contents.once('did-finish-load', () => setTimeout(reveal, 400));
  setTimeout(reveal, 4000);
  // Reloading the renderer (hot reload) orphans this window's shells — end them then.
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      killTerminalsOf(ctx.id);
    }
  });
  win.on('focus', () => {
    lastFocused = win;
    syncWorkspaceRoots();
  });
  win.on('closed', () => releaseWindow(ctx));

  // Close only after asking in the renderer (unsaved changes).
  win.on('close', (event) => {
    if (forceClose || ctx.forceClose) {
      return;
    }
    event.preventDefault();
    contents.send('app:close-request');
  });

  const emit = (channel: string, payload?: unknown) => {
    if (!contents.isDestroyed()) {
      contents.send(channel, payload);
    }
  };

  win.on('maximize', () => emit('window:state', { maximized: true }));
  win.on('unmaximize', () => emit('window:state', { maximized: false }));
  win.on('enter-full-screen', () => emit('window:state', { fullscreen: true }));
  win.on('leave-full-screen', () => emit('window:state', { fullscreen: false }));

  // Never open external links in the app window.
  // Except the windows the renderer opens itself for pop-out views and editor groups.
  win.webContents.setWindowOpenHandler((details) => {
    const popout = popoutOpenResult(details);
    if (popout) {
      return popout;
    }
    if (/^https?:\/\//.test(details.url)) {
      shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });
  trackPopouts(win);

  const query = launchQuery(launch);
  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    void win.loadURL(url.toString());
    return win;
  }
  void win.loadFile(path.join(RENDERER_DIST, 'index.html'), { query });
  return win;
}

function launchQuery(launch: Launch): Record<string, string> {
  const query: Record<string, string> = {};
  if (launch.project) {
    query.project = launch.project;
  }
  if (launch.workspace) {
    query.workspace = launch.workspace;
  }
  if (launch.view) {
    query.view = launch.view;
  }
  if (launch.empty) {
    query.empty = '1';
  }
  if (launch.fresh && !launch.project) {
    query.fresh = '1';
  }
  return query;
}

/** “Open last project on start” is read straight from the settings file — no renderer runs yet. */
function reopensLastProject(): boolean {
  try {
    const file = path.join(app.getPath('userData'), 'settings.json');
    const parsed = JSON.parse(fsSync.readFileSync(file, 'utf8')) as { effects?: { reopenLastProject?: boolean; }; };
    return parsed.effects?.reopenLastProject === true;
  } catch {
    return false;
  }
}

/**
 * Starting the app: the project screen in a small window of its own, and the
 * main window only once a project is chosen. With “open last project on
 * start” or a folder on the command line the main window opens directly.
 */
function startWindow() {
  if (pendingFolder || reopensLastProject()) {
    createWindow({ primary: true });
    return;
  }
  createWindow({ view: 'projects' });
}

/** The project screen is done: the main window opens with the choice, and the small one goes once it shows. */
function handOver(launch: Launch) {
  const from = projectsWindow;
  const main = createWindow({ ...launch, fresh: true, primary: true });
  const closeFrom = () => {
    if (from && !from.isDestroyed()) {
      from.close();
    }
  };
  main.once('show', closeFrom);
  return main;
}

/** Open a project in a window of its own — or bring forward the window that has it open already. */
function openProjectWindow(project?: string) {
  const existing = project ? [...contexts.values()].find((ctx) => ctx.workspaceRoot === project) : undefined;
  if (existing && !existing.win.isDestroyed()) {
    if (existing.win.isMinimized()) {
      existing.win.restore();
    }
    existing.win.focus();
    return 'focused';
  }
  createWindow({ project, fresh: true });
  return 'opened';
}

const relaunching = applyWindowSystem();

/**
 * One instance is enough.
 *
 * The entries of the jump list under Windows and the actions of the desktop
 * entry under Linux start the program afresh, only with `--open-folder=…`.
 * Without the lock a second window would then stand beside the first; with it
 * the second instance passes the folder through to the running window and
 * quits.
 */
const singleInstance = relaunching || app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
}

/** The folder the command line names at start — the renderer collects it. */
let pendingFolder = folderFromArgv(process.argv);

app.on('second-instance', (_event, argv) => {
  const folder = folderFromArgv(argv);
  const win = activeWindow();
  if (!win || win.isDestroyed()) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.focus();
  if (!folder) {
    return;
  }
  if (win === projectsWindow) {
    handOver({ project: folder });
    return;
  }
  win.webContents.send('app:open-folder', folder);
});

app.whenReady().then(() => {
  if (relaunching || !singleInstance) {
    return;
  }
  nativeTheme.themeSource = 'dark';
  registerIpc();
  registerNetIpc();
  registerSdkIpc(activeWindow);
  registerLspPackageIpc(activeWindow);
  registerPrivilegedIpc(activeWindow);
  registerDapIpc();
  registerUserAddonIpc(activeWindow);
  registerUpdaterIpc(() => { forceClose = true; });
  registerRecentProjectsIpc(activeWindow);
  registerLocalRepoIpc();
  registerCaptureIpc();
  registerProjectDataIpc();
  registerJdtlsIpc();
  registerExtensionHostIpc(activeWindow);
  registerExtensionIpc();
  registerMediaIpc();
  registerPopoutIpc();
  registerOpenFileWatchIpc((owner, file) => contextOf(owner)?.watchers.some((watcher) => watcher.covers(file)) ?? false);
  startWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/* ------------------------------------------------------------------ *
 * Filesystem helpers
 * ------------------------------------------------------------------ */

const IGNORED = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  '.next', '.nuxt', '.cache', '__pycache__', '.venv', 'venv',
  'target', 'vendor', '.idea', '.gradle', 'bin', 'obj',
]);

const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Entries the file tree never shows — dotfiles such as .gitignore stay visible. */
const HIDDEN_ENTRIES = new Set(['.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db', '.idea', '.cache']);

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

async function readDirectory(dir: string): Promise<DirEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: DirEntry[] = [];
  for (const e of entries) {
    if (HIDDEN_ENTRIES.has(e.name)) {
      continue;
    }
    if (IGNORED.has(e.name)) {
      continue;
    }
    result.push({
      name: e.name,
      path: path.join(dir, e.name),
      isDirectory: e.isDirectory(),
    });
  }
  result.sort((a, b) =>
    a.isDirectory === b.isDirectory
      ? a.name.localeCompare(b.name, 'de', { numeric: true })
      : a.isDirectory ? -1 : 1,
  );
  return result;
}

/**
 * Keeps IPC calls from the renderer from writing to arbitrary paths. Allowed
 * are the folder opened and paths the user picked in a file dialog
 * themselves.
 */
const grantedPaths = new Set<string>();

function isInside(parent: string, target: string) {
  const rel = path.relative(parent, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function assertWritable(target: string) {
  if (grantedPaths.has(target)) {
    return;
  }
  // Lumen's own project files (~/.lumen/projects) — opened and saved like any other file.
  if (isProjectDataPath(target)) {
    return;
  }
  // The folders of every window: each one writes only through its own tree anyway.
  for (const root of openRoots()) {
    if (isInside(root, target)) {
      return;
    }
  }
  for (const granted of grantedPaths) {
    if (isInside(granted, target)) {
      return;
    }
  }
  throw new Error('Path lies outside the workspace folder');
}

/** The folders open in any window. */
function openRoots(): string[] {
  return [...contexts.values()].flatMap((ctx) => (ctx.workspaceRoot ? [ctx.workspaceRoot, ...ctx.extraRoots] : ctx.extraRoots));
}

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
class WorkspaceWatcher {
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


/* ------------------------------------------------------------------ *
 * Settings (userData/settings.json)
 * ------------------------------------------------------------------ */

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

async function loadSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

async function saveSettings(data: Record<string, unknown>) {
  await fs.mkdir(path.dirname(settingsFile()), { recursive: true });
  await fs.writeFile(settingsFile(), JSON.stringify(data, null, 2), 'utf8');
}

/* ------------------------------------------------------------------ *
 * The process runner
 * ------------------------------------------------------------------ */

/** Keyed by `scopedId`; the output goes to `owner` under the renderer's own id. */
const running = new Map<string, ChildProcess>();

/** Replace `${env:NAME}` with the environment variable. */
function expandEnv(value: string, env: Record<string, string | undefined>) {
  return value.replace(/\$\{env:(\w+)\}/g, (_m, name: string) => env[name] ?? '');
}

function runCommand(
  owner: WebContents, id: string, command: string, rawArgs: string[], cwd: string,
  env: Record<string, string> = {},
) {
  const key = scopedId(owner, id);
  killCommand(key);
  const merged = { ...process.env, ...env };
  const args = rawArgs.map((a) => expandEnv(a, merged));
  const child = spawn(expandEnv(command, merged), args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0', ...env },
    shell: process.platform === 'win32',
  });
  running.set(key, child);

  const post = (channel: string, payload: unknown) => {
    if (!owner.isDestroyed()) {
      owner.send(channel, payload);
    }
  };
  const send = (stream: 'stdout' | 'stderr', data: Buffer) =>
    post('run:data', { id, stream, data: data.toString() });

  child.stdout?.on('data', (d: Buffer) => send('stdout', d));
  child.stderr?.on('data', (d: Buffer) => send('stderr', d));
  // A rerun under the same id replaced this child — its late end must not remove the new one.
  const release = () => { if (running.get(key) === child) {
    running.delete(key);
  } };
  child.on('error', (err) => {
    post('run:data', { id, stream: 'stderr', data: `${err.message}\n` });
    release();
    post('run:exit', { id, code: -1 });
  });
  child.on('close', (code) => {
    release();
    post('run:exit', { id, code });
  });
}

function killCommand(key: string) {
  const child = running.get(key);
  if (!child) {
    return;
  }
  child.kill('SIGTERM');
  running.delete(key);
}

app.on('before-quit', () => {
  for (const id of [...running.keys()]) {
    killCommand(id);
  }
  for (const id of [...servers.keys()]) {
    stopLsp(id);
  }
  killAllTerminals();
  stopAllDebugAdapters();
  for (const ctx of contexts.values()) {
    for (const existing of ctx.watchers) {
      existing.close();
    }
  }
});

/* ------------------------------------------------------------------ *
 * Language servers (JSON-RPC over stdio)
 * ------------------------------------------------------------------ */

interface LspProcess {
  child: ChildProcess;
  /** A buffer for messages not yet complete. */
  buffer: Buffer;
  /** The renderer's id for the server — `servers` keys it per window. */
  id: string;
  owner: WebContents;
}

/** Keyed by `scopedId`. */
const servers = new Map<string, LspProcess>();

function postLsp(server: LspProcess, channel: string, payload: unknown) {
  if (server.owner.isDestroyed()) {
    return;
  }
  server.owner.send(channel, payload);
}

/** Checks whether a program lies in the PATH. */
function commandExists(command: string): Promise<boolean> {
  return resolveCommand(command).then((hit) => hit !== null);
}

/**
 * Resolves a program: absolute paths (with `~` as well) through the file
 * permissions, bare names through `which`/`where`. Returns the path to use.
 */
function resolveCommand(command: string): Promise<string | null> {
  const expanded = command.replace(/^~(?=\/|$)/, os.homedir());
  return new Promise((resolve) => {
    if (path.isAbsolute(expanded) || expanded.includes('/') || expanded.includes('\\')) {
      fs.access(expanded, fsSync.constants.X_OK).then(
        () => resolve(expanded),
        () => resolve(null),
      );
      return;
    }
    const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [expanded], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    probe.on('error', () => resolve(null));
    probe.on('close', (code) => resolve(code === 0 ? expanded : null));
  });
}

/**
 * The first candidate that exists. A server Lumen installed itself
 * (`~/.lumen/lsp/bin`) comes before anything on the PATH.
 */
async function resolveFirst(candidates: string[]): Promise<string | null> {
  const managed = candidates[0] ? await managedCommand(candidates[0]) : null;
  if (managed) {
    return managed;
  }
  for (const candidate of candidates) {
    const hit = await resolveCommand(candidate);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/**
 * Splits the stdout stream into LSP messages.
 * The frame: `Content-Length: <n>\r\n\r\n<n bytes of JSON>`
 */
function drainLsp(server: LspProcess) {
  for (;;) {
    const headerEnd = server.buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const header = server.buffer.subarray(0, headerEnd).toString('ascii');
    const match = /content-length:\s*(\d+)/i.exec(header);
    if (!match) {
      // An unusable frame — discard up to the end of the header.
      server.buffer = server.buffer.subarray(headerEnd + 4);
      continue;
    }

    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (server.buffer.length < start + length) {
      return;
    }

    const body = server.buffer.subarray(start, start + length).toString('utf8');
    server.buffer = server.buffer.subarray(start + length);

    try {
      postLsp(server, 'lsp:message', { id: server.id, message: JSON.parse(body) });
    } catch {
      // Skip broken JSON rather than lose the stream.
    }
  }
}

/**
 * The environment of a language server. Variables of a VS Code session that
 * started Lumen stay out: ModDevGradle, run inside jdtls' Gradle import,
 * takes `VSCODE_PID` as “running in VS Code” and writes `.vscode/launch.json`
 * into the project.
 */
function serverEnvironment(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    if (key.startsWith('VSCODE_')) {
      delete env[key];
    }
  }
  return env;
}

function startLsp(
  owner: WebContents, id: string, command: string, args: string[], cwd: string,
  env: Record<string, string> = {},
) {
  const key = scopedId(owner, id);
  stopLsp(key);
  // Create the data folder (jdtls -data, say) where the arguments name one.
  for (const arg of args) {
    if (arg.startsWith(app.getPath('userData'))) {
      try { fsSync.mkdirSync(arg, { recursive: true }); } catch { /* egal */ }
    }
  }
  // Through the Windows shell a path with spaces (C:\Users\Jane Doe\…) has to be quoted.
  const quoted = process.platform === 'win32' && command.includes(' ') && !command.startsWith('"');
  const child = spawn(quoted ? `"${command}"` : command, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: serverEnvironment(env),
    shell: process.platform === 'win32',
  });
  const server: LspProcess = { child, buffer: Buffer.alloc(0), id, owner };
  servers.set(key, server);

  child.stdout?.on('data', (chunk: Buffer) => {
    server.buffer = Buffer.concat([server.buffer, chunk]);
    drainLsp(server);
  });
  // The servers' stderr is often chatty — pass it on for debugging only.
  child.stderr?.on('data', (chunk: Buffer) => {
    postLsp(server, 'lsp:stderr', { id, text: chunk.toString() });
  });
  // A restart uses the same id. The late end of the old process must neither
  // delete the entry of the new one nor report its client as having crashed.
  child.on('error', (err) => {
    if (servers.get(key) !== server) {
      return;
    }
    servers.delete(key);
    postLsp(server, 'lsp:closed', { id, reason: err.message });
  });
  child.on('close', (code) => {
    if (servers.get(key) !== server) {
      return;
    }
    servers.delete(key);
    postLsp(server, 'lsp:closed', { id, reason: `beendet (Code ${code})` });
  });
}

/** `LUMEN_TRACE_LSP=1` prints the document sync sent to servers — for debugging drift between editor and server. */
const TRACE_LSP = process.env.LUMEN_TRACE_LSP === '1';

function traceLsp(id: string, message: unknown) {
  const { method, params } = message as { method?: string; params?: { textDocument?: { uri?: string; version?: number; }; contentChanges?: unknown[]; }; };
  if (!method?.startsWith('textDocument/did') && method !== 'workspace/didChangeWatchedFiles') {
    return;
  }
  console.log(`[lsp ${id}] ${method} ${params?.textDocument?.uri ?? ''} v${params?.textDocument?.version ?? ''} ${JSON.stringify(params?.contentChanges ?? (params as Record<string, unknown>)?.changes ?? '').slice(0, 400)}`);
}

function sendLsp(key: string, message: unknown) {
  if (TRACE_LSP) {
    traceLsp(key, message);
  }
  const server = servers.get(key);
  if (!server?.child.stdin?.writable) {
    return false;
  }
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  server.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  server.child.stdin.write(body);
  return true;
}

function stopLsp(key: string) {
  const server = servers.get(key);
  if (!server) {
    return;
  }
  servers.delete(key);
  server.child.stdin?.end();
  server.child.kill('SIGTERM');
  // Kill hanging servers outright after a short wait.
  // `killed` becomes true as soon as SIGTERM is sent — what counts is whether it has ended.
  setTimeout(() => {
    if (server.child.exitCode === null && server.child.signalCode === null) {
      server.child.kill('SIGKILL');
    }
  }, 2000);
}

/** Marker folders that only say “a repository starts here” — the last resort for a root. */
const VCS_MARKERS = new Set(['.git', '.hg', '.svn']);

async function hasAny(dir: string, markers: string[]): Promise<boolean> {
  for (const marker of markers) {
    if (await fs.access(path.join(dir, marker)).then(() => true, () => false)) {
      return true;
    }
  }
  return false;
}

/** The folders from `startDir` up to the working folder containing it (or the file system root). */
function ancestors(startDir: string): string[] {
  const containing = openRoots().find((dir) => isInside(dir, startDir));
  const limit = containing ?? path.parse(startDir).root;
  const out: string[] = [];
  let dir = startDir;
  for (;;) {
    out.push(dir);
    const parent = path.dirname(dir);
    if (dir === limit || parent === dir) {
      return out;
    }
    dir = parent;
  }
}

async function findProjectRoot(startDir: string, markers: string[], mode: 'nearest' | 'outermost'): Promise<string | null> {
  const dirs = ancestors(startDir);
  const build = markers.filter((marker) => !VCS_MARKERS.has(marker));
  const vcs = markers.filter((marker) => VCS_MARKERS.has(marker));
  if (mode === 'nearest') {
    for (const dir of dirs) {
      if (await hasAny(dir, markers)) {
        return dir;
      }
    }
    return null;
  }
  let outermost: string | null = null;
  for (const dir of dirs) {
    if (await hasAny(dir, build)) {
      outermost = dir;
    }
  }
  if (outermost) {
    return outermost;
  }
  for (const dir of dirs) {
    if (await hasAny(dir, vcs)) {
      return dir;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

/** Every file below `root`, depth-first, up to `limit` entries. */
async function listFilesUnder(root: string, limit: number): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string) {
    if (files.length >= limit) {
      return;
    }
    let entries: DirEntry[];
    try { entries = await readDirectory(dir); } catch { return; }
    for (const e of entries) {
      if (files.length >= limit) {
        return;
      }
      if (!e.isDirectory) {
        files.push(e.path);
        continue;
      }
      await walk(e.path);
    }
  }
  await walk(root);
  return files;
}

/** Case-insensitive line search over text files below `root`. */
async function searchInFiles(root: string, query: string, limit: number) {
  const needle = query.toLowerCase();
  const hits: { path: string; line: number; text: string; }[] = [];

  async function walk(dir: string) {
    if (hits.length >= limit) {
      return;
    }
    let entries: DirEntry[];
    try { entries = await readDirectory(dir); } catch { return; }
    for (const e of entries) {
      if (hits.length >= limit) {
        return;
      }
      if (e.isDirectory) { await walk(e.path); continue; }
      try {
        const stat = await fs.stat(e.path);
        if (stat.size > 1024 * 512) {
          continue;
        }
        const buf = await fs.readFile(e.path);
        if (buf.subarray(0, 2048).includes(0)) {
          continue;
        }
        const lines = buf.toString('utf8').split('\n');
        for (let i = 0; i < lines.length && hits.length < limit; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            hits.push({ path: e.path, line: i + 1, text: lines[i].trim().slice(0, 200) });
          }
        }
      } catch { /* unreadable — skip */ }
    }
  }

  if (needle) {
    await walk(root);
  }
  return hits;
}

/** Window controls act on the window that asked. */
const senderWindow = (contents: WebContents) => BrowserWindow.fromWebContents(contents);

function registerIpc() {
  registerWindowIpc();
  registerAppIpc();
  registerDialogIpc();
  registerFsIpc();
  registerWorkspaceIpc();
  registerLspIpc();
  registerShellIpc();
}

function registerWindowIpc() {
  ipcMain.handle('window:minimize', (e) => senderWindow(e.sender)?.minimize());
  ipcMain.handle('window:toggleMaximize', (e) => {
    const win = senderWindow(e.sender);
    if (!win) {
      return false;
    }
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });
  ipcMain.handle('window:close', (e) => e.sender.send('app:close-request'));
  ipcMain.handle('window:forceClose', (e) => {
    const ctx = contextOf(e.sender);
    if (ctx) {
      ctx.forceClose = true;
    }
    const win = senderWindow(e.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });
  ipcMain.handle('window:isMaximized', (e) => senderWindow(e.sender)?.isMaximized() ?? false);
  /** A project in a window of its own; without one, an empty window at the project screen. */
  ipcMain.handle('window:openProject', (e, folder?: string) => {
    const project = typeof folder === 'string' && path.isAbsolute(folder) ? folder : undefined;
    if (project && senderWindow(e.sender) === projectsWindow) {
      handOver({ project });
      return 'opened';
    }
    return openProjectWindow(project);
  });
  /** The project screen's choice: a saved workspace, or the editor without a project. */
  ipcMain.handle('window:handOver', (e, request: { workspace?: string; empty?: boolean; }) => {
    if (senderWindow(e.sender) !== projectsWindow) {
      return false;
    }
    handOver({ workspace: typeof request?.workspace === 'string' ? request.workspace : undefined, empty: request?.empty === true });
    return true;
  });
  /** Clipboard and selection commands for the menu bar — they act on whatever has focus. */
  ipcMain.handle('window:edit', (e, action: string) => {
    const actions: Record<string, () => void> = {
      cut: () => e.sender.cut(),
      copy: () => e.sender.copy(),
      paste: () => e.sender.paste(),
      selectAll: () => e.sender.selectAll(),
    };
    actions[String(action)]?.();
  });
  ipcMain.handle('window:toggleDevTools', (e) => e.sender.toggleDevTools());
}

function registerAppIpc() {
  // Once only: the renderer collects the start folder, after which it is spent.
  ipcMain.handle('app:startupFolder', () => {
    const folder = pendingFolder;
    pendingFolder = null;
    return folder;
  });

  ipcMain.handle('app:info', () => ({
    platform: process.platform,
    version: app.getVersion(),
    home: os.homedir(),
    userData: app.getPath('userData'),
    tmp: app.getPath('temp'),
    windowSystem: currentWindowSystem(),
    waylandSession: isWaylandSession(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }));
  /** “Exit”: every window asks about its unsaved changes and closes; the last one ends the app. */
  ipcMain.handle('app:quit', () => {
    for (const ctx of contexts.values()) {
      if (!ctx.win.isDestroyed()) {
        ctx.win.webContents.send('app:close-request');
      }
    }
  });
  ipcMain.handle('app:relaunch', () => {
    forceClose = true;
    relaunchApp();
  });
}

function registerDialogIpc() {
  ipcMain.handle('dialog:openFolder', async (e) => {
    const res = await showOpen(e.sender, { properties: ['openDirectory'] });
    const folder = res.filePaths[0];
    if (res.canceled || !folder) {
      return null;
    }
    const ctx = contextOf(e.sender);
    if (ctx) {
      setContextRoots(ctx, folder, []);
    }
    return folder;
  });

  ipcMain.handle('dialog:chooseFolder', async (e, title?: string, defaultPath?: string) => {
    const res = await showOpen(e.sender, {
      title: title ?? 'Choose folder',
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) {
      return null;
    }
    grantedPaths.add(res.filePaths[0]);
    return res.filePaths[0];
  });

  ipcMain.handle('dialog:chooseFile', async (e, title?: string, defaultPath?: string) => {
    const res = await showOpen(e.sender, { title, defaultPath, properties: ['openFile'] });
    if (res.canceled || !res.filePaths[0]) {
      return null;
    }
    return res.filePaths[0];
  });

  ipcMain.handle('dialog:openFile', async (e) => {
    const res = await showOpen(e.sender, { properties: ['openFile'] });
    if (res.canceled || !res.filePaths[0]) {
      return null;
    }
    const file = res.filePaths[0];
    grantedPaths.add(file);
    return { path: file, content: await fs.readFile(file, 'utf8') };
  });

  ipcMain.handle('dialog:saveFile', async (e, suggested: string) => {
    const res = await showSave(e.sender, { defaultPath: suggested });
    if (res.canceled || !res.filePath) {
      return null;
    }
    grantedPaths.add(res.filePath);
    return res.filePath;
  });
}

function registerFsIpc() {
  ipcMain.handle('fs:readDir', (_e, dir: string) => readDirectory(dir));

  ipcMain.handle('fs:exists', (_e, target: string) =>
    fs.access(target).then(() => true, () => false));

  ipcMain.handle('fs:stat', async (_e, target: string) => {
    try {
      const st = await fs.stat(target);
      return { isDirectory: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
    } catch {
      return null;
    }
  });

  /** The contents of a folder including dot entries — for project detection. */
  ipcMain.handle('fs:list', async (_e, dir: string) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
    } catch {
      return [];
    }
  });

  ipcMain.handle('fs:readFile', async (_e, file: string) => {
    const stat = await fs.stat(file);
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`File is too large (${(stat.size / 1048576).toFixed(1)} MB)`);
    }
    const buf = await fs.readFile(file);
    // A rough check for binary content: a NUL byte in the head of the file.
    if (buf.subarray(0, 4096).includes(0)) {
      throw new Error('Binary file');
    }
    return buf.toString('utf8');
  });

  ipcMain.handle('fs:writeFile', async (_e, file: string, content: string) => {
    assertWritable(file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
    return true;
  });

  ipcMain.handle('fs:create', async (_e, target: string, isDir: boolean) => {
    assertWritable(target);
    const existing = await fs.stat(target).catch(() => null);
    if (existing && !isDir) {
      throw new Error(`“${path.basename(target)}” already exists`);
    }
    if (existing && isDir && !existing.isDirectory()) {
      throw new Error(`“${path.basename(target)}” is already a file`);
    }
    if (isDir) {
      await fs.mkdir(target, { recursive: true });
      return true;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, '', { flag: 'wx' });
    return true;
  });

  ipcMain.handle('fs:rename', async (_e, from: string, to: string) => {
    assertWritable(from);
    assertWritable(to);
    if (from !== to && await fs.access(to).then(() => true, () => false)) {
      throw new Error(`“${path.basename(to)}” already exists`);
    }
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.rename(from, to);
    return true;
  });

  ipcMain.handle('fs:copy', async (_e, from: string, to: string) => {
    assertWritable(to);
    if (isInside(from, to)) {
      throw new Error(`“${path.basename(from)}” cannot be copied into itself`);
    }
    if (await fs.access(to).then(() => true, () => false)) {
      throw new Error(`“${path.basename(to)}” already exists`);
    }
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    return true;
  });

  ipcMain.handle('fs:delete', async (_e, target: string) => {
    assertWritable(target);
    await shell.trashItem(target);
    return true;
  });

  ipcMain.handle('fs:listFiles', (_e, root: string, limit = 5000) => listFilesUnder(root, limit));

  ipcMain.handle('fs:search', (_e, root: string, query: string, limit = 200) => searchInFiles(root, query, limit));
}

function registerWorkspaceIpc() {
  ipcMain.handle('workspace:set', (e, root: string, extras?: string[]) => {
    const ctx = contextOf(e.sender);
    if (!ctx) {
      return root;
    }
    setContextRoots(ctx, root, Array.isArray(extras) ? extras.filter((dir) => typeof dir === 'string' && path.isAbsolute(dir)) : []);
    return root;
  });

  ipcMain.handle('settings:load', () => loadSettings());
  ipcMain.handle('settings:save', (_e, data: Record<string, unknown>) => saveSettings(data));

  ipcMain.handle('run:start', (
    e, id: string, cmd: string, args: string[], cwd: string, env?: Record<string, string>,
  ) => {
    runCommand(e.sender, id, cmd, args, cwd, env ?? {});
    return id;
  });
  ipcMain.handle('run:kill', (e, id: string) => killCommand(scopedId(e.sender, id)));

  /**
   * Searches from `startDir` upwards (as far as the working folder) for project
   * markers. `nearest` returns the first folder holding one; `outermost` the
   * highest — the top of a multi-module build (the Maven reactor, the folder
   * with `settings.gradle`) rather than the module the file sits in. Version
   * control folders (`.git` …) only count when no other marker is found.
   */
  ipcMain.handle('fs:findRoot', (_e, startDir: string, markers: string[], mode: 'nearest' | 'outermost' = 'nearest') =>
    findProjectRoot(startDir, markers, mode));
}

function registerLspIpc() {
  ipcMain.handle('lsp:available', (_e, command: string) => commandExists(command));
  ipcMain.handle('lsp:resolve', (_e, candidates: string[]) => resolveFirst(candidates));
  ipcMain.handle('lsp:start', (
    e, id: string, cmd: string, args: string[], cwd: string, env?: Record<string, string>,
  ) => {
    startLsp(e.sender, id, cmd, args, cwd, env ?? {});
    return id;
  });
  ipcMain.handle('lsp:send', (e, id: string, message: unknown) => sendLsp(scopedId(e.sender, id), message));
  ipcMain.handle('lsp:stop', (e, id: string) => stopLsp(scopedId(e.sender, id)));
  /** Delete a server's data folder (jdtls' workspace) — only below userData/lsp. */
  ipcMain.handle('lsp:clearData', async (_e, dir: string) => {
    const base = path.join(app.getPath('userData'), 'lsp');
    const target = path.resolve(String(dir));
    if (!isInside(base, target) || target === base) {
      throw new Error('Not a language server data folder');
    }
    await fs.rm(target, { recursive: true, force: true });
  });
}

function registerShellIpc() {
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) {
      return shell.openExternal(url);
    }
  });
  ipcMain.handle('terminal:shells', () => detectShells());
  ipcMain.handle('terminal:external', () => detectExternalTerminals());
  ipcMain.handle('terminal:create', (e, id: string, options: TerminalOptions) =>
    createTerminal(id, options, e.sender));
  ipcMain.handle('terminal:write', (e, id: string, data: string) => writeTerminal(terminalKey(e.sender, id), data));
  ipcMain.handle('terminal:resize', (e, id: string, cols: number, rows: number) => resizeTerminal(terminalKey(e.sender, id), cols, rows));
  ipcMain.handle('terminal:kill', (e, id: string) => killTerminal(terminalKey(e.sender, id)));
  ipcMain.handle('terminal:openExternal', (e, cwd: string, terminalId?: string) => {
    const target = cwd && fsSync.existsSync(cwd) ? cwd : (contextOf(e.sender)?.workspaceRoot ?? os.homedir());
    return openExternalTerminal(target, terminalId);
  });

  ipcMain.handle('shell:showItemInFolder', (_e, target: string) => shell.showItemInFolder(target));
}
