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
 * The shape of the application state.
 *
 * The store is put together from slices (`state/slices/*`), one per area:
 * the app shell, the workspace and its project, the editor's tabs and groups,
 * the window layout, the appearance, and the extension settings. Each slice
 * declares its state and its actions here, so every slice can call every
 * other through `get()` with full types.
 */

import type { FormatSettings, LanguageFormat } from '@/core/format-settings';
import type { StateCreator } from 'zustand';
import type { ExtensionManifest, ExtensionServer } from '@/core/extensions/types';
import type { ContentChange } from '@/core/lsp/client';
import type { Effects } from '@/core/theme';
import type { PopoutBounds, PopoutEntry } from './popout';
import type { ProjectInfo } from '@/core/project/detect';
import type { ProjectConfig } from '@/core/project/config';
import type { ScaffoldProgress } from '@/core/project/scaffold';
import type {
  DependencySpec, FormField, FormValues, IconPack, LanguageSpec, ProjectTemplate, Theme,
} from '@/core/types';
import type { Dock } from '@/core/views';
import type { LanguageSetting } from '@/i18n';
import type { BindingMap, PresetId } from '@/core/keybindings';
import type { MediaKind } from '@/lib/media-kind';
import type { LayoutState, NavSide } from './layout';

/* ------------------------------------------------------------------ *
 * Shared records
 * ------------------------------------------------------------------ */

export interface Tab {
  id: string;
  path: string | null;
  name: string;
  content: string;
  /** The content as of the last save — the basis for the dirty marker. */
  saved: string;
  languageId: string | null;
  /** Opened with a single click: replaced the next time something is opened. */
  preview: boolean;
  /** Not editable (classes from the JDK, for instance). */
  readonly?: boolean;
  /** Not a file path but a server URI (jdt://…). */
  virtual?: boolean;
  /** The file has been deleted on disk. */
  missing?: boolean;
  /** The file changed on disk while the tab has unsaved changes. */
  diskChanged?: boolean;
  /** Shown in a non-text viewer (image, video, …) rather than the editor. */
  viewer?: MediaKind;
  /** Bumped whenever a viewer's file changed on disk — the viewer reloads. */
  revision?: number;
  /** The file's line ending on disk; `content` always holds "\n" (see lib/line-endings). */
  eol?: '\n' | '\r\n';
}

export interface FsChange {
  path: string;
  type: 1 | 2 | 3;
}

/** A generic form dialog (adding a dependency, input of any kind). */
export interface FormDialogSpec {
  title: string;
  description?: string;
  /** A value to read out in full below the description — a checksum, say — selectable in one click. */
  detail?: { label: string; value: string; };
  fields: FormField[];
  initial?: FormValues;
  submitLabel?: string;
  /** Returning a string means an error message: the dialog stays open. */
  onSubmit(values: FormValues): Promise<string | void> | string | void;
  /** Closed without submitting — Esc, the backdrop, Cancel. */
  onCancel?(): void;
}

export interface OutputLine {
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'warning' | 'error';
}

/**
 * The views that used to live in the side bar. Any view id works — the
 * built-in ones are listed for completion, `ext:<extension>:<page>`,
 * `agent:<extension>/<agent>` and `view:<extension>/<view>` belong to
 * extensions.
 */
export type ExtensionPageView = `ext:${string}`;
export type AgentView = `agent:${string}`;
export type ExtensionCodeView = `view:${string}`;
export type SidebarView = 'explorer' | 'search' | 'project' | 'outline' | 'debug' | ExtensionPageView | AgentView | ExtensionCodeView;

/** The views that used to be tabs of the bottom panel. */
export type PanelTab = 'output' | 'terminal' | 'problems' | 'references' | 'lsp' | 'debug';

/** Large dialogs that sit above the interface (the lower icons of the navigation). */
export type DialogId = 'settings' | 'themes' | 'keybindings' | 'sdks' | 'workspaces' | 'extensions';

