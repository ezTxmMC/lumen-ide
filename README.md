# Lumen

A lightweight, modern IDE — flat design, a theme system with optional effects,
project handling with templates and package managers for every language, and an
add-on system that consists of a single object.

Built with **React 18**, **TypeScript**, **Vite 8**, **Electron 44**,
**Tailwind CSS 4** and **CodeMirror 6**.

```bash
npm install
npm run dev      # development (Vite + Electron with hot reload)
npm run build    # type check + production build
npm run dist     # installable package (electron-builder)
npm run check    # types, tokenizers, templates/package managers, LSP against clangd
```

### Building packages

| Command | Result |
| --- | --- |
| `npm run dist:linux` | AppImage (x64) |
| `npm run dist:linux:arm64` | AppImage (arm64) — only on an arm64 machine, `node-pty` is built natively |
| `npm run dist:win` | Windows 11 x64 and arm64: installer (`-setup.exe`) and ZIP, plus one installer covering both architectures |
| `npm run dist:win:x64` / `dist:win:arm64` | a single architecture |
| `npm run dist:mac` | macOS arm64 (Apple Silicon): DMG and ZIP |

Windows packages can be built on Linux too; that needs `wine` for the program
icons. macOS packages only come out of a Mac — or out of
`.github/workflows/build.yml`, which builds all five packages (Linux x64/arm64,
Windows x64/arm64, macOS arm64) on a `v*` tag or on demand. `node-pty` ships
prebuilt binaries for Windows and macOS; on Linux it is built for Electron
during `npm install`.

The packages are unsigned. On macOS they are ad-hoc signed — run
`xattr -cr /Applications/Lumen.app` once after downloading, or Gatekeeper will
call the app damaged. Windows SmartScreen asks on first launch.

### Publishing and updates

```bash
npm run publish:cdn -- --dry-run                 # show what would be uploaded
npm run publish:cdn -- --notes "New: …"          # every package of this version from release/
npm run publish:cdn -- --only linux_amd64        # single platforms only
```

The script looks through `release/` — including subfolders of downloaded CI
artefacts — for the packages matching the version in `package.json`, computes
SHA-512 checksums and uploads over `sftp` in a single session, so at most one
password prompt:

```
cdn.eztxm.de/download/lumen-ide/version/
  latest/latest.json                 manifest for the updater
  latest/<platform>/…                linux_amd64 · linux_aarch64 · macos_arm64 · windows_x86_64 · windows_arm64
  <version>/<platform>/…             archive (--no-archive turns it off)
```

Platforms left out of an upload keep their entry in the manifest; old files
under `latest/` only disappear once the new manifest is in place. The target is
configurable through `LUMEN_CDN_HOST`, `LUMEN_CDN_USER`, `LUMEN_CDN_PORT`,
`LUMEN_CDN_ROOT` and `LUMEN_CDN_URL`.

Lumen checks `latest/latest.json` 20 seconds after startup and every six hours
after that, downloads newer versions in the background, verifies the checksum
and applies them on exit — or straight away through *Settings → Updates →
Restart*, or the notice in the status bar. It can be switched off under
*Settings → Updates*. Because the packages are unsigned, Lumen uses neither
Squirrel nor electron-updater, but instead:

| System | How it applies |
| --- | --- |
| Linux | write the new AppImage as `Lumen.AppImage` next to the running one — a fixed path, so desktop entries and taskbar/start-menu pins survive updates (needs write access to the folder) |
| Windows | run the NSIS installer silently (`--updated /S`) |
| macOS | unpack the ZIP and swap `Lumen.app` after quitting (not from a DMG or under translocation) |

Development mode, unpacked ZIPs and read-only locations get a download link
instead. `LUMEN_UPDATE_URL` points the updater at a different feed, which is
useful for testing.

---

## Projects

Lumen starts at the **project screen**: recent projects with a filter (type,
↑/↓, Enter), workspaces, *New project* and *Open folder*, and folders that have
gone missing dimmed. *Open last project on start* (on the screen or under
*Settings → General*) skips it and reopens the last project instead.

When a folder opens, Lumen recognises the build system and package manager from
their files and shows tasks, facts, dependencies, environment variables and
server preferences in the **project panel** (`Ctrl+Shift+J`).

| Language | Build systems and package managers |
| --- | --- |
| C / C++ | **CMake** (presets, Ninja, Makefiles, Ninja Multi-Config), **Ninja**, **Meson** with WrapDB, **xmake** with xrepo, **Make**, **Bazel** (Bzlmod), **vcpkg** (manifest), **Conan 2** |
| Java / Kotlin | **Maven** (with `mvnw`), **Gradle** in both Kotlin and Groovy DSL (with `gradlew`, version catalogue, multi-module), Bazel |
| JavaScript / TypeScript | **npm**, **pnpm**, **Yarn**, **Bun** — recognised through `packageManager` or the lockfile, workspaces and framework — plus **Deno** (JSR/npm) |
| Python | **uv**, **Poetry**, **PDM**, **Hatch**, **Pipenv**, **conda**, **pip** with `requirements.txt` |
| Rust · Go · PHP · C# · Crystal · Novus | **Cargo** · **Go modules** · **Composer** · **.NET/NuGet** (`*.csproj`, `*.sln`, `*.slnx`) · **Shards** · **novusc deps** |
| Containers | **Dockerfile** and **Compose** |

Every kind brings its own tasks — install, build, run, test, update, outdated
packages, lockfile, generate a wrapper — and reads its metadata out of the build
files. Package managers on their own, such as vcpkg or Conan, appear next to the
build system, which stays the primary kind.
### Adding dependencies

*Project panel → Dependencies → +*, or *Command palette → Add dependency…*,
opens a dialog for package, version and scope (`compile`/`test`,
`devDependencies`, `[dev-dependencies]` …). When a project uses several package
managers, you pick which one the dependency belongs to.

- Where the package manager can do it itself, its command runs in the output
  panel: `npm install -D`, `pnpm add`, `yarn add`, `bun add`, `deno add`,
  `uv add`, `poetry add`, `pdm add`, `pipenv install`, `cargo add`, `go get`,
  `composer require`, `dotnet add package`, `vcpkg add port`,
  `meson wrap install`, `novusc deps add`.
- Where no such command exists, Lumen edits the build file and starts the
  install afterwards: `pom.xml` (only the block directly under `<project>`),
  `build.gradle(.kts)`, `conanfile.txt`, `xmake.lua`, `MODULE.bazel`,
  `shard.yml`, `requirements.txt`. Open tabs of that file follow along.

### New project

`Ctrl+Alt+N` opens the wizard with **30 templates** — every language add-on
brings at least one. Besides name and target folder, each template asks for its
own settings; dependent fields fill themselves in until you touch them (the
artifact id from the name, the package from group id and artifact id).

