/**
 * Automatic updates from the CDN.
 *
 * `<FEED>/latest.json` describes, per platform, the current version and its
 * files, which lie under `<FEED>/<platform>/<file>`. Both are produced and
 * uploaded by `scripts/publish-cdn.mjs`.
 *
 * The packages are unsigned — Squirrel (electron-updater) refuses ad-hoc signed
 * bundles under macOS. Lumen therefore installs updates itself:
 *   - Linux:   put the new AppImage beside the running one and swap them
 *   - Windows: run the NSIS installer quietly (`--updated /S`)
 *   - macOS:   unpack the ZIP, swap Lumen.app once the program has quit
 * Other installations (development, an unpacked ZIP, translocation) get nothing
 * but a download link.
 */

import { app, ipcMain, net, shell, type BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import { once } from 'node:events'
import path from 'node:path'
import { relaunchApp } from './window-system'

const FEED = (process.env.LUMEN_UPDATE_URL ?? 'https://cdn.eztxm.de/download/lumen-ide/version/latest').replace(/\/+$/, '')
const FIRST_CHECK_MS = 20_000
const TICK_MS = 60 * 60 * 1000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const MANIFEST_TIMEOUT_MS = 15_000

/** The platform folders on the CDN, keyed by `<process.platform>-<process.arch>`. */
const PLATFORM_KEYS: Record<string, string> = {
  'linux-x64': 'linux_amd64',
  'linux-arm64': 'linux_aarch64',
  'darwin-arm64': 'macos_arm64',
  'win32-x64': 'windows_x86_64',
  'win32-arm64': 'windows_arm64',
}

export interface ManifestFile {
  name: string
  size: number
  /** Base64, as with electron-builder. */
  sha512: string
}

export interface PlatformRelease {
  version: string
  releaseDate: string
  /** The file the updater installs (an AppImage, a setup EXE, a ZIP). */
  update: ManifestFile | null
  files: ManifestFile[]
}

export interface Manifest {
  product: string
  version: string
  releaseDate: string
  notes?: string
  platforms: Record<string, PlatformRelease>
}

type InstallKind = 'appimage' | 'nsis' | 'mac-zip' | 'manual'

export interface UpdateState {
  status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'unsupported' | 'error'
  current: string
  version?: string
  notes?: string
  releaseDate?: string
  received?: number
  total?: number
  /** Can this installation install the update itself? */
  installable: boolean
  /** The file to download by hand. */
  downloadUrl?: string
  error?: string
  checkedAt?: number
}

let getWindow: () => BrowserWindow | null = () => null
let beforeQuit: () => void = () => {}
let state: UpdateState = { status: 'idle', current: app.getVersion(), installable: false }
let release: PlatformRelease | null = null
/** The file downloaded and checked (under macOS: the unpacked Lumen.app). */
let prepared: { version: string; file: string } | null = null
let busy: Promise<unknown> | null = null
let installing = false

function setState(next: Partial<UpdateState>) {
  state = { ...state, ...next }
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('updater:state', state)
}

export function platformKey(): string | null {
  return PLATFORM_KEYS[`${process.platform}-${process.arch}`] ?? null
}

/** `1.2.10` > `1.2.9`; a prerelease (`1.3.0-beta.1`) comes before its final version. */
export function compareVersions(a: string, b: string): number {
  const [coreA, preA = ''] = a.replace(/^v/, '').split('-', 2)
  const [coreB, preB = ''] = b.replace(/^v/, '').split('-', 2)
  const partsA = coreA.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const partsB = coreB.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  if (preA === preB) return 0
  if (!preA) return 1
  if (!preB) return -1
  return preA.localeCompare(preB, 'en', { numeric: true })
}

/* ------------------------------------------------------------------ *
 * The kind of installation
 * ------------------------------------------------------------------ */

function updatesDir() {
  return path.join(app.getPath('userData'), 'updates')
}

async function writable(dir: string) {
  try {
    await fs.access(dir, fsSync.constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** The Lumen.app the running process sits in. */
function macBundle() {
  return path.resolve(process.execPath, '..', '..', '..')
}

async function installKind(): Promise<InstallKind> {
  if (!app.isPackaged) return 'manual'
  if (process.platform === 'linux') return linuxKind()
  if (process.platform === 'win32') return windowsKind()
  if (process.platform === 'darwin') return macKind()
  return 'manual'
}

async function linuxKind(): Promise<InstallKind> {
  const appImage = process.env.APPIMAGE
  if (!appImage) return 'manual'
  if (!(await writable(path.dirname(appImage)))) return 'manual'
  return 'appimage'
}

async function windowsKind(): Promise<InstallKind> {
  const entries = await fs.readdir(path.dirname(process.execPath)).catch(() => [] as string[])
  if (!entries.some((name) => /^Uninstall .+\.exe$/i.test(name))) return 'manual'
  return 'nsis'
}

async function macKind(): Promise<InstallKind> {
  const bundle = macBundle()
  if (!bundle.endsWith('.app') || bundle.includes('/AppTranslocation/')) return 'manual'
  if (!(await writable(path.dirname(bundle)))) return 'manual'
  return 'mac-zip'
}

/* ------------------------------------------------------------------ *
 * Checking
 * ------------------------------------------------------------------ */

async function fetchManifest(): Promise<Manifest> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS)
  try {
    const response = await net.fetch(`${FEED}/latest.json?t=${Date.now()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': `Lumen-IDE/${app.getVersion()}`, 'Cache-Control': 'no-cache' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} for latest.json`)
    return (await response.json()) as Manifest
  } finally {
    clearTimeout(timer)
  }
}

function fileUrl(platform: string, file: ManifestFile) {
  return `${FEED}/${platform}/${encodeURIComponent(file.name)}`
}

async function check(): Promise<UpdateState> {
  const platform = platformKey()
  if (!platform) {
    setState({ status: 'unsupported', installable: false })
    return state
  }
  if (state.status === 'downloading' || state.status === 'ready') return state
  setState({ status: 'checking', error: undefined })
  try {
    const manifest = await fetchManifest()
    const entry = manifest.platforms?.[platform]
    const newer = entry && compareVersions(entry.version, app.getVersion()) > 0
    if (!entry || !newer) {
      release = null
      setState({ status: 'current', version: undefined, checkedAt: Date.now() })
      return state
    }
    release = entry
    const kind = await installKind()
    const main = entry.update ?? entry.files[0]
    setState({
      status: 'available',
      version: entry.version,
      releaseDate: entry.releaseDate,
      notes: manifest.version === entry.version ? manifest.notes : undefined,
      total: entry.update?.size,
      installable: kind !== 'manual' && Boolean(entry.update),
      downloadUrl: main ? fileUrl(platform, main) : undefined,
      checkedAt: Date.now(),
    })
    return state
  } catch (err) {
    setState({ status: 'error', error: errorText(err), checkedAt: Date.now() })
    return state
  }
}

function errorText(err: unknown) {
  if (err instanceof Error) return err.message
  return String(err)
}

/* ------------------------------------------------------------------ *
 * Downloading
 * ------------------------------------------------------------------ */

async function sha512Of(file: string) {
  const hash = crypto.createHash('sha512')
  for await (const chunk of fsSync.createReadStream(file)) hash.update(chunk as Buffer)
  return hash.digest('base64')
}

async function alreadyDownloaded(target: string, expected: ManifestFile) {
  const stat = await fs.stat(target).catch(() => null)
  if (!stat || stat.size !== expected.size) return false
  return (await sha512Of(target)) === expected.sha512
}

async function downloadTo(url: string, target: string, expected: ManifestFile) {
  const partial = `${target}.part`
  const response = await net.fetch(url, { headers: { 'User-Agent': `Lumen-IDE/${app.getVersion()}` } })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} for ${expected.name}`)

  const out = fsSync.createWriteStream(partial)
  const hash = crypto.createHash('sha512')
  const reader = response.body.getReader()
  let received = 0
  let lastEmit = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      received += value.byteLength
      if (!out.write(value)) await once(out, 'drain')
      if (Date.now() - lastEmit < 200) continue
      lastEmit = Date.now()
      setState({ received })
    }
    out.end()
    await once(out, 'close')
  } catch (err) {
    out.destroy()
    await fs.rm(partial, { force: true })
    throw err
  }

  if (received !== expected.size || hash.digest('base64') !== expected.sha512) {
    await fs.rm(partial, { force: true })
    throw new Error(`Checksum of ${expected.name} does not match`)
  }
  await fs.rename(partial, target)
}

/** Remove everything under `updates/` apart from `keep`. */
async function cleanUpdates(keep: string[]) {
  const entries = await fs.readdir(updatesDir()).catch(() => [] as string[])
  for (const name of entries) {
    if (keep.includes(name)) continue
    await fs.rm(path.join(updatesDir(), name), { recursive: true, force: true })
  }
}

async function download(): Promise<UpdateState> {
  const platform = platformKey()
  const entry = release
  if (!platform || !entry?.update || !state.installable) return state
  if (prepared?.version === entry.version) return state

  const file = entry.update
  const target = path.join(updatesDir(), file.name)
  setState({ status: 'downloading', received: 0, total: file.size, error: undefined })
  try {
    await fs.mkdir(updatesDir(), { recursive: true })
    const extracted = `mac-${entry.version}`
    await cleanUpdates([file.name, extracted])
    if (!(await alreadyDownloaded(target, file))) await downloadTo(fileUrl(platform, file), target, file)
    prepared = { version: entry.version, file: await prepare(target, extracted) }
    setState({ status: 'ready', received: file.size })
    return state
  } catch (err) {
    setState({ status: 'error', error: errorText(err) })
    return state
  }
}

/** Under macOS unpack the ZIP; otherwise the file is ready as it is. */
async function prepare(file: string, extractedName: string) {
  if (process.platform !== 'darwin') return file
  const dir = path.join(updatesDir(), extractedName)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  await run('/usr/bin/ditto', ['-x', '-k', file, dir])
  const bundle = (await fs.readdir(dir)).find((name) => name.endsWith('.app'))
  if (!bundle) throw new Error('The ZIP holds no .app bundle')
  return path.join(dir, bundle)
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${path.basename(command)} endete mit Code ${code}`))
    })
  })
}

