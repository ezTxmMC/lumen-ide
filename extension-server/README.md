# The Lumen extension server

Standalone software for distributing Lumen extensions: a catalogue for the IDE,
an interface for publishing and project pages to look at in a browser.

It runs anywhere Node 20 or newer runs — Linux, macOS, Windows — and needs **no
dependencies**: Node's standard library alone. No `npm install`, no database, no
web server in front.

## Starting it

```sh
node src/main.js --data ./data --token "$(openssl rand -hex 24)"
```

After that the catalogue lies at <http://localhost:8730/api/v1/index> and the
overview page at <http://localhost:8730/>.

Without `--token` the server runs **read-only**. That is deliberate: a server
somebody starts briefly to try things out should never be open to strangers.

### Options

| Option | Environment variable | Default | Meaning |
| --- | --- | --- | --- |
| `--port <n>` | `LUMEN_EXT_PORT` | `8730` | The port |
| `--host <address>` | `LUMEN_EXT_HOST` | `0.0.0.0` | The address listened on |
| `--data <folder>` | `LUMEN_EXT_DATA` | `./data` | The data folder |
| `--name <text>` | `LUMEN_EXT_NAME` | `Lumen Extensions` | The name shown on the project pages |
| `--url <address>` | `LUMEN_EXT_URL` | `http://localhost:<port>` | The public address at which Lumen reaches the server |
| `--token <secret>` | `LUMEN_EXT_TOKENS` | — | A token for publishing, allowed more than once |
| `--allow-overwrite` | `LUMEN_EXT_ALLOW_OVERWRITE=1` | off | Published versions may be replaced |
| `--quiet` | — | off | No output |

## Behind a reverse proxy

The server speaks plain HTTP. For TLS a proxy belongs in front; `--url` must
then name the public address, so that the project pages and the answer after
publishing show the right links.

```nginx
server {
  server_name lumen-extensions.example.com;
  location / {
    proxy_pass http://127.0.0.1:8730;
    proxy_set_header Host $host;
  }
}
```

```sh
node src/main.js --url https://lumen-extensions.example.com --token "$TOKEN"
```

> Lumen treats `lumen-extensions.eztxm.de` alone as vetted. Every other server —
> your own included — raises a prompt before anything is installed, until the
> user marks it as trusted in the settings.

## The interface

Reading is open, writing needs `Authorization: Bearer <token>`.

| Path | Meaning |
| --- | --- |
| `GET /api/v1/info` | The particulars: name, address, count |
| `GET /api/v1/index[?q=…]` | The catalogue, searched where asked |
| `GET /api/v1/extensions/<id>` | The details, the versions and the recommended manifest |
| `GET /api/v1/extensions/<id>/<version>` | One particular manifest |
| `GET /api/v1/extensions/<id>/<version>/security` | The full findings of the security scan, rescanned from the stored manifest |
| `GET /api/v1/scanner` | The scanner's version, rule count and the id, severity and title of every rule |
| `POST /api/v1/publish` | Publish a manifest (token) |
| `DELETE /api/v1/extensions/<id>/<version>` | Remove a version (token) |
| `GET /` | The overview page |
| `GET /e/<id>` | The project page of an extension |

A prerelease (`2.0.0-beta.1`) never becomes the recommended version of its own
accord. It stays available, but with no version named the last finished one is
what arrives.

## Storage

```
data/
  index.json                      the catalogue, written afresh after every change
  extensions/<id>/<version>.json  one manifest that has been checked
  extensions/<id>/meta.json       when published, when last changed, security summary per version
```

The disk is the only truth: whoever backs up the folder backs up the server.
Whoever puts a file in there by hand sees it in the catalogue after a restart.
Writing always goes beside it first and is then renamed — a crash in the middle
of writing never leaves half a manifest behind.

## Publishing

From within the Lumen source tree:

```sh
npm run publish:ext -- --server https://lumen-extensions.example.com --token "$LUMEN_EXT_TOKEN"
```

Or by hand:

```sh
curl -X POST https://lumen-extensions.example.com/api/v1/publish \
  -H "Authorization: Bearer $LUMEN_EXT_TOKEN" \
  -H 'content-type: application/json' \
  --data-binary @extensions/dist/ext.go-1.0.0.json
```

The server checks the manifest before it accepts it, and on an error answers
with the field concerned:

```json
{ "error": "invalid_manifest", "field": "settings[0].key", "message": "…" }
```

A manifest that passes the shape check is then scanned for malware (see below).
One with a critical finding is turned away with `422`:

```json
{ "error": "security_blocked", "message": "…", "counts": { "critical": 1, … }, "findings": [ { "id": "SEC-MAL-001", … } ] }
```

## The security scanner

Every manifest is scanned when it is published, by the same module Lumen uses
itself for installs, terminal commands and project folders:
`src/scanner/` — plain ESM, no dependencies, nothing from Node, so it also runs
in Electron and in the browser. TypeScript sees it through
`src/scanner/index.d.ts`.

```js
import { scanManifest, scanCommand, scanText, scanProjectFiles } from './src/scanner/index.js';

const report = scanManifest(manifest);   // { findings, verdict, scanned, rules, truncated? }
```

### Verdict

| Verdict | When | What the server does |
| --- | --- | --- |
| `block` | at least one `critical` finding | refuses the publish with `422 security_blocked`; the publisher cannot override it |
| `warn` | otherwise at least one `high` or `medium` finding | accepts; the summary says so |
| `clean` | otherwise (`low` and `info` are listed but never change the verdict) | accepts |

There is deliberately no `--no-scan` or `--allow-risky` option: a server whose
scanner can be switched off is a server nobody can rely on.

### What is stored and shown

Per version, `meta.json` keeps a compact summary:
`{ verdict, counts: { critical, high, medium, low, info }, scannedAt, scanner }`.
The catalogue entry of an extension carries `security: { verdict, counts }` of
the recommended version, `GET /api/v1/extensions/<id>` carries it for every
version (`securityByVersion`), and the project page shows a line such as
*Security: clean* or *Security: 2 warnings*. The full findings come from
`GET /api/v1/extensions/<id>/<version>/security`, which scans the stored
manifest again — rules improve, and an old verdict should not outlive them.

Versions that are on disk without a summary (stored by an older server, or
copied in by hand) are scanned the first time they are needed — the recommended
version when the server starts, older ones when they are first read — and the
result is kept. A summary written by an older scanner (`scanner` below the
current `SCANNER_VERSION`) is refreshed the same way. Nothing here can crash on
old data.

### What it looks at

| Part of a manifest | How it is read |
| --- | --- |
| `code.main`, `code.renderer` | The code itself, with comments blanked, through the extension rules; its **string literals** through the command rules. Identifiers and comments are never read as commands. |
| `pages[]` | HTML pages only (script tags, inline handlers, `javascript:` URLs, remote frames, forms, imports). Markdown pages are only checked for malware markers. |
| `settings[].default`, `commands[]`, the add-on graph (`addon.*`, depth ≤ 8, ≤ 5000 strings) | Every string as a possible command. Language tables, themes, snippets and template file contents are skipped. A command rule that matches here is at least `high`. |
| `readme` | Never scanned: documentation may say what the extension protects against. |

### Rule categories

Rule ids are stable (`SEC-<AREA>-<NNN>`) and never reused. `GET /api/v1/scanner`
lists them all.