| Add-on | Templates and settings |
| --- | --- |
| Java | **Java project**: group id, artifact id, version, package, description, Maven or Gradle (Kotlin/Groovy), application or library, Java 17/21/25, JUnit 5 · **single files** |
| Kotlin | **Kotlin project**: as Java, plus the Kotlin version · **script** (`.main.kts`) or a single file |
| C · C++ | **C/C++ project**: CMake (generator), Meson, xmake, Make or Bazel; vcpkg or Conan; program or library; language standard; GoogleTest, Catch2 or a plain test |
| TypeScript | **Node.js** (tsx, node:test, optional ESLint) · **library** (npm package with `exports`, Vitest) · **Vite** · **Deno** |
| JavaScript | **Node.js** · **browser without a build step** |
| HTML · CSS · Tailwind | **static website** · **CSS library** (Lightning CSS) · **Tailwind CSS 4 with Vite** |
| React · Vue · Angular · Astro · MDX | **React 19** (TS/JS, Tailwind, Vitest) · **Vue 3** (router, Pinia) · **Angular 19** standalone (prefix, CSS/SCSS) · **Astro 5** (MDX, sitemap) · **MDX docs** with Vite |
| Python | uv, Poetry, PDM, Hatch or pip; Python version; module name; CLI entry point |
| Rust · Go · PHP · C# · Crystal | Cargo bin/lib, edition, clap · module path, cmd/ or library · vendor, namespace, PHP version · namespace, console/library/web API, .NET 8/9/10, xUnit · application/library |
| Novus | `project.nv` with module path, version, program name, optionally `lib.nv` |
| Build tools · Essentials | **container project** (runtime, port, PostgreSQL/Redis) · **Markdown docs** (MkDocs) · **shell scripts** |

Name, version, description, author and licence end up in the respective
manifests. The preview shows every file before anything is created. Afterwards
Lumen optionally sets up a Git repository and runs the template's setup step
(`npm install`, `uv sync`, `cmake --preset debug`, `cargo build` …). Then the
project is open, the main file is in the editor and the project panel is
showing.

As before: **build · run · test** sit on `Ctrl+Shift+B`, `F5` and
`Ctrl+Shift+F5`. Custom tasks, default tasks, environment variables and server
preferences live in the project configuration (`project.json`). Inside tasks,
`${env:NAME}` is replaced by the environment variable of that name —
`VCPKG_ROOT`, for instance.

**Lumen keeps its own files out of your projects.** The project configuration,
breakpoints and launch configurations live in a folder of their own per project,
`~/.lumen/projects/<folder name>-<hash>/` (`project.json`, `breakpoints.json`,
`debug.json`, and `location.json` naming the project). *Open project
configuration* in the command palette or the project panel opens the file; it
can be edited and saved like any other. Projects from older versions carried a
`.lumen/` folder — it moves over the first time the project opens and is
removed once empty.

### Multi-module builds and custom tasks

Maven reactors and Gradle multi-project builds show up as a **module tree** in
the project panel. Lumen reads `<modules>` recursively, nested aggregators
included, and `include(…)` in `settings.gradle(.kts)`, including
`projectDir` overrides and implied parents such as `:libs` for `:libs:core`.
Every module brings its own tasks: build, test, install, clean, dependency tree
and, where it can start, run. Maven scopes them with `-pl <module> -am`, Gradle
with `:module:task`, and the run task follows the module's plugins
(`spring-boot:run`, `quarkus:dev`, `javafx:run`, `bootRun`, `run` …).

**More tasks** lists what the build files add beyond the standard tasks. For
Gradle these are tasks registered in the scripts (`tasks.register`, `task x`,
`val x by tasks.registering`) with their group and description. For Maven they
are plugin goals, including those bound in `<executions>` as `goal@execution`,
and one `-P <id> package` task per profile.

**Tasks from plugins** appear without running Gradle: `runClient`,
`runServer`, `runData` … of Minecraft mods (Fabric Loom, Architectury Loom,
NeoForge ModDevGradle and NeoGradle, ForgeGradle, VanillaGradle — one task per
run declared in `runs { }`), `bootRun`/`bootJar`, `quarkusDev`, `shadowJar`,
`runIde`, `jib`, `runServer` of run-paper, publishing, Spotless, ktlint and
more. Plugins count wherever they are applied — the module's `plugins { }`,
`subprojects { apply plugin: … }` in the root script, or a block that gives
them away (`architectury { neoForge() }`, `loom { }`); `apply false` does not.
In a multi-loader build the modules' run tasks (`fabric: runClient`) also join
the project's main task list.

Everything else a build defines — tasks of convention plugins and
dependencies — comes from `gradle tasks --all`: Lumen runs it once in the
background when a Gradle project without a cached list opens (*Settings →
General → Load Gradle tasks when a project opens*), caches the result in the
project's data folder, and sorts the tasks into their modules. *Load all Gradle
tasks* fetches the list afresh. Every task runs in the output panel or,
from its hover button, in a terminal.

### Project kinds and templates in add-ons
```ts
export const zigAddon: Addon = {
  id: 'lang.zig',
  name: 'Zig',
  version: '1.0.0',
  languages: [/* … */],
  projectKinds: [{
    id: 'zig',
    name: 'Zig',
    markers: ['build.zig'],
    languageIds: ['zig'],
    tasks: () => [
      { id: 'zig:build', label: 'Build', command: 'zig', args: ['build'], group: 'build' },
      { id: 'zig:run', label: 'Run', command: 'zig', args: ['build', 'run'], group: 'run' },
    ],
    dependencies: {
      manager: 'zig fetch',
      placeholder: 'https://…/archive.tar.gz',
      add: (_ctx, dep) => ({
        type: 'task',
        task: { id: 'zig:fetch', label: 'zig fetch', command: 'zig', args: ['fetch', '--save', dep.name] },
      }),
    },
  }],
  projectTemplates: [{
    id: 'zig-exe',
    name: 'Zig program',
    languageId: 'zig',
    kindId: 'zig',
    fields: [
      { id: 'version', label: 'Version', default: '0.1.0', pattern: String.raw`\d+\.\d+\.\d+` },
      { id: 'optimize', label: 'Optimisation', type: 'select', choices: [{ value: 'Debug', label: 'Debug' }, { value: 'ReleaseFast', label: 'ReleaseFast' }] },
    ],
    open: 'src/main.zig',
    setup: () => [{ id: 'setup:build', label: 'zig build', command: 'zig', args: ['build'] }],
    files: ({ slug, values }) => ({ 'build.zig': '…', 'build.zig.zon': `.{ .name = .${slug}, .version = "${values.version}" }` }),
  }],
}
```

`markers` drives detection — `*` is allowed, as in `*.csproj`. `tasks` supplies
the tasks, `inspect` the facts, `dependencies` the adding. A template's fields
are `text`, `select` or `toggle`, with `default` (fixed or derived), `pattern`,
`when` and `section`.

---

## Search everywhere

Pressing **Shift** twice opens a search across the whole project, as in
IntelliJ. `Tab` moves between the tabs, `Shift+Tab` back:

| Tab | Contents |
| --- | --- |
| All | every area grouped, with the best hits per area and a “show all” |
| Files | fuzzy search over file names, or over the path with `/`; recently opened first |
| Symbols | the outline of the active file and symbols from every running language server |
| Actions | every command and setting, with its shortcut |
| Tasks | build, test and package-manager tasks of the project |
| Text | full text across the project folder, from three characters on |

With nothing typed, the search shows recently opened files. `File.ts:42` — or
`:42:7` — jumps straight to that line and column. The last query stays
selected. As in IntelliJ, `Ctrl+Shift+N` opens the *Files* tab and
`Ctrl+Shift+A` the *Actions* tab; the magnifier in the title bar does the same.
Shift together with another key, so ordinary capitals, does not count.

---

## Terminal

The panel has a **Terminal** tab with real shells, through node-pty and
xterm.js: colours, full-screen programs such as `vim`, `htop` or `less`, mouse
selection and 10,000 lines of scrollback.

- **Opening:** `Ctrl+`` — `Ctrl+Ö` on a German keyboard — or `Alt+F12` as in
  IntelliJ. The same key inside the terminal hides the panel again while the
  sessions keep running. `Ctrl+Shift+`` opens another terminal.