/** An editor group (split view): its own tab bar, its own active tab. */
export interface EditorGroup {
  id: string;
  tabIds: string[];
  activeTabId: string | null;
}

export type SplitDirection = 'right' | 'down';

/** A named workspace: several folders plus the files last open and the split. */
export interface WorkspaceDef {
  id: string;
  name: string;
  color: string;
  /** Absolute paths; `activeFolder` is one of them. */
  folders: string[];
  /** The folder whose project, language server and tasks currently apply. */
  activeFolder: string;
  session?: {
    groups: string[][];
    splitDirection: SplitDirection;
    activeGroup: number;
  };
  openedAt: number;
}

export type PaletteMode = false | 'commands' | 'files' | 'symbols' | 'workspace-symbols' | 'tasks' | 'everywhere';

/** The tabs of “Search everywhere” (double shift). */
export type EverywhereTab = 'all' | 'files' | 'symbols' | 'actions' | 'tasks' | 'text';

/** An artefact already present on the device. */
export interface LocalDependency {
  name: string;
  versions: string[];
}

export interface RecentProject {
  path: string;
  name: string;
  kind?: string;
  color?: string;
  icon?: string;
  openedAt: number;
}

export interface ReferenceHit {
  path: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  /** The line of text, once loaded. */
  preview?: string;
}

export interface ReferenceResult {
  title: string;
  hits: ReferenceHit[];
  loading: boolean;
}

export interface RevealRequest {
  tabId: string;
  /** The group that should jump — otherwise the active one. */
  groupId?: string;
  line: number;
  character: number;
  endLine?: number;
  endCharacter?: number;
  token: number;
}

export interface CursorInfo {
  line: number;
  character: number;
}

/** What goes into `userData/settings.json`. */
export interface PersistedSettings {
  themeId: string;
  customThemes: Theme[];
  effects: Effects;
  enabledAddons: string[];
  lastFolder: string | null;
  recentFolders: string[];
  recentProjects: RecentProject[];
  layout: LayoutState;
  language: LanguageSetting;
  keymapPreset: PresetId;
  keybindingOverrides: BindingMap;
  splitRatio: number;
  workspaces: WorkspaceDef[];
  currentWorkspaceId: string | null;
  iconPackId: string;
  customIconPacks: IconPack[];
  /** Languages for which nobody wants to be asked about installing a server again. */
  lspInstallDeclined: string[];
  /** The extension servers on record. */
  extensionServers: ExtensionServer[];
  /** The values of the extension settings, per extension. */
  extensionSettings: Record<string, Record<string, string>>;
  /** Formatting settings per language id. */
  formatSettings?: FormatSettings;
  /** Before docks: the width of the one side bar and the height of the panel. */
  sidebarWidth?: number;
  panelHeight?: number;
}

/* ------------------------------------------------------------------ *
 * Slices
 * ------------------------------------------------------------------ */

/** The shell: startup, persistence, overlays, notifications, language and keys. */
export interface AppSlice {
  ready: boolean;
  platform: string;
  language: LanguageSetting;
  keymapPreset: PresetId;
  keybindingOverrides: BindingMap;
  /** The large dialog open, and optionally the section within it. */
  dialog: DialogId | null;
  dialogSection: string | null;
  /** A hint in the status bar while a key sequence waits for its second chord. */
  chordHint: string | null;
  /** Is a debug session running? (set by the debugger) */
  debugActive: boolean;
  paletteOpen: PaletteMode;
  everywhereTab: EverywhereTab;
  newProjectOpen: boolean;
  formDialog: FormDialogSpec | null;
  toasts: Toast[];
  /** Increases on every state change of a language server. */
  lspVersion: number;
  /** Increases on new log lines from the servers. */
  lspLogVersion: number;