| Ids | Category | Examples |
| --- | --- | --- |
| `SEC-CMD-001…018` | destructive, ransomware | `rm -rf /`, `dd of=/dev/sda`, fork bomb, `vssadmin delete shadows` |
| `SEC-CMD-019…034` | download-exec, obfuscation | `curl … \| sh`, `iwr \| iex`, `powershell -enc`, `certutil -urlcache`, `mshta http:` |
| `SEC-CMD-035…041` | reverse-shell | `bash -i >& /dev/tcp/…`, `nc -e`, `mkfifo \| nc`, `socat exec:` |
| `SEC-CMD-042…052` | persistence | `.bashrc` payloads, cron, `authorized_keys`, sudoers, `schtasks`, `reg add …\Run` |
| `SEC-CMD-053…063` | tamper | firewall off, SELinux off, Defender off, history wiped, logs wiped |
| `SEC-CMD-064…069` | privilege | `sudo curl \| sh`, setuid, `--privileged -v /:/host`, docker socket |
| `SEC-CMD-070…078` | exfiltration | SSH keys, cloud credentials, `.env`, browser stores, wallets, keychain (each only together with a network tool) |
| `SEC-CMD-079…082` | cryptominer | `xmrig`, `stratum+tcp://`, `--donate-level`, known pools |
| `SEC-CMD-083…089` | supply-chain | installs from URLs, foreign registries, `pip --index-url http://` |
| `SEC-CMD-OBF-001…003` | obfuscation | raised by the command scanner for decoded Base64/PowerShell payloads and quote-splitting tricks |
| `SEC-PKG-001`, `SEC-PRJ-…` | project | lifecycle scripts, `runOn: folderOpen`, dev containers, git hooks, `setup.py`, `.npmrc`, executables |
| `SEC-SCR-…` | secret | AWS, GitHub, Slack, Anthropic, OpenAI, Stripe keys, private keys (never above `medium`) |
| `SEC-OBF-…` | obfuscation | encoded blobs fed to `eval`/`atob`, `fromCharCode` chains, obfuscator signatures |
| `SEC-MAL-…` | malware | the EICAR test string, web shells, mimikatz, metasploit |
| `SEC-EXT-…`, `SEC-HTML-…` | extension code and pages | writes to `~/.ssh`, credential reads, hard-coded IPs, drop hosts, dropper patterns, keyloggers, remote scripts |

Commands are normalised first: line continuations, `${IFS}`, `$'\x72\x6d'`,
split quotes (`r""m`), brace expansion and a leading `sudo` are undone;
`sh -c`, `eval`, `powershell -c`, `cmd /c`, `$(…)` and backticks are unwrapped
to depth 3; Base64 payloads (`… | base64 -d | sh`, `-EncodedCommand`) are
decoded and scanned again. A command that is dangerous only after that is
reported with `SEC-CMD-OBF-003`.

The EICAR antivirus test string is `critical` everywhere, which makes the whole
chain (publish, install, project open) verifiable with a harmless file.

### Rules from extensions

An extension can add rules to Lumen's scanner as data (`SecurityRuleSpec`):
`{ id, title, severity, targets, pattern, message? }`. `toRule(spec, owner)`
compiles one: the id becomes `${owner}:${id}`, the pattern is a regular
expression of at most 500 characters, compiled case-insensitively, matched per
line. Patterns that can backtrack badly — nested quantifiers such as `(a+)+`
or `(.*)*`, or more than six unbounded repetitions — are refused with an
`Error`. Pass the result as `extraRules` to any `scan*` function.

### Limits

Texts over 2 MB are cut (`truncated: true`); lines are scanned in windows of
400 characters; at most 200 findings are returned. A 1 MB script scans in
about 150 ms.

## As a service

```ini
# /etc/systemd/system/lumen-extensions.service
[Unit]
Description=Lumen extension server
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/lumen-extension-server/src/main.js
Environment=LUMEN_EXT_DATA=/var/lib/lumen-extensions
Environment=LUMEN_EXT_URL=https://lumen-extensions.example.com
Environment=LUMEN_EXT_TOKENS=…
User=lumen
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

With Docker:

```sh
docker build -t lumen-extension-server .
docker run -p 8730:8730 -v lumen-ext:/data \
  -e LUMEN_EXT_TOKENS="$TOKEN" \
  -e LUMEN_EXT_URL=https://lumen-extensions.example.com \
  lumen-extension-server
```

## Tests

```sh
npm test               # everything
npm run test:scanner   # the scanner alone, no server
```

Starts a real server on a free port and addresses it over HTTP — what is tested
is the path Lumen and the publishing scripts take too. The scanner has a test
table with positive and negative samples for every rule, and scans all the
manifests in `../addons/dist` (none may be blocked).