- **Local shells:** Lumen finds the installed shells (`/etc/shells`, the PATH;
  on Windows PowerShell, cmd, Git Bash, WSL) and starts them as login shells so
  `.profile`/`.zprofile` take effect. `$SHELL` is the default; any shell can be
  picked from the menu beside “+” or from the command palette, and the
  preference lives under *Settings → Terminal*.
- **The working folder** is the project root; *Open in terminal* in the file
  tree's context menu starts in the folder you picked. The project's
  environment variables apply here too, along with `TERM_PROGRAM=Lumen` and
  `COLORTERM=truecolor`.
- **Several sessions** appear as tabs in the panel header; a double click
  renames one, and the shell may set the title itself. After `exit`, any key
  closes the tab.
- **Keyboard:** inside the terminal the keys belong to the shell — `Ctrl+C`,
  `Ctrl+W`, `Ctrl+R` and friends close no editor tabs. Copy and paste with
  `Ctrl+Shift+C/V`; `Ctrl+C` copies while text is selected, and optionally
  selecting alone already copies.
- **Links:** URLs open in the browser, paths such as `src/main.ts:12:4` in the
  editor.
- **From the editor:** *Run selection in terminal* sends the selected lines, or
  the current one, to the active terminal. Every task in the project panel has
  a *Run in terminal* button.
- **External terminals:** Ghostty, kitty, WezTerm, Alacritty, foot, Konsole,
  GNOME Terminal, Ptyxis, Xfce Terminal, Tilix, Terminator, XTerm — on macOS
  Terminal, iTerm and Ghostty; on Windows Windows Terminal — are recognised and
  can be opened in the project folder or any other.

The native module `node-pty` is built for Electron automatically during
`npm install`, or by hand with `npm run rebuild:native`.

---

## File tree

- **New file / new folder** from the toolbar, the context menu, or the icons
  that appear when hovering a folder — created in the folder you picked,
  inline in the tree. `folder/subfolder/file.ts` creates the intermediate
  folders too, and a trailing `/` makes a folder. Existing names and invalid
  characters are reported.
- **Context menu**: new file, new folder, rename (`F2`), delete (`Del`, to the
  wastebasket), copy path and relative path, reveal in the file manager.
  Renaming and deleting carry open tabs along.
- **Refreshing itself**: changes on disk — from the terminal, from build tools
  or from another editor — show up in the tree at once. On Linux, Lumen watches
  every relevant folder individually, leaving out `node_modules`, `target`,
  `build` and the like, and picks up new folders as they appear.
- **Open files** reload externally changed content by themselves as long as the
  tab has no unsaved changes of its own. Otherwise a notice offers *Load from
  disk* or *Keep my version*; deleted files can be restored. Focusing the
  window triggers another comparison.
- Dotfiles such as `.gitignore` or `.env` are visible.

---

## Add-on system

An add-on is an object — no manifest, no build step, no registration API. A new
language usually amounts to nothing but lists of words.

### A language in 20 lines

`src/addons/extra/lua.ts`:

```ts
import type { Addon } from '@/core/types'

export const luaAddon: Addon = {
  id: 'lang.lua',
  name: 'Lua',
  version: '1.0.0',
  description: 'Lua 5.4 with a luajit runner.',
  icon: 'Lu',
  category: 'language',
  languages: [{
    id: 'lua',
    name: 'Lua',
    extensions: ['.lua'],
    color: '#2c2d72',
    comments: { line: '--', block: ['--[[', ']]'] },
    controls: ['if', 'then', 'else', 'elseif', 'for', 'while', 'do', 'return'],
    keywords: ['local', 'function', 'end', 'and', 'or', 'not', 'in'],
    constants: ['true', 'false', 'nil'],
    builtins: ['print', 'pairs', 'ipairs', 'require', 'type', 'tostring'],
    run: [{ label: 'Lua', command: 'lua', args: ['${file}'] }],
  }],
}
```

Then list it in `BUNDLED_ADDONS` in `src/addons/index.ts` — done. The add-on
shows up in the add-on manager, can be switched on and off, and gets syntax
highlighting, completion, comment toggling (`Ctrl+/`), bracket closing,
indentation and an entry in the run menu.

### `LanguageSpec` at a glance

| Field | Purpose |
| --- | --- |
| `extensions`, `filenames` | file association (the longest extension wins) |
| `priority` | precedence when an extension is shared (Tailwind over CSS) |
| `comments` | line and block comments |
| `keywords`, `controls`, `types`, `builtins`, `constants` | word lists, one colour each |
| `strings` | quotes, multi-line, escapes |
| `numbers`, `identifier`, `operators`, `meta` | regexes of your own |
| `capitalizedAsType` | colour `Capitalised` identifiers as types |
| `indentOpen`, `indentClose`, `indentUnit` | indentation rules |
| `strings[].interpolate` | colour interpolation separately (`'${'`, `'#{'`) |
| `snippets`, `completions` | completion |
| `run` | runners, including compile-then-run |
| `lsp` | language servers, most preferred first |
| `tokenizer` | a tokenizer of your own, when word lists are not enough |

Placeholders in `run`: `${file}` `${fileDir}` `${fileName}` `${fileStem}` `${workspace}` `${projectRoot}`.

### Panels

An add-on can put panels into the docks — a cheat sheet, a guide, a status page.
They are Markdown or HTML, shown in a sealed frame without scripts; `location`
is only where a panel starts, the user can drag it anywhere:

```ts
panels: [{
  id: 'cheatsheet',
  title: 'Lua cheat sheet',
  icon: 'book-open',          // an icon-pack shape or action icon
  location: 'right',          // left · right · bottom
  format: 'markdown',
  content: '# Lua\n\n| … | … |',
}],
```

In the **Add-on Studio** the same comes as the *Panels* area, with a live
preview. Extensions have panels too (`pages/*.md` with `location: left|right|
bottom`), and extensions with program code get **views with live content**,
commands, status-bar items, dialogs, secrets and more — see
[extensions/README.md](extensions/README.md).

### Beyond languages

```ts
export const myAddon: Addon = {
  id: 'tool.example',
  name: 'Example',
  version: '1.0.0',
  themes: [/* themes of your own */],
  commands: [{ id: 'x.hello', title: 'Say hello', run: () => alert('hi') }],
  projectKinds: [/* see above */],
  projectTemplates: [/* see above */],
  activate(ctx) {
    ctx.notify('Add-on running', 'success')
    ctx.storage.set('startedAt', Date.now())
    ctx.registerLanguage(/* a language generated at runtime */)
    ctx.registerProjectKind(/* … */)
    return () => { /* clean up on deactivation */ }
  },
}
```

---

## Language servers

Every language ships an LSP configuration — Java, Kotlin, C, C++, TypeScript
and JavaScript especially thorough ones. In the editor that gives you:
- **Diagnostics** — squiggles, gutter markers, a counter in the status bar, and
  the **problems panel** (`Ctrl+Shift+M`) with every message in the workspace.
  Deprecated and unnecessary spots are struck through or dimmed, and related
  locations appear in the tooltip.
- **Completion** with **auto-imports** (`additionalTextEdits`, fetched later
  through `completionItem/resolve` where needed), snippets, and documentation
  rendered as Markdown
- **Hover** with signature and documentation — Markdown with code blocks, lists
  and links
- **Signature help** while typing `(` and `,` (`Ctrl+Shift+Space`), with the
  active parameter highlighted
- **Navigation**: definition (`F12`, `Ctrl+click`), declaration
  (`Ctrl+Alt+F12`), type definition (`Ctrl+Shift+F12`), implementation
  (`Ctrl+F12`); with several hits the list lands in the **references panel**
