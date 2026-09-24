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
  extensions/<id>/meta.json       when published, when last changed
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
npm test
```

Starts a real server on a free port and addresses it over HTTP — what is tested
is the path Lumen and the publishing scripts take too.