  init(): Promise<void>;
  persist(): void;
  openDialog(id: DialogId, section?: string): void;
  closeDialog(): void;
  setChordHint(hint: string | null): void;
  setLanguage(language: LanguageSetting | string): void;
  setKeymapPreset(preset: PresetId): void;
  /** `null` restores the binding of the preset. */
  setKeybinding(commandId: string, bindings: string[] | null): void;
  resetKeybindings(): void;
  applyKeybindings(): void;
  setPalette(open: PaletteMode): void;
  openEverywhere(tab?: EverywhereTab): void;
  setEverywhereTab(tab: EverywhereTab): void;
  setNewProjectOpen(open: boolean): void;
  openForm(spec: FormDialogSpec): void;
  closeForm(): void;
  notify(message: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
}

/** The opened folder, the workspace around it, and the project detected in it. */
export interface WorkspaceSlice {
  workspace: string | null;
  /** Further folders of the workspace besides `workspace` (explorer, write access, watching). */
  extraFolders: string[];
  workspaces: WorkspaceDef[];
  currentWorkspaceId: string | null;
  recentProjects: RecentProject[];
  /** Artefacts from the local Maven and Gradle stores — suggestions when adding one. */
  localDependencies: LocalDependency[];
  project: ProjectInfo | null;
  projectConfig: ProjectConfig;
  projectLoading: boolean;

  openFolder(): Promise<void>;
  setWorkspace(root: string, options?: { keepTabs?: boolean; restoreFiles?: boolean; }): Promise<void>;
  closeWorkspace(): Promise<void>;
  /** Open a workspace: save the session of the old one, load the folders and files of the new. */
  openWorkspace(id: string): Promise<void>;
  /** Save the current folders as a (new) workspace. */
  saveWorkspace(name?: string): WorkspaceDef | null;
  updateWorkspace(id: string, patch: Partial<Pick<WorkspaceDef, 'name' | 'color'>>): void;
  deleteWorkspace(id: string): void;
  /** Add a folder (without a path: a chooser). Creates a workspace where needed. */
  addFolderToWorkspace(path?: string): Promise<void>;
  removeFolderFromWorkspace(path: string): Promise<void>;
  /** Make another folder of the workspace active; the tabs stay open. */
  setActiveFolder(path: string): Promise<void>;
  exportWorkspace(id: string): Promise<void>;
  importWorkspace(): Promise<void>;
  removeRecent(path: string): void;
  /** Read the local Maven and Gradle stores (once per session). */
  loadLocalDependencies(): Promise<void>;

  refreshProject(): Promise<void>;
  /** Read the project configuration afresh — after it was edited in a tab, say. */
  reloadProjectConfig(): Promise<void>;
  updateProjectConfig(patch: Partial<ProjectConfig>): Promise<void>;
  /** Open the project configuration in the editor, creating it where needed. */
  openProjectConfig(): Promise<void>;
  setPreferredLsp(languageId: string, label: string | null): Promise<void>;
  createProject(
    template: ProjectTemplate, parentDir: string, name: string,
    values: FormValues, options?: CreateProjectOptions,
  ): Promise<void>;
  addDependency(kindId: string, dep: DependencySpec): Promise<void>;
  openDependencyDialog(kindId?: string): void;
}

/** How “New project” finishes: what runs afterwards and where the project opens. */
export interface CreateProjectOptions {
  setup?: boolean;
  git?: boolean;
  /** `new` opens the project in a window of its own; defaults to this one. */
  window?: 'this' | 'new';
  onProgress?: (progress: ScaffoldProgress) => void;
}

/** Open files: tabs, editor groups, saving, and keeping up with the disk. */
export interface EditorSlice {
  tabs: Tab[];
  /** The active tab of the active editor group. */
  activeTabId: string | null;
  groups: EditorGroup[];
  activeGroupId: string;
  splitDirection: SplitDirection;
  /** The share of the first group (0.15 – 0.85). */
  splitRatio: number;
  /** The paths of the tabs closed most recently, newest first. */
  closedTabs: string[];
  cursor: CursorInfo;
  reveal: RevealRequest | null;
  /** The files opened most recently, newest first — for “Search everywhere”. */
  recentFiles: string[];

