/**
 * SDK management in the main process: detecting JDKs, downloading them from the
 * foojay Disco API (streamed with progress, a checksum and cancelling),
 * unpacking them into `~/.lumen/jdks/<distribution>-<version>` and removing
 * them again.
 *
 * When installing, the renderer hands over nothing but foojay's package id —
 * the download address and the checksum the main process fetches itself, so
 * that no arbitrary address can be loaded or path written through IPC.
 */

import { app, ipcMain, net, shell, type BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, type Hash } from 'node:crypto'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DISCO = 'https://api.foojay.io/disco/v3.0'
const JDK_ROOT = path.join(os.homedir(), '.lumen', 'jdks')
const IS_WINDOWS = process.platform === 'win32'
const JAVA_EXE = IS_WINDOWS ? 'java.exe' : 'java'
const PROGRESS_INTERVAL_MS = 150
const HASH_TYPES = new Set(['sha1', 'sha256', 'sha512'])

/* ------------------------------------------------------------------ *
 * Types (mirrored in src/core/sdk/types.ts)
 * ------------------------------------------------------------------ */

export interface DetectedJdk {
  /** The resolved path (realpath) — it serves as the id. */
  home: string
  version: string
  major: number
  implementor: string
  implementorVersion: string
  arch: string
  /** Where the find came from: JAVA_HOME, PATH, /usr/lib/jvm … */
  sources: string[]
  /** Installed by Lumen (lies under ~/.lumen/jdks) — only these may be removed. */
  managed: boolean
  /** A runtime only, without javac. */
  jreOnly: boolean
  /** The distribution from Lumen's marker, where there is one. */
  distribution?: string
}

export type InstallPhase = 'resolve' | 'download' | 'verify' | 'extract' | 'done' | 'error' | 'cancelled'

export interface InstallProgress {
  jobId: string
  phase: InstallPhase
  received: number
  total: number
  /** Bytes per second (smoothed). */
  speed: number
  error?: string
  home?: string
  /** The checksum has been compared. */
  verified?: boolean
}

export interface InstallRequest {
  jobId: string
  kind: 'java'
  packageId: string
  distribution: string
  version: string
}

export interface SdkEnvironment {
  platform: string
  arch: string
  home: string
  /** The key of the PATH variable (often `Path` under Windows). */
  pathKey: string
  path: string
  delimiter: string
  jdkRoot: string
}

interface Job {
  controller: AbortController
  child: ChildProcess | null
  cancelled: boolean
}

const jobs = new Map<string, Job>()

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function isInside(parent: string, target: string) {
  const rel = path.relative(parent, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

const exists = (target: string) => fs.access(target).then(() => true, () => false)

/** Our own write access: only below ~/.lumen/jdks. */
function assertJdkPath(target: string) {
  if (isInside(JDK_ROOT, path.resolve(target))) return
  throw new Error('Path lies outside ~/.lumen/jdks')
}

/** A folder name from the distribution and the version, without special characters. */
function folderName(distribution: string, version: string) {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9._+-]+/g, '_').replace(/^[._]+/, '')
  return `${clean(distribution) || 'jdk'}-${clean(version) || 'unknown'}`
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  if (!/^https:\/\//.test(url)) throw new Error('Only HTTPS addresses are allowed')
  const response = await net.fetch(url, { signal, headers: { 'User-Agent': 'Lumen-IDE' } })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response.text()
}

function environment(): SdkEnvironment {
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
  return {
    platform: process.platform,
    arch: process.arch,
    home: os.homedir(),
    pathKey,
    path: process.env[pathKey] ?? '',
    delimiter: path.delimiter,
    jdkRoot: JDK_ROOT,
  }
}

/* ------------------------------------------------------------------ *
 * Settings (userData/sdk.json)
 * ------------------------------------------------------------------ */

const settingsFile = () => path.join(app.getPath('userData'), 'sdk.json')

async function loadSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}

