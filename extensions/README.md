# Extensions

Extensions lie here as source folders, are built into a manifest and pushed to
an [extension server](../extension-server/README.md). Lumen fetches them from
there.

```sh
npm run build:ext                 # build them all -> extensions/dist/
npm run build:ext -- example      # only this one
npm run check:extensions          # test against the server's and Lumen's checks
npm run publish:ext -- --server https://lumen-extensions.eztxm.de --token "$LUMEN_EXT_TOKEN"
```

To try things out, a server of your own alongside is enough:

```sh
npm run server:ext -- --data /tmp/lumen-ext --token secret
npm run publish:ext -- --server http://localhost:8730 --token secret
```

## How a source folder is laid out

```
extensions/<name>/
  extension.json    the particulars and the settings
  addon.json        languages, templates, project kinds, commands, themes
  README.md         the project page on the server
  pages/<id>.md     pages that Lumen itself displays
```

`extensions/example/` is a complete template with all of that.

### `extension.json`

The id, the version and the name stand **here alone** — the add-on inherits them
at build time.

```json
{
  "id": "ext.go",
  "name": "Go",
  "version": "1.0.0",
  "description": "Go-Sprachunterstützung mit gopls.",
  "category": "language",
  "icon": "Go",
  "color": "#00add8",
  "keywords": ["go", "golang"],
  "settings": [
    { "key": "gopls", "label": "gopls-Pfad", "type": "text", "default": "gopls" }
  ]
}
```

The id must begin with `ext.` — `user.` stays reserved for the add-on studio.
Settings appear in Lumen under *Settings → Extensions*, each with the name of
its extension in front.

`minAppVersion` (in `extension.json`, e.g. `"0.5.0"`) names the oldest Lumen the
extension needs. Set it whenever the extension uses something the app only has
from that version on — a setting type, a host API, window code. An older Lumen
lists the extension as “Needs Lumen 0.5.0”, refuses to install it, skips it in
updates, and does not start the code of one already installed.

The kinds of setting: `text`, `number`, `toggle`, `select` (with `choices`).

A manifest is written in one language. Settings and commands carry the other
interface languages in `i18n`, by language code — what a language leaves out
keeps the manifest's own text:

```json
{ "key": "idleText", "label": "Leerlauf-Text", "section": "Leerlauf",
  "i18n": { "en": { "label": "Idle text", "section": "Idle", "hint": "…", "placeholder": "…" } } }
{ "key": "mode", "type": "select", "label": "Modus", "choices": [{ "value": "a", "label": "Aus" }],
  "i18n": { "en": { "label": "Mode", "choices": { "a": "Off" } } } }
{ "id": "discord.reconnect", "title": "Discord: Neu verbinden", "i18n": { "en": { "title": "Discord: Reconnect" } } }
```

### `addon.json`

The same shape the add-on studio writes — languages with their language servers
and start commands, snippets, templates, project kinds, themes, and commands as
a node graph. Regular expressions stand as text (`"^\\d+"`), not as `/…/`.

Give every language server a `package`, so Lumen can install it into its
closed environment (`~/.lumen/lsp`) — right after the extension is installed it
offers to, one server or all:

```json
"package": { "type": "npm", "packages": ["typescript-language-server", "typescript@6"] }
"package": { "type": "pypi", "package": "cmake-language-server", "python": "3.13", "with": ["pygls<2"] }
"package": { "type": "go", "module": "golang.org/x/tools/gopls@latest" }
"package": { "type": "github", "repo": "clangd/clangd", "assets": { "linux-x64": "^clangd-linux-[\\d.]+\\.zip$" } }
```

`github` assets are regular expressions per `<platform>-<arch>` (`linux-x64`,
`linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`, `win32-arm64`).
`bin` names the program when it differs from `command`. `installCommands`
(per platform: `linux`, `darwin`, `win32`) remain the fallback for servers
without a package.

### Pages