- **References** (`Shift+F12`) with preview lines, grouped by file
- **Rename** (`F2`) across every file of the project — open tabs change through
  an undoable transaction, closed files directly on disk
- **Code actions** (`Ctrl+.`): quick fixes, refactorings,
  `source.organizeImports` (`Ctrl+Alt+O`), `source.fixAll`; also as a button on
  every diagnostic
- **Formatting** (`Ctrl+Alt+L`) — document or selection, optionally on save,
  and the same for organising imports
- **Highlighting occurrences**: reads and writes of the symbol under the cursor
- **Inlay hints**: parameter names and types, switchable
- **Outline** (in the sidebar) and **go to symbol** (`Ctrl+Shift+O`), **symbol
  in workspace** (`Ctrl+T`), breadcrumbs in the status bar
- **Progress** (`$/progress`, jdtls status messages) in the status bar, server
  messages as notices, the transcript in the **language server panel**
- **Java**: jumping into JDK and jar classes opens the decompiled source
  (`jdt://`) as a read-only tab

**Servers start with the project**: when a project opens, the chosen server of
every language the project uses starts right away — indexing is under way
before the first file opens (*Settings → Language servers → Start with the
project*). Choosing another server in the project panel stops the old one and
starts the new one at once.

Lumen installs nothing without asking. Before starting a server it looks in
its own environment (`~/.lumen/lsp/bin`), then on the PATH, then in the places
it knows (`candidates`: Mason, Homebrew, `node_modules/.bin`, LLVM
directories). When a server is missing, the built-in completion takes over and
Lumen opens the **install dialog**: when a file of that language is opened,
from the language-server or project panel, and right after installing an
extension. The dialog lists every server of the language, whether it is already
there, and each way to install it on this machine. It shows the exact command
before anything runs, then streams progress with a log and a cancel button.
Afterwards the server starts by itself.

There are three ways to install, in this order of preference:

- **Lumen environment** (`package`): into `~/.lumen/lsp`, with no root and no
  change to the system (see the table below).
- **System package manager** (`systemPackages`): Lumen detects the manager
  itself (pacman, APT, DNF, zypper, apk, XBPS, Portage, Homebrew, winget, Scoop,
  Chocolatey), builds the command, and runs it non-interactively.
- **Install command** (`installCommands`): the add-on's command for this
  platform. It can be edited in the dialog.

Where a command needs root, Lumen asks for the password in its own dialog. It
is passed once to `sudo` and never stored or logged; `pkexec` can be used
instead where it is installed. No manual download is needed for any server that
is a package or known to a system package manager.

**The Lumen environment is closed.** Nothing goes to a global npm, pip or the
system — every server and every tool needed to install it lives under
`~/.lumen/lsp`:

| Kind | How | Toolchain (downloaded by Lumen, checksum-verified) |
|---|---|---|
| `npm` | `npm install` into `packages/<id>` | Node.js LTS from nodejs.org |
| `pypi` | `uv tool install`, pinned Python and extras | uv from GitHub; uv fetches its own Python |
| `go` | `go install module@version` | Go from go.dev |
| `github` | a release asset per platform, unpacked | — |
| `archive` | any HTTPS download (jdtls), optionally run through Lumen's Python/Node | — |
| `dotnet` | `dotnet tool install --tool-path` | the .NET SDK has to be present |

Each server gets a launcher in `~/.lumen/lsp/bin`, which wins over anything on
the PATH — so a broken system install (a pipx package built against the wrong
Python, say) no longer matters. Servers without a `package` fall back to their
`installCommands`, run in the output panel. Deleting `~/.lumen/lsp` removes
everything.

**One process per program and project root**: clangd serves C and C++ together,
tsserver JavaScript and TypeScript. Document changes go to the server
incrementally when it supports that, otherwise as full text. File changes in
the workspace are forwarded as `workspace/didChangeWatchedFiles`, as far as the
server subscribed to them.