async function saveSettings(data: Record<string, unknown>) {
  await fs.mkdir(path.dirname(settingsFile()), { recursive: true })
  await fs.writeFile(settingsFile(), JSON.stringify(data, null, 2), 'utf8')
}

/* ------------------------------------------------------------------ *
 * Detection
 * ------------------------------------------------------------------ */

/** The `KEY="value"` lines of the `release` file. */
function parseRelease(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=\"?(.*?)\"?\s*$/.exec(line)
    if (match) out[match[1]] = match[2]
  }
  return out
}

/** `1.8.0_392` → 8, `21.0.2` → 21, `25` → 25. */
function majorOf(version: string): number {
  const legacy = /^1\.(\d+)/.exec(version)
  if (legacy) return Number(legacy[1])
  const modern = /^(\d+)/.exec(version)
  return modern ? Number(modern[1]) : 0
}

/** Is `dir` the root of a JDK (bin/java present)? Checks macOS bundles too. */
async function javaHomeIn(dir: string): Promise<string | null> {
  const variants = [dir, path.join(dir, 'Contents', 'Home'), path.join(dir, 'libexec', 'openjdk.jdk', 'Contents', 'Home')]
  for (const variant of variants) {
    if (await exists(path.join(variant, 'bin', JAVA_EXE))) return variant
  }
  return null
}

async function subdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.'))
      .map((e) => path.join(dir, e.name))
  } catch {
    return []
  }
}

/** The children of a collecting folder — one level deeper where the child is not a JDK itself (Gradle, archives). */
async function scanCollection(root: string, match?: RegExp): Promise<string[]> {
  const homes: string[] = []
  for (const child of await subdirectories(root)) {
    if (match && !match.test(path.basename(child))) continue
    const direct = await javaHomeIn(child)
    if (direct) {
      homes.push(direct)
      continue
    }
    for (const grandchild of await subdirectories(child)) {
      const nested = await javaHomeIn(grandchild)
      if (nested) homes.push(nested)
    }
  }
  return homes
}

interface CollectionRoot {
  dir: string
  label: string
  /** Check only children whose name fits (Homebrew has hundreds of formulae). */
  match?: RegExp
}

function collectionRoots(): CollectionRoot[] {
  const home = os.homedir()
  const common = [
    { dir: JDK_ROOT, label: 'Lumen' },
    { dir: path.join(home, '.sdkman', 'candidates', 'java'), label: 'SDKMAN!' },
    { dir: path.join(home, '.jdks'), label: 'IntelliJ' },
    { dir: path.join(home, '.gradle', 'jdks'), label: 'Gradle' },
    { dir: path.join(home, '.asdf', 'installs', 'java'), label: 'asdf' },
    { dir: path.join(home, '.local', 'share', 'mise', 'installs', 'java'), label: 'mise' },
    { dir: path.join(home, '.jbang', 'cache', 'jdks'), label: 'JBang' },
  ]
  if (IS_WINDOWS) {
    const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432]
      .filter((dir): dir is string => Boolean(dir))
    const vendors = ['Java', 'Eclipse Adoptium', 'Amazon Corretto', 'Zulu', 'Microsoft', 'BellSoft', 'SapMachine', 'Semeru', 'OpenJDK']
    return [
      ...common,
      ...programFiles.flatMap((base) => vendors.map((vendor) => ({ dir: path.join(base, vendor), label: vendor }))),
    ]
  }
  if (process.platform === 'darwin') {
    return [
      ...common,
      { dir: '/Library/Java/JavaVirtualMachines', label: 'macOS' },
      { dir: path.join(home, 'Library', 'Java', 'JavaVirtualMachines'), label: 'macOS' },
      { dir: '/opt/homebrew/opt', label: 'Homebrew', match: /openjdk/ },
      { dir: '/usr/local/opt', label: 'Homebrew', match: /openjdk/ },
    ]
  }
  return [
    ...common,
    { dir: '/usr/lib/jvm', label: '/usr/lib/jvm' },
    { dir: '/usr/lib64/jvm', label: '/usr/lib64/jvm' },
    { dir: '/usr/java', label: '/usr/java' },
    { dir: '/opt', label: '/opt' },
    { dir: '/opt/java', label: '/opt/java' },
  ]
}