  openFile(path: string, preview?: boolean): Promise<void>;
  /** An SVG: switch between the image preview and the text editor. */
  setTabTextMode(id: string, text: boolean): Promise<void>;
  openAt(path: string, line: number, character: number, endLine?: number, endCharacter?: number): Promise<void>;
  openVirtual(uri: string, name: string, content: string, languageId: string | null): void;
  consumeReveal(): void;
  newFile(): void;
  /** Close a tab in one group (by default the active one, or the one showing it). */
  closeTab(id: string, groupId?: string): void;
  /** Close a tab in every group. */
  closeTabEverywhere(id: string): void;
  closeOthers(id: string): void;
  closeAll(): void;
  setActiveTab(id: string, groupId?: string): void;
  cycleTab(delta: number): void;
  reopenClosedTab(): Promise<void>;
  /** Move a tab by dragging (into another group as well). */
  moveTab(tabId: string, fromGroupId: string, toGroupId: string, index?: number): void;
  splitEditor(direction: SplitDirection): void;
  unsplitEditor(): void;
  focusGroup(index: number): void;
  focusNextGroup(): void;
  moveTabToOtherGroup(): void;
  setSplitRatio(ratio: number): void;
  retargetTab(id: string, path: string): void;
  /** After a rename or move in the file tree: bring the open tabs along. */
  pathRenamed(from: string, to: string): void;
  /** After a deletion in the file tree: close the open tabs below it. */
  pathDeleted(path: string): void;
  reloadTab(id: string): Promise<void>;
  handleFsChanges(changes: FsChange[]): Promise<void>;
  /** Reconcile every open tab with the disk (on window focus, say). */
  syncTabsWithDisk(): Promise<void>;
  updateContent(id: string, content: string, changes?: ContentChange[]): void;
  pinTab(id: string): void;
  setCursor(cursor: CursorInfo): void;
  saveTab(id?: string): Promise<void>;
  saveAll(): Promise<void>;

  activeTab(): Tab | null;
  languageFor(tab: Tab | null): LanguageSpec | null;
  languages(): LanguageSpec[];
}

/** The window: docks and their views, the run output, references and terminals. */
export interface LayoutSlice {
  layout: LayoutState;
  output: OutputLine[];
  runningId: string | null;
  /** The label of the running task. */
  runningLabel: string | null;
  references: ReferenceResult | null;

  /** Open the dock holding the view and bring the view to the front. */
  showView(id: string): void;
  /** Show the view, or close its dock when it is already what the dock shows. */
  toggleView(id: string): void;
  /** Move a view into a dock (at a position) — by dragging or through its menu. */
  moveView(id: string, dock: Dock, index?: number): void;
  toggleDock(dock: Dock, open?: boolean): void;
  setDockSize(dock: Dock, px: number): void;
  /** Put the panel navigation on the left or the right; the side docks trade places. */
  setNavSide(side: NavSide): void;
  resetLayout(): void;

  /** A view on the navigation side; the same as `showView`. */
  showSidebar(view: SidebarView): void;
  /** Toggle a view on the navigation side; `null` closes that dock. */
  setSidebarView(view: SidebarView | null): void;
  /** A view that used to be a tab of the bottom panel. */
  showPanel(tab: PanelTab): void;
  setPanelTab(tab: PanelTab): void;
  togglePanel(open?: boolean): void;
  toggleTerminal(target?: EventTarget | null): void;

  clearOutput(): void;
  appendOutput(line: OutputLine): void;
  setRunning(id: string | null, label?: string | null): void;
  setReferences(result: ReferenceResult | null): void;
  /** Open a new built-in terminal. */
  openTerminal(options?: { shell?: string; cwd?: string; command?: string; title?: string; }): Promise<void>;
  openExternalTerminal(cwd?: string, terminalId?: string): Promise<void>;
}

/** Themes, effects, icon packs, their studios, and switching add-ons. */
export interface AppearanceSlice {
  themeId: string;
  /** Themes created in the theme studio. */
  customThemes: Theme[];
  /** The theme currently being edited in the studio (applied live). */
  editingThemeId: string | null;
  effects: Effects;
  enabledAddons: string[];
  /** Increases when the add-on registry changes. */
  registryVersion: number;
  /** The add-on studio: `addonId` null means a new add-on. */
  addonStudio: { addonId: string | null; starter?: 'toolkit'; } | null;
  /** The active icon pack. */
  iconPackId: string;
  /** Packs created in the icon studio. */
  customIconPacks: IconPack[];
  /** The open icon studio: a draft, saved only on “Save”. */
  iconStudio: { draft: IconPack; isNew: boolean; } | null;
  /** Formatting settings per language id (tab width, quotes …). */
  formatSettings: FormatSettings;