| Language | Server | Notes |
| --- | --- | --- |
| Java | jdtls, NetBeans (nb-javac), java-language-server | **jdtls:** the whole Maven/Gradle build as its root, Gradle run with the project's JDK; module dependencies Gradle's Eclipse model drops (Architectury's `namedElements`, `compileOnly project(':common')` next to ModDevGradle) added through an init script for the import — workspaces imported with an older version of it are re-imported once; the same script keeps ModDevGradle from writing `.eclipse/` launch files (it keeps its IDE sync); `.project`, `.classpath` and `.settings` live in jdtls' workspace, not in the project, and ones generated earlier are removed once before the start (unless git tracks them); code is checked with javac through jdtls' javac backend where it is installed (*Settings → Language servers*, on by default) — on a JDK within the range its manifest names, with a load-time repair of the backend's class-cache bug (`electron/features/jdtls-agent.ts`) — so generic code the Eclipse compiler rejects but javac compiles shows no false errors; open files re-checked once the import finishes, import problems reported; *Java: Reimport Projects* and *Java: Clean Language Server Workspace and Restart*; JVM options through the launcher's `--jvm-arg` (2 GB heap); a data folder per project under `userData/lsp`, auto-import, organise imports, class sources out of jars · **NetBeans:** Apache NetBeans' Java server as Oracle ships it (installed from Open VSX into `~/.lumen/lsp`), real javac and Gradle/Maven through their tooling models; runs on the project's JDK or the newest installed LTS |
| Kotlin | kotlin-language-server, kotlin-lsp (JetBrains) | inlay hints, Gradle/Maven root |
| C / C++ | clangd, ccls | `--compile-commands-dir=<root>/build`, clang-tidy, IWYU header insertion; the CMake “configure” task produces `compile_commands.json` |
| TypeScript / JavaScript | typescript-language-server, vtsls, deno lsp | the project's own `node_modules/.bin` first, inlay hints, auto-import, renaming files |
| Build files | cmake-language-server, neocmakelsp, lemminx (XML), docker-langserver | |

A server inside an add-on is an object:

```ts
lsp: [{
  label: 'clangd',
  command: 'clangd',
  args: ['--background-index', '--compile-commands-dir=${root}/build'],
  candidates: ['/usr/lib/llvm-18/bin/clangd', '~/.local/share/nvim/mason/bin/clangd'],
  rootMarkers: ['compile_commands.json', 'CMakeLists.txt', '.git'],
  settings: { /* workspace/didChangeConfiguration */ },
  install: 'pacman -S clang · apt install clangd · brew install llvm',
  installCommands: { darwin: 'brew install llvm' },
  docs: 'https://clangd.llvm.org',
}]
```

Placeholders in `args`, `candidates` and `env`: `${root}` (project root),
`${workspace}`, `${home}`, `${dataDir}` (a folder per server and root under
`userData/lsp`). `rootMarkers` decides the project root: the search runs from
the file's folder upwards to the workspace folder. With `rootSearch: 'outermost'` the highest
folder with a marker wins — Java and Kotlin use it, so the server sees the
whole Maven reactor or Gradle build and resolves classes across modules, not
just the module of the open file (`.git` then only counts when nothing else
is found). Which server a language
prefers can be chosen per project in the project panel.

All of it can be switched off under *Settings → Language servers*, which also
holds the switches for inlay hints, signature help, highlighting, formatting
and organising imports on save.

---

### Add-ons and extensions

**Built in** (always active): Novus · Java · HTML · CSS · JavaScript · TypeScript · Diff · Lumen Themes · Lumen Icons

**Bundled**: none any more — Minecraft Development, the last one, is an
extension with code for the window since extensions can bring one.

**From an extension server**: React · Vue · Angular · Astro · MDX · C++ · C ·
C# · Kotlin · Tailwind CSS · PHP · Crystal · Rust · Go · Python · build tools
(CMake, Makefile, XML, Gradle/Groovy, Properties, Dockerfile) · Essentials
(JSON, YAML, TOML, Markdown, Shell, SQL) · **Git** · **GitHub** · **Claude
Code** · **ChatGPT Codex** · **Minecraft Development**. Open *Extensions* in
the navigation strip; `lumen-extensions.eztxm.de` is set up and vetted.

Together: 35 languages, 20 project kinds with 16 package-manager integrations,
30 project templates, around 470 snippets and around 10,000 completion words.

A language whose highlighting is a program rather than a list of keywords —
Markdown, MDX, the markup of Vue, Astro and Angular, Tailwind, JSX — names a
tokenizer that ships with Lumen (`"tokenizer": "markdown"`), the same way an
extension names a debug adapter. `src/core/user-addons/tokenizers.ts` says why.

**React** colours components (`<Card>`) differently from HTML elements
(`<div>`) and brings every hook along. **Vue** reads SFCs as one file:
template, `<script setup>` and `<style scoped>` each get the right tokenizer,
and `{{ … }}` a colour of its own. **Angular** covers templates with the new
control flow (`@if`, `@for`, `@defer`) and Angular-flavoured TypeScript with
signals. **Astro** reads the TypeScript frontmatter between `---` and the
markup with `{ … }` expressions after it. **MDX** is Markdown plus
`import`/`export` lines, expressions and component tags. **Build tools** brings
snippets for `pom.xml`, `CMakeLists.txt`, Makefiles and Gradle scripts.

**Novus** (`.nv`) follows the compiler at
[ezTxmMC/novus](https://github.com/ezTxmMC/novus): keywords from
`compiler/lexer/chars.nv` and the parser modules, types from
`compiler/parser/types.nv`, free builtins from `compiler/codegen/builtins.nv`
and the standard modules from its README. Annotations (`@Deprecated{…}`) and
`${…}` interpolation get a colour of their own, and there are snippets for
`define class`, `define enum`, `define interface`, `define abstract`, `async`
and `sync`. The runners call `novusc run | build | check | emit` — in project
mode (`project.nv`) even without a file argument.

HTML colours embedded `<style>` and `<script>` with the CSS and JavaScript
tokenizers. In `.css` files Tailwind CSS takes precedence over the CSS add-on
and completes more than 4000 utility classes as well as the Tailwind 4
directives `@theme`, `@utility` and `@variant`.

Files with no matching language open as plain text — so the IDE works with
anything, and highlights everything registered.

### Git and GitHub

**Git** (`ext.git`) brings source control into the docks: a *Source Control*
view with a commit box (commit, commit & push, amend), merge conflicts, staged,
changed and untracked files — diff, stage, unstage and discard per file or per
group, continuing or aborting a merge, rebase or cherry-pick — plus *Branches*
(local and remote with ahead/behind, tags, stashes, remotes) and a *Git
history* with branch and tag badges, cherry-pick, revert and reset. The status
bar shows the branch and the sync state; everything else is in the command
palette (`Git: …`), including the active file's history and blame. It refreshes
on save, on window focus and while the views are in use, and can fetch in the
background. git always runs without a shell and never waits for a terminal
prompt. Diffs open in a read-only tab with the built-in *Diff* colouring.

**GitHub** (`ext.github`) shows the pull requests, issues and Actions runs of
the repository in the open folder: check out, review, approve, comment and
merge pull requests, or create one from the current branch (pushing it first
when needed); create, comment on and close issues; re-run or cancel workflow
runs. The status bar shows the CI state of the current branch. It signs in with
a personal access token kept in the system's key store, or with the GitHub
CLI's login (`gh auth login`); GitHub Enterprise works through the API address
setting.

### AI agents

Two extensions bring coding agents into a chat that docks on the right (drag it
anywhere): **Claude Code** runs the Claude Agent SDK on the installed `claude`
program — login, `CLAUDE.md`, settings and MCP servers apply — and **ChatGPT
Codex** drives the installed `codex` CLI in its JSON mode. Both stream their
answers as Markdown, show thinking, tool calls with diffs and command output,
the agent's plan and the tokens and cost of every turn; Claude Code asks before
each action (allow, always allow, deny with a reason), Codex works within the
sandbox level chosen as its mode. Several chats per agent, earlier sessions to
resume, a model picker, `/` commands and `@` files in the composer, pasted
images, and the open file and selection sent along on request. Everything else
— models, effort and thinking, turn and cost limits, extra instructions,
allowed and blocked tools, extra folders, MCP servers, profiles, `-c`
overrides, environment variables — is configured under *Settings → Extensions*.

---

## Editor

- **Split view**: `Ctrl+\` splits to the right, `Ctrl+K Ctrl+\` downwards.
  Tabs can be dragged between groups — dropping at the right or bottom edge
  splits — and a tab's context menu offers split, move, “close to the right”
  and so on. The layout is remembered per project.
- **Position per file**: scroll position, cursor, folds and undo history are
  kept per file, including when switching between groups.
- **Pop out**: any dock view (explorer, terminal, problems, an agent's chat, an
  extension's page …) and any editor tab or group can open in a window of its
  own — the dock button or the view's context menu, *Move into New Window* on
  a tab (`Ctrl+K Ctrl+E`), *View → Pop Out Active View* (`Ctrl+K Ctrl+V`).
  The window shares the running app, so terminals, diagnostics and unsaved
  text stay live, and it follows the theme as you change it. The dock shows
  where the view went, with *Bring Back*; closing the window, the dock-back
  button, `Ctrl+K Ctrl+H` (*Dock Window Back*) or *Dock All Popped-Out Views*
  put things where they came from. Pop-outs close with the main window and
  are not restored on restart. Dialogs and the command palette open in the
  main window, which comes forward when a pop-out asks for one.
- **Images, video, audio, PDF and fonts** open in viewers instead of the text
  editor: images fit the window or show at 100 % (Ctrl+wheel zooms, dragging
  pans, a checkerboard shows transparency), SVGs preview and switch to text,
  video and audio play with seeking, PDFs use Chromium's viewer, fonts show a
  sample text. Other binary files show a hex view of their first 64 KB and
  open in the system's default app. The files stream from disk through the
  `lumen-file://` scheme — only files inside the open folders or opened
  explicitly — and reload when they change on disk.
- **Minimap** on the right with syntax colours, error and warning marks, the
  current line and a draggable viewport (`Ctrl+K Ctrl+N`, width in the
  settings).
- **Folding** of classes, methods, loops, objects and argument lists through
  their brackets, plus block comments, `#region`/`#endregion`, Markdown
  headings and indentation (Python, YAML, HTML …). The placeholder shows the
  line count; `Ctrl+Shift+[`/`]`, everything with `Ctrl+Alt+[`/`]`.
- **Suggestions** from the language server, snippets, language words, the
  document and open tabs, all in one list. The matcher understands CamelCase
  humps (`gSC` → `getSurfaceCapabilities`), subsequences (`VkKHR` →
  `VkSurfaceCapabilitiesKHR`) and typos (`prnitln` → `println`). Local hits
  appear at once, server results are folded in as they arrive and are kept in
  use even after a typo. Recently accepted suggestions move up.
- **A readable list**: up to 14 rows tall, the symbol kind as a coloured chip
  in its syntax colour (function, class, variable, constant, keyword …), typed
  characters in the accent colour, type and package right-aligned and dimmed.
  The selection is a tinted row with an accent bar, and the details stay
  legible.
- **Everything from the dependencies**: the list has no cap — every matching
  class, function and package appears, and only a window around the selection
  is rendered. The bundled servers are configured to match: jdtls without a
  `maxResults` limit and without case filtering, clangd with
  `--limit-results=0`, rust-analyzer and gopls suggesting unimported items from
  every crate or module with no time budget, pyright/basedpyright indexing
  installed packages in full, TypeScript offering exports of every package in
  `node_modules`, and intelephense returning up to 10,000 entries. Lumen
  cancels stale requests through `$/cancelRequest` so the server does not keep
  working for nothing.

## Keyboard shortcuts

Every shortcut runs through one central system (`src/core/keybindings.ts`) and
can be changed in the **Keyboard shortcuts** dialog — the keyboard icon at the
bottom of the activity bar, or `Ctrl+K Ctrl+S`:

- **Presets**: Lumen IDE, JetBrains (IntelliJ IDEA), Visual Studio Code, Visual
  Studio, Eclipse — your own changes survive a switch.
- Recording by pressing keys, including two-chord sequences (`Ctrl+K Ctrl+O`),
  conflict display, filters (changed, conflicting, unbound), search by name or
  by the keys pressed, export and import as JSON.
- Shortcuts match per keyboard layout either by position or by the character
  produced, so `Ctrl+/` works on German keyboards too.
- Editor commands such as duplicate, move or delete a line, multiple cursors,
  next occurrence, expand selection, go to line, change case, join and sort
  lines — all of them bindable.

Add-on commands carrying a `keybinding` get that binding as their default;
other features register commands through `registerCommandProvider` from
`src/core/commands.ts`.

## Workspaces

A workspace gathers several folders and remembers the open files and the
layout. The switcher sits in the title bar:

- *Add folder to workspace* shows further roots in the explorer. One of them is
  **active** — the project panel, tasks, language servers and new terminals all
  refer to it; clicking the star switches without closing any tabs.
- Managing workspaces: rename, colour, delete, export and import as
  `.lumen-workspace.json`. Switching saves the previous session first.

## Debugger

A click in the narrow strip left of the line numbers sets a breakpoint;
right-clicking offers a condition, a hit count, a logpoint, “run to here” and
“debug from here”. Breakpoints move along as you type and live in the
project's `breakpoints.json` (in `~/.lumen/projects/…`).

- The **Run & debug** sidebar: variables (values editable), watches, the call
  stack with threads, breakpoints, exception filters.
- The **Debug** panel with console and REPL, a floating control bar, the
  current line and inline values in the editor, and hover evaluation.
- Adapters through the Debug Adapter Protocol: GDB ≥ 14, lldb-dap, CodeLLDB
  (C/C++/Rust/Crystal), debugpy, vscode-js-debug (Node/TypeScript), Delve,
  java-debug through jdtls, vscode-php-debug, netcoredbg,
  kotlin-debug-adapter.
- Launch configurations of your own in the project's `debug.json` (`name`, `type`,
  `request`, `adapter`, and the placeholders `${file}`, `${fileDir}`,
  `${fileStem}`, `${projectRoot}`, `${workspace}`, `${projectName}`). In
  add-ons, `LanguageSpec.debug` supplies the adapters.
- Keys follow the preset; in Lumen: `F9` breakpoint, `Shift+F9` start, `F5`
  continue (only during a session), `F10`/`F11`/`Shift+F11` to step.

## SDKs & JDKs

*Settings → SDKs & JDKs* downloads JDKs of every version — 8 up to current,
optionally early access — from **Eclipse Temurin, Amazon Corretto, OpenJDK,
Azul Zulu** as well as Liberica, Microsoft, SapMachine, GraalVM CE and Semeru
through the foojay API, with progress, cancelling and a SHA-256 check, into
`~/.lumen/jdks`. JDKs already present are found (JAVA_HOME, `/usr/lib/jvm`,
SDKMAN, `~/.jdks`, Gradle, asdf, mise …). A default JDK, and a per-project one
(`jdk` in the project configuration), set `JAVA_HOME` and `PATH` for tasks,
terminals and jdtls.

## Discord Rich Presence

Discord Rich Presence is an **extension** now (`extensions/discord`, install
it from the extension catalog) — it used to be a bundled add-on, and whoever
had that switched on is told once where it went. It shows what you are working
on in your profile: “Editing Main.java”, “in lumen-ide”, the language and the
elapsed time. Its code speaks the local Discord client's IPC protocol itself
(socket `discord-ipc-N`, Flatpak and Snap included; a named pipe on Windows)
with no extra packages. Updates are batched to one every 15 seconds, and with
Discord closed it quietly reconnects.

- The settings (*Settings → Extensions*) switch the file name, project,
  language and time off one by one, pick where the time counts from, set an
  idle text and after how many minutes without focus Lumen counts as idle, and
  add a “View repository” button for public repositories.
- Private projects — marked with *Discord: Toggle Private Project* or listed
  as folders in the settings — show no names (or nothing at all).
- A *Discord* entry in the status bar shows the connection; a click
  reconnects. *Discord: Enable / Disable Rich Presence* switch it on and off.
- For your own “Playing …” name, create an application at
  [discord.com/developers](https://discord.com/developers/applications), put
  its *Application ID* into the settings and upload art assets named after the
  language ids (`java`, `typescript`, `python` …) plus `lumen`.

## Minecraft Development

An extension (`extensions/minecraft`, with code for the window) that creates
plugins for **Spigot, Paper, Folia, Purpur, Leaf, Velocity, BungeeCord** and
mods for **Fabric, NeoForge, Forge, Quilt, Architectury** — for every Minecraft
version from 1.7.10 to the newest that the platform supports. Anyone who had
the old built-in add-on switched on gets a one-time hint to install it.

- **Every version field is a searchable list loaded live** for the chosen
  Minecraft version — releases from Mojang's manifest (snapshots on request for
  Fabric), loaders and APIs from FabricMC, QuiltMC, NeoForged, Forge (with its
  *recommended*/*latest* promotions), PaperMC, SpigotMC, Architectury and
  Modrinth, newest first with badges. Lists are cached (12 hours by default)
  and work offline from the cache or built-in defaults; *Minecraft: Update
  versions* fetches them afresh.
- **Builds match the era**: Java 8/16/17/21/25 as Mojang ships it; Forge as its
  MDK builds (ForgeGradle 6 or 7, ModDevGradle Legacy for 1.17.1–1.19.3,
  RetroFuturaGradle for 1.7.10 and 1.12.2); NeoForge with ModDevGradle (Legacy
  for 1.20.1); Fabric Loom with or without remapping; Mojang, Yarn or
  Parchment mappings. The Gradle wrapper is set up from a small build of its
  own, with a daemon JDK that fits (`gradle/gradle-daemon-jvm.properties`).
- **Paper and its forks from 26.1** name builds `26.2.build.128-stable`; the
  first choice keeps the newest build of the version (`26.2.build.+` in
  Gradle, `[26.2.build,26.2.1)` in Maven).
- Project kinds for existing projects with `runClient`, `runServer`,
  `runData` …; *Minecraft: Insert snippet…* brings listeners, commands, mixins
  and registrations.

## Add-on Studio

Add-ons of your own are built inside Lumen (*Add-ons → New add-on*):

- **Languages** through a form — extensions, word lists, strings, comments,
  indentation, snippets, runners, language servers — with a live preview using
  the real tokenizer.
- **Commands and events** with **visual scripting**: a node editor with
  execution and data pins, 65 nodes (editor, text, logic, loops, variables,
  maths, files, shell, dialogs, IDE commands), and a test run with a transcript
  and nodes lighting up. Events: startup, file saved, file opened, tab changed.
- **Project templates** with fields (text, choice, switch), placeholders with
  filters (`{{group|path}}` → `de/example`, `{{name|pascal}}`, `|camel`,
  `|snake`, `|kebab`, `|lower`, `|upper`), blocks (`{{#if field}}…{{/if}}`,
  `{{#if field=value}}`, `{{#unless field}}`), fields and files that only
  appear under a condition, setup commands and a link to a project kind.
  **Choice lists from the network**: a JSON URL, the path to the list, the
  value and label fields (nested paths allowed, `version.id`), a regex filter,
  reversing and a maximum — loaded at startup, stored, and still usable
  offline.
- **Project kinds** as in Minecraft Development: marker files, rules (the file
  exists and matches a regex), tasks with a group and a wrapper (`gradlew`,
  `mvnw` — `.bat` on Windows), facts by regex as name, version or a fact for
  the project panel. A test checks detection, tasks and facts against the open
  folder.
- **Snippets for any language**, including other add-ons' (Java, Kotlin …) —
  they appear in that language's completion. The bundled add-ons use the same
  `snippets` field; the Minecraft ones carry an `mc-` prefix.
- Themes, and a raw JSON view.
- **A worked example** (*Add-ons → Toolkit example*): a finished “Paper Plugin
  Kit” with a project kind, a template carrying current Minecraft versions from
  PaperMC, conditional files and snippets, as a starting point.
- Stored under `userData/addons`, active immediately, exported and imported as
  `.lumen-addon.json`; bundled language add-ons can be copied into one of your
  own.

## Localisation

The interface comes in **German, English, Spanish, French, Polish, Italian,
Portuguese and Dutch** (*Settings → General*, defaulting to the system
language). Texts live per area in `src/i18n/messages/<area>.ts`; components use
`useT()`, static add-on texts `tr('key')`. `npm run check:i18n` checks
completeness and placeholders.

## Interface

- **Three docks and a navigation strip.** Everything that is not the editor —
  explorer, search, project, outline, run & debug, output, terminal, problems,
  references, language servers, extension pages, agent chats, Git and GitHub —
  is a *view* that lives in one of three docks: **left**, **right** or
  **bottom**. The icon strips at the outer edges of the window open the views of
  the side docks, the bottom dock shows its views as tabs.
- **Drag and drop**: pick up any icon or tab and drop it on the other strip, on
  the bottom tab bar, or on one of the targets that appear over the editor
  (left, right, bottom). The order within a dock changes the same way. A
  right-click on an icon or tab offers *Move to left/right/bottom*; the layout is
  remembered.
- **Navigation left or right**: *Settings → Window → Panel navigation* (or
  *Move Panel Navigation Right* in the command palette) puts the strip with
  **extensions, settings, keyboard shortcuts and themes** on the right; the two
  side docks trade places with it. *Reset Window Layout* puts every view back.
- The title bar toggles the navigation-side dock, the bottom dock and the
  secondary side dock; the bottom dock can be maximised over the editor.
- Context menus render above everything else and never end up offset inside a
  panel.
- **Wayland**: under Wayland, Lumen starts natively, with proper window
  decoration, scaling and input methods. *Settings → Window* chooses automatic,
  Wayland or X11; `LUMEN_X11=1 npm run dev` forces X11 during development.
- Animation in three levels (reduced, normal, rich) with consistent curves —
  `--ease-out` coming in, a shorter `--ease-in` going out. Dialogs rise and
  sink back on closing, palettes and forms fade rather than vanish, toasts
  glide in and out, completion and hover popups appear softly, and there is a
  sliding active-item bar, fading tabs and panels, theme cross-fades and
  staggered lists. “Normal” follows the system's *reduce motion* setting.

---

## Theme system

A theme is an object as well: one colour table for the interface (`ui`) and one
for the code (`syntax`).

```ts
import type { Theme } from '@/core/types'

export const myTheme: Theme = {
  id: 'my-theme',
  name: 'My theme',
  type: 'dark',
  ui: { bg: '#0e1013', bgElevated: '#14171c', /* … 21 keys */ },
  syntax: {
    keyword: '#c4a6ff',
    comment: { color: '#5e6673', italic: true },
    string: '#98d982',
    // … one colour per TokenKind
  },
}
```

The values end up as CSS variables on the `<html>` element (`--c-bg`,
`--c-accent`, `--s-keyword`, …) and are translated into a CodeMirror theme at
the same time. **Lumen Dark**, **Midnight**, **Forest**, **Graphite**, **Lumen
Light** and **Solar** ship with it.

### Theme Studio

Themes can be built entirely inside the IDE — no code needed. *Themes → New
theme*, or edit on a card, opens the editor:

- **21 interface colours** and **19 syntax colours** with a colour picker, hex,
  HSL and OKLCH sliders, alpha, an eyedropper and recently used colours
- **Preview modes**: the whole IDE, the editor with real highlighting in 15
  languages, interface elements (buttons, palettes, toasts, diagnostics,
  completion …) and the terminal with ANSI colours; zoom, before/after and a
  colour-vision simulation
- Hovering a colour swatch highlights where it is used in the preview, and
  clicking in the preview jumps to that colour
- **Contrast** to WCAG on every swatch, a warning list with a “fix” action, and
  a palette generator from an accent and a base colour
- **Dark ↔ light** inverts surfaces and text perceptually (OKLab) and adapts
  accent and syntax colours to the new background — switchable, and undoable
- Undo and redo, *Discard*, *Done*, export and import as JSON

A built-in theme is copied automatically when you edit it; the bundled ones
stay untouched.

**Selection in the editor**: `ui.selection` applies as given while focused, and
at about 60 % opacity without focus. When the colour is too weak against the
background — contrast under 1.4 — Lumen raises the opacity or mixes in some
accent, so every selection stays visible (`npm run check:themes` verifies every
theme). Line highlighting is dropped on lines carrying a selection, and further
occurrences of the selected text get a discreet outline.

## Icon packs

The explorer, tabs, palettes, problems and references draw files and folders
with the active icon pack (*Themes → Icon packs*). Like a theme, a pack is an
object — from an add-on (`iconPacks`) or built in the Icon Studio:

```ts
import type { IconPack } from '@/core/types'