/** `java` from the PATH → the root of a JDK (symlinks resolved, Java 8's `jre` skipped). */
async function homesFromPath(): Promise<string[]> {
  const env = environment()
  const homes: string[] = []
  for (const dir of env.path.split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, JAVA_EXE)
    const real = await fs.realpath(candidate).catch(() => null)
    if (!real) continue
    const home = path.dirname(path.dirname(real))
    homes.push(path.basename(home) === 'jre' ? path.dirname(home) : home)
  }
  return homes
}

async function describeJdk(home: string): Promise<Omit<DetectedJdk, 'sources'> | null> {
  if (!(await exists(path.join(home, 'bin', JAVA_EXE)))) return null
  const release = parseRelease(await fs.readFile(path.join(home, 'release'), 'utf8').catch(() => ''))
  const fromName = /(\d+(?:\.\d+)*)/.exec(path.basename(home))?.[1] ?? ''
  const version = release.JAVA_VERSION || fromName
  const marker = await fs.readFile(path.join(home, '.lumen-sdk.json'), 'utf8')
    .then((text) => JSON.parse(text) as { distribution?: string })
    .catch(() => null)
  return {
    home,
    version,
    major: majorOf(version),
    implementor: release.IMPLEMENTOR ?? '',
    implementorVersion: release.IMPLEMENTOR_VERSION ?? '',
    arch: release.OS_ARCH ?? '',
    managed: isInside(JDK_ROOT, home),
    jreOnly: !(await exists(path.join(home, 'bin', IS_WINDOWS ? 'javac.exe' : 'javac'))),
    distribution: marker?.distribution,
  }
}

async function detectJava(): Promise<DetectedJdk[]> {
  const found: { home: string; source: string }[] = []
  if (process.env.JAVA_HOME) found.push({ home: process.env.JAVA_HOME, source: 'JAVA_HOME' })
  for (const home of await homesFromPath()) found.push({ home, source: 'PATH' })
  for (const root of collectionRoots()) {
    for (const home of await scanCollection(root.dir, root.match)) found.push({ home, source: root.label })
  }

  const byHome = new Map<string, DetectedJdk>()
  for (const { home, source } of found) {
    const real = await fs.realpath(home).catch(() => null)
    if (!real) continue
    const known = byHome.get(real)
    if (known) {
      if (!known.sources.includes(source)) known.sources.push(source)
      continue
    }
    const info = await describeJdk(real)
    if (!info) continue
    byHome.set(real, { ...info, sources: [source] })
  }
  return [...byHome.values()].sort((a, b) => b.major - a.major || b.version.localeCompare(a.version, 'en', { numeric: true }))
}

/* ------------------------------------------------------------------ *
 * Installing
 * ------------------------------------------------------------------ */

interface PackageInfo {
  filename: string
  direct_download_uri: string
  checksum_uri: string
  checksum: string
  checksum_type: string
}

/** The download address and the checksum of a foojay package. */
async function resolvePackage(packageId: string, signal: AbortSignal): Promise<PackageInfo & { expected: string }> {
  if (!/^[a-f0-9]{16,64}$/i.test(packageId)) throw new Error('Invalid package id')
  const response = JSON.parse(await fetchText(`${DISCO}/ids/${packageId}`, signal)) as { result?: PackageInfo[] }
  const info = response.result?.[0]
  if (!info?.direct_download_uri) throw new Error('The package has no download address')
  const type = (info.checksum_type || 'sha256').toLowerCase()
  if (info.checksum) return { ...info, checksum_type: type, expected: info.checksum.toLowerCase() }
  if (!info.checksum_uri || !HASH_TYPES.has(type)) return { ...info, checksum_type: type, expected: '' }
  // Checksum files hold “<hex>  <file>” or the hex value alone.
  const text = await fetchText(info.checksum_uri, signal).catch(() => '')
  const expected = /\b([a-f0-9]{40,128})\b/i.exec(text)?.[1]?.toLowerCase() ?? ''
  return { ...info, checksum_type: type, expected }
}

