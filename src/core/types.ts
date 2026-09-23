/**
 * Lumen Add-on API
 * ================
 *
 * An add-on is a plain object. There is nothing to build, compile or
 * register — export the object, list it in `src/addons/index.ts`, done. A
 * new language is usually nothing but a few lists of keywords:
 *
 *   export const myAddon: Addon = {
 *     id: 'lang.lua',
 *     name: 'Lua',
 *     version: '1.0.0',
 *     languages: [{
 *       id: 'lua',
 *       name: 'Lua',
 *       extensions: ['.lua'],
 *       comments: { line: '--', block: ['--[[', ']]'] },
 *       keywords: ['local', 'function', 'end'],
 *       controls: ['if', 'then', 'else', 'for', 'while'],
 *       run: { label: 'Lua', command: 'lua', args: ['${file}'] },
 *     }],
 *   }
 */

import type { StringStream } from '@codemirror/language'

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

/** Every token kind a theme can colour. */
export const TOKEN_KINDS = [
  'keyword',     // let, class, import …
  'control',     // if, for, return … (eigene Farbe für Kontrollfluss)
  'type',        // int, String, benutzerdefinierte Typen
  'builtin',     // eingebaute Funktionen/Objekte
  'constant',    // true, false, null, PI
  'string',
  'escape',      // \n innerhalb von Strings
  'number',
  'comment',
  'function',    // Aufruf-/Definitionsname
  'variable',
  'property',    // obj.prop, CSS-Eigenschaften
  'operator',
  'punctuation',
  'tag',         // <div>
  'attribute',   // class="…"
  'meta',        // #include, @media, Präprozessor
  'regexp',
  'invalid',
] as const

export type TokenKind = (typeof TOKEN_KINDS)[number]

/* ------------------------------------------------------------------ *
 * Languages
 * ------------------------------------------------------------------ */

export interface StringRule {
  /** Character that opens the string, and closes it too when `end` is absent. */
  start: string
  end?: string
  /** May the string span several lines? */
  multiline?: boolean
  /** Honour backslash escapes? Defaults to true. */
  escapes?: boolean
  /** Colour as `meta` rather than `string` — template literals, say. */
  kind?: TokenKind
  /**
   * Start of an interpolation, such as `'${'` (Novus, JavaScript) or `'#{'`
   * (Crystal). Everything up to the matching closing brace is coloured as
   * `meta` instead of as part of the string.
   */
  interpolate?: string
}

export interface RunConfig {
  /** Label in the run menu. */
  label: string
  /** Executable to launch, such as `python3`. */
  command: string
  /**
   * Arguments. Placeholders:
   *  `${file}` `${fileDir}` `${fileName}` `${fileStem}` `${workspace}`
   */
  args: string[]
  /** Optional second stage (compile, then run). */
  then?: { command: string; args: string[] }
}

/**
 * A language server for this language.
 *
 * Lumen never installs anything by itself: if `command` is not on the PATH
 * the server stays off and the status bar shows how to install it. Several
 * entries are tried in order — the first one found wins.
 */
/**
 * How Lumen installs a server into its closed environment under
 * `~/.lumen/lsp` — with its own Node.js, uv/Python and Go, never touching a
 * global npm, pip or the system. The program ends up as a launcher in
 * `~/.lumen/lsp/bin`, which is checked before the PATH.
 *
 *   npm      packages from the npm registry (`["typescript", "typescript-language-server"]`)
 *   pypi     a Python tool through uv, with its own Python (`python: "3.13"`)
 *            and pinned extras (`with: ["pygls<2"]`)
 *   go       `go install module@version`
 *   dotnet   a .NET tool — needs the .NET SDK, which is not downloaded
 *   github   a release asset per `<platform>-<arch>` (a regular expression
 *            on the asset name); `bin` may be a path inside the archive
 *   archive  a download address, per platform or for all
 *
 * `bin` defaults to `command`. `runtime` starts the program through Lumen's
 * Node.js or Python — for scripts such as jdtls' launcher.
 */