/* ------------------------------------------------------------------ *
 * Installing
 * ------------------------------------------------------------------ */

/**
 * Install the update. `relaunch`: start Lumen afresh afterwards (otherwise
 * quietly in the background on quit).
 */
async function install(relaunch: boolean) {
  if (!prepared || installing) return false
  installing = true
  const kind = await installKind()
  try {
    if (kind === 'appimage') return await installAppImage(prepared.file, relaunch)
    if (kind === 'nsis') return installNsis(prepared.file, relaunch)
    if (kind === 'mac-zip') return installMac(prepared.file, relaunch)
    installing = false
    return false
  } catch (err) {
    installing = false
    setState({ status: 'error', error: errorText(err) })
    return false
  }
}

async function installAppImage(file: string, relaunch: boolean) {
  const current = process.env.APPIMAGE!
  const dir = path.dirname(current)
  // `Lumen-0.2.1-linux-x86_64.AppImage` takes the new name; a renamed one stays as it is.
  const versioned = path.basename(current).includes(app.getVersion())
  const target = versioned ? path.join(dir, path.basename(file)) : current
  const staging = path.join(dir, `.${path.basename(file)}.part`)
  await fs.copyFile(file, staging)
  await fs.chmod(staging, 0o755)
  // The running AppImage stays reachable through its mount even when the file is replaced.
  await fs.rename(staging, target)
  if (target !== current) await fs.rm(current, { force: true })
  await fs.rm(file, { force: true })
  if (!relaunch) return true
  beforeQuit()
  relaunchApp(process.argv.slice(1), target)
  return true
}

