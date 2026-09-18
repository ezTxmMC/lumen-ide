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

The kinds of setting: `text`, `number`, `toggle`, `select` (with `choices`).

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

`location: sidebar` gives the page an icon of its own in the activity bar — like
the views of Copilot or Dev Containers in VS Code. With nothing given it lands
in the editor area. `.html` files work just as well but are not sent through the
Markdown converter.

Pages run in a walled-off frame: no JavaScript, no access to Lumen, no windows
of their own. Links pointing outwards Lumen opens in the system's browser.

## What an extension can do beyond data

Most extensions are data — a language, a template, a page. Logic comes about
through node graphs, which the same interpreter runs as for the user's own
add-ons; such an extension cannot reach files, the network or the shell.

An extension that needs more ships **program code**: `main.js` in its folder.
The build bundles it (with everything it imports) into one ES module,
`code.main` in the manifest. Lumen runs it in its main process and calls
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

`agents` in `extension.json` describes how the panel looks (name, modes,
placeholder); the code does the work. Lumen knows nothing about the product
behind an agent — a chat panel with messages, tool calls and an allow/deny card
for every permission the code raises is all it draws. `extensions/claude-code/`
is a complete example.

The events a provider emits: `session`, `assistant` (text and tool blocks),
`toolResult`, `permission` / `permissionSettled`, `result`, `error`. Lumen adds
`done` itself when `send` ends.

**Code runs with Lumen's own rights.** So it is never installed silently:

1. the user is asked, told what that means, and shown the SHA-256 of the code,
2. the main process hashes the code again and refuses a mismatch,
3. at startup the file is hashed once more against the approved hash — a file
   changed on disk afterwards does not run.

An update whose code changed asks again; unchanged code carries over. The
trust boundary for data extensions stays what it was: `lumen-extensions.eztxm.de`
counts as vetted, and every other server raises a prompt first.

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