export type LspPackage =
  | { type: 'npm'; packages: string[]; bin?: string }
  | { type: 'pypi'; package: string; python?: string; with?: string[]; bin?: string }
  | { type: 'go'; module: string; bin?: string }
  | { type: 'dotnet'; package: string; bin?: string }
  | { type: 'github'; repo: string; assets: Record<string, string>; bin?: string; version?: string; runtime?: 'python' | 'node' }
  | { type: 'archive'; url: string | Record<string, string>; bin?: string; runtime?: 'python' | 'node'; executables?: string[] }

/** System package managers Lumen can drive — the keys of `LspConfig.systemPackages`. */
export type SystemPackageManager =
  | 'pacman' | 'apt' | 'dnf' | 'zypper' | 'apk' | 'xbps' | 'emerge'
  | 'brew' | 'winget' | 'scoop' | 'choco'

/** Package names per system package manager; several packages separated by spaces. */
export type SystemPackages = Partial<Record<SystemPackageManager, string>>

export interface LspConfig {
  /** Display name, for instance "typescript-language-server". */
  label: string
  command: string
  args?: string[]
  /**
   * Further places the server may live when `command` is not on the PATH.
   * Absolute paths, `~` and the placeholders `${root}` (project root),
   * `${home}` and `${dataDir}` are allowed. The first hit becomes the
   * program.
   */
  candidates?: string[]
  /** Extra environment variables for the server process. */
  env?: Record<string, string>
  /** The LSP `languageId`, when it differs from `LanguageSpec.id`. */
  languageId?: string
  /**
   * Files or folders that mark the project root (`package.json`, `go.mod`).
   * With no hit the opened folder is used.
   */
  rootMarkers?: string[]
  /**
   * `nearest` (the default) takes the first folder upwards holding a marker.
   * `outermost` takes the highest one within the workspace folder — for build
   * tools with modules (Maven, Gradle), whose server has to see the whole build
   * to resolve one module's classes in another. VCS markers such as `.git`
   * then only count when nothing else is found.
   */
  rootSearch?: 'nearest' | 'outermost'
  initializationOptions?: unknown
  /** Sent through `workspace/didChangeConfiguration`. */
  settings?: unknown
  /** How to install the server, in prose. */
  install?: string
  /**
   * Install commands per platform. Lumen only runs them when someone clicks
   * in the language-server panel or confirms the install prompt — never on
   * its own.
   */
  installCommands?: Partial<Record<'linux' | 'darwin' | 'win32', string>>
  /** Installs the server into Lumen's own environment; preferred over `installCommands`. */
  package?: LspPackage
  /**
   * The package that provides the server in the system's package manager, per
   * manager (`{ pacman: 'clang', apt: 'clangd', brew: 'llvm' }`). Lumen detects
   * the manager itself, builds the command and asks for the administrator
   * password where the manager needs root.
   */
  systemPackages?: SystemPackages
  /** Link to the server's documentation. */
  docs?: string
  /**
   * One process serving several languages (clangd for C and C++, tsserver
   * for JavaScript and TypeScript). Defaults to true: clients are shared by
   * program and project root.
   */
  shared?: boolean
}

export interface Snippet {
  label: string
  detail?: string
  /** `$0` marks where the cursor lands after insertion. */
  body: string
}

/** A snippet an add-on contributes to some other language. */
export interface AddonSnippet extends Snippet {
  languageId: string
}

/** A tokenizer of your own — only needed for markup and the like. */
export interface CustomTokenizer<S = unknown> {
  startState(): S
  copyState?(state: S): S
  token(stream: StringStream, state: S): TokenKind | null
}

export interface LanguageSpec {
  id: string
  name: string
  /** Lower case, with the dot: `['.ts', '.mts']` */
  extensions: string[]
  /** Exact file names without an extension, e.g. `['Makefile', 'Dockerfile']` */
  filenames?: string[]
  /** One or two characters for the file icon. */
  icon?: string
  /** Accent colour of the language (file icon, status bar). */
  color?: string

