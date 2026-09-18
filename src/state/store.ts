import { create } from 'zustand'
import { registry } from '@/core/registry'
import { lsp } from '@/core/lsp/manager'
import { fetchServerInfo } from '@/core/extensions/client'
import { isOfficial, normalizeServerUrl } from '@/core/extensions/trust'
import { OFFICIAL_SERVER_URL, type ExtensionManifest, type ExtensionServer } from '@/core/extensions/types'
import { isVirtualUri } from '@/core/lsp/protocol'
import type { ContentChange } from '@/core/lsp/client'
import { matchLanguage } from '@/core/language'
import { applyEffects, applyTheme, DEFAULT_EFFECTS, type Effects } from '@/core/theme'
import { detectProject, type ProjectInfo } from '@/core/project/detect'
import {
  EMPTY_PROJECT_CONFIG, loadProjectConfig, saveProjectConfig, type ProjectConfig,
} from '@/core/project/config'
import { scaffoldProject } from '@/core/project/scaffold'
import { projectContext } from '@/core/project/detect'
import { editorBridge } from '@/lib/editor-bridge'
import { terminals } from '@/lib/terminals'
import { symbolStore } from '@/lib/symbols'
import { ALL_ADDONS, DEFAULT_ENABLED } from '@/addons'
import { DEFAULT_THEME_ID } from '@/addons/builtin/themes'
import { DEFAULT_ICON_PACK_ID } from '@/addons/builtin/icons'
import { isIconPack, uniqueIconPackId } from '@/core/icon-pack'
import { setActiveIconPack } from '@/lib/file-icon'
import type {
  DependencySpec, FormField, FormValues, IconPack, LanguageSpec, ProjectTemplate, Theme,
} from '@/core/types'
import { lumenDark } from '@/addons/builtin/themes'
import { setLanguage as applyLanguage, t, tr, type LanguageSetting } from '@/i18n'
import {
  keybindings, setKeybindingPlatform, type BindingMap, type PresetId,
} from '@/core/keybindings'

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface Tab {
  id: string
  path: string | null
  name: string
  content: string
  /** The content as of the last save — the basis for the dirty marker. */
  saved: string
  languageId: string | null
  /** Opened with a single click: replaced the next time something is opened. */
  preview: boolean
  /** Not editable (classes from the JDK, for instance). */
  readonly?: boolean
  /** Not a file path but a server URI (jdt://…). */
  virtual?: boolean
  /** The file has been deleted on disk. */
  missing?: boolean
  /** The file changed on disk while the tab has unsaved changes. */
  diskChanged?: boolean
}

export interface FsChange {
  path: string
  type: 1 | 2 | 3
}

/** A generic form dialog (adding a dependency, input of any kind). */
export interface FormDialogSpec {
  title: string
  description?: string
  fields: FormField[]
  initial?: FormValues
  submitLabel?: string
  /** Returning a string means an error message: the dialog stays open. */
  onSubmit(values: FormValues): Promise<string | void> | string | void
}

export interface OutputLine {
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'success' | 'warning' | 'error'
}

/**
 * The views of the side bar.
 *
 * `ext:<extension>:<page>` belongs to an extension — that way its pages can be
 * selected like the built-in views without the rest of the program needing to
 * know about them.
 */
export type ExtensionPageView = `ext:${string}`
/** `agent:<extension id>/<agent id>` — the chat of an agent an extension registers. */
export type AgentView = `agent:${string}`
export type SidebarView = 'explorer' | 'search' | 'project' | 'outline' | 'debug' | ExtensionPageView | AgentView

/** Split the identifier of an extension page. */
export function parseExtensionView(view: string | null): { extensionId: string; pageId: string } | null {
  if (!view?.startsWith('ext:')) return null
  const rest = view.slice(4)
  const cut = rest.lastIndexOf(':')
  if (cut <= 0) return null
  return { extensionId: rest.slice(0, cut), pageId: rest.slice(cut + 1) }
}

/** Large dialogs that sit above the interface (the lower icons of the activity bar). */
export type DialogId = 'settings' | 'themes' | 'keybindings' | 'sdks' | 'workspaces' | 'extensions'

/** An editor group (split view): its own tab bar, its own active tab. */
export interface EditorGroup {
  id: string
  tabIds: string[]
  activeTabId: string | null
}

export type SplitDirection = 'right' | 'down'

/** A named workspace: several folders plus the files last open and the split. */
export interface WorkspaceDef {
  id: string
  name: string
  color: string
  /** Absolute paths; `activeFolder` is one of them. */
  folders: string[]
  /** The folder whose project, language server and tasks currently apply. */
  activeFolder: string
  session?: {
    groups: string[][]
    splitDirection: SplitDirection
    activeGroup: number
  }
  openedAt: number
}

export type PanelTab = 'output' | 'terminal' | 'problems' | 'references' | 'lsp' | 'debug'

export type PaletteMode = false | 'commands' | 'files' | 'symbols' | 'workspace-symbols' | 'tasks' | 'everywhere'

/** The tabs of “Search everywhere” (double shift). */
export type EverywhereTab = 'all' | 'files' | 'symbols' | 'actions' | 'tasks' | 'text'

/** The vetted server is always in the list and cannot be removed. */
const DEFAULT_EXTENSION_SERVER: ExtensionServer = { url: OFFICIAL_SERVER_URL, name: 'Lumen', trusted: true }

/**
 * Read the stored servers and put the official one in front.
 *
 * It is never taken from the file but always set afresh: otherwise an edited
 * settings file could record it as “untrusted” or, worse, list a foreign host
 * under its name.
 */
function withOfficialServer(stored: ExtensionServer[] | undefined): ExtensionServer[] {
  const rest = (Array.isArray(stored) ? stored : [])
    .filter((server) => server && typeof server.url === 'string' && !isOfficial(server.url))
    .map((server) => ({
      url: server.url,
      name: typeof server.name === 'string' ? server.name : undefined,
      trusted: server.trusted === true,
      disabled: server.disabled === true,
    }))
  return [DEFAULT_EXTENSION_SERVER, ...rest]
}

/** Project kinds whose dependencies come from ~/.m2 or the Gradle cache. */
const JVM_MANAGERS = new Set(['maven', 'gradle'])

/** An artefact already present on the device. */
export interface LocalDependency {
  name: string
  versions: string[]
}

export interface RecentProject {
  path: string
  name: string
  kind?: string
  color?: string
  icon?: string
  openedAt: number
}

export interface ReferenceHit {
  path: string
  line: number
  character: number
  endLine: number
  endCharacter: number
  /** The line of text, once loaded. */
  preview?: string
}

export interface ReferenceResult {
  title: string
  hits: ReferenceHit[]
  loading: boolean
}

export interface RevealRequest {
  tabId: string
  /** The group that should jump — otherwise the active one. */
  groupId?: string
  line: number
  character: number
  endLine?: number
  endCharacter?: number
  token: number
}

export interface CursorInfo {
  line: number
  character: number
}

export interface PersistedSettings {
  themeId: string
  customThemes: Theme[]
  effects: Effects
  enabledAddons: string[]
  lastFolder: string | null
  recentFolders: string[]
  recentProjects: RecentProject[]
  sidebarWidth: number
  panelHeight: number
  language: LanguageSetting
  keymapPreset: PresetId
  keybindingOverrides: BindingMap
  splitRatio: number
  workspaces: WorkspaceDef[]
  currentWorkspaceId: string | null
  iconPackId: string
  customIconPacks: IconPack[]
  /** Languages for which nobody wants to be asked about installing a server again. */
  lspInstallDeclined: string[]
  /** The extension servers on record. */
  extensionServers: ExtensionServer[]
  /** The values of the extension settings, per extension. */
  extensionSettings: Record<string, Record<string, string>>
}

export interface State {
  ready: boolean
  platform: string

  workspace: string | null
  /** Further folders of the workspace besides `workspace` (explorer, write access, watching). */
  extraFolders: string[]
  workspaces: WorkspaceDef[]
  currentWorkspaceId: string | null
  recentProjects: RecentProject[]
  /** Languages for which the offer of a language server was declined. */
  lspInstallDeclined: string[]
  /** Artefacts from the local Maven and Gradle stores — suggestions when adding one. */
  localDependencies: LocalDependency[]
  /** The extension servers on record; the official one always comes first. */
  extensionServers: ExtensionServer[]
  /** The values of the extension settings, per extension and key. */
  extensionSettings: Record<string, Record<string, string>>
  project: ProjectInfo | null
  projectConfig: ProjectConfig
  projectLoading: boolean

  tabs: Tab[]
  /** The active tab of the active editor group. */
  activeTabId: string | null
  groups: EditorGroup[]
  activeGroupId: string
  splitDirection: SplitDirection
  /** The share of the first group (0.15 – 0.85). */
  splitRatio: number
  /** The paths of the tabs closed most recently, newest first. */
  closedTabs: string[]
  cursor: CursorInfo
  reveal: RevealRequest | null

  sidebarView: SidebarView | null
  sidebarWidth: number
  panelOpen: boolean
  panelTab: PanelTab
  panelHeight: number
  output: OutputLine[]
  runningId: string | null
  /** The label of the running task. */
  runningLabel: string | null
  references: ReferenceResult | null

  themeId: string
  /** Themes created in the theme studio. */
  customThemes: Theme[]
  /** The theme currently being edited in the studio (applied live). */
  editingThemeId: string | null
  effects: Effects
  enabledAddons: string[]
  /** Increases when the add-on registry changes. */
  registryVersion: number
  /** Increases on every state change of a language server. */
  lspVersion: number
  /** Increases on new log lines from the servers. */
  lspLogVersion: number

  language: LanguageSetting
  keymapPreset: PresetId
  keybindingOverrides: BindingMap
  /** The large dialog open, and optionally the section within it. */
  dialog: DialogId | null
  dialogSection: string | null
  /** A hint in the status bar while a key sequence waits for its second chord. */
  chordHint: string | null
  /** Is a debug session running? (set by the debugger) */
  debugActive: boolean
  /** The add-on studio: `addonId` null means a new add-on. */
  addonStudio: { addonId: string | null; starter?: 'toolkit' } | null
  /** The active icon pack. */
  iconPackId: string
  /** Packs created in the icon studio. */
  customIconPacks: IconPack[]
  /** The open icon studio: a draft, saved only on “Save”. */
  iconStudio: { draft: IconPack; isNew: boolean } | null