function installNsis(file: string, relaunch: boolean) {
  const args = ['--updated', '/S']
  if (relaunch) args.push('--force-run')
  spawn(file, args, { detached: true, stdio: 'ignore' }).unref()
  if (!relaunch) return true
  beforeQuit()
  app.quit()
  return true
}

/** Waits until Lumen has quit, swaps the bundle and starts it afresh on request. */
const MAC_SWAP_SCRIPT = `
while kill -0 "$1" 2>/dev/null; do sleep 0.3; done
rm -rf "$2.old"
mv "$2" "$2.old" || exit 1
if ! mv "$3" "$2"; then mv "$2.old" "$2"; exit 1; fi
rm -rf "$2.old"
xattr -dr com.apple.quarantine "$2" 2>/dev/null
if [ "$4" = 1 ]; then open "$2"; fi
`

function installMac(bundle: string, relaunch: boolean) {
  const args = ['-c', MAC_SWAP_SCRIPT, 'lumen-update', String(process.pid), macBundle(), bundle, relaunch ? '1' : '0']
  spawn('/bin/sh', args, { detached: true, stdio: 'ignore' }).unref()
  if (!relaunch) return true
  beforeQuit()
  app.quit()
  return true
}

/* ------------------------------------------------------------------ *
 * Automatic
 * ------------------------------------------------------------------ */

function autoUpdateEnabled() {
  try {
    const file = path.join(app.getPath('userData'), 'settings.json')
    const parsed = JSON.parse(fsSync.readFileSync(file, 'utf8')) as { effects?: { autoUpdate?: boolean } }
    return parsed.effects?.autoUpdate !== false
  } catch {
    return true
  }
}

/** One after another rather than in parallel: checking and loading share `release` and `state`. */
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const next = (busy ?? Promise.resolve()).catch(() => {}).then(task)
  busy = next
  return next
}

async function tick() {
  if (!app.isPackaged || !autoUpdateEnabled()) return
  if (state.checkedAt && Date.now() - state.checkedAt < CHECK_INTERVAL_MS && state.status !== 'error') return
  const result = await exclusive(check)
  if (result.status !== 'available' || !result.installable) return
  await exclusive(download)
}

export function registerUpdaterIpc(windowGetter: () => BrowserWindow | null, onBeforeQuit: () => void) {
  getWindow = windowGetter
  beforeQuit = onBeforeQuit

  ipcMain.handle('updater:state', () => state)
  ipcMain.handle('updater:check', () => exclusive(check))
  ipcMain.handle('updater:download', () => exclusive(download))
  ipcMain.handle('updater:install', () => install(true))
  ipcMain.handle('updater:openDownload', () => {
    if (!state.downloadUrl) return
    void shell.openExternal(state.downloadUrl)
  })

  setTimeout(() => void tick(), FIRST_CHECK_MS)
  setInterval(() => void tick(), TICK_MS).unref()

  // Quietly install an update already downloaded when quitting normally.
  app.on('will-quit', (event) => {
    if (state.status !== 'ready' || installing || !autoUpdateEnabled()) return
    event.preventDefault()
    void install(false).finally(() => app.quit())
  })
}