export const myIcons: IconPack = {
  id: 'my-icons',
  name: 'My icons',
  fileNames: { 'package.json': { shape: 'package', color: '#cb3837' } },
  extensions: { 'test.ts': { shape: 'flask', color: '#4ade80' }, ts: { glyph: 'TS', color: '#3178c6' } },
  languages: { java: { shape: 'coffee', color: '#e76f00' } },
  folderNames: { src: { shape: 'folder-code', color: '#7c8cff' } },
  file: { shape: 'file' },
  folder: { shape: 'folder' },
}
```

An icon is either a **short text** (`glyph`, up to three characters), one of
around 85 built-in **shapes** (`shape`: `package`, `lock`, `hammer`,
`container`, `git-branch` …) or an **SVG path** of your own (`path`, 24×24) —
each with a colour. Lookup runs: exact file name → extension (longest first,
`d.ts` before `ts`) → language → the language add-on's glyph → `file`. Folders
without a shape show the tinted arrow.

Bundled:

- **Lumen** (default) — shapes and marks for about 1,700 file names, extensions,
  languages and folders: every language, build system and package manager
  (npm/pnpm/Yarn/Bun/Deno, Maven, Gradle, CMake, Meson, Bazel, Cargo, Go,
  uv/Poetry, Composer, .NET …), framework and tool configs (Vite, Next, Nuxt,
  Astro, Svelte, Tailwind, ESLint, Prettier, Biome, Jest, Vitest, Playwright,
  tsconfig …), CI, containers and deployment, env files, certificates, docs,
  licences, media, fonts and archives — in one coordinated palette, with brand
  colours where a tool is known by them. Folders with a role (`src`, `test`,
  `docs`, `assets`, `components`, `api`, `routes`, `styles`, `i18n`,
  `migrations`, `config`, `scripts`, `dist`, `node_modules`, `.github` …) carry
  an emblem inside the folder outline. 343 shapes in all: Lucide's plus 61 drawn
  for Lumen on the same grid (role folders and marks such as Git, GitHub,
  Markdown, Vue, Angular, GraphQL, Tailwind, Kotlin, Docker).
- **Lumen Monochrome** — the same coverage and the same shapes, drawn in one
  neutral tone that follows the theme (files in the muted, folders in the subtle
  text colour).
- **Lumen Classic** — nothing but the language add-ons' glyphs, folders as
  tinted arrows

**Icon Studio**: *New icon pack* starts empty, *Customise* on a card copies a
bundled pack (your own are edited directly). Entries by file name, extension,
language and folder, with a glyph, a shape picker, a colour and an optional SVG
path; on the right an explorer preview and a test showing which rule a given
file name hits. Packs export and import as `*.lumen-icons.json`, and invalid
shapes, colours or paths are rejected (`npm run check:addons`).

### Effects

Switchable in *Themes → Effects*; everything applies and is saved at once:

- animation on/off, level (reduced/normal/rich), speed 0.4× – 2×
- frosted glass (backdrop blur) behind overlays and palettes
- accent glow and shadows
- corner radius 0 – 20 px, panel transparency 0 – 50 %

Font, line numbers, minimap, fold markers, cursor and density live in
*Settings*. The **text cursor** can be a line between characters (1–4 px), a
semi-transparent block over the character at the cursor, or an underline — both of
the latter exactly one character width of the editor font.

### Custom CSS

The *Custom CSS* field is inserted as the last stylesheet and overrides
everything:

```css
:root {
  --c-accent: #ff7ab6;
  --s-keyword: #ffd479;
  --radius: 2px;
  --duration: 0.08s;
}