  paletteOpen: PaletteMode
  everywhereTab: EverywhereTab
  /** The files opened most recently, newest first — for “Search everywhere”. */
  recentFiles: string[]
  newProjectOpen: boolean
  formDialog: FormDialogSpec | null
  toasts: Toast[]
}

interface Actions {
  init(): Promise<void>
  persist(): void

  openFolder(): Promise<void>
  setWorkspace(root: string, options?: { keepTabs?: boolean; restoreFiles?: boolean }): Promise<void>
  closeWorkspace(): Promise<void>
  /** Open a workspace: save the session of the old one, load the folders and files of the new. */
  openWorkspace(id: string): Promise<void>
  /** Save the current folders as a (new) workspace. */
  saveWorkspace(name?: string): WorkspaceDef | null
  updateWorkspace(id: string, patch: Partial<Pick<WorkspaceDef, 'name' | 'color'>>): void
  deleteWorkspace(id: string): void
  /** Add a folder (without a path: a chooser). Creates a workspace where needed. */
  addFolderToWorkspace(path?: string): Promise<void>
  removeFolderFromWorkspace(path: string): Promise<void>
  /** Make another folder of the workspace active; the tabs stay open. */
  setActiveFolder(path: string): Promise<void>
  exportWorkspace(id: string): Promise<void>
  importWorkspace(): Promise<void>
  removeRecent(path: string): void
  /** Stop asking about a language server for this language. */
  declineLspInstall(languageId: string): void
  /** Read the local Maven and Gradle stores (once per session). */
  loadLocalDependencies(): Promise<void>

  /** Record an extension server; returns a message when it is no good. */
  addExtensionServer(url: string): Promise<string | null>
  removeExtensionServer(url: string): void
  setExtensionServer(url: string, patch: Partial<ExtensionServer>): void
  /** Set the values of an extension setting. */
  setExtensionSetting(extensionId: string, key: string, value: string): void
  /** Record the defaults of a manifest without overwriting what is there. */
  applyExtensionDefaults(manifest: ExtensionManifest): void
  /** Forget the settings of an extension that has been removed. */
  forgetExtensionSettings(extensionId: string): void

  refreshProject(): Promise<void>
  updateProjectConfig(patch: Partial<ProjectConfig>): Promise<void>
  setPreferredLsp(languageId: string, label: string | null): Promise<void>
  createProject(
    template: ProjectTemplate, parentDir: string, name: string,
    values: FormValues, options?: { setup?: boolean; git?: boolean },
  ): Promise<void>
  addDependency(kindId: string, dep: DependencySpec): Promise<void>
  openDependencyDialog(kindId?: string): void

  openFile(path: string, preview?: boolean): Promise<void>
  openAt(path: string, line: number, character: number, endLine?: number, endCharacter?: number): Promise<void>
  openVirtual(uri: string, name: string, content: string, languageId: string | null): void
  consumeReveal(): void
  newFile(): void
  /** Close a tab in one group (by default the active one, or the one showing it). */
  closeTab(id: string, groupId?: string): void
  /** Close a tab in every group. */
  closeTabEverywhere(id: string): void
  closeOthers(id: string): void
  closeAll(): void
  setActiveTab(id: string, groupId?: string): void
  cycleTab(delta: number): void
  reopenClosedTab(): Promise<void>
  /** Move a tab by dragging (into another group as well). */
  moveTab(tabId: string, fromGroupId: string, toGroupId: string, index?: number): void
  splitEditor(direction: SplitDirection): void
  unsplitEditor(): void
  focusGroup(index: number): void
  focusNextGroup(): void
  moveTabToOtherGroup(): void
  setSplitRatio(ratio: number): void
  retargetTab(id: string, path: string): void
  /** After a rename or move in the file tree: bring the open tabs along. */
  pathRenamed(from: string, to: string): void
  /** After a deletion in the file tree: close the open tabs below it. */
  pathDeleted(path: string): void
  reloadTab(id: string): Promise<void>
  handleFsChanges(changes: FsChange[]): Promise<void>
  /** Reconcile every open tab with the disk (on window focus, say). */
  syncTabsWithDisk(): Promise<void>
  updateContent(id: string, content: string, changes?: ContentChange[]): void
  pinTab(id: string): void
  setCursor(cursor: CursorInfo): void
  saveTab(id?: string): Promise<void>
  saveAll(): Promise<void>

  setSidebarView(view: SidebarView | null): void
  showSidebar(view: SidebarView): void
  setSidebarWidth(px: number): void
  togglePanel(open?: boolean): void
  showPanel(tab: PanelTab): void
  setPanelTab(tab: PanelTab): void
  setPanelHeight(px: number): void
  toggleTerminal(target?: EventTarget | null): void
  openDialog(id: DialogId, section?: string): void
  closeDialog(): void
  setChordHint(hint: string | null): void
  /** `starter`: a new add-on from an example rather than an empty one. */
  openAddonStudio(addonId?: string | null, starter?: 'toolkit'): void
  closeAddonStudio(): void
  setLanguage(language: LanguageSetting | string): void
  setKeymapPreset(preset: PresetId): void
  /** `null` restores the binding of the preset. */
  setKeybinding(commandId: string, bindings: string[] | null): void
  resetKeybindings(): void
  applyKeybindings(): void
  clearOutput(): void
  appendOutput(line: OutputLine): void
  setRunning(id: string | null, label?: string | null): void
  setReferences(result: ReferenceResult | null): void

  setTheme(id: string): void
  setEffects(patch: Partial<Effects>): void

  openThemeStudio(baseId?: string): void
  closeThemeStudio(cancel: boolean): void
  previewTheme(theme: Theme): void
  saveCustomTheme(theme: Theme): void
  deleteCustomTheme(id: string): void
  duplicateTheme(id: string): string | null
  importTheme(): Promise<void>
  exportTheme(id: string): Promise<void>

  setIconPack(id: string): void
  /** Open the icon studio: edit your own pack, otherwise a copy of `baseId` (default: the active pack). */
  openIconStudio(baseId?: string, blank?: boolean): void
  closeIconStudio(): void
  saveCustomIconPack(pack: IconPack): void
  deleteCustomIconPack(id: string): void
  duplicateIconPack(id: string): string | null
  importIconPack(): Promise<void>
  exportIconPack(id: string): Promise<void>
  resetEffects(): void
  toggleAddon(id: string): void

  setPalette(open: PaletteMode): void
  openEverywhere(tab?: EverywhereTab): void
  setEverywhereTab(tab: EverywhereTab): void
  /** Open a new built-in terminal in the panel. */
  openTerminal(options?: { shell?: string; cwd?: string; command?: string; title?: string }): Promise<void>
  openExternalTerminal(cwd?: string, terminalId?: string): Promise<void>
  setNewProjectOpen(open: boolean): void
  openForm(spec: FormDialogSpec): void
  closeForm(): void
  notify(message: string, kind?: Toast['kind']): void
  dismissToast(id: number): void

  languages(): LanguageSpec[]
  themes(): Theme[]
  activeTab(): Tab | null
  languageFor(tab: Tab | null): LanguageSpec | null
}

let tabCounter = 0
let toastCounter = 0
let revealCounter = 0
let groupCounter = 1
const nextTabId = () => `tab-${++tabCounter}`
const nextGroupId = () => `group-${++groupCounter}`
const FIRST_GROUP_ID = 'group-1'

let themeTransitionTimer = 0
let appliedKeybindings = ''

/** Deferred writing of the open files into the project configuration. */
let openFilesTimer: ReturnType<typeof setTimeout> | null = null

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