  comments?: { line?: string; block?: [string, string] }
  keywords?: string[]
  controls?: string[]
  types?: string[]
  builtins?: string[]
  constants?: string[]

  /** Defaults to `"` and `'`, single-line, with escapes. */
  strings?: StringRule[]
  numbers?: RegExp
  identifier?: RegExp
  operators?: RegExp
  /** Preprocessor directives at the start of a line, `/^#\w+/` for C. */
  meta?: RegExp
  caseInsensitive?: boolean
  /** Colour capitalised identifiers as types (Java, Rust, Go …). */
  capitalizedAsType?: boolean

  /** Characters that indent and outdent. Defaults to `{[(` / `}])` */
  indentOpen?: RegExp
  indentClose?: RegExp
  indentUnit?: number

  /** Extra words for completion. */
  completions?: string[]
  snippets?: Snippet[]
  run?: RunConfig[]
  /** Language servers, most preferred first. */
  lsp?: LspConfig[]
  /** Debug adapters, most preferred first. */
  debug?: DebugAdapterConfig[]

  /** Replaces the generic tokenizer outright. */
  tokenizer?: CustomTokenizer<never>

  /**
   * Higher wins when several languages claim the same extension (Tailwind
   * ahead of CSS, for instance). Defaults to 0.
   */
  priority?: number
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

export type TaskGroup = 'build' | 'run' | 'test' | 'clean' | 'other'

/** A runnable task of a project — build, test, script … */
export interface ProjectTask {
  /** Unique within the project, such as `maven:package`. */
  id: string
  label: string
  command: string
  args: string[]
  group?: TaskGroup
  /** Relative to the project root, which is also the default. */
  cwd?: string
  env?: Record<string, string>
  /** Second stage (compile, then run). */
  then?: { command: string; args: string[] }
  /** Short description for the panel. */
  detail?: string
  /**
   * Where a discovered task belongs — a Gradle task group (`Build`, `Help`)
   * or a Maven plugin prefix (`spring-boot`). Used to group custom tasks.
   */
  category?: string
}

export interface ProjectDependency {
  name: string
  version?: string
  /** For instance "test", "dev", "compile". */
  scope?: string
}

/**
 * A module of a multi-module build — a Maven module listed under `<modules>`
 * or a Gradle project `include`d in the settings script. Modules nest.
 */
export interface ProjectModule {
  /** Unique within the project: the Maven module path or the Gradle project path (`:app:core`). */
  id: string
  name: string
  /** Folder relative to the project root (`services/api`). */
  path: string
  /** A short kind: Maven packaging (`jar`, `pom`) or the Gradle flavour (`application`, `library`). */
  kind?: string
  /** Tasks scoped to this module (`mvn -pl … -am`, `gradle :app:build`), custom ones included. */
  tasks: ProjectTask[]
  facts?: Record<string, string>
  dependencies?: ProjectDependency[]
  /** Build file relative to the project root. */
  buildFile?: string
  modules?: ProjectModule[]
}

export interface ProjectMeta {
  name?: string
  version?: string
  description?: string
  /** Java version, language standard, package manager and the like. */
  facts?: Record<string, string>
  dependencies?: ProjectDependency[]
  /** Source folders relative to the root (`src/main/java`). */
  sourceRoots?: string[]
  /** File offered when the project opens (`pom.xml`). */
  buildFile?: string
  /** Modules of a multi-module build, as a tree. */
  modules?: ProjectModule[]
  /** Tasks found in the build files beyond the standard ones — Gradle tasks, Maven plugin goals, profiles. */
  customTasks?: ProjectTask[]
}

export interface ProjectContext {
  root: string
  /** Reads a file relative to the root; `null` when it is missing. */
  readFile(relative: string): Promise<string | null>
  exists(relative: string): Promise<boolean>
  /** Entries of a folder relative to the root (names only). */
  list(relative: string): Promise<{ name: string; isDirectory: boolean }[]>
  platform: string
}

/* ------------------------------------------------------------------ *
 * Forms (project templates, dependencies, dialogs)
 * ------------------------------------------------------------------ */

export type FormValues = Record<string, string>

/** One entry of a select. `group` puts it under a heading (“Releases”, “Snapshots”). */
export interface FieldChoice {
  value: string
  label: string
  hint?: string
  group?: string
  /** A short tag beside the label — “latest”, “recommended”, “beta”. */
  badge?: string
}

/** An input in a dialog. Values are always strings — `'true'`/`'false'` for switches. */
export interface FormField {
  id: string
  label: string
  /**
   * Defaults to `text`. `combobox` is a select with a search box, for long
   * lists such as every Minecraft version or every loader build.
   */
  type?: 'text' | 'select' | 'combobox' | 'toggle' | 'password' | 'textarea'
  /** A fixed starting value, or one derived from other fields until someone edits it. */
  default?: string | ((values: FormValues) => string)
  placeholder?: string
  hint?: string
  choices?: FieldChoice[]
  /** Choices computed from the other fields — replaces `choices` when given. */
  choicesFor?: (values: FormValues) => FieldChoice[]
  /**
   * Choices fetched on demand — versions from a Maven repository, say. Called
   * when the form opens and again whenever a field named in `dependsOn`
   * changes; `signal` aborts a fetch that has been overtaken. While it runs
   * the field shows a spinner; on failure the error with a retry. When the
   * current value is not among the result, the field's `default` (or the
   * first choice) takes its place.
   */
  loadChoices?: (values: FormValues, signal: AbortSignal) => Promise<FieldChoice[]>
  /** Fields whose change reloads `loadChoices` (and recomputes `choicesFor`). */
  dependsOn?: string[]
  /** Regular expression source; the whole value has to match. */
  pattern?: string
  /** Message shown when `pattern` does not match. */
  patternHint?: string
  /** Defaults to true for text fields. */
  required?: boolean
  /** Heading the field appears under. */
  section?: string
  /** Only show — and only read — the field while the condition holds. */
  when?: (values: FormValues) => boolean
  /** Render in a monospaced font (packages, versions, paths). */
  mono?: boolean
  /**
   * Suggestions for the field, offered beside the input rather than enforced.
   * A function when they depend on other fields, such as versions of a package.
   */
  suggestions?: string[] | ((values: FormValues) => string[])
}

/* ------------------------------------------------------------------ *
 * Project kinds and package managers
 * ------------------------------------------------------------------ */

export interface DependencySpec {
  name: string
  version?: string
  scope?: string
}

/**
 * Outcome of “add dependency”: either a command for the package manager
 * (`npm add`, `cargo add`) or an edit to the build file (`pom.xml`,
 * `vcpkg.json`), optionally followed by a command.
 */
export type DependencyAction =
  | { type: 'task'; task: ProjectTask }
  | { type: 'edit'; file: string; content: string; then?: ProjectTask }

export interface DependencySupport {
  /** What the package manager is called — “npm”, “vcpkg”, “Maven”. */
  manager: string
  /** Placeholder for the name field, such as `org.slf4j:slf4j-api`. */
  placeholder: string
  hint?: string
  /** Scopes, such as compile/test or dependencies/devDependencies. */
  scopes?: { value: string; label: string }[]
  /** Does a version have to be given, as Maven requires? */
  versionRequired?: boolean
  add(ctx: ProjectContext, dep: DependencySpec): Promise<DependencyAction> | DependencyAction
}

/**
 * A kind of project an add-on recognises — Maven, CMake, npm …
 *
 * Recognition goes through `markers` in the project root; tasks and metadata
 * come out of the build files.
 */
export interface ProjectKind {
  id: string
  name: string
  /** One or two characters for the panel. */
  icon?: string
  color?: string
  /**
   * Files of which at least one must sit in the root. Simple `*` patterns
   * are allowed (`*.csproj`).
   */
  markers: string[]
  /**
   * A closer look once the markers matched — whether `build.gradle` uses a
   * particular plugin, say. `false` rejects the kind despite the markers.
   */
  detect?(ctx: ProjectContext): Promise<boolean> | boolean
  /** Higher wins when several kinds match. Defaults to 0. */
  priority?: number
  /** Languages this kind is typical for. */
  languageIds?: string[]
  /** `build` for build systems, `packages` for plain package managers (vcpkg, Conan). */
  role?: 'build' | 'packages'
  tasks(ctx: ProjectContext): Promise<ProjectTask[]> | ProjectTask[]
  inspect?(ctx: ProjectContext): Promise<ProjectMeta> | ProjectMeta
  /** Adding dependencies through this kind's package manager. */
  dependencies?: DependencySupport
}

/* ------------------------------------------------------------------ *
 * Project templates
 * ------------------------------------------------------------------ */

export interface TemplateContext {
  /** Project name, as typed. */
  name: string
  /** Cleaned-up name for folders, artefacts and packages (`my-project`). */
  slug: string
  /** Path of the new project. */
  dir: string
  /** Every field value of the template, filled in, defaults applied. */
  values: FormValues
}

/** A template for “New project”. */
export interface ProjectTemplate {
  id: string
  name: string
  description?: string
  /**
   * The group on the project page — “Minecraft”, “Web”, “JVM” … Without one
   * the template's language names the group.
   */
  category?: string
  /** Search terms beyond the name — “spigot bukkit plugin”, say. */
  keywords?: string[]
  languageId?: string
  /** Kind of project this produces (`maven`, say) — may depend on the fields. */
  kindId?: string | ((values: FormValues) => string | undefined)
  icon?: string
  color?: string
  /** Fields in the dialog, beyond name and target folder. */
  fields?: FormField[]
  /**
   * Relative path → contents. May be asynchronous (to fetch a file); the
   * project page previews the paths of a synchronous result only.
   */
  files(ctx: TemplateContext): Record<string, string> | Promise<Record<string, string>>
  /** File opened once the project exists (relative). */
  open?: string | ((ctx: TemplateContext) => string)
  /** Commands to run afterwards — installing dependencies and such — only on request. */
  setup?(ctx: TemplateContext): ProjectTask[]
  /** A hint shown once the project is created. */
  next?: string | ((ctx: TemplateContext) => string)
}

/* ------------------------------------------------------------------ *
 * Themes
 * ------------------------------------------------------------------ */

export const UI_COLOR_KEYS = [
  'bg',            // Fensterhintergrund
  'bgElevated',    // Panels, Seitenleiste
  'bgOverlay',     // Dialoge, Paletten
  'bgInput',
  'bgHover',
  'bgActive',
  'border',
  'borderStrong',
  'text',
  'textMuted',
  'textSubtle',
  'accent',
  'accentText',    // Text auf Akzentfläche
  'success',
  'warning',
  'danger',
  'selection',     // Editor-Auswahl
  'lineHighlight',
  'cursor',
  'gutter',
  'scrollbar',
] as const

export type UIColorKey = (typeof UI_COLOR_KEYS)[number]

export interface SyntaxStyle {
  color: string
  italic?: boolean
  bold?: boolean
  underline?: boolean
}

export interface Theme {
  id: string
  name: string
  type: 'dark' | 'light'
  author?: string
  ui: Record<UIColorKey, string>
  syntax: Partial<Record<TokenKind, string | SyntaxStyle>>
}

/* ------------------------------------------------------------------ *
 * Befehle
 * ------------------------------------------------------------------ */

export interface Command {
  id: string
  title: string
  /** Group in the command palette, such as "File" or "View". */
  category?: string
  /**
   * Suggested binding, such as `'Ctrl+Shift+P'` or `'Ctrl+K Ctrl+X'`. It
   * applies as long as neither the preset nor the user says otherwise.
   */
  keybinding?: string
  run: () => void | Promise<void>
  /** Hide the command when `false`. */
  when?: () => boolean
  /** `editor`: the shortcut only fires while the editor has focus. */
  scope?: 'editor' | 'global'
}

/* ------------------------------------------------------------------ *
 * Add-on
 * ------------------------------------------------------------------ */

export interface AddonContext {
  /** Message in the status bar, or as a toast. */
  notify(message: string, kind?: 'info' | 'success' | 'warning' | 'error'): void
  /** A persistent key-value store, one per add-on. */
  storage: {
    get<T>(key: string, fallback: T): T
    set(key: string, value: unknown): void
  }
  /** Register later, at runtime — languages generated on the fly, say. */
  registerLanguage(spec: LanguageSpec): void
  registerTheme(theme: Theme): void
  registerCommand(command: Command): void
  registerProjectKind(kind: ProjectKind): void
  registerProjectTemplate(template: ProjectTemplate): void
}

/* ------------------------------------------------------------------ *
 * Icon packs
 * ------------------------------------------------------------------ */

/**
 * An icon for a file or folder. Drawing order: `path`, then `shape`, then
 * `glyph`. With none of them only the colour counts, as for folder arrows.
 */
export interface IconDef {
  /** Short text, one to three characters, such as `TS`. */
  glyph?: string
  /** Name from the built-in icon set (`ICON_SHAPE_NAMES`), such as `lock`. */
  shape?: string
  /** An SVG path (`d`) of your own on a 24×24 grid, stroked as an outline. */
  path?: string
  /** Hex colour or CSS variable. */
  color?: string
}

/**
 * An icon pack: which icon a file or folder gets. Lookup runs in this order:
 * exact file name → extension (longest first, `d.ts` before `ts`) → the
 * file's language → that language's icon from its add-on → `file`.
 *
 * All keys are lower case, extensions carry no dot.
 */
export interface IconPack {
  id: string
  name: string
  author?: string
  description?: string
  fileNames?: Record<string, IconDef>
  extensions?: Record<string, IconDef>
  /** Language ids of the add-ons (`java`, `typescript` …). */
  languages?: Record<string, IconDef>
  folderNames?: Record<string, IconDef>
  /** Fallback for unknown files. */
  file?: IconDef
  /** Fallback for folders. */
  folder?: IconDef
}

/**
 * A panel an add-on puts into one of the window's docks — a cheat sheet, a
 * guide, a status page. Markdown or HTML, shown in a sealed frame (no scripts).
 * The user can drag it to any dock; `location` is only where it starts.
 */
export interface AddonPanel {
  id: string
  title: string
  /** An icon-pack shape or action icon name (`book-open`, `rocket` …). */
  icon?: string
  location?: 'left' | 'right' | 'bottom'
  format?: 'markdown' | 'html'
  content: string
}

export interface Addon {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** An emoji, or one to two characters. */
  icon?: string
  /** Built-in add-ons cannot be switched off. */
  builtin?: boolean
  /** Made in the Add-on Studio (a file under userData/addons). */
  user?: boolean
  /** Not listed on its own — the window code of an extension, which belongs to that extension's entry. */
  hidden?: boolean
  /** Category in the add-on manager. */
  category?: 'language' | 'theme' | 'tool'