.cm-line { letter-spacing: 0.02em; }
```

---

## What it does

- A project panel with the recognised build system and package manager, tasks,
  facts, dependencies (added through a dialog), environment variables and
  server preferences; a wizard with templates for every language add-on
- A file tree with inline creation, a context menu, renaming, deleting (to the
  wastebasket), automatic refreshing and reloading of externally changed files
- Tabs with a preview mode (a single click replaces, a double click pins),
  dirty markers and read-only tabs for class sources
- Editor: undo history per tab, bracket closing, folding, find and replace,
  multiple cursors, completion from language data, document words and the
  language server
- Language servers: diagnostics, hover, signature help, navigation, references,
  renaming, code actions, formatting, inlay hints, outline, symbol search
- Search everywhere (Shift twice) across files, symbols, actions, tasks and
  text
- Built-in terminals using the locally installed shells, plus external
  terminals
- A command palette (`Ctrl+Shift+P`) and a quick file opener (`Ctrl+P`), both
  with fuzzy search; prefixes `>` commands, `@` symbols, `#` workspace,
  `!` tasks
- A bottom panel with output, problems, references and language servers
- Full-text search across the project folder
- Running with process output, cancelling, compile-then-run chains and
  clickable file:line references
- Add-on manager, theme picker with preview, settings — all persisted