function archiveKind(filename: string): 'zip' | 'tar.gz' | 'tar' {
  if (/\.zip$/i.test(filename)) return 'zip'
  if (/\.(tar\.gz|tgz)$/i.test(filename)) return 'tar.gz'
  return 'tar'
}

/** Runs an unpacking program; remembers the process so it can be cancelled. */
function runTool(job: Job, command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    job.child = child
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (err) => {
      job.child = null
      reject(err)
    })
    child.on('close', (code) => {
      job.child = null
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim().split('\n').pop() || `${command} endete mit Code ${code}`))
    })
  })
}

async function extract(job: Job, archive: string, target: string) {
  await fs.mkdir(target, { recursive: true })
  const kind = archiveKind(archive)
  if (kind === 'tar.gz') {
    await runTool(job, 'tar', ['-xzf', archive, '-C', target])
    return
  }
  if (kind === 'tar') {
    await runTool(job, 'tar', ['-xf', archive, '-C', target])
    return
  }
  if (!IS_WINDOWS) {
    await runTool(job, 'unzip', ['-q', '-o', archive, '-d', target])
    return
  }
  // Windows 10+ brings bsdtar along, which handles ZIP too; otherwise PowerShell.
  try {
    await runTool(job, 'tar', ['-xf', archive, '-C', target])
  } catch (err) {
    if (job.cancelled) throw err
    const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
    await runTool(job, 'powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(target)} -Force`,
    ])
  }
}

/** Finds the actual root of the JDK in the unpacked folder (nested folders, macOS `Contents/Home`). */
async function findExtractedHome(dir: string, depth = 0): Promise<string | null> {
  const direct = await javaHomeIn(dir)
  if (direct) return direct
  if (depth >= 3) return null
  for (const child of await subdirectories(dir)) {
    if (path.basename(child) === '__MACOSX') continue
    const hit = await findExtractedHome(child, depth + 1)
    if (hit) return hit
  }
  return null
}