Every file under `pages/` becomes a page. A header sets the title and the place:

```markdown
---
title: Willkommen
location: sidebar
---

# Willkommen
```

`location: left`, `right` or `bottom` puts the page into that dock of the window
with an icon of its own (`sidebar` is the old name of `left`); the user can drag
it to any other dock. `icon:` names an icon-pack shape or action icon
(`book-open`, `rocket` …). With no location the page is not docked. `.html` files work just as well but are not sent through the
Markdown converter.

Pages run in a walled-off frame: no JavaScript, no access to Lumen, no windows
of their own. Links pointing outwards Lumen opens in the system's browser.

## What an extension can do beyond data

Most extensions are data — a language, a template, a page. Logic comes about
through node graphs, which the same interpreter runs as for the user's own
add-ons; such an extension cannot reach files, the network or the shell.

An extension that needs more ships **program code**: `main.js` in its folder.
The build bundles it (with everything it imports) into one ES module,
`code.main` in the manifest. Packages of its own go into a `package.json` next
to it (the build installs them into the folder when they are missing);
`"lumenBuild": { "alias": { "pkg": "./stub.js" } }` there swaps a package for a
local file — for an optional part a dependency imports but the extension never
uses (`extensions/database/` does that to stay under the size limit). Lumen runs it in its main process and calls
`activate(ctx)`:

```js
export function activate(ctx) {
  ctx.agents.register('helper', {
    async send(request, emit) { /* one turn; report through emit({ kind: … }) */ },
    answer({ requestId, allow, remember }) { return true },
    interrupt(chatId) {},
  })
  return () => { /* dispose */ }
}
```

`agents` in `extension.json` describes how the panel looks; the code does the
work. Lumen knows nothing about the product behind an agent — it draws a chat
with streamed Markdown answers, thinking, tool calls, an allow/deny card for
every permission the code raises, the agent's plan and the cost of each turn.
Two complete examples: `extensions/claude-code/` (the Claude Agent SDK) and
`extensions/codex/` (the Codex CLI in JSON mode).

| Field | Purpose |
| --- | --- |
| `name`, `description`, `icon`, `placeholder` | how the chat presents itself |
| `modes` | chips in the chat; the chosen id arrives as `mode` (the first is the default) |
| `models`, `modelSetting` | the model picker; the chosen id arrives as `model`, `""` means the setting named by `modelSetting` applies |
| `location` | the dock the chat starts in: `left`, `right` (default) or `bottom` |
| `suggestions` | prompts offered in an empty chat |
| `images` | `true` lets the user paste or attach images (`attachments` with base64 `data`) |

A provider implements `send(request, emit)`, `answer(reply)`, `interrupt(chatId)`
and, optionally, `sessions(cwd)` — earlier conversations the chat offers to
resume (the id comes back as `sessionId`). Every chat of an agent has its own
`chatId`. The events `send` emits:

| Event | Meaning |
| --- | --- |
| `session` | the conversation's id, model, tools and slash commands (offered after `/` in the composer) |
| `delta` | streamed text of the message being written; `thinking: true` for reasoning |
| `assistant` | complete blocks: `text`, `thinking`, `tool` (replaces the streamed text) |
| `toolResult` | a tool's output, `isError` when it failed |
| `permission` / `permissionSettled` | ask before a tool runs; `reason` explains why |
| `todos` | the agent's plan, replacing the previous one |
| `status` | a short line while working (`""` clears it) |
| `result` | the end of a turn with `usage` (tokens, cache, cost, duration, steps) |
| `error` | a message shown in the chat |

Lumen adds `done` itself when `send` ends.

### Views, commands, the status bar

Code can do much more than agents. Everything it shows is **data**: Lumen draws
it with its own components, so a panel looks like the rest of the program and a
buggy extension cannot break the window. The shapes are in
`electron/features/extension-host/contract.ts`, `ctx` is built in `context.ts`.