  languages?: LanguageSpec[]
  themes?: Theme[]
  /** Icon packs for the explorer, tabs and search lists. */
  iconPacks?: IconPack[]
  /** Snippets for other add-ons' languages — Minecraft snippets for `java`, say. */
  snippets?: AddonSnippet[]
  /** Panels for the docks (left, right, bottom). */
  panels?: AddonPanel[]
  commands?: Command[]
  /** Project kinds the add-on recognises (Maven, CMake, npm …). */
  projectKinds?: ProjectKind[]
  /** Templates for “New project”. */
  projectTemplates?: ProjectTemplate[]

  /** Runs on activation. Its return value is called on deactivation. */
  activate?(ctx: AddonContext): void | (() => void)
}

/* ------------------------------------------------------------------ *
 * Debugger (Debug Adapter Protocol)
 * ------------------------------------------------------------------ */

/** One way of launching a debug adapter. */
export interface DebugAdapterProgram {
  /**
   * Program or path (`~` and `*` are allowed in path segments). When the path
   * ends in `.js`, `.py` or `.jar`, Lumen starts it with node, python3 or java.
   */
  command: string
  args?: string[]
  /** A trial run with these arguments must exit 0, e.g. `['-c', 'import debugpy']`. */
  probe?: string[]
}

/** Surroundings when a debug session starts — for adapter configurations. */
export interface DebugContext {
  /** The active file, when there is one. */
  file: string | null
  fileDir: string
  fileName: string
  fileStem: string
  workspace: string
  projectRoot: string
  projectName: string
  /** Recognised project kinds (`cargo`, `cmake`, `maven` …). */
  projectKinds: string[]
  languageId: string | null
  platform: string
  home: string
  /** Replaces `${file}`, `${fileDir}`, `${fileStem}`, `${workspace}`, `${projectRoot}` … */
  substitute(value: string): string
  exists(path: string): Promise<boolean>
  /** Resolve paths containing `*` in their segments. */
  glob(pattern: string): Promise<string[]>
  /** `workspace/executeCommand` on the language's server. */
  lspCommand(command: string, args?: unknown[]): Promise<unknown>
  /** A choice; `null` when cancelled. */
  pick(title: string, choices: { value: string; label: string; detail?: string }[]): Promise<string | null>
  /** A form; `null` when cancelled. */
  ask(title: string, fields: FormField[], initial?: FormValues): Promise<FormValues | null>
  /** Values Lumen remembers per project — the last chosen program, say. */
  memory: { get(key: string): string | undefined; set(key: string, value: string): void }
}

export type DebugLaunchArguments = Record<string, unknown>

/**
 * A debug adapter for this language. As with language servers, Lumen installs
 * nothing itself — when the adapter is missing, the debug panel shows
 * `install`.
 */
export interface DebugAdapterConfig {
  /** Display name, such as “lldb-dap”. */
  label: string
  /** DAP type of the configuration, such as `lldb`, `debugpy`, `pwa-node`. */
  type: string
  /** Defaults to `stdio`. With `tcp`, Lumen replaces `${port}` in the arguments. */
  transport?: 'stdio' | 'tcp'
  command?: string
  args?: string[]
  /** Trial run for `command` (see `DebugAdapterProgram.probe`). */
  probe?: string[]
  /** Further places the adapter may live; the first one found wins. */
  candidates?: (string | DebugAdapterProgram)[]
  env?: Record<string, string>
  /** A fixed TCP port; otherwise Lumen looks for a free one. */
  port?: number
  host?: string
  /** TCP without a process of our own: the port comes from elsewhere, as with Java's language server. */
  connect?(ctx: DebugContext): Promise<{ port: number; host?: string }>
  /** Defaults to `launch`. */
  request?: 'launch' | 'attach'
  /**
   * Arguments for `launch`/`attach`. As an object, placeholders are replaced
   * in every string; as a function it may ask questions — `null` cancels.
   */
  launch?: DebugLaunchArguments | ((ctx: DebugContext) => DebugLaunchArguments | null | Promise<DebugLaunchArguments | null>)
  /** Plugins the language's server has to load (java-debug for jdtls, say). */
  lspBundles?: string[]
  /** Project kinds this adapter is preferred for. */
  kinds?: string[]
  /** How to install the adapter, in prose. */
  install?: string
  installCommands?: Partial<Record<'linux' | 'darwin' | 'win32', string>>
  docs?: string
}