async function download(
  job: Job, url: string, file: string, hashType: string,
  report: (received: number, total: number, speed: number) => void,
): Promise<string> {
  if (!/^https:\/\//.test(url)) throw new Error('Only HTTPS downloads are allowed')
  const response = await net.fetch(url, { signal: job.controller.signal, headers: { 'User-Agent': 'Lumen-IDE' } })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} while downloading`)
  const total = Number(response.headers.get('content-length') ?? 0)
  const hash: Hash | null = HASH_TYPES.has(hashType) ? createHash(hashType) : null
  const out = fsSync.createWriteStream(file)
  const reader = response.body.getReader()
  let received = 0
  let lastReport = 0
  let lastBytes = 0
  let speed = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      hash?.update(value)
      if (!out.write(value)) await once(out, 'drain')
      const now = Date.now()
      if (now - lastReport < PROGRESS_INTERVAL_MS) continue
      const current = ((received - lastBytes) * 1000) / Math.max(1, now - lastReport)
      speed = speed ? speed * 0.7 + current * 0.3 : current
      lastReport = now
      lastBytes = received
      report(received, total, speed)
    }
    out.end()
    await once(out, 'finish')
  } catch (err) {
    out.destroy()
    throw err
  }
  report(received, total || received, speed)
  return hash ? hash.digest('hex') : ''
}

async function install(request: InstallRequest, getWindow: () => BrowserWindow | null): Promise<string> {
  if (request.kind !== 'java') throw new Error(`Unbekannte SDK-Art: ${request.kind}`)
  if (jobs.has(request.jobId)) throw new Error('An installation is already running')

  const job: Job = { controller: new AbortController(), child: null, cancelled: false }
  jobs.set(request.jobId, job)
  const target = path.join(JDK_ROOT, folderName(request.distribution, request.version))
  const downloads = path.join(JDK_ROOT, '.downloads')
  const staging = path.join(JDK_ROOT, `.extract-${request.jobId.replace(/[^A-Za-z0-9_-]/g, '')}`)
  let archive = ''
  let state: InstallProgress = { jobId: request.jobId, phase: 'resolve', received: 0, total: 0, speed: 0 }
  const send = (patch: Partial<InstallProgress>) => {
    state = { ...state, ...patch }
    getWindow()?.webContents.send('sdk:progress', state)
  }

  try {
    send({})
    if (await exists(target)) throw new Error(`Already installed: ${target}`)
    const info = await resolvePackage(request.packageId, job.controller.signal)
    await fs.mkdir(downloads, { recursive: true })
    archive = path.join(downloads, `${request.jobId.replace(/[^A-Za-z0-9_-]/g, '')}-${path.basename(info.filename)}`)
    assertJdkPath(archive)

    send({ phase: 'download' })
    const digest = await download(job, info.direct_download_uri, archive, info.checksum_type, (received, total, speed) =>
      send({ received, total, speed }))

    send({ phase: 'verify', speed: 0 })
    const verified = Boolean(info.expected && digest)
    if (verified && digest !== info.expected) throw new Error('Checksum does not match — the download is damaged')

    send({ phase: 'extract', verified })
    await fs.rm(staging, { recursive: true, force: true })
    await extract(job, archive, staging)
    const home = await findExtractedHome(staging)
    if (!home) throw new Error('No JDK found in the archive (bin/java is missing)')
    await fs.rename(home, target)
    await fs.writeFile(path.join(target, '.lumen-sdk.json'), JSON.stringify({
      distribution: request.distribution,
      version: request.version,
      packageId: request.packageId,
      installedAt: new Date().toISOString(),
    }, null, 2)).catch(() => {})

    send({ phase: 'done', home: target })
    return target
  } catch (err) {
    const cancelled = job.cancelled
    send({ phase: cancelled ? 'cancelled' : 'error', error: cancelled ? undefined : (err as Error).message, speed: 0 })
    if (cancelled) throw new Error('Abgebrochen')
    throw err
  } finally {
    jobs.delete(request.jobId)
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
    if (archive) await fs.rm(archive, { force: true }).catch(() => {})
  }
}

function cancel(jobId: string) {
  const job = jobs.get(jobId)
  if (!job) return false
  job.cancelled = true
  job.controller.abort()
  job.child?.kill()
  return true
}

/** Removes a Lumen installation — to the wastebasket first, otherwise for good. */
async function remove(home: string) {
  const real = await fs.realpath(home)
  assertJdkPath(real)
  try {
    await shell.trashItem(real)
  } catch {
    await fs.rm(real, { recursive: true, force: true })
  }
  return true
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

export function registerSdkIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('sdk:environment', () => environment())
  ipcMain.handle('sdk:settings:load', () => loadSettings())
  ipcMain.handle('sdk:settings:save', (_e, data: Record<string, unknown>) => saveSettings(data))
  ipcMain.handle('sdk:detect', (_e, kind: string) => {
    if (kind !== 'java') return []
    return detectJava()
  })
  ipcMain.handle('sdk:install', (_e, request: InstallRequest) => install(request, getWindow))
  ipcMain.handle('sdk:cancel', (_e, jobId: string) => cancel(jobId))
  ipcMain.handle('sdk:remove', (_e, home: string) => remove(home))

  app.on('before-quit', () => {
    for (const jobId of [...jobs.keys()]) cancel(jobId)
  })
}
