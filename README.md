# Lumen

A lightweight, modern IDE — flat design, a theme system with optional effects,
project handling with templates and package managers for every language, and an
add-on system that consists of a single object.

Built with **React 18**, **TypeScript**, **Vite 6**, **Electron 33**,
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
| Linux | put the new AppImage next to the running one and replace it (needs write access to the folder) |
| Windows | run the NSIS installer silently (`--updated /S`) |
| macOS | unpack the ZIP and swap `Lumen.app` after quitting (not from a DMG or under translocation) |

Development mode, unpacked ZIPs and read-only locations get a download link
instead. `LUMEN_UPDATE_URL` points the updater at a different feed, which is
useful for testing.

---

## Projects

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
preferences live in `.lumen/project.json`. Inside tasks, `${env:NAME}` is
replaced by the environment variable of that name — `VCPKG_ROOT`, for instance.

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

Lumen installs nothing by itself. Before starting a server it checks whether
the program is on the PATH — or in one of the places it knows (`candidates`:
Mason, Homebrew, `node_modules/.bin`, LLVM directories, `~/.lumen/lsp`). When
it is missing, things quietly fall back to the built-in completion; the
language server panel explains how to install it and, where a command is on
record (`npm i -g …`, `brew install …`), offers an **Install** button that runs
it in the output panel.

**One process per program and project root**: clangd serves C and C++ together,
tsserver JavaScript and TypeScript. Document changes go to the server
incrementally when it supports that, otherwise as full text. File changes in
the workspace are forwarded as `workspace/didChangeWatchedFiles`, as far as the
server subscribed to them.

| Language | Server | Notes |
| --- | --- | --- |
| Java | jdtls, java-language-server | a data folder per project under `userData/lsp`, `JDTLS_JVM_ARGS`, auto-import, organise imports, class sources out of jars |
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
the file's folder upwards to the workspace folder. Which server a language
prefers can be chosen per project in the project panel.

All of it can be switched off under *Settings → Language servers*, which also
holds the switches for inlay hints, signature help, highlighting, formatting
and organising imports on save.

---

### Add-ons and extensions

**Built in** (always active): Novus · Java · HTML · CSS · JavaScript · TypeScript · Lumen Themes

**Bundled** (can be switched off): Minecraft Development · Discord Rich
Presence. These two stay in the program because they run code — an `activate()`
— and a manifest carries data, never code.

**From an extension server**: React · Vue · Angular · Astro · MDX · C++ · C ·
C# · Kotlin · Tailwind CSS · PHP · Crystal · Rust · Go · Python · build tools
(CMake, Makefile, XML, Gradle/Groovy, Properties, Dockerfile) · Essentials
(JSON, YAML, TOML, Markdown, Shell, SQL). Open *Extensions* in the activity
bar; `lumen-extensions.eztxm.de` is set up and vetted.

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

---

## Editor

- **Split view**: `Ctrl+\` splits to the right, `Ctrl+K Ctrl+\` downwards.
  Tabs can be dragged between groups — dropping at the right or bottom edge
  splits — and a tab's context menu offers split, move, “close to the right”
  and so on. The layout is remembered per project.
- **Position per file**: scroll position, cursor, folds and undo history are
  kept per file, including when switching between groups.
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
“debug from here”. Breakpoints move along as you type and live in
`.lumen/breakpoints.json`.

- The **Run & debug** sidebar: variables (values editable), watches, the call
  stack with threads, breakpoints, exception filters.
- The **Debug** panel with console and REPL, a floating control bar, the
  current line and inline values in the editor, and hover evaluation.
- Adapters through the Debug Adapter Protocol: GDB ≥ 14, lldb-dap, CodeLLDB
  (C/C++/Rust/Crystal), debugpy, vscode-js-debug (Node/TypeScript), Delve,
  java-debug through jdtls, vscode-php-debug, netcoredbg,
  kotlin-debug-adapter.
- Launch configurations of your own in `.lumen/debug.json` (`name`, `type`,
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
(`jdk` in `.lumen/project.json`), set `JAVA_HOME` and `PATH` for tasks,
terminals and jdtls.

## Discord Rich Presence

The **Discord Rich Presence** add-on — off by default, because data goes to
Discord — shows what you are working on in your profile: “Editing Main.java”,
“in lumen-ide”, the language and the elapsed time. Lumen speaks the local
Discord client's IPC protocol itself (socket `discord-ipc-N`, Flatpak and Snap
included; a named pipe on Windows) with no extra packages. Updates are batched
to one every 15 seconds, and with Discord closed it quietly reconnects.

- Create an application at
  [discord.com/developers](https://discord.com/developers/applications); its
  name appears as “Playing …”. Put the *Application ID* into *Discord:
  Settings…*.
- Under *Rich Presence → Art Assets*, upload images named after the language
  ids (`java`, `typescript`, `python` …) plus `lumen`.
- In *Discord: Settings…* the file name, project, language and time can each be
  switched off, and a text for “no file open” set. *Discord: Hide file names*
  toggles quickly, and *Discord: Reconnect* rebuilds the connection at once.

## Minecraft Development

The add-on creates plugins for **Spigot, Paper, Leaf, Velocity, BungeeCord**
and mods for **Fabric, Forge, NeoForge, Quilt, Architectury** — with a
Minecraft version, the Java version derived from it, Gradle (Kotlin/Groovy) or
Maven, an example command, a listener, mixins, data generation and
`runData` …. *Minecraft: Update versions* fetches the latest loader and API
versions; *Minecraft: Insert snippet…* brings listeners, commands, mixins and
registrations.

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

- The activity bar: explorer, search, project, outline and debug at the top;
  **add-ons, settings, keyboard shortcuts and themes** at the bottom, each a
  large dialog with its own search and navigation.
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

  Webpack, ESLint, Prettier, Maven, Gradle, Ant, CMake, Make, Meson, xmake,
  Ninja, Bazel, Conan, vcpkg, Cargo, Go modules, Poetry, uv, pip, Composer,
  Bundler, .NET, Shards, CI files, Minecraft mods; folders by role (`src`,
  `test`, `docs`, `node_modules`, `.github`, `build` …)
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
electron/features/      SDK downloads, debug adapters, user add-ons, network, Wayland, updater
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
src/core/project/       project detection, .lumen/project.json, field values and creating templates
src/addons/             the add-ons themselves
src/addons/lib/         project kinds, package managers and templates (jvm, native, node, web, lang)
src/lib/                Markdown renderer, workspace edits, runner, editor bridge, symbols
src/state/store.ts      application state (zustand)
src/components/         interface (panels, ThemeStudio, the editor's LSP wiring)
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
  works only through `.lumen/debug.json`.
- During development, Wayland can only be switched through `vite.config.ts` or
  `LUMEN_X11`; the setting itself applies to the built program.
- Install buttons exist only for servers that install without root (npm, brew,
  pipx, cargo); system packages are merely named.