export const useStore = create<State & Actions>((set, get) => ({
  ready: false,
  platform: 'linux',

  workspace: null,
  extraFolders: [],
  workspaces: [],
  currentWorkspaceId: null,
  recentProjects: [],
  lspInstallDeclined: [],
  localDependencies: [],
  extensionServers: [DEFAULT_EXTENSION_SERVER],
  extensionSettings: {},
  project: null,
  projectConfig: structuredClone(EMPTY_PROJECT_CONFIG),
  projectLoading: false,

  tabs: [],
  activeTabId: null,
  groups: [{ id: FIRST_GROUP_ID, tabIds: [], activeTabId: null }],
  activeGroupId: FIRST_GROUP_ID,
  splitDirection: 'right',
  splitRatio: 0.5,
  closedTabs: [],
  cursor: { line: 0, character: 0 },
  reveal: null,

  sidebarView: 'explorer',
  sidebarWidth: 260,
  panelOpen: false,
  panelTab: 'output',
  panelHeight: 220,
  output: [],
  runningId: null,
  runningLabel: null,
  references: null,

  themeId: DEFAULT_THEME_ID,
  customThemes: [],
  editingThemeId: null,
  iconPackId: DEFAULT_ICON_PACK_ID,
  customIconPacks: [],
  iconStudio: null,
  effects: DEFAULT_EFFECTS,
  enabledAddons: DEFAULT_ENABLED,
  registryVersion: 0,
  lspVersion: 0,
  lspLogVersion: 0,

  language: 'system',
  keymapPreset: 'lumen',
  keybindingOverrides: {},
  dialog: null,
  dialogSection: null,
  chordHint: null,
  debugActive: false,
  addonStudio: null,

  paletteOpen: false,
  everywhereTab: 'all',
  recentFiles: [],
  newProjectOpen: false,
  formDialog: null,
  toasts: [],

  /* ---------------------------------------------------------------- */

  async init() {
    registry.notify = (message, kind) => get().notify(message, kind)
    registry.register(...ALL_ADDONS)
    registry.subscribe(() => set({ registryVersion: registry.getVersion() }))
    lsp.subscribe(() => set({ lspVersion: lsp.getVersion(), lspLogVersion: lsp.getLogVersion() }))
    lsp.showMessage = (server, params) => {
      const kind = ({ 1: 'error', 2: 'warning' } as const)[params.type as 1 | 2] ?? 'info'
      if (params.type <= 3) get().notify(`${server}: ${params.message}`, kind)
    }
    lsp.documentFor = (path) => {
      const tab = get().tabs.find((open) => open.path === path)
      if (!tab) return null
      return { spec: get().languageFor(tab), text: tab.content }
    }

    const info = await window.lumen.app.info().catch(() => null)
    lsp.setPaths({
      home: info?.home ?? '',
      userData: info?.userData ?? '',
      platform: info?.platform ?? 'linux',
      platformKey: await window.lumen.lspPackages.platform().catch(() => undefined),
    })

    const stored = (await window.lumen.settings.load().catch(() => ({}))) as
      Partial<PersistedSettings>

    const language = stored.language ?? 'system'
    applyLanguage(language)
    setKeybindingPlatform(info?.platform ?? 'linux')

    const effects: Effects = { ...DEFAULT_EFFECTS, ...(stored.effects ?? {}) }
    const enabledAddons = stored.enabledAddons ?? DEFAULT_ENABLED
    const customThemes = (stored.customThemes ?? []).filter(isTheme)

    registry.applyEnabled(enabledAddons)
    registry.setUserThemes(customThemes)
    const customIconPacks = (stored.customIconPacks ?? []).filter(isIconPack)
    registry.setUserIconPacks(customIconPacks)
    const iconPackId = registry.iconPacks().some((pack) => pack.id === stored.iconPackId)
      ? stored.iconPackId!
      : DEFAULT_ICON_PACK_ID
    applyIconPack(iconPackId)
    // When the pack disappears with an add-on, the default pack applies again.
    registry.subscribe(() => applyIconPack(get().iconPackId))
    lsp.setEnabled(effects.lsp)

    const themeId = stored.themeId ?? DEFAULT_THEME_ID
    const theme = registry.themes().find((t) => t.id === themeId)
    applyTheme(theme ?? registry.themes()[0], effects)

    // Older settings knew only paths — those become projects.
    const recentProjects: RecentProject[] = stored.recentProjects
      ?? (stored.recentFolders ?? []).map((path, i) => ({
        path,
        name: path.split(/[\\/]/).filter(Boolean).pop() ?? path,
        openedAt: Date.now() - i,
      }))

    set({
      ready: true,
      platform: info?.platform ?? 'linux',
      themeId: theme ? themeId : DEFAULT_THEME_ID,
      customThemes,
      customIconPacks,
      iconPackId,
      effects,
      enabledAddons,
      recentProjects,
      lspInstallDeclined: stored.lspInstallDeclined ?? [],
      extensionServers: withOfficialServer(stored.extensionServers),
      extensionSettings: stored.extensionSettings ?? {},
      sidebarWidth: stored.sidebarWidth ?? 260,
      panelHeight: stored.panelHeight ?? 220,
      splitRatio: stored.splitRatio ?? 0.5,
      language,
      keymapPreset: stored.keymapPreset ?? 'lumen',
      keybindingOverrides: stored.keybindingOverrides ?? {},
      registryVersion: registry.getVersion(),
    })
    get().applyKeybindings()
    registry.subscribe(() => get().applyKeybindings())

    const workspaces = (stored.workspaces ?? []).filter(isWorkspaceDef)
    const current = workspaces.find((w) => w.id === stored.currentWorkspaceId) ?? null
    set({
      workspaces,
      currentWorkspaceId: current?.id ?? null,
      extraFolders: current ? current.folders.filter((f) => f !== current.activeFolder) : [],
    })

    if (current) {
      await get().openWorkspace(current.id).catch(() => {})
      return
    }
    if (stored.lastFolder) {
      await get().setWorkspace(stored.lastFolder).catch(() => {})
    }
  },

  persist() {
    const s = get()
    const data: PersistedSettings = {
      themeId: s.themeId,
      customThemes: s.customThemes,
      effects: s.effects,
      enabledAddons: s.enabledAddons,
      lastFolder: s.workspace,
      recentFolders: s.recentProjects.slice(0, 12).map((p) => p.path),
      recentProjects: s.recentProjects.slice(0, 12),
      sidebarWidth: s.sidebarWidth,
      panelHeight: s.panelHeight,
      language: s.language,
      keymapPreset: s.keymapPreset,
      keybindingOverrides: s.keybindingOverrides,
      splitRatio: s.splitRatio,
      workspaces: s.workspaces,
      currentWorkspaceId: s.currentWorkspaceId,
      iconPackId: s.iconPackId,
      customIconPacks: s.customIconPacks,
      lspInstallDeclined: s.lspInstallDeclined,
      extensionServers: s.extensionServers,
      extensionSettings: s.extensionSettings,
    }
    void window.lumen.settings.save(data as unknown as Record<string, unknown>)
  },

  /* ---------------------------------------------------------------- *
   * The working folder and the project
   * ---------------------------------------------------------------- */

  async openFolder() {
    const root = await window.lumen.dialog.openFolder()
    if (!root) return
    await get().setWorkspace(root)
  },

  async setWorkspace(root, options = {}) {
    const previous = get().workspace
    if (previous && previous !== root && !options.keepTabs) {
      await rememberOpenFiles(previous)
      get().closeAll()
    }
    // A single folder outside the workspace leaves it.
    const ws = get().workspaces.find((w) => w.id === get().currentWorkspaceId)
    if (ws && !ws.folders.includes(root)) set({ currentWorkspaceId: null, extraFolders: [] })

    await window.lumen.workspace.set(root, get().extraFolders.filter((f) => f !== root))
    lsp.setWorkspace(root)

    const name = root.split(/[\\/]/).filter(Boolean).pop() ?? root
    const recent: RecentProject[] = [
      { ...(get().recentProjects.find((p) => p.path === root) ?? { name }), path: root, openedAt: Date.now() },
      ...get().recentProjects.filter((p) => p.path !== root),
    ].slice(0, 12)

    set({
      workspace: root,
      recentProjects: recent,
      sidebarView: get().sidebarView ?? 'explorer',
      project: null,
      projectConfig: structuredClone(EMPTY_PROJECT_CONFIG),
      references: null,
    })
    get().persist()

    const config = await loadProjectConfig(root)
    if (get().workspace !== root) return
    lsp.setPreferred(config.lsp)
    set({ projectConfig: config })

    await get().refreshProject()

    if (options.restoreFiles === false || !get().effects.restoreOpenFiles || get().tabs.length > 0) return
    const [first, second] = config.openGroups?.length ? config.openGroups : [config.openFiles ?? []]
    for (const relative of (first ?? []).slice(0, 16)) {
      if (get().workspace !== root) return
      await get().openFile(`${root}/${relative}`).catch(() => {})
    }
    if (!second?.length) return
    const extra: EditorGroup = { id: nextGroupId(), tabIds: [], activeTabId: null }
    set((st) => ({ groups: [...st.groups, extra], activeGroupId: extra.id, splitDirection: config.splitDirection ?? 'right' }))
    for (const relative of second.slice(0, 16)) {
      if (get().workspace !== root) return
      await get().openFile(`${root}/${relative}`).catch(() => {})
    }
    get().focusGroup(0)
  },

  async closeWorkspace() {
    const previous = get().workspace
    if (previous) await rememberOpenFiles(previous)
    captureSession()
    get().closeAll()
    lsp.setWorkspace(null)
    set({
      workspace: null, extraFolders: [], currentWorkspaceId: null, project: null,
      projectConfig: structuredClone(EMPTY_PROJECT_CONFIG), references: null,
    })
    get().persist()
  },

  async openWorkspace(id) {
    const target = get().workspaces.find((w) => w.id === id)
    if (!target) return
    const previous = get().workspace
    if (previous) await rememberOpenFiles(previous)
    captureSession()
    get().closeAll()

    const existing: string[] = []
    for (const folder of target.folders) {
      if (await window.lumen.fs.exists(folder)) existing.push(folder)
    }
    if (!existing.length) {
      get().notify(t('workspaces.missingFolders', { name: target.name }), 'error')
      return
    }
    const active = existing.includes(target.activeFolder) ? target.activeFolder : existing[0]
    set((s) => ({
      currentWorkspaceId: target.id,
      extraFolders: existing.filter((f) => f !== active),
      workspaces: s.workspaces.map((w) => (w.id === target.id ? { ...w, openedAt: Date.now(), activeFolder: active } : w)),
      // A folder change without closing: reset `workspace` so that setWorkspace reloads cleanly.
      workspace: null,
    }))
    await get().setWorkspace(active, { keepTabs: true, restoreFiles: !target.session })
    if (target.session) await restoreSession(target.session)
    get().persist()
  },

  saveWorkspace(name) {
    const s = get()
    if (!s.workspace) return null
    const folders = [s.workspace, ...s.extraFolders]
    const current = s.workspaces.find((w) => w.id === s.currentWorkspaceId)
    if (current && !name) {
      const updated = { ...current, folders, activeFolder: s.workspace }
      set({ workspaces: s.workspaces.map((w) => (w.id === current.id ? updated : w)) })
      captureSession()
      get().persist()
      return updated
    }
    const def: WorkspaceDef = {
      id: `ws-${Date.now().toString(36)}`,
      name: name || (s.workspace.split(/[\/]/).filter(Boolean).pop() ?? 'Workspace'),
      color: WORKSPACE_COLORS[s.workspaces.length % WORKSPACE_COLORS.length],
      folders,
      activeFolder: s.workspace,
      openedAt: Date.now(),
    }
    set({ workspaces: [...s.workspaces, def], currentWorkspaceId: def.id })
    captureSession()
    get().persist()
    return def
  },

  updateWorkspace(id, patch) {
    set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)) }))
    get().persist()
  },

  deleteWorkspace(id) {
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      currentWorkspaceId: s.currentWorkspaceId === id ? null : s.currentWorkspaceId,
    }))
    get().persist()
  },

  async addFolderToWorkspace(path) {
    const folder = path ?? await window.lumen.dialog.chooseFolder(t('workspaces.chooseFolder'))
    if (!folder) return
    const s = get()
    if (!s.workspace) {
      await get().setWorkspace(folder)
      return
    }
    if (folder === s.workspace || s.extraFolders.includes(folder)) return
    const extraFolders = [...s.extraFolders, folder]
    set({ extraFolders })
    await window.lumen.workspace.set(s.workspace, extraFolders)
    if (!get().currentWorkspaceId) get().saveWorkspace(s.workspace.split(/[\/]/).filter(Boolean).pop())
    const current = get().workspaces.find((w) => w.id === get().currentWorkspaceId)
    if (current) {
      set((st) => ({
        workspaces: st.workspaces.map((w) => (w.id === current.id ? { ...w, folders: [st.workspace!, ...extraFolders] } : w)),
      }))
    }
    get().persist()
    get().notify(t('workspaces.folderAdded', { name: folder.split(/[\/]/).filter(Boolean).pop() ?? folder }), 'success')
  },

  async removeFolderFromWorkspace(path) {
    const s = get()
    if (path === s.workspace) {
      const next = s.extraFolders[0]
      if (!next) return
      await get().setActiveFolder(next)
    }
    const extraFolders = get().extraFolders.filter((f) => f !== path)
    set({ extraFolders })
    if (get().workspace) await window.lumen.workspace.set(get().workspace!, extraFolders)
    const prefix = `${path}/`
    for (const tab of get().tabs.filter((tb) => tb.path && !tb.virtual && tb.path.startsWith(prefix) && tb.content === tb.saved)) {
      get().closeTabEverywhere(tab.id)
    }
    set((st) => ({
      workspaces: st.workspaces.map((w) => (w.id === st.currentWorkspaceId
        ? { ...w, folders: w.folders.filter((f) => f !== path), activeFolder: st.workspace ?? w.activeFolder }
        : w)),
    }))
    get().persist()
  },

  async setActiveFolder(path) {
    const s = get()
    if (path === s.workspace) return
    const folders = [s.workspace, ...s.extraFolders].filter((f): f is string => Boolean(f))
    if (!folders.includes(path)) return
    set({ extraFolders: folders.filter((f) => f !== path) })
    await get().setWorkspace(path, { keepTabs: true, restoreFiles: false })
    set((st) => ({
      workspaces: st.workspaces.map((w) => (w.id === st.currentWorkspaceId ? { ...w, activeFolder: path } : w)),
    }))
    get().persist()
  },

  async exportWorkspace(id) {
    const def = get().workspaces.find((w) => w.id === id)
    if (!def) return
    const target = await window.lumen.dialog.saveFile(`${def.name.replace(/[^\w.-]+/g, '-')}.lumen-workspace.json`)
    if (!target) return
    const { session: _session, ...portable } = def
    void _session
    await window.lumen.fs.writeFile(target, `${JSON.stringify({ schema: 1, ...portable }, null, 2)}\n`)
    get().notify(t('workspaces.exported', { name: def.name }), 'success')
  },

  async importWorkspace() {
    const picked = await window.lumen.dialog.openFile()
    if (!picked) return
    try {
      const parsed = JSON.parse(picked.content) as Partial<WorkspaceDef>
      const candidate = { ...parsed, id: `ws-${Date.now().toString(36)}`, openedAt: Date.now(), color: parsed.color ?? WORKSPACE_COLORS[0] }
      if (!isWorkspaceDef(candidate)) throw new Error('invalid')
      set((s) => ({ workspaces: [...s.workspaces, candidate] }))
      get().persist()
      get().notify(t('workspaces.imported', { name: candidate.name }), 'success')
    } catch {
      get().notify(t('workspaces.invalidFile'), 'error')
    }
  },

  removeRecent(path) {
    set((s) => ({ recentProjects: s.recentProjects.filter((p) => p.path !== path) }))
    get().persist()
  },

  async loadLocalDependencies() {
    if (get().localDependencies.length) return
    const list = await window.lumen.deps.local().catch(() => [])
    set({ localDependencies: list })
  },

  async addExtensionServer(url) {
    let normalized: string
    try {
      normalized = normalizeServerUrl(url)
    } catch (err) {
      return (err as Error).message
    }
    if (get().extensionServers.some((server) => server.url === normalized)) {
      return t('extensions.serverKnown')
    }
    // Ask first whether one is running there — an entry that never answers is
    // a silent source of trouble in every later list.
    const info = await fetchServerInfo(normalized).catch((err: Error) => err)
    if (info instanceof Error) return info.message
    set((s) => ({ extensionServers: [...s.extensionServers, { url: info.url, name: info.name, trusted: false }] }))
    get().persist()
    return null
  },

  removeExtensionServer(url) {
    if (isOfficial(url)) return
    set((s) => ({ extensionServers: s.extensionServers.filter((server) => server.url !== url) }))
    get().persist()
  },

  setExtensionServer(url, patch) {
    set((s) => ({
      extensionServers: s.extensionServers.map((server) => {
        if (server.url !== url) return server
        // The vetted server stays trusted and switched on.
        if (isOfficial(url)) return { ...server, ...patch, trusted: true, disabled: false }
        return { ...server, ...patch }
      }),
    }))
    get().persist()
  },

  setExtensionSetting(extensionId, key, value) {
    set((s) => ({
      extensionSettings: {
        ...s.extensionSettings,
        [extensionId]: { ...s.extensionSettings[extensionId], [key]: value },
      },
    }))
    get().persist()
  },

  applyExtensionDefaults(manifest) {
    const current = get().extensionSettings[manifest.id] ?? {}
    const next = { ...current }
    let changed = false
    for (const setting of manifest.settings ?? []) {
      if (setting.key in next) continue
      next[setting.key] = setting.default ?? (setting.type === 'toggle' ? 'false' : '')
      changed = true
    }
    if (!changed) return
    set((s) => ({ extensionSettings: { ...s.extensionSettings, [manifest.id]: next } }))
    get().persist()
  },

  forgetExtensionSettings(extensionId) {
    const { [extensionId]: _removed, ...rest } = get().extensionSettings
    set({ extensionSettings: rest })
    get().persist()
  },

  declineLspInstall(languageId) {
    if (get().lspInstallDeclined.includes(languageId)) return
    set((s) => ({ lspInstallDeclined: [...s.lspInstallDeclined, languageId] }))
    get().persist()
  },

  async refreshProject() {
    const root = get().workspace
    if (!root) return
    set({ projectLoading: true })
    try {
      const info = await detectProject(root, registry.projectKinds(), get().platform)
      if (get().workspace !== root) return
      const config = get().projectConfig
      const name = config.name ?? info.name
      set((s) => ({
        project: { ...info, name },
        projectLoading: false,
        recentProjects: s.recentProjects.map((p) =>
          p.path === root
            ? {
                ...p,
                name,
                // Project kinds may carry their name as a translation key.
                kind: tr(info.primary?.kind.name),
                color: info.primary?.kind.color,
                icon: info.primary?.kind.icon,
              }
            : p,
        ),
      }))
      get().persist()
    } catch (err) {
      set({ projectLoading: false })
      get().notify(t('notify.projectDetectFailed', { error: (err as Error).message }), 'warning')
    }
  },

  async updateProjectConfig(patch) {
    const root = get().workspace
    if (!root) return
    const config: ProjectConfig = { ...get().projectConfig, ...patch }
    set({ projectConfig: config })
    if (patch.lsp) lsp.setPreferred(config.lsp)
    if (patch.name !== undefined && get().project) {
      set((s) => ({ project: s.project ? { ...s.project, name: patch.name || s.project.name } : null }))
    }
    try {
      await saveProjectConfig(root, config)
    } catch (err) {
      get().notify(t('notify.projectConfigNotSaved', { error: (err as Error).message }), 'error')
    }
  },

  async setPreferredLsp(languageId, label) {
    const next = { ...get().projectConfig.lsp }
    delete next[languageId]
    if (label) next[languageId] = label
    await get().updateProjectConfig({ lsp: next })
    get().notify(
      label ? t('notify.lspPreferred', { name: label }) : t('notify.lspPreferenceRemoved'),
      'info',
    )
  },

  async createProject(template, parentDir, name, values, options = {}) {
    const result = await scaffoldProject(template, parentDir, name, values)
    set({ newProjectOpen: false })
    await get().setWorkspace(result.dir)
    if (result.open) await get().openFile(result.open).catch(() => {})
    get().showSidebar('project')
    get().notify(result.next ? t('notify.projectCreatedNext', { next: tr(result.next) }) : t('notify.projectCreated', { name }), 'success')

    const tasks = [
      ...(options.git ? [{ id: 'setup:git', label: 'git init', command: 'git', args: ['init', '-q'] }] : []),
      ...(options.setup ? result.setup : []),
    ]
    if (!tasks.length) return
    const { runTasks } = await import('@/lib/run')
    await runTasks(tasks, result.dir, () => void get().refreshProject())
  },

  async addDependency(kindId, dep) {
    const project = get().project
    const detected = project?.kinds.find((k) => k.kind.id === kindId)
    const support = detected?.kind.dependencies
    if (!project || !support) throw new Error(t('notify.dependency.unsupported'))

    const ctx = projectContext(project.root, get().platform)
    const action = await support.add(ctx, dep)
    const { runTask } = await import('@/lib/run')

    if (action.type === 'task') {
      await runTask(action.task, () => void get().refreshProject())
      return
    }

    const target = `${project.root}/${action.file}`
    const tab = get().tabs.find((t) => t.path === target)
    await window.lumen.fs.writeFile(target, action.content)
    if (tab) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, content: action.content, saved: action.content, diskChanged: false } : t)),
      }))
      lsp.changeDocument(target, action.content)
    }
    get().notify(t('notify.dependency.added', { name: dep.name, file: action.file }), 'success')
    await get().refreshProject()
    if (action.then) await runTask(action.then)
  },

  openDependencyDialog(kindId) {
    const project = get().project
    const kinds = (project?.kinds ?? []).filter((k) => k.kind.dependencies)
    if (!kinds.length) {
      get().notify(t('notify.dependency.noManager'), 'info')
      return
    }
    const preferred = kinds.find((k) => k.kind.id === kindId) ?? kinds[0]
    // Load what is already present locally in the background: the dialog is
    // there at once, the suggestions fill in as soon as the search is through.
    if (kinds.some((k) => JVM_MANAGERS.has(k.kind.id))) void get().loadLocalDependencies()
    const scopeChoices = (id: string) => kinds.find((k) => k.kind.id === id)?.kind.dependencies?.scopes ?? []
    const support = (id: string) => kinds.find((k) => k.kind.id === id)?.kind.dependencies

    get().openForm({
      title: t('notify.dependency.title'),
      description: kinds.length > 1
        ? t('notify.dependency.chooseManager')
        : t('notify.dependency.via', { manager: preferred.kind.dependencies!.manager }),
      submitLabel: t('common.add'),
      initial: { kind: preferred.kind.id },
      fields: [
        {
          id: 'kind', label: t('notify.dependency.manager'), type: 'select',
          choices: kinds.map((k) => ({ value: k.kind.id, label: `${tr(k.kind.name)} — ${k.kind.dependencies!.manager}` })),
          when: () => kinds.length > 1,
        },
        {
          id: 'name', label: t('notify.dependency.package'), mono: true,
          placeholder: preferred.kind.dependencies!.placeholder,
          hint: preferred.kind.dependencies!.hint,
          suggestions: (v: FormValues) =>
            (JVM_MANAGERS.has(v.kind || preferred.kind.id) ? get().localDependencies : []).map((d) => d.name),
        },
        {
          id: 'version', label: t('common.version'), mono: true, required: false,
          placeholder: t('notify.dependency.versionPlaceholder'),
          // Only the versions of the package typed in that are actually there.
          suggestions: (v: FormValues) =>
            get().localDependencies.find((d) => d.name === v.name?.trim())?.versions ?? [],
        },
        ...(kinds.some((k) => k.kind.dependencies?.scopes?.length)
          ? [{
              id: 'scope', label: t('notify.dependency.scope'), type: 'select' as const,
              default: (v: FormValues) => scopeChoices(v.kind)[0]?.value ?? '',
              choices: kinds.flatMap((k) => k.kind.dependencies?.scopes ?? []).filter((c, i, all) => all.findIndex((x) => x.value === c.value) === i),
              when: (v: FormValues) => scopeChoices(v.kind).length > 0,
            }]
          : []),
      ],
      onSubmit: async (values) => {
        const chosen = support(values.kind || preferred.kind.id)
        if (!chosen) return t('notify.dependency.managerNotFound')
        if (chosen.versionRequired && !values.version?.trim()) return t('notify.dependency.versionRequired', { manager: chosen.manager })
        const scopes = scopeChoices(values.kind || preferred.kind.id)
        const scope = scopes.some((c) => c.value === values.scope) ? values.scope : scopes[0]?.value
        try {
          await get().addDependency(values.kind || preferred.kind.id, {
            name: values.name.trim(),
            version: values.version?.trim() || undefined,
            scope,
          })
        } catch (err) {
          return (err as Error).message.replace(/^Error: /, '')
        }
      },
    })
  },

  /* ---------------------------------------------------------------- *
   * Tabs
   * ---------------------------------------------------------------- */

  async openFile(path, preview = false) {
    const existing = get().tabs.find((t) => t.path === path)
    if (existing) {
      if (!preview && existing.preview) get().pinTab(existing.id)
      get().setActiveTab(existing.id)
      return
    }

    let content: string
    try {
      content = await window.lumen.fs.readFile(path)
    } catch (err) {
      get().notify(
        `${path.split('/').pop()}: ${(err as Error).message.replace(/^Error: /, '')}`,
        'error',
      )
      throw err
    }

    const name = path.split(/[\\/]/).pop() ?? path
    const language = matchLanguage(path, registry.languages())
    const tab: Tab = {
      id: nextTabId(),
      path,
      name,
      content,
      saved: content,
      languageId: language?.id ?? null,
      preview,
    }

    // The group's preview tab is reused rather than stacked.
    const s = get()
    const group = currentGroup(s)
    const replaced = preview ? group.tabIds.filter((id) => s.tabs.find((t) => t.id === id)?.preview) : []
    set({ tabs: [...s.tabs, tab] })
    commitGroups(
      s.groups.map((g) => (g.id === group.id ? withTab(replaced.reduce(withoutTab, g), tab.id) : g)),
      group.id,
      { remember: false },
    )

    void lsp.openDocument(language, path, content)
    scheduleOpenFilesSync()
  },

  async openAt(path, line, character, endLine, endCharacter) {
    const opened = isVirtualUri(path) ? await openVirtualUri(path) : await get().openFile(path).then(() => true, () => false)
    if (!opened) return
    const tab = get().tabs.find((t) => t.path === path)
    if (!tab) return
    set({ reveal: { tabId: tab.id, groupId: get().activeGroupId, line, character, endLine, endCharacter, token: ++revealCounter } })
  },

  openVirtual(uri, name, content, languageId) {
    const tab: Tab = {
      id: nextTabId(),
      path: uri,
      name,
      content,
      saved: content,
      languageId,
      preview: false,
      readonly: true,
      virtual: true,
    }
    addTabToActiveGroup(tab)
  },

  consumeReveal() {
    set({ reveal: null })
  },

  newFile() {
    const tab: Tab = {
      id: nextTabId(),
      path: null,
      name: t('common.untitled'),
      content: '',
      saved: '',
      languageId: null,
      preview: false,
    }
    addTabToActiveGroup(tab)
  },

  closeTab(id, groupId) {
    const s = get()
    const active = currentGroup(s)
    const group = s.groups.find((g) => g.id === groupId)
      ?? (active.tabIds.includes(id) ? active : s.groups.find((g) => g.tabIds.includes(id)))
    if (!group) return
    commitGroups(s.groups.map((g) => (g.id === group.id ? withoutTab(g, id) : g)), s.activeGroupId)
  },

  closeTabEverywhere(id) {
    const s = get()
    commitGroups(s.groups.map((g) => withoutTab(g, id)), s.activeGroupId)
  },

  closeOthers(id) {
    const s = get()
    const active = currentGroup(s)
    const group = active.tabIds.includes(id) ? active : s.groups.find((g) => g.tabIds.includes(id))
    if (!group) return
    commitGroups(s.groups.map((g) => (g.id === group.id ? { ...g, tabIds: [id], activeTabId: id } : g)), group.id)
  },

  closeAll() {
    const s = get()
    commitGroups([{ id: s.groups[0].id, tabIds: [], activeTabId: null }], s.groups[0].id)
    set({ reveal: null })
  },

  setActiveTab(id, groupId) {
    const s = get()
    if (!s.tabs.some((t) => t.id === id)) return
    const target = s.groups.find((g) => g.id === groupId) ?? currentGroup(s)
    commitGroups(s.groups.map((g) => (g.id === target.id ? withTab(g, id) : g)), target.id, { remember: false })
  },

  cycleTab(delta) {
    const s = get()
    const group = currentGroup(s)
    if (group.tabIds.length < 2) return
    const index = group.tabIds.indexOf(group.activeTabId ?? '')
    const next = group.tabIds[(index + delta + group.tabIds.length) % group.tabIds.length]
    get().setActiveTab(next, group.id)
  },

  async reopenClosedTab() {
    const s = get()
    const path = s.closedTabs.find((p) => !s.tabs.some((t) => t.path === p))
    if (!path) return
    set({ closedTabs: s.closedTabs.filter((p) => p !== path) })
    await get().openFile(path).catch(() => {})
  },

  moveTab(tabId, fromGroupId, toGroupId, index) {
    const s = get()
    const from = s.groups.find((g) => g.id === fromGroupId)
    const to = s.groups.find((g) => g.id === toGroupId)
    if (!from || !to) return
    const groups = s.groups.map((g) => {
      if (g.id === from.id && g.id === to.id) return reorder(g, tabId, index)
      if (g.id === from.id) return withoutTab(g, tabId)
      if (g.id === to.id) return withTab(g.tabIds.includes(tabId) ? g : insertAt(g, tabId, index), tabId)
      return g
    })
    commitGroups(groups, to.id, { remember: false })
  },

  splitEditor(direction) {
    const s = get()
    const tabId = s.activeTabId
    if (!tabId) return
    set({ splitDirection: direction })
    if (s.groups.length === 1) {
      const second: EditorGroup = { id: nextGroupId(), tabIds: [tabId], activeTabId: tabId }
      commitGroups([...s.groups, second], second.id, { remember: false })
      return
    }
    const other = s.groups.find((g) => g.id !== s.activeGroupId) ?? s.groups[1]
    commitGroups(s.groups.map((g) => (g.id === other.id ? withTab(g, tabId) : g)), other.id, { remember: false })
  },

  unsplitEditor() {
    const s = get()
    if (s.groups.length < 2) return
    const tabIds = [...new Set(s.groups.flatMap((g) => g.tabIds))]
    const merged: EditorGroup = { id: s.groups[0].id, tabIds, activeTabId: s.activeTabId ?? tabIds[0] ?? null }
    commitGroups([merged], merged.id, { remember: false })
  },

  focusGroup(index) {
    const group = get().groups[index]
    if (!group) return
    set({ activeGroupId: group.id, activeTabId: group.activeTabId })
  },

  focusNextGroup() {
    const s = get()
    if (s.groups.length < 2) return
    const index = s.groups.findIndex((g) => g.id === s.activeGroupId)
    get().focusGroup((index + 1) % s.groups.length)
  },

  moveTabToOtherGroup() {
    const s = get()
    const tabId = s.activeTabId
    const group = currentGroup(s)
    if (!tabId) return
    if (s.groups.length === 1 && group.tabIds.length < 2) {
      get().splitEditor(s.splitDirection)
      return
    }
    if (s.groups.length === 1) {
      const second: EditorGroup = { id: nextGroupId(), tabIds: [tabId], activeTabId: tabId }
      commitGroups([withoutTab(group, tabId), second], second.id, { remember: false })
      return
    }
    const other = s.groups.find((g) => g.id !== group.id)!
    get().moveTab(tabId, group.id, other.id)
  },

  setSplitRatio(ratio) {
    set({ splitRatio: Math.min(0.85, Math.max(0.15, ratio)) })
  },

  retargetTab(id, path) {
    const name = path.split(/[\\/]/).pop() ?? path
    const language = matchLanguage(path, registry.languages())
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, path, name, languageId: language?.id ?? t.languageId } : t),
    }))
  },

  pathRenamed(from, to) {
    const prefix = `${from}/`
    for (const tab of get().tabs) {
      if (!tab.path || tab.virtual) continue
      if (tab.path !== from && !tab.path.startsWith(prefix)) continue
      const next = `${to}${tab.path.slice(from.length)}`
      lsp.closeDocument(tab.path)
      symbolStore.clear(tab.path)
      get().retargetTab(tab.id, next)
      const moved = get().tabs.find((t) => t.id === tab.id)
      if (moved) void lsp.openDocument(get().languageFor(moved), next, moved.content)
    }
    scheduleOpenFilesSync()
  },

  pathDeleted(path) {
    const prefix = `${path}/`
    const affected = get().tabs.filter((t) => t.path && !t.virtual && (t.path === path || t.path.startsWith(prefix)))
    for (const tab of affected) {
      if (tab.content !== tab.saved) {
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, missing: true } : t)) }))
        continue
      }
      get().closeTabEverywhere(tab.id)
    }
  },

  async reloadTab(id) {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab?.path || tab.virtual) return
    let content: string
    try {
      content = await window.lumen.fs.readFile(tab.path)
    } catch (err) {
      get().notify(`${tab.name}: ${(err as Error).message.replace(/^Error: /, '')}`, 'error')
      return
    }
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, content, saved: content, diskChanged: false, missing: false } : t)),
    }))
    // The active tab synchronises through the editor (so undo works) and reports the change itself.
    if (editorBridge.tabId !== id) lsp.changeDocument(tab.path, content)
  },

  async handleFsChanges(changes) {
    for (const change of changes) {
      const tab = get().tabs.find((t) => t.path === change.path && !t.virtual)
      if (!tab) continue
      if (change.type === 3) {
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, missing: true } : t)) }))
        continue
      }
      const disk = await window.lumen.fs.readFile(change.path).catch(() => null)
      if (disk === null) continue
      const current = get().tabs.find((t) => t.id === tab.id)
      if (!current) continue
      if (disk === current.content && disk !== current.saved) {
        // Our own save, whose event arrived before the state did.
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, saved: disk, missing: false, diskChanged: false } : t)) }))
        continue
      }
      if (disk === current.saved) {
        if (current.missing) set((s) => ({ tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, missing: false } : t)) }))
        continue
      }
      if (current.content === current.saved) {
        await get().reloadTab(tab.id)
        continue
      }
      if (current.diskChanged) continue
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, diskChanged: true, missing: false } : t)) }))
      get().notify(t('notify.changedOutside', { name: current.name }), 'warning')
    }
  },

  async syncTabsWithDisk() {
    const changes = get().tabs
      .filter((t) => t.path && !t.virtual)
      .map<FsChange>((t) => ({ path: t.path!, type: 2 }))
    const existing: FsChange[] = []
    for (const change of changes) {
      const exists = await window.lumen.fs.exists(change.path)
      existing.push(exists ? change : { ...change, type: 3 })
    }
    await get().handleFsChanges(existing)
  },

  updateContent(id, content, changes) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
    }))
    const tab = get().tabs.find((t) => t.id === id)
    if (tab?.virtual) return
    lsp.changeDocument(tab?.path ?? null, content, changes)
  },

  pinTab(id) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, preview: false } : t)),
    }))
    scheduleOpenFilesSync()
  },

  setCursor(cursor) {
    const current = get().cursor
    if (current.line === cursor.line && current.character === cursor.character) return
    set({ cursor })
  },

  async saveTab(id) {
    const s = get()
    const tab = s.tabs.find((t) => t.id === (id ?? s.activeTabId))
    if (!tab || tab.readonly) return

    let target = tab.path
    if (!target) {
      target = await window.lumen.dialog.saveFile(
        s.workspace ? `${s.workspace}/${tab.name}` : tab.name,
      )
      if (!target) return
    }

    // Formatting and organising imports — only possible for the visible tab.
    if ((s.effects.formatOnSave || s.effects.organizeImportsOnSave) && editorBridge.tabId === tab.id) {
      try { await editorBridge.beforeSave?.(tab.id) } catch { /* Speichern geht trotzdem weiter */ }
    }
    const fresh = get().tabs.find((t) => t.id === tab.id) ?? tab

    try {
      await window.lumen.fs.writeFile(target, fresh.content)
    } catch (err) {
      get().notify((err as Error).message.replace(/^Error: /, ''), 'error')
      return
    }

    const name = target.split(/[\\/]/).pop() ?? tab.name
    const language = matchLanguage(target, registry.languages())
    const wasNew = !tab.path
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tab.id
          ? { ...t, path: target, name, saved: fresh.content, preview: false, diskChanged: false, missing: false,
              languageId: language?.id ?? t.languageId }
          : t,
      ),
    }))
    if (wasNew) void lsp.openDocument(language, target, fresh.content)
    if (!wasNew) lsp.saveDocument(target, fresh.content)
    get().notify(t('common.saved', { name }), 'success')
    scheduleOpenFilesSync()
  },

  async saveAll() {
    const dirty = get().tabs.filter((t) => t.content !== t.saved && !t.readonly)
    for (const tab of dirty) await get().saveTab(tab.id)
  },

  /* ---------------------------------------------------------------- *
   * The interface
   * ---------------------------------------------------------------- */

  setSidebarView(view) {
    set((s) => ({ sidebarView: s.sidebarView === view ? null : view }))
  },
  showSidebar(view) {
    set({ sidebarView: view })
  },
  setSidebarWidth(px) {
    set({ sidebarWidth: Math.min(560, Math.max(180, px)) })
  },
  togglePanel(open) {
    set((s) => ({ panelOpen: open ?? !s.panelOpen }))
  },
  showPanel(tab) {
    set({ panelOpen: true, panelTab: tab })
  },
  setPanelTab(tab) {
    set({ panelTab: tab })
  },
  setPanelHeight(px) {
    set({ panelHeight: Math.min(700, Math.max(100, px)) })
  },
  toggleTerminal(target) {
    const s = get()
    const visible = s.panelOpen && s.panelTab === 'terminal'
    const element = (target ?? document.activeElement) as HTMLElement | null
    const inTerminal = Boolean(element?.closest?.('.lm-terminal'))
    if (visible && inTerminal) {
      s.togglePanel(false)
      editorBridge.focus()
      return
    }
    if (visible) {
      terminals.focus(terminals.activeId)
      return
    }
    s.showPanel('terminal')
    window.setTimeout(() => terminals.focus(terminals.activeId), 30)
  },
  openDialog(id, section) {
    set({ dialog: id, dialogSection: section ?? null, paletteOpen: false })
  },
  closeDialog() {
    // The section stays put so the dialog does not jump when hidden; `openDialog` sets it anew.
    set({ dialog: null })
  },
  setChordHint(hint) {
    set({ chordHint: hint })
  },
  openAddonStudio(addonId = null, starter) {
    set({ addonStudio: { addonId, starter }, dialog: null })
  },
  closeAddonStudio() {
    set({ addonStudio: null })
  },
  setLanguage(language) {
    const value = (language || 'system') as LanguageSetting
    applyLanguage(value)
    set({ language: value, registryVersion: registry.getVersion() })
    get().persist()
  },
  setKeymapPreset(preset) {
    set({ keymapPreset: preset })
    get().applyKeybindings()
    get().persist()
  },
  setKeybinding(commandId, bindings) {
    const overrides = { ...get().keybindingOverrides }
    delete overrides[commandId]
    if (bindings) overrides[commandId] = bindings
    set({ keybindingOverrides: overrides })
    get().applyKeybindings()
    get().persist()
  },
  resetKeybindings() {
    set({ keybindingOverrides: {} })
    get().applyKeybindings()
    get().persist()
  },
  applyKeybindings() {
    const defaults: BindingMap = {}
    for (const command of registry.commands()) {
      if (command.keybinding) defaults[command.id] = [command.keybinding]
    }
    // The registry reports often (on every colour change in the theme studio, say) — rebind only on real changes.
    const key = JSON.stringify([get().keymapPreset, get().keybindingOverrides, defaults])
    if (key === appliedKeybindings) return
    appliedKeybindings = key
    keybindings.configure(get().keymapPreset, get().keybindingOverrides, defaults)
  },
  clearOutput() {
    set({ output: [] })
  },
  appendOutput(line) {
    set((s) => ({ output: [...s.output, line].slice(-3000) }))
  },
  setRunning(id, label = null) {
    set({ runningId: id, runningLabel: id ? label : null })
  },
  setReferences(result) {
    set({ references: result })
    if (result) get().showPanel('references')
  },

  /* ---------------------------------------------------------------- */

  setTheme(id) {
    const theme = registry.themes().find((t) => t.id === id)
    if (!theme) return
    set({ themeId: id })
    const root = document.documentElement
    if (get().effects.animations && !get().editingThemeId) {
      root.classList.add('lm-theme-transition')
      window.clearTimeout(themeTransitionTimer)
      themeTransitionTimer = window.setTimeout(() => root.classList.remove('lm-theme-transition'), 450)
    }
    applyTheme(theme, get().effects)
    get().persist()
  },

  setEffects(patch) {
    const effects = { ...get().effects, ...patch }
    set({ effects })
    applyEffects(effects)
    if (patch.lsp !== undefined) lsp.setEnabled(patch.lsp)
    get().persist()
  },

  resetEffects() {
    set({ effects: DEFAULT_EFFECTS })
    applyEffects(DEFAULT_EFFECTS)
    get().persist()
  },

  /* ---------------------------------------------------------------- */

  openThemeStudio(baseId) {
    const s = get()
    const source =
      registry.themes().find((t) => t.id === (baseId ?? s.themeId)) ?? lumenDark

    // An existing theme of your own is edited directly, everything else copied.
    if (baseId && registry.isUserTheme(baseId)) {
      set({ editingThemeId: baseId })
      s.setTheme(baseId)
      return
    }

    const copy: Theme = {
      ...structuredClone(source),
      id: uniqueThemeId(source.id, s.customThemes),
      name: t('notify.theme.copyName', { name: source.name }),
      author: t('notify.theme.authorMe'),
    }
    const customThemes = [...s.customThemes, copy]
    registry.setUserThemes(customThemes)
    set({ customThemes, editingThemeId: copy.id, registryVersion: registry.getVersion() })
    get().setTheme(copy.id)
  },

  closeThemeStudio(cancel) {
    const s = get()
    const id = s.editingThemeId
    set({ editingThemeId: null })
    if (!id) return

    if (cancel) {
      const customThemes = s.customThemes.filter((t) => t.id !== id)
      registry.setUserThemes(customThemes)
      set({ customThemes, registryVersion: registry.getVersion() })
      get().setTheme(
        registry.themes().some((t) => t.id === s.themeId) ? s.themeId : DEFAULT_THEME_ID,
      )
      return
    }
    get().persist()
    get().notify(t('notify.theme.saved'), 'success')
  },

  /** Applies the draft at once, without saving it. */
  previewTheme(theme) {
    const customThemes = get().customThemes.map((t) => (t.id === theme.id ? theme : t))
    registry.setUserThemes(customThemes)
    set({ customThemes, registryVersion: registry.getVersion() })
    applyTheme(theme, get().effects)
  },

  saveCustomTheme(theme) {
    const existing = get().customThemes.some((t) => t.id === theme.id)
    const customThemes = existing
      ? get().customThemes.map((t) => (t.id === theme.id ? theme : t))
      : [...get().customThemes, theme]
    registry.setUserThemes(customThemes)
    set({ customThemes, registryVersion: registry.getVersion() })
    get().persist()
  },

  deleteCustomTheme(id) {
    const customThemes = get().customThemes.filter((t) => t.id !== id)
    registry.setUserThemes(customThemes)
    set({ customThemes, registryVersion: registry.getVersion() })
    if (get().themeId === id) get().setTheme(DEFAULT_THEME_ID)
    get().persist()
    get().notify(t('notify.theme.deleted'), 'info')
  },

  duplicateTheme(id) {
    const source = registry.themes().find((t) => t.id === id)
    if (!source) return null
    const copy: Theme = {
      ...structuredClone(source),
      id: uniqueThemeId(source.id, get().customThemes),
      name: t('notify.theme.copyName', { name: source.name }),
      author: t('notify.theme.authorMe'),
    }
    get().saveCustomTheme(copy)
    return copy.id
  },

  async importTheme() {
    const picked = await window.lumen.dialog.openFile()
    if (!picked) return
    try {
      const parsed = JSON.parse(picked.content) as Theme
      if (!isTheme(parsed)) throw new Error(t('notify.theme.invalid'))
      const theme: Theme = {
        ...parsed,
        id: uniqueThemeId(parsed.id, get().customThemes),
        author: parsed.author ?? 'Import',
      }
      get().saveCustomTheme(theme)
      get().setTheme(theme.id)
      get().notify(t('notify.theme.imported', { name: theme.name }), 'success')
    } catch (err) {
      get().notify(t('notify.theme.importFailed', { error: (err as Error).message }), 'error')
    }
  },

  async exportTheme(id) {
    const theme = registry.themes().find((t) => t.id === id)
    if (!theme) return
    const target = await window.lumen.dialog.saveFile(`${theme.id}.lumen-theme.json`)
    if (!target) return
    try {
      await window.lumen.fs.writeFile(target, `${JSON.stringify(theme, null, 2)}\n`)
      get().notify(t('notify.theme.exported', { name: theme.name }), 'success')
    } catch (err) {
      get().notify((err as Error).message, 'error')
    }
  },

  /* ---------------------------------------------------------------- *
   * Icon packs
   * ---------------------------------------------------------------- */

  setIconPack(id) {
    if (!registry.iconPacks().some((pack) => pack.id === id)) return
    set({ iconPackId: id })
    applyIconPack(id)
    get().persist()
  },

  openIconStudio(baseId, blank = false) {
    const packs = registry.iconPacks()
    const taken = packs.map((pack) => pack.id)
    if (blank) {
      const draft: IconPack = { id: uniqueIconPackId('eigene-icons', taken), name: t('iconPacks.newName'), author: t('notify.theme.authorMe') }
      set({ iconStudio: { draft, isNew: true }, dialog: null })
      return
    }
    const source = packs.find((pack) => pack.id === (baseId ?? get().iconPackId)) ?? packs[0]
    if (!source) return
    if (registry.isUserIconPack(source.id)) {
      set({ iconStudio: { draft: structuredClone(source), isNew: false }, dialog: null })
      return
    }
    const draft: IconPack = {
      ...structuredClone(source),
      id: uniqueIconPackId(source.id, taken),
      name: t('notify.theme.copyName', { name: source.name }),
      author: t('notify.theme.authorMe'),
    }
    set({ iconStudio: { draft, isNew: true }, dialog: null })
  },

  closeIconStudio() {
    set({ iconStudio: null, dialog: 'themes', dialogSection: 'icons' })
  },

  saveCustomIconPack(pack) {
    const existing = get().customIconPacks.some((entry) => entry.id === pack.id)
    const customIconPacks = existing
      ? get().customIconPacks.map((entry) => (entry.id === pack.id ? pack : entry))
      : [...get().customIconPacks, pack]
    registry.setUserIconPacks(customIconPacks)
    set({ customIconPacks, registryVersion: registry.getVersion() })
    // An edited active pack is applied again straight away.
    if (get().iconPackId === pack.id) applyIconPack(pack.id)
    get().persist()
  },

  deleteCustomIconPack(id) {
    const customIconPacks = get().customIconPacks.filter((pack) => pack.id !== id)
    registry.setUserIconPacks(customIconPacks)
    set({ customIconPacks, registryVersion: registry.getVersion() })
    if (get().iconPackId === id) get().setIconPack(DEFAULT_ICON_PACK_ID)
    get().persist()
    get().notify(t('iconPacks.deleted'), 'info')
  },

  duplicateIconPack(id) {
    const source = registry.iconPacks().find((pack) => pack.id === id)
    if (!source) return null
    const copy: IconPack = {
      ...structuredClone(source),
      id: uniqueIconPackId(source.id, registry.iconPacks().map((pack) => pack.id)),
      name: t('notify.theme.copyName', { name: source.name }),
      author: t('notify.theme.authorMe'),
    }
    get().saveCustomIconPack(copy)
    return copy.id
  },

  async importIconPack() {
    const picked = await window.lumen.dialog.openFile()
    if (!picked) return
    try {
      const parsed = JSON.parse(picked.content) as IconPack
      if (!isIconPack(parsed)) throw new Error(t('iconPacks.invalid'))
      const pack: IconPack = {
        ...parsed,
        id: uniqueIconPackId(parsed.id, registry.iconPacks().map((entry) => entry.id)),
        author: parsed.author ?? 'Import',
      }
      get().saveCustomIconPack(pack)
      get().setIconPack(pack.id)
      get().notify(t('iconPacks.imported', { name: pack.name }), 'success')
    } catch (err) {
      get().notify(t('iconPacks.importFailed', { error: (err as Error).message }), 'error')
    }
  },

  async exportIconPack(id) {
    const pack = registry.iconPacks().find((entry) => entry.id === id)
    if (!pack) return
    const target = await window.lumen.dialog.saveFile(`${pack.id}.lumen-icons.json`)
    if (!target) return
    try {
      await window.lumen.fs.writeFile(target, `${JSON.stringify(pack, null, 2)}\n`)
      get().notify(t('iconPacks.exported', { name: pack.name }), 'success')
    } catch (err) {
      get().notify((err as Error).message, 'error')
    }
  },

  toggleAddon(id) {
    const addon = registry.get(id)
    if (!addon || addon.builtin) return
    registry.toggle(id)

    const enabledAddons = registry
      .activeIds()
      .filter((activeId) => !registry.get(activeId)?.builtin)
    set({ enabledAddons, registryVersion: registry.getVersion() })

    // When the theme disappears with the add-on, fall back to the default theme.
    if (!registry.themes().some((t) => t.id === get().themeId)) {
      get().setTheme(DEFAULT_THEME_ID)
    }

    // Work out the language of the open tabs afresh.
    const languages = registry.languages()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path && !t.virtual ? { ...t, languageId: matchLanguage(t.path, languages)?.id ?? null } : t,
      ),
    }))

    get().persist()
    get().applyKeybindings()
    get().notify(
      t(registry.isActive(id) ? 'notify.addonEnabled' : 'notify.addonDisabled', { name: addon.name }),
      'info',
    )
    // The project kinds may have changed.
    void get().refreshProject()
  },

  /* ---------------------------------------------------------------- */

  setPalette(open) {
    set({ paletteOpen: open })
  },

  openEverywhere(tab = 'all') {
    set({ paletteOpen: 'everywhere', everywhereTab: tab })
  },

  setEverywhereTab(tab) {
    set({ everywhereTab: tab })
  },

  async openTerminal(options = {}) {
    const s = get()
    const cwd = options.cwd ?? s.project?.root ?? s.workspace ?? undefined
    const created = terminals.create({
      shell: options.shell ?? (s.effects.terminalShell || undefined),
      cwd,
      command: options.command,
      title: options.title,
      env: s.projectConfig.env,
    })
    set({ panelOpen: true, panelTab: 'terminal' })
    await created
  },

  async openExternalTerminal(cwd, terminalId) {
    const s = get()
    const target = cwd ?? s.project?.root ?? s.workspace ?? ''
    try {
      const label = await window.lumen.terminal.openExternal(target, terminalId ?? (s.effects.externalTerminal || undefined))
      get().notify(t('notify.externalTerminalOpened', { name: label }), 'info')
    } catch (err) {
      get().notify((err as Error).message, 'error')
    }
  },

  setNewProjectOpen(open) {
    set({ newProjectOpen: open })
  },

  openForm(spec) {
    set({ formDialog: spec })
  },

  closeForm() {
    set({ formDialog: null })
  },

  notify(message, kind = 'info') {
    const toast: Toast = { id: ++toastCounter, message, kind }
    set((s) => ({ toasts: [...s.toasts, toast].slice(-4) }))
    setTimeout(() => get().dismissToast(toast.id), kind === 'error' ? 6000 : 3800)
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  /* ---------------------------------------------------------------- */

  languages: () => registry.languages(),
  themes: () => registry.themes(),

  activeTab() {
    const s = get()
    return s.tabs.find((t) => t.id === s.activeTabId) ?? null
  },

  languageFor(tab) {
    if (!tab) return null
    if (tab.languageId) {
      return registry.languages().find((l) => l.id === tab.languageId) ?? null
    }
    return tab.path && !tab.virtual ? matchLanguage(tab.path, registry.languages()) : null
  },
}))

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Open a virtual document (jdt:// classes from jars) — `false` when that is not possible. */
async function openVirtualUri(uri: string): Promise<boolean> {
  const state = useStore.getState()
  const existing = state.tabs.find((t) => t.path === uri)
  if (existing) {
    state.setActiveTab(existing.id)
    return true
  }
  if (!uri.startsWith('jdt://')) {
    state.notify(t('notify.unsupportedUri', { scheme: uri.split(':')[0] }), 'warning')
    return false
  }
  const client = lsp.clientForLanguage('java')
  const content = client ? await client.classFileContents(uri) : null
  if (content === null) {
    state.notify(t('notify.classSourceFailed'), 'warning')
    return false
  }
  const name = decodeURIComponent(uri.split('?')[0].split('/').pop() ?? 'Klasse').replace(/\.class$/, '.java')
  state.openVirtual(uri, name, content, 'java')
  return true
}

/** Write the open files of the working folder (relative) into the project configuration. */
export async function rememberOpenFiles(root: string) {
  const s = useStore.getState()
  if (!s.effects.restoreOpenFiles) return
  const prefix = `${root.replace(/[\\/]$/, '')}/`
  const relative = (ids: string[]) => ids
    .map((id) => s.tabs.find((t) => t.id === id))
    .filter((t): t is Tab => Boolean(t?.path && !t.virtual && !t.preview && t.path.startsWith(prefix)))
    .map((t) => t.path!.slice(prefix.length))
  const openFiles = relative(s.groups.flatMap((g) => g.tabIds)).filter((p, i, all) => all.indexOf(p) === i)
  const openGroups = s.groups.length > 1 ? s.groups.map((g) => relative(g.tabIds)) : undefined
  const splitDirection = s.groups.length > 1 ? s.splitDirection : undefined
  const config = s.workspace === root ? s.projectConfig : await loadProjectConfig(root)
  const same = JSON.stringify([config.openFiles ?? [], config.openGroups, config.splitDirection])
    === JSON.stringify([openFiles, openGroups, splitDirection])
  if (same) return
  const next = { ...config, openFiles, openGroups, splitDirection }
  if (s.workspace === root) useStore.setState({ projectConfig: next })
  await saveProjectConfig(root, next).catch(() => {})
}

function scheduleOpenFilesSync() {
  if (openFilesTimer) clearTimeout(openFilesTimer)
  openFilesTimer = setTimeout(() => {
    openFilesTimer = null
    const root = useStore.getState().workspace
    if (root) void rememberOpenFiles(root)
  }, 1500)
}

/* ------------------------------------------------------------------ *
 * Workspaces
 * ------------------------------------------------------------------ */

const WORKSPACE_COLORS = ['#7c8cff', '#22d3ee', '#5ecf8f', '#fbbf24', '#f472b6', '#fb7185', '#c084fc', '#f97316']

/** Write the open files and the split into the current workspace. */
function captureSession() {
  const s = useStore.getState()
  const current = s.workspaces.find((w) => w.id === s.currentWorkspaceId)
  if (!current) return
  const paths = (ids: string[]) => ids
    .map((id) => s.tabs.find((tab) => tab.id === id))
    .filter((tab): tab is Tab => Boolean(tab?.path && !tab.virtual && !tab.preview))
    .map((tab) => tab.path!)
  const session = {
    groups: s.groups.map((g) => paths(g.tabIds)),
    splitDirection: s.splitDirection,
    activeGroup: Math.max(0, s.groups.findIndex((g) => g.id === s.activeGroupId)),
  }
  useStore.setState({
    workspaces: s.workspaces.map((w) => (w.id === current.id
      ? { ...w, session, folders: s.workspace ? [s.workspace, ...s.extraFolders] : w.folders, activeFolder: s.workspace ?? w.activeFolder }
      : w)),
  })
}

async function restoreSession(session: NonNullable<WorkspaceDef['session']>) {
  const store = useStore.getState()
  const [first, second] = session.groups
  for (const path of (first ?? []).slice(0, 24)) await store.openFile(path).catch(() => {})
  if (second?.length) {
    const extra: EditorGroup = { id: nextGroupId(), tabIds: [], activeTabId: null }
    useStore.setState((st) => ({ groups: [...st.groups, extra], activeGroupId: extra.id, splitDirection: session.splitDirection }))
    for (const path of second.slice(0, 24)) await store.openFile(path).catch(() => {})
  }
  useStore.getState().focusGroup(Math.min(session.activeGroup, useStore.getState().groups.length - 1))
}

function isWorkspaceDef(value: unknown): value is WorkspaceDef {
  const w = value as WorkspaceDef | null
  return Boolean(
    w && typeof w.id === 'string' && typeof w.name === 'string' && Array.isArray(w.folders) &&
    w.folders.every((f) => typeof f === 'string') && typeof w.activeFolder === 'string',
  )
}

/* ------------------------------------------------------------------ *
 * Editor groups
 * ------------------------------------------------------------------ */

function currentGroup(s: State): EditorGroup {
  return s.groups.find((g) => g.id === s.activeGroupId) ?? s.groups[0]
}

function withoutTab(group: EditorGroup, tabId: string): EditorGroup {
  const index = group.tabIds.indexOf(tabId)
  if (index === -1) return group
  const tabIds = group.tabIds.filter((id) => id !== tabId)
  if (group.activeTabId !== tabId) return { ...group, tabIds }
  return { ...group, tabIds, activeTabId: tabIds[index] ?? tabIds[index - 1] ?? null }
}

function withTab(group: EditorGroup, tabId: string): EditorGroup {
  if (group.tabIds.includes(tabId)) return { ...group, activeTabId: tabId }
  return { ...group, tabIds: [...group.tabIds, tabId], activeTabId: tabId }
}

function insertAt(group: EditorGroup, tabId: string, index?: number): EditorGroup {
  const tabIds = [...group.tabIds]
  tabIds.splice(index ?? tabIds.length, 0, tabId)
  return { ...group, tabIds }
}

function reorder(group: EditorGroup, tabId: string, index?: number): EditorGroup {
  const without = group.tabIds.filter((id) => id !== tabId)
  const target = Math.min(index ?? without.length, without.length)
  without.splice(target, 0, tabId)
  return { ...group, tabIds: without, activeTabId: tabId }
}

/**
 * Takes on new groups: empty secondary groups fall away, tabs without a group
 * are closed (language servers, symbols) and remembered for “reopen”.
 */
function commitGroups(groups: EditorGroup[], activeGroupId: string, options: { remember?: boolean } = {}) {
  const s = useStore.getState()
  const kept = groups.filter((g) => g.tabIds.length > 0)
  const list = kept.length ? kept : [{ id: groups[0]?.id ?? FIRST_GROUP_ID, tabIds: [], activeTabId: null }]
  const active = list.find((g) => g.id === activeGroupId) ?? list[0]
  const referenced = new Set(list.flatMap((g) => g.tabIds))
  const closed = s.tabs.filter((t) => !referenced.has(t.id))
  for (const tab of closed) {
    lsp.closeDocument(tab.path)
    if (tab.path) symbolStore.clear(tab.path)
  }
  const remembered = options.remember === false
    ? []
    : closed.filter((t) => t.path && !t.virtual).map((t) => t.path!)
  useStore.setState({
    tabs: closed.length ? s.tabs.filter((t) => referenced.has(t.id)) : s.tabs,
    groups: list,
    activeGroupId: active.id,
    activeTabId: active.activeTabId,
    closedTabs: remembered.length
      ? [...remembered, ...s.closedTabs.filter((p) => !remembered.includes(p))].slice(0, 30)
      : s.closedTabs,
  })
  scheduleOpenFilesSync()
}

function addTabToActiveGroup(tab: Tab) {
  const s = useStore.getState()
  useStore.setState({ tabs: [...s.tabs, tab] })
  const group = currentGroup(s)
  commitGroups(s.groups.map((g) => (g.id === group.id ? withTab(g, tab.id) : g)), group.id, { remember: false })
}

/** Produces a theme identifier not yet taken. */
function uniqueThemeId(base: string, existing: Theme[]): string {
  const clean = base.replace(/-kopie(-\d+)?$/, '')
  const taken = new Set([...registry.themes(), ...existing].map((t) => t.id))
  let candidate = `${clean}-kopie`
  let counter = 2
  while (taken.has(candidate)) candidate = `${clean}-kopie-${counter++}`
  return candidate
}

/** Set the active icon pack; without an id, the default pack. */
function applyIconPack(id: string) {
  const packs = registry.iconPacks()
  setActiveIconPack(packs.find((pack) => pack.id === id) ?? packs.find((pack) => pack.id === DEFAULT_ICON_PACK_ID) ?? null)
}

/** A rough structural check for themes loaded and imported. */
function isTheme(value: unknown): value is Theme {
  const t = value as Theme | null
  return Boolean(
    t && typeof t.id === 'string' && typeof t.name === 'string' &&
    (t.type === 'dark' || t.type === 'light') &&
    t.ui && typeof t.ui === 'object' && typeof t.ui.bg === 'string' &&
    t.syntax && typeof t.syntax === 'object',
  )
}

/** A selector helper for the dirty state. */
export const isDirty = (tab: Tab) => tab.content !== tab.saved && !tab.readonly

/** The path relative to the working folder, otherwise unchanged. */
export function relativeToWorkspace(path: string, workspace: string | null): string {
  if (!workspace) return path
  const prefix = `${workspace.replace(/[\\/]$/, '')}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

/* Keep track of the files opened most recently whenever a tab becomes active. */
useStore.subscribe((state, previous) => {
  if (state.activeTabId === previous.activeTabId) return
  const tab = state.tabs.find((t) => t.id === state.activeTabId)
  if (!tab?.path || tab.virtual) return
  if (state.recentFiles[0] === tab.path) return
  useStore.setState({ recentFiles: [tab.path, ...state.recentFiles.filter((p) => p !== tab.path)].slice(0, 50) })
})