```json
"views": [
  { "id": "changes", "title": "Source Control", "icon": "git-branch", "location": "left" }
],
"commands": [
  { "id": "refresh", "title": "Refresh", "category": "Git", "keybinding": "Ctrl+Alt+R" }
]
```

```js
export function activate(ctx) {
  ctx.views.register('changes', {
    render: () => ({
      toolbar: [{ action: 'refresh', title: 'Refresh', icon: 'refresh-cw' }],
      nodes: [
        { type: 'input', id: 'message', multiline: true, placeholder: 'Message',
          submit: { action: 'commit', title: 'Commit' } },
        { type: 'section', id: 'staged', title: 'Staged', badge: 2, children: [
          { type: 'item', id: 'a', label: 'main.ts', fileIcon: 'main.ts', tone: 'modified',
            onClick: { action: 'open', title: 'Open', payload: '/abs/main.ts' },
            actions: [{ action: 'unstage', title: 'Unstage', icon: 'minus', payload: 'main.ts' }] },
        ] },
      ],
    }),
    async onAction({ action, payload, inputs }) { /* inputs.message … */ ctx.views.refresh('changes') },
  })
  ctx.commands.register('refresh', () => ctx.views.refresh('changes'))
  ctx.statusBar.set('branch', { text: 'main', icon: 'git-branch', command: 'refresh' })
}
```

Node types: `section`, `item` (icon or file icon, description, badge, tone,
hover actions, context `menu`, children), `input` (single or multi-line,
`submit` on Enter / Ctrl+Enter), `select`, `toggle`, `buttons`, `text`,
`markdown`, `keyValue`, `empty` (with an action), `progress`, `divider`, `row`
(its children side by side), `grid` and `code` (below). An action with
`confirm` asks first. The view's content is fetched while it is visible and
again after `ctx.views.refresh`.

#### Grids and code inputs

For views built around data there are two larger nodes; `layout: 'fill'` on the
content lets one of them (`grow: true`) take the rest of the height instead of
the view scrolling.

```js
{ type: 'grid', id: 'rows', grow: true, select: 'multi',
  columns: [{ id: 'id', title: 'id', detail: 'INTEGER', numeric: true, key: true, sortable: true },
            { id: 'name', title: 'name', editable: true, nullable: true }],
  rows: [{ id: 'k1', cells: [1, 'Ada'], tone: 'modified', changed: [1] }],
  sort: { column: 'id', direction: 'asc' },
  onSort: { action: 'sort', title: 'Sort' },       // payload { column, direction, data }
  onEdit: { action: 'edit', title: 'Edit' },       // payload { row, column, value, data }
  onOpen: { action: 'open', title: 'Open' },       // payload { row, data }; `activate: 'click'` opens on one click
  menu: [{ action: 'delete', title: 'Delete', danger: true }],
  paging: { offset: 0, limit: 200, total: 1234, action: { action: 'page', title: 'Page' } } }  // payload { offset, data }

{ type: 'code', id: 'sql', language: 'sql', rows: 10, value: 'SELECT 1',
  submit: { action: 'run', title: 'Run' } }       // Ctrl+Enter
```

A grid draws only the rows in sight, so tens of thousands are fine; columns
can be resized, cells are edited in place (Enter commits, Escape cancels, the
menu offers *set to NULL* on `nullable` columns), rows copy as tab-separated
text. Cells are text, numbers, booleans or `null`. `data` in a payload is the
action's own `payload`. The selected row ids reach every action as a JSON list
in `inputs[<grid id>]`; a code input's text is `inputs[<id>]`, its selection
`inputs['<id>.selection']`.

#### Views in the editor area

A view with `"location": "editor"` is not docked. Its code opens it as tabs in
the editor area, any number of them, each an *instance* the provider tells
apart:

```js
ctx.views.register('data', {
  render: (instance) => ({ title: tables.get(instance).name, layout: 'fill', nodes: [/* … */] }),
  onAction: ({ action, payload, inputs, instance }) => { /* … */ ctx.views.refresh('data', instance) },
  onClose: (instance) => tables.delete(instance),
})
ctx.views.open('data', 't1', 'customers')   // opens or focuses that tab
```

The content's `toolbar` shows above the tab's content. What was typed into a
tab's inputs survives switching tabs. Tabs are not restored after a restart;
`render` gets an instance it no longer knows then and should say so.

#### Opening files

`openWith` in `extension.json` offers the extension for files of certain names:

```json
"openWith": [{ "command": "open-file", "title": "Database viewer", "patterns": ["*.db", "*.sqlite"] }]
```

Opening such a file asks whether it goes to the extension or into the text
editor, and the explorer's context menu offers it directly. The command gets
`{ path }`.

What else `ctx` offers:

| | |
| --- | --- |
| `ctx.workspace.root()`, `folders()`, `onDidChange` | the open folders |
| `ctx.events.on('fileSaved' \| 'activeFile' \| 'project' \| 'windowFocus' \| 'windowBlur' \| 'viewVisible' \| 'locale', fn)` | what happens in the interface; `activeFile` carries the tab's `languageId` and `languageName`, `project` its `root` and `name` |
| `ctx.events.last(kind)` | the latest event of a kind — the active file or project at the moment the code starts |
| `ctx.ui.notify`, `openFile`, `openDocument(name, text, languageId)`, `showView`, `runInTerminal`, `refreshProject` | acting on the interface |
| `ctx.ui.confirm`, `input(title, fields)`, `pick(title, items)` | questions, answered in Lumen's dialogs |
| `ctx.exec(command, args, { cwd, env, timeoutMs, input })` | run a program without a shell, collect its output |
| `ctx.settings.get / all / onDidChange` | the extension's settings |
| `ctx.secrets.get / set / delete` | tokens and keys, encrypted with the system's key store |
| `ctx.storage.get / set` | a small JSON document that survives restarts |
| `ctx.storage.dir()` | a folder of the extension's own for larger files (downloads, caches); removed with the extension |
| `ctx.views.open(id, instance, title)`, `ctx.views.refresh(id, instance?)` | tabs of editor views |
| `ctx.locale()`, `ctx.appVersion`, `ctx.openExternal(url)`, `ctx.log(…)` | the interface language, Lumen's version, links, logging |

Ids of views, commands and status items are lower-case (`open-changes`).
Settings come in the types `text`, `number` (`min`/`max`/`step`), `toggle`,
`select`, `textarea` (`rows`), `path` (`pathKind: file|folder`), `color` and
`secret`; `section` groups them and `when: "key"` / `"key=value"` shows a
setting only under a condition. `extensions/git/` and `extensions/github/` are
complete examples; `extensions/discord/` (Discord Rich Presence) is a small one
that works from events and the status bar alone.

**Code runs with Lumen's own rights.** So it is never installed silently:

1. the user is asked, told what that means, and shown the SHA-256 of the code,
2. the main process hashes the code again and refuses a mismatch,
3. at startup the file is hashed once more against the approved hash — a file
   changed on disk afterwards does not run.

An update whose code changed asks again; unchanged code carries over. The
trust boundary for data extensions stays what it was: `lumen-extensions.eztxm.de`
counts as vetted, and every other server raises a prompt first.

### Code for Lumen's window

`renderer.ts` (or `.js`) is code for the window rather than the main process —
for what only lives there: project templates whose fields load their choices
over the network and whose files are computed, project kinds with a `detect`,
snippets and commands with an `activate(ctx)`. The build bundles it into
`code.renderer`; it exports `addon(lumen)` and returns the parts of an add-on.
Everything from Lumen comes through `lumen` (`src/core/extensions/renderer-api.ts`):
translation over the extension's own message tables, `net.fetchJson/fetchText`,
the project helpers, the editor, dialogs and settings. The source never
imports the app — only `import type` from `../../src/…`, which vanishes in the
bundle.