  setFormat(languageId: string, patch: Partial<LanguageFormat>): void;
  resetFormat(languageId: string): void;
  setTheme(id: string): void;
  setEffects(patch: Partial<Effects>): void;
  resetEffects(): void;
  openThemeStudio(baseId?: string): void;
  closeThemeStudio(cancel: boolean): void;
  previewTheme(theme: Theme): void;
  saveCustomTheme(theme: Theme): void;
  deleteCustomTheme(id: string): void;
  duplicateTheme(id: string): string | null;
  importTheme(): Promise<void>;
  exportTheme(id: string): Promise<void>;

  setIconPack(id: string): void;
  /** Open the icon studio: edit your own pack, otherwise a copy of `baseId` (default: the active pack). */
  openIconStudio(baseId?: string, blank?: boolean): void;
  closeIconStudio(): void;
  saveCustomIconPack(pack: IconPack): void;
  deleteCustomIconPack(id: string): void;
  duplicateIconPack(id: string): string | null;
  importIconPack(): Promise<void>;
  exportIconPack(id: string): Promise<void>;

  toggleAddon(id: string): void;
  /** `starter`: a new add-on from an example rather than an empty one. */
  openAddonStudio(addonId?: string | null, starter?: 'toolkit'): void;
  closeAddonStudio(): void;
  themes(): Theme[];
}

/** Extension servers, extension settings and remembered answers about language servers. */
export interface ExtensionSlice {
  /** The extension servers on record; the official one always comes first. */
  extensionServers: ExtensionServer[];
  /** The values of the extension settings, per extension and key. */
  extensionSettings: Record<string, Record<string, string>>;
  /** Languages for which the offer of a language server was declined. */
  lspInstallDeclined: string[];

  /** Record an extension server; returns a message when it is no good. */
  addExtensionServer(url: string): Promise<string | null>;
  removeExtensionServer(url: string): void;
  setExtensionServer(url: string, patch: Partial<ExtensionServer>): void;
  /** Set the value of an extension setting. */
  setExtensionSetting(extensionId: string, key: string, value: string): void;
  /** Record the defaults of a manifest without overwriting what is there. */
  applyExtensionDefaults(manifest: ExtensionManifest): void;
  /** Forget the settings of an extension that has been removed. */
  forgetExtensionSettings(extensionId: string): void;
  /** Stop asking about a language server for this language. */
  declineLspInstall(languageId: string): void;
}

/** Views and editor groups in windows of their own (`state/popout.ts`). */
export interface PopoutSlice {
  popouts: PopoutEntry[];

  /** Move a dock view into a window of its own; a window that exists is brought forward. */
  popOutView(id: string): void;
  /** Move an editor tab (the active one without an id) into a new window, as a group of its own. */
  popOutTab(tabId?: string): void;
  /** Move a whole editor group into a window of its own. */
  popOutGroup(groupId: string): void;
  /** Close the window and return its view or tabs where they came from. */
  dockBack(key: string): void;
  dockAllBack(): void;
  focusPopout(key: string): void;
  /** The window moved or was resized. */
  setPopoutBounds(key: string, bounds: PopoutBounds): void;
}

export type State = AppSlice & WorkspaceSlice & EditorSlice & LayoutSlice & PopoutSlice & AppearanceSlice & ExtensionSlice;

/** A slice of the store, with `get()` typed as the whole of it. */
export type Slice<T> = StateCreator<State, [], [], T>;