## Architecture

```
electron/main.ts        window, IPC, file system, process runner, server processes
electron/terminal.ts    finding shells and external terminals, PTY sessions (node-pty)
electron/preload.ts     typed bridge (contextIsolation, no nodeIntegration)
electron/features/      SDK downloads, debug adapters, user add-ons, network, Wayland, updater,
                        project data (~/.lumen/projects), privileged installs, output capture
electron/features/extension-host/  extension code: activation, ctx, agents, views, services
src/core/types.ts       the whole add-on API (languages, themes, project kinds, templates)
src/core/tokenizer.ts   LanguageSpec → CodeMirror StreamParser
src/core/language.ts    language association, completion, indentation
src/core/theme.ts       theme + effects → CSS variables and a CodeMirror theme
src/core/registry.ts    the add-on registry and its lifecycle
src/core/commands.ts    every command; keybindings.ts: presets, chords, conflicts
src/core/completion/    error-tolerant matcher, the merged suggestion source
src/core/folding.ts     fold ranges for every language
src/core/debug/         DAP client, sessions, breakpoints, adapters
src/core/sdk/           JDK catalogue, detection, environment
src/core/user-addons/   Add-on Studio: model, node catalogue, interpreter
src/core/extensions/    extensions from a server: trust, catalogue, install
src/features/           features that register themselves at startup
src/i18n/               translations (8 languages)
src/core/lsp/           JSON-RPC client, server management, protocol types
src/core/project/       project detection, the project configuration (~/.lumen/projects), templates
src/addons/             the add-ons themselves
src/addons/lib/         project kinds, package managers and templates (jvm, native, node, web, lang)
src/lib/                Markdown renderer, workspace edits, runner, editor bridge, symbols
src/core/views.ts       the registry of views every dock draws from
src/state/store.ts      application state (zustand), put together from slices:
src/state/slices/       app · workspace · editor · layout · appearance · extensions
src/state/layout.ts     the window layout as data: docks, moving views, the navigation side
src/components/shell/   title bar, status bar, toasts, welcome
src/components/workbench/  docks, navigation strips, drag and drop, built-in views
src/components/editor/  editor groups, CodeMirror, minimap, the editor's LSP wiring
src/components/overlays/   command palette, search everywhere, forms
src/components/panels/  the views themselves (explorer, project, terminal, output …)
src/components/extension-view/  draws extension views from their data
src/components/…        dialogs, studios, agent chat, debug, settings, ui
extension-server/       standalone extension server (catalogue, publishing, project pages)
extensions/             extension sources, built and published from here
```

Writing is limited to the opened folder and to paths chosen in a file dialog,
including the target folder of a new project. The renderer has no Node access.

## Code style

No `else` and no nested ternary chains: conditions end early through guard
clauses with `return`/`continue`, and branching lives in lookup tables or small
helper functions.

Never hard-code visible text: use `t('area.key')` with entries in all eight
languages (`npm run check:i18n`).

Comments, thrown errors and script output are written in English
(`npm run check:docs`); German remains only where it is content — the
translated interface strings under `src/i18n/`, and the text project templates
write into a user's own project.

## Limits

- Code blocks in Markdown and MDX are coloured as a whole, not in the language
  named on the fence.
- Semantic tokens from servers are not used; highlighting comes from the
  add-ons' tokenizers.
- There is no language server for Novus yet; the configuration is ready and
  takes effect as soon as `novus-lsp` appears on the PATH.
- Templates pin versions to fixed releases (React 19, Angular 19, JUnit 5.11
  and so on); “update dependencies” in the project panel raises them.
- Adding a dependency does not edit `conanfile.py`, only `conanfile.txt`.
- An add-on's snippets cannot (yet) be attached to another language from
  outside — which is why the Minecraft snippets arrive through a command.
- The debugger has no function or data breakpoints and no memory view; attach
  works only through the project's `debug.json`.
- During development, Wayland can only be switched through `vite.config.ts` or
  `LUMEN_X11`; the setting itself applies to the built program.
- Servers that are neither a package nor in a known system package manager (a
  download page, say) can't be installed automatically. The install dialog
  shows their install hint and docs link.