`extensions/minecraft/` is the complete example: every Minecraft version from
1.7.10 with live version lists per platform (cached in `ctx.storage`, offline
defaults built in), templates per era and project kinds. Its rules are pure
modules with tests — `node extensions/minecraft/test.mjs` offline,
`--network` against the live sources.

## The check before publishing

`npm run check:extensions` checks every built manifest twice — against the
server's rules and against Lumen's add-on check. Whatever passes there every
server accepts and can be installed.

## What an extension cannot carry

Debug adapters and tokenizers stay in the program and are named rather than
shipped.

**Debug adapters.** An adapter describes not only its command but what a launch
request looks like, and that is a function. An extension writes
`"debug": ["delve"]` and gets the adapter Lumen already has;
`src/core/debug/builtin-adapters.ts` lists the names.

**Tokenizers.** Most languages describe their syntax as data — keywords and a
few regexes — and the generic tokenizer turns that into highlighting. A handful
cannot: Markdown switches between block and inline, HTML hands `<style>` and
`<script>` to another tokenizer, JSX has to tell a comparison from a tag. Those
name one instead:

| Name | What it colours |
| --- | --- |
| `markdown` | Markdown |
| `mdx` | Markdown plus ESM lines, expressions and JSX tags |
| `css` | CSS, selector / property / value apart (Tailwind) |
| `markup` | HTML with embedded CSS and JavaScript (XML) |
| `markup-mustache` | the same plus `{{ … }}` (Vue, Angular templates) |
| `markup-astro` | the same plus a `---` frontmatter block and `{ … }` (Astro) |
| `jsx` | the language's own highlighting plus JSX tags (React) |

`src/core/user-addons/tokenizers.ts` holds the registry,
`src/addons/lib/builtin-tokenizers.ts` the names. An unknown name is an error
in `npm run check:extensions`, so a typo cannot quietly cost a language its
colours.

## What is still only a language

Six extensions carry their language and nothing else — their project kinds,
tasks and templates were never migrated, and the add-ons they came from are
gone:

`ext.c` · `ext.cpp` · `ext.csharp` · `ext.kotlin` · `ext.python` ·
`ext.buildtools`

`npm run check:project` lists them under *languages only, no templates* and
skips the dependency checks that would need them. Finishing one means writing
its `projectKinds` and `templates` into its `addon.json` by hand.

### Why the native build systems were never migrated

`c`, `cpp` and `buildtools` shared eight project kinds. After a review they were
**deliberately** left: the tasks could be expressed, the facts could not.

| Project kind | What would be missing |
| --- | --- |
| `make` | — (already migrated in `essentials`) |
| `ninja` | — |
| `cmake` | Facts: the targets joined into a list, the `clangd` state from whether `build/compile_commands.json` exists |
| `meson` | Dependencies from the folder `subprojects/` (`*.wrap`) |
| `xmake` | The entry after the last `add_requires(`, otherwise before the first `target(` |
| `bazel` | The build file depending on whether `MODULE.bazel` or `WORKSPACE` is there |
| `vcpkg` | Dependencies as a list of text *or* of objects; the version from one of two fields |
| `conan` | Facts that depend on whether a `conanfile.txt` or a `conanfile.py` is present |

Every line would be a small mechanism of its own in the schema — nine of them
together, which nobody outside the native build systems needs. The format is
meant for add-ons written by hand; widening it by nine special cases makes it
harder for everyone else to read.

The generally useful parts of that review are there all the same, and tested
(`npm run check:addons`): `then` for a second stage, `argsWhenFile` for
arguments that depend on a file being present, matches from a JSON list
(`jsonName`, `jsonLabel`, `jsonSkipWhen` — CMake presets, for instance) and
`alsoWhenEmpty` for tasks that come along only when nothing matched.
