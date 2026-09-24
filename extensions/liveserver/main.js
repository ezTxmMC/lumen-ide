/**
 * Live Server for Lumen: serves the project folder, opens it in the browser
 * and reloads the page when a file changes. PHP files run through `php -S`.
 * The server itself lives in `src/server.js`.
 */

import path from 'node:path'
import { startLiveServer } from './src/server.js'

/** Files that make sense as the page to open. */
const PAGE_EXTENSIONS = new Set(['.html', '.htm', '.xhtml', '.php', '.phtml', '.svg', '.md', '.xml'])

const list = (text) => String(text ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)

export function activate(ctx) {
  let server = null
  let starting = false
  let projectRoot = ctx.events.last('project')?.root ?? ctx.workspace.root() ?? null
  let activePath = ctx.events.last('activeFile')?.path ?? null

  const text = (key, fallback = '') => {
    const value = ctx.settings.get(key)
    return value === undefined || value === null || value === '' ? fallback : String(value)
  }
  const flag = (key, fallback) => {
    const value = ctx.settings.get(key)
    if (value === undefined || value === null || value === '') return fallback
    return value === true || value === 'true'
  }

  const serveRoot = () => {
    if (!projectRoot) return null
    const sub = text('subfolder')
    return sub ? path.resolve(projectRoot, sub) : projectRoot
  }

  const baseUrl = () => `http://${server.host === '0.0.0.0' ? 'localhost' : server.host}:${server.port}`

  function updateStatusBar() {
    if (starting) {
      ctx.statusBar.set('live', { text: 'Live…', icon: 'loader', tooltip: 'Live Server', command: 'liveserver.toggle', priority: 50 })
      return
    }
    if (!server) {
      ctx.statusBar.set('live', { text: 'Go Live', icon: 'radio', tooltip: 'Live Server starten', command: 'liveserver.toggle', priority: 50 })
      return
    }
    ctx.statusBar.set('live', {
      text: `Port ${server.port}`, icon: 'radio-tower', tone: 'success', tooltip: `${baseUrl()} — klicken zum Stoppen`, command: 'liveserver.toggle', priority: 50,
    })
  }

  /** The address of a file below the served folder, or the site's root. */
  function urlFor(file) {
    const root = serveRoot()
    if (!server || !root) return null
    if (!file) return `${baseUrl()}/`
    const relative = path.relative(root, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null
    if (!PAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) return null
    const encoded = relative.split(path.sep).map(encodeURIComponent).join('/')
    return `${baseUrl()}/${encoded}`
  }

  async function start({ open = flag('openBrowser', true) } = {}) {
    if (server || starting) return
    const root = serveRoot()
    if (!root) {
      ctx.ui.notify('Live Server: Kein Projekt geöffnet.', 'warning')
      return
    }
    starting = true
    updateStatusBar()
    try {
      server = await startLiveServer({
        root,
        port: Number(text('port', '5500')) || 5500,
        host: text('host', '127.0.0.1'),
        liveReload: flag('liveReload', true),
        php: flag('php', true),
        phpPath: text('phpPath', 'php'),
        ignore: list(text('ignore', 'node_modules,.git,vendor,.idea,.vscode')),
        reloadOn: list(text('reloadOn', 'html,htm,php,js,mjs,json,svg,xml,md,txt,twig,phtml')).map((ext) => `.${ext.replace(/^\./, '').toLowerCase()}`),
        log: (line) => ctx.log(line),
      })
    } catch (err) {
      server = null
      ctx.ui.notify(`Live Server: ${err.message}`, 'error')
      return
    } finally {
      starting = false
      updateStatusBar()
    }
    const note = server.phpEnabled ? ' (mit PHP)' : ''
    ctx.ui.notify(`Live Server läuft auf ${baseUrl()}${note}`, 'success')
    if (open) await ctx.openExternal(urlFor(activePath) ?? `${baseUrl()}/`)
  }

  async function stop({ quiet = false } = {}) {
    if (!server) return
    const running = server
    server = null
    updateStatusBar()
    await running.stop().catch(() => {})
    if (!quiet) ctx.ui.notify('Live Server gestoppt', 'info')
  }

  async function openActive() {
    if (!server) await start({ open: false })
    if (!server) return
    const url = urlFor(activePath)
    if (!url) {
      ctx.ui.notify('Live Server: Die aktive Datei liegt nicht im bedienten Ordner oder ist keine Seite.', 'warning')
      return
    }
    await ctx.openExternal(url)
  }

  async function openRoot() {
    if (!server) await start({ open: false })
    if (server) await ctx.openExternal(`${baseUrl()}/`)
  }

  const commands = {
    'liveserver.toggle': () => (server ? stop() : start()),
    'liveserver.start': () => start(),
    'liveserver.stop': () => stop(),
    'liveserver.open': () => openActive(),
    'liveserver.open-root': () => openRoot(),
  }
  for (const [id, run] of Object.entries(commands)) ctx.commands.register(id, run)

  ctx.events.on('project', (event) => {
    if ((event.root ?? null) === projectRoot) return
    projectRoot = event.root ?? null
    // The server belongs to the folder it was started for.
    if (server) void stop({ quiet: true })
  })
  ctx.events.on('activeFile', (event) => { activePath = event.path ?? null })
  // The watcher does the work; a save in Lumen is the backup where watching is unreliable.
  ctx.events.on('fileSaved', (event) => server?.changed(event.path))

  updateStatusBar()

  return () => {
    void stop({ quiet: true })
    ctx.statusBar.set('live', null)
  }
}
