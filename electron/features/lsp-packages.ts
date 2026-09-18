/**
 * Language servers in a closed environment.
 *
 * Every server Lumen installs lives under `~/.lumen/lsp`, and so does every
 * tool needed to install it — nothing goes to a global npm, pip or the system:
 *
 *   ~/.lumen/lsp/
 *     bin/                one launcher per server; checked before the PATH
 *     packages/<id>/      the servers themselves (npm prefix, GitHub release …)
 *     tools/node          Node.js, downloaded from nodejs.org
 *     tools/uv            uv, downloaded from GitHub — brings its own Python
 *     tools/python        the Pythons uv installs
 *     tools/go            Go, downloaded from go.dev
 *     cache/              npm, uv and Go caches
 *     packages.json       what is installed, and which launchers belong to it
 *
 * The renderer hands over the package description from the add-on; the paths
 * and the package id are derived here, and every name is checked before it
 * reaches a command line. Processes run without a shell.
 */

import { ipcMain, net, type BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import zlib from 'node:zlib'
import { download, extract, type Job } from './sdk'

/* ------------------------------------------------------------------ *
 * Types (mirrored in src/core/types.ts)
 * ------------------------------------------------------------------ */

/** `<platform>-<arch>` as Node names them: `linux-x64`, `darwin-arm64`, `win32-x64` … */
type PlatformKey = string

export type LspPackage =
  | { type: 'npm'; packages: string[]; bin?: string }
  | { type: 'pypi'; package: string; python?: string; with?: string[]; bin?: string }
  | { type: 'go'; module: string; bin?: string }
  | { type: 'dotnet'; package: string; bin?: string }
  | { type: 'github'; repo: string; assets: Record<PlatformKey, string>; bin?: string; version?: string; runtime?: 'python' | 'node' }
  | { type: 'archive'; url: string | Record<PlatformKey, string>; bin?: string; runtime?: 'python' | 'node' }

export interface InstalledPackage {
  id: string
  type: LspPackage['type']
  /** The launcher names under `bin/`. */
  bins: string[]
  installedAt: string
  version?: string
}

/* ------------------------------------------------------------------ *
 * Places
 * ------------------------------------------------------------------ */

const ROOT = path.join(os.homedir(), '.lumen', 'lsp')
const BIN = path.join(ROOT, 'bin')
const PACKAGES = path.join(ROOT, 'packages')
const TOOLS = path.join(ROOT, 'tools')
const CACHE = path.join(ROOT, 'cache')
const DOWNLOADS = path.join(ROOT, '.downloads')
const MANIFEST = path.join(ROOT, 'packages.json')
const IS_WINDOWS = process.platform === 'win32'
const EXE = IS_WINDOWS ? '.exe' : ''
const PLATFORM: PlatformKey = `${process.platform}-${process.arch}`
/** Python for `pypi` packages that do not say — uv downloads it where missing. */
const DEFAULT_PYTHON = '3.13'

/* ------------------------------------------------------------------ *
 * Checking what comes from the renderer
 * ------------------------------------------------------------------ */

const NPM_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~<>=*|-]+)?$/i
const PYPI_NAME = /^[A-Za-z0-9][\w.-]*(\[[\w,.-]+\])?([<>=!~]=?[\w.*+-]+(,[<>=!~]=?[\w.*+-]+)*)?$/
const GO_MODULE = /^[\w.-]+(\/[\w.-]+)+@[\w.+-]+$/
const DOTNET_NAME = /^[A-Za-z0-9][\w.-]*$/
const REPO = /^[\w.-]+\/[\w.-]+$/
const BIN_NAME = /^[\w.+-]+(\/[\w.+-]+)*$/
const PYTHON = /^\d+\.\d+$/
const COMMAND_NAME = /^[\w.+-]+$/

function check(value: unknown, pattern: RegExp, what: string): string {
  const text = String(value ?? '')
  if (!pattern.test(text) || text.includes('..')) throw new Error(`Invalid ${what}: ${text}`)
  return text
}

function slug(value: string) {
  return value.replace(/@[^/]*$/, '').replace(/^@/, '').replace(/[^\w.-]+/g, '-').toLowerCase()
}

/** The id — and with it the folder — of a package. */
function packageId(spec: LspPackage): string {
  if (spec.type === 'npm') return `npm-${slug(spec.packages[0])}`
  if (spec.type === 'pypi') return `pypi-${slug(spec.package.replace(/[[<>=!~].*$/, ''))}`
  if (spec.type === 'go') return `go-${slug(spec.module.split('/').slice(-2).join('-'))}`
  if (spec.type === 'dotnet') return `dotnet-${slug(spec.package)}`
  if (spec.type === 'github') return `github-${slug(spec.repo)}`
  return `archive-${slug(spec.bin ?? 'server')}`
}

/** The download address of an `archive` package for this platform. */
function archiveUrl(spec: Extract<LspPackage, { type: 'archive' }>): string {
  const url = typeof spec.url === 'string' ? spec.url : spec.url[PLATFORM]
  if (!url) throw new Error(`No download for ${PLATFORM}`)
  if (!/^https:\/\//.test(url)) throw new Error('Only HTTPS downloads are allowed')
  return url
}

function validate(spec: LspPackage, bin: string): LspPackage {
  check(bin, BIN_NAME, 'program name')
  if (spec.type === 'npm') {
    if (!Array.isArray(spec.packages) || !spec.packages.length) throw new Error('No npm package given')
    spec.packages.forEach((name) => check(name, NPM_NAME, 'npm package'))
    return spec
  }
  if (spec.type === 'pypi') {
    check(spec.package, PYPI_NAME, 'Python package')
    ;(spec.with ?? []).forEach((name) => check(name, PYPI_NAME, 'Python package'))
    if (spec.python) check(spec.python, PYTHON, 'Python version')
    return spec
  }
  if (spec.type === 'go') {
    check(spec.module, GO_MODULE, 'Go module')
    return spec
  }
  if (spec.type === 'dotnet') {
    check(spec.package, DOTNET_NAME, '.NET tool')
    return spec
  }
  if (spec.type === 'github') {
    check(spec.repo, REPO, 'repository')
    if (!spec.assets?.[PLATFORM]) throw new Error(`No download for ${PLATFORM}`)
    void new RegExp(spec.assets[PLATFORM])
    if (spec.version) check(spec.version, /^[\w.+-]+$/, 'version')
    return spec
  }
  if (spec.type === 'archive') {
    archiveUrl(spec)
    return spec
  }
  throw new Error(`Unknown package type: ${(spec as { type: string }).type}`)
}

/* ------------------------------------------------------------------ *
 * The record of what is installed
 * ------------------------------------------------------------------ */

async function readManifest(): Promise<Record<string, InstalledPackage>> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST, 'utf8')) as Record<string, InstalledPackage>
  } catch {
    return {}
  }
}

async function writeManifest(data: Record<string, InstalledPackage>) {
  await fs.mkdir(ROOT, { recursive: true })
  await fs.writeFile(MANIFEST, `${JSON.stringify(data, null, 2)}\n`)
}

async function record(id: string, type: LspPackage['type'], bin: string, version?: string) {
  const data = await readManifest()
  const bins = new Set(data[id]?.bins ?? [])
  bins.add(bin)
  data[id] = { id, type, bins: [...bins], installedAt: new Date().toISOString(), version }
  await writeManifest(data)
}

/* ------------------------------------------------------------------ *
 * Launchers
 * ------------------------------------------------------------------ */

const exists = (target: string) => fs.access(target).then(() => true, () => false)

/** The launcher of a server in `bin/`, if Lumen installed one. */
export async function managedCommand(command: string): Promise<string | null> {
  if (!BIN_NAME.test(command) || command.includes('/')) return null
  const names = IS_WINDOWS ? [`${command}.cmd`, `${command}.exe`, command] : [command]
  for (const name of names) {
    const file = path.join(BIN, name)
    if (await exists(file)) return file
  }
  return null
}

/** A launcher that starts `target`, through `runtime` where one is needed. */
async function writeLauncher(bin: string, target: string, runtime: string[] = [], env: Record<string, string> = {}) {
  await fs.mkdir(BIN, { recursive: true })
  const command = [...runtime, target]
  if (IS_WINDOWS) {
    const lines = ['@echo off', ...Object.entries(env).map(([key, value]) => `set "${key}=${value}"`)]
    lines.push(`${command.map((part) => `"${part}"`).join(' ')} %*`)
    await fs.writeFile(path.join(BIN, `${bin}.cmd`), `${lines.join('\r\n')}\r\n`)
    return
  }
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
  const lines = ['#!/bin/sh', ...Object.entries(env).map(([key, value]) => `export ${key}=${quote(value)}`)]
  lines.push(`exec ${command.map(quote).join(' ')} "$@"`)
  const file = path.join(BIN, bin)
  await fs.writeFile(file, `${lines.join('\n')}\n`)
  await fs.chmod(file, 0o755)
}

/* ------------------------------------------------------------------ *
 * Jobs, logging and processes
 * ------------------------------------------------------------------ */

type Log = (text: string) => void

const jobs = new Map<string, Job>()

/** Runs a program and passes every line of its output to the log. */
function run(job: Job, log: Log, command: string, args: string[], options: { env?: Record<string, string>; cwd?: string } = {}) {
  log(`$ ${path.basename(command)} ${args.join(' ')}`)
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    job.child = child
    let tail = ''
    const forward = (chunk: Buffer) => {
      const text = chunk.toString()
      tail = (tail + text).slice(-2000)
      for (const line of text.split(/\r?\n/)) {
        // uv's advice to extend the PATH does not apply: Lumen finds bin/ itself.
        if (!line.trim() || /is not on your PATH|update-shell/.test(line)) continue
        log(line)
      }
    }
    child.stdout?.on('data', forward)
    child.stderr?.on('data', forward)
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
      if (job.cancelled) {
        reject(new Error('Cancelled'))
        return
      }
      reject(new Error(`${path.basename(command)} exited with code ${code}`))
    })
  })
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await net.fetch(url, { signal, headers: { 'User-Agent': 'Lumen-IDE', Accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return (await response.json()) as T
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await net.fetch(url, { signal, headers: { 'User-Agent': 'Lumen-IDE' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return response.text()
}

function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Download with a checksum check (when one is known); returns the file. */
async function fetchFile(job: Job, log: Log, url: string, name: string, sha256 = ''): Promise<string> {
  await fs.mkdir(DOWNLOADS, { recursive: true })
  const file = path.join(DOWNLOADS, `${Date.now()}-${name.replace(/[^\w.-]/g, '_')}`)
  log(`↓ ${url}`)
  let step = 0
  const digest = await download(job, url, file, 'sha256', (received, total) => {
    if (!total) return
    const percent = Math.floor((received / total) * 4)
    if (percent <= step) return
    step = percent
    log(`  ${percent * 25} % of ${megabytes(total)}`)
  })
  if (sha256 && digest !== sha256.toLowerCase()) {
    await fs.rm(file, { force: true })
    throw new Error('Checksum does not match — the download is damaged')
  }
  if (sha256) log('  checksum verified')
  return file
}

/** Unpacks an archive, a gzipped program or a bare program into `target`. */
async function unpack(job: Job, file: string, name: string, target: string, bin: string) {
  await fs.rm(target, { recursive: true, force: true })
  await fs.mkdir(target, { recursive: true })
  if (/\.(zip|tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2)$/i.test(name)) {
    await extract(job, file, target)
    return
  }
  const program = path.join(target, `${path.basename(bin)}${EXE}`)
  if (/\.gz$/i.test(name)) {
    await pipeline(fsSync.createReadStream(file), zlib.createGunzip(), fsSync.createWriteStream(program))
    await fs.chmod(program, 0o755)
    return
  }
  await fs.copyFile(file, program)
  await fs.chmod(program, 0o755)
}

/** Looks for the program in an unpacked folder — releases often nest it (`clangd_18/bin/clangd`). */
async function findProgram(dir: string, bin: string, extensions: string[], depth = 0): Promise<string | null> {
  for (const ext of extensions) {
    const direct = path.join(dir, `${bin}${ext}`)
    const stat = await fs.stat(direct).catch(() => null)
    if (stat?.isFile()) return direct
  }
  if (depth >= 4) return null
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '__MACOSX') continue
    const hit = await findProgram(path.join(dir, entry.name), bin, extensions, depth + 1)
    if (hit) return hit
  }
  return null
}

/** The one program in a folder — for archives whose program name carries the platform (`lemminx-linux-x86_64`). */
async function onlyFile(dir: string): Promise<string | null> {
  const files: string[] = []
  const walk = async (current: string, depth: number) => {
    if (depth > 4 || files.length > 1) return
    for (const entry of await fs.readdir(current, { withFileTypes: true }).catch(() => [])) {
      if (entry.name === '__MACOSX') continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full, depth + 1)
      if (entry.isFile()) files.push(full)
    }
  }
  await walk(dir, 0)
  return files.length === 1 ? files[0] : null
}

/* ------------------------------------------------------------------ *
 * Toolchains
 * ------------------------------------------------------------------ */

/** Moves the single top folder of an unpacked archive (or the folder itself) to `target`. */
async function settle(staging: string, target: string) {
  const entries = (await fs.readdir(staging, { withFileTypes: true })).filter((entry) => entry.name !== '__MACOSX')
  const inner = entries.length === 1 && entries[0].isDirectory() ? path.join(staging, entries[0].name) : staging
  await fs.rm(target, { recursive: true, force: true })
  await fs.rename(inner, target)
  await fs.rm(staging, { recursive: true, force: true })
}

const NODE_DIR = path.join(TOOLS, 'node')
const nodeBinary = () => (IS_WINDOWS ? path.join(NODE_DIR, 'node.exe') : path.join(NODE_DIR, 'bin', 'node'))
const npmCli = () => (IS_WINDOWS
  ? path.join(NODE_DIR, 'node_modules', 'npm', 'bin', 'npm-cli.js')
  : path.join(NODE_DIR, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'))

/** Node.js (current LTS) from nodejs.org. */
async function ensureNode(job: Job, log: Log): Promise<string> {
  if (await exists(nodeBinary())) return nodeBinary()
  log('Node.js is not installed yet — fetching the current LTS')
  const index = await fetchJson<{ version: string; lts: string | false }[]>('https://nodejs.org/dist/index.json', job.controller.signal)
  const release = index.find((entry) => entry.lts)
  if (!release) throw new Error('No Node.js LTS release found')
  const os = { win32: 'win', darwin: 'darwin', linux: 'linux' }[process.platform as string]
  if (!os) throw new Error(`Node.js is not available for ${process.platform}`)
  const name = `node-${release.version}-${os}-${process.arch}.${IS_WINDOWS ? 'zip' : 'tar.gz'}`
  const base = `https://nodejs.org/dist/${release.version}`
  const sums = await fetchText(`${base}/SHASUMS256.txt`, job.controller.signal)
  const sha256 = sums.split('\n').find((line) => line.endsWith(`  ${name}`))?.split(/\s+/)[0] ?? ''
  const file = await fetchFile(job, log, `${base}/${name}`, name, sha256)
  const staging = path.join(TOOLS, '.node-staging')
  await fs.rm(staging, { recursive: true, force: true })
  await extract(job, file, staging)
  await settle(staging, NODE_DIR)
  await fs.rm(file, { force: true })
  log(`Node.js ${release.version} ready`)
  return nodeBinary()
}

const UV_DIR = path.join(TOOLS, 'uv')
const UV_TARGETS: Record<string, string> = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
}

/** uv from its GitHub releases — it installs Python itself where needed. */
async function ensureUv(job: Job, log: Log): Promise<string> {
  const binary = path.join(UV_DIR, `uv${EXE}`)
  if (await exists(binary)) return binary
  const target = UV_TARGETS[PLATFORM]
  if (!target) throw new Error(`uv is not available for ${PLATFORM}`)
  log('uv is not installed yet — fetching it')
  const name = `uv-${target}.${IS_WINDOWS ? 'zip' : 'tar.gz'}`
  const base = 'https://github.com/astral-sh/uv/releases/latest/download'
  const sha256 = (await fetchText(`${base}/${name}.sha256`, job.controller.signal).catch(() => '')).split(/\s+/)[0] ?? ''
  const file = await fetchFile(job, log, `${base}/${name}`, name, sha256)
  const staging = path.join(TOOLS, '.uv-staging')
  await fs.rm(staging, { recursive: true, force: true })
  await extract(job, file, staging)
  const found = await findProgram(staging, 'uv', [EXE])
  if (!found) throw new Error('uv was not found in the download')
  await fs.rm(UV_DIR, { recursive: true, force: true })
  await fs.mkdir(UV_DIR, { recursive: true })
  for (const program of ['uv', 'uvx']) {
    const source = path.join(path.dirname(found), `${program}${EXE}`)
    if (await exists(source)) await fs.rename(source, path.join(UV_DIR, `${program}${EXE}`))
  }
  await fs.rm(staging, { recursive: true, force: true })
  await fs.rm(file, { force: true })
  log('uv ready')
  return binary
}

/** Everything that keeps uv inside `~/.lumen/lsp`. */
function uvEnvironment(): Record<string, string> {
  return {
    UV_TOOL_DIR: path.join(PACKAGES, 'uv-tools'),
    UV_TOOL_BIN_DIR: BIN,
    UV_PYTHON_INSTALL_DIR: path.join(TOOLS, 'python'),
    // Otherwise `uv python install` puts a python3.x into ~/.local/bin.
    UV_PYTHON_BIN_DIR: path.join(TOOLS, 'python', 'bin'),
    UV_PYTHON_PREFERENCE: 'only-managed',
    UV_CACHE_DIR: path.join(CACHE, 'uv'),
    UV_NO_MODIFY_PATH: '1',
  }
}

const GO_DIR = path.join(TOOLS, 'go')

/** Go from go.dev — only needed for servers published as Go modules. */
async function ensureGo(job: Job, log: Log): Promise<string> {
  const binary = path.join(GO_DIR, 'bin', `go${EXE}`)
  if (await exists(binary)) return binary
  log('Go is not installed yet — fetching the current release')
  const releases = await fetchJson<{ version: string; stable: boolean; files: { filename: string; os: string; arch: string; sha256: string; kind: string }[] }[]>(
    'https://go.dev/dl/?mode=json', job.controller.signal)
  const release = releases.find((entry) => entry.stable)
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch as string]
  const os = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform as string]
  const file = release?.files.find((entry) => entry.kind === 'archive' && entry.os === os && entry.arch === arch)
  if (!release || !file) throw new Error(`Go is not available for ${PLATFORM}`)
  const archive = await fetchFile(job, log, `https://go.dev/dl/${file.filename}`, file.filename, file.sha256)
  const staging = path.join(TOOLS, '.go-staging')
  await fs.rm(staging, { recursive: true, force: true })
  await extract(job, archive, staging)
  await settle(staging, GO_DIR)
  await fs.rm(archive, { force: true })
  log(`${release.version} ready`)
  return binary
}

/** The .NET SDK is not downloaded — a C# setup brings it anyway, and the servers need it to run. */
async function findDotnet(): Promise<string> {
  const candidates = [process.env.DOTNET_ROOT, path.join(os.homedir(), '.dotnet'), '/usr/share/dotnet', '/usr/lib/dotnet', '/usr/local/share/dotnet', 'C:\\Program Files\\dotnet']
  for (const dir of candidates) {
    if (!dir) continue
    const file = path.join(dir, `dotnet${EXE}`)
    if (await exists(file)) return file
  }
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const file = path.join(dir, `dotnet${EXE}`)
    if (await exists(file)) return file
  }
  throw new Error('The .NET SDK is required for this server (https://dotnet.microsoft.com/download)')
}

/** The launcher prefix for a program that needs a runtime of its own. */
async function runtimeFor(job: Job, log: Log, runtime: 'python' | 'node' | undefined): Promise<{ command: string[]; env: Record<string, string> }> {
  if (runtime === 'node') return { command: [await ensureNode(job, log)], env: {} }
  if (runtime === 'python') {
    const uv = await ensureUv(job, log)
    const env = uvEnvironment()
    await run(job, log, uv, ['python', 'install', DEFAULT_PYTHON], { env })
    return { command: [uv, 'run', '--no-project', '--python', DEFAULT_PYTHON, '--', 'python'], env }
  }
  return { command: [], env: {} }
}

/* ------------------------------------------------------------------ *
 * Installing
 * ------------------------------------------------------------------ */

interface NpmPackageJson {
  bin?: string | Record<string, string>
  name?: string
}

/** The script behind an npm program name, from the `bin` field of the installed packages. */
async function npmScript(prefix: string, packages: string[], bin: string): Promise<string | null> {
  for (const spec of packages) {
    const name = spec.replace(/(?!^)@.*$/, '')
    const dir = path.join(prefix, 'node_modules', name)
    const json = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8').catch(() => '{}')) as NpmPackageJson
    if (typeof json.bin === 'string' && name.split('/').pop() === bin) return path.join(dir, json.bin)
    if (json.bin && typeof json.bin === 'object' && json.bin[bin]) return path.join(dir, json.bin[bin])
  }
  return null
}

async function installNpm(job: Job, log: Log, id: string, spec: Extract<LspPackage, { type: 'npm' }>, bin: string, command: string) {
  const node = await ensureNode(job, log)
  const prefix = path.join(PACKAGES, id)
  await fs.mkdir(prefix, { recursive: true })
  const env = {
    PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH ?? ''}`,
    npm_config_cache: path.join(CACHE, 'npm'),
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
  }
  await run(job, log, node, [npmCli(), 'install', '--prefix', prefix, '--omit=dev', ...spec.packages], { env, cwd: prefix })
  const script = await npmScript(prefix, spec.packages, bin)
  if (!script) throw new Error(`None of ${spec.packages.join(', ')} provides “${bin}”`)
  await writeLauncher(command, script, [node])
}

async function installPypi(job: Job, log: Log, spec: Extract<LspPackage, { type: 'pypi' }>, bin: string) {
  const uv = await ensureUv(job, log)
  const args = ['tool', 'install', '--force', '--python', spec.python ?? DEFAULT_PYTHON]
  for (const extra of spec.with ?? []) args.push('--with', extra)
  args.push(spec.package)
  await run(job, log, uv, args, { env: uvEnvironment() })
  if (!(await managedCommand(bin))) throw new Error(`${spec.package} provides no program “${bin}”`)
}

async function installGo(job: Job, log: Log, spec: Extract<LspPackage, { type: 'go' }>, bin: string) {
  const go = await ensureGo(job, log)
  await fs.mkdir(BIN, { recursive: true })
  const env = {
    GOBIN: BIN,
    GOPATH: path.join(PACKAGES, 'go'),
    GOCACHE: path.join(CACHE, 'go-build'),
    GOMODCACHE: path.join(CACHE, 'go-mod'),
    GOTOOLCHAIN: 'auto',
    GOFLAGS: '-modcacherw',
    GOTELEMETRY: 'off',
    // Go keeps its settings and telemetry under the config folder — keep them in here.
    XDG_CONFIG_HOME: path.join(CACHE, 'go-config'),
    APPDATA: path.join(CACHE, 'go-config'),
    PATH: `${path.dirname(go)}${path.delimiter}${process.env.PATH ?? ''}`,
  }
  await run(job, log, go, ['install', spec.module], { env })
  if (!(await managedCommand(bin))) throw new Error(`${spec.module} provides no program “${bin}”`)
}

async function installDotnet(job: Job, log: Log, spec: Extract<LspPackage, { type: 'dotnet' }>, bin: string) {
  const dotnet = await findDotnet()
  await fs.mkdir(BIN, { recursive: true })
  const env = { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', NUGET_PACKAGES: path.join(CACHE, 'nuget') }
  await run(job, log, dotnet, ['tool', 'uninstall', '--tool-path', BIN, spec.package], { env }).catch(() => {})
  await run(job, log, dotnet, ['tool', 'install', '--tool-path', BIN, spec.package], { env })
  if (!(await managedCommand(bin))) throw new Error(`${spec.package} provides no program “${bin}”`)
}

interface GithubRelease {
  tag_name: string
  assets: { name: string; browser_download_url: string; digest?: string | null }[]
}

async function installRelease(
  job: Job, log: Log, id: string, url: string, name: string, sha256: string,
  bin: string, command: string, runtime: 'python' | 'node' | undefined,
) {
  const file = await fetchFile(job, log, url, name, sha256)
  const target = path.join(PACKAGES, id)
  try {
    await unpack(job, file, name, target, bin)
  } finally {
    await fs.rm(file, { force: true })
  }
  const extensions = runtime || !IS_WINDOWS ? ['', '.cmd', '.bat', '.exe'] : ['.exe', '.cmd', '.bat', '']
  const program = await findProgram(target, bin, extensions) ?? await onlyFile(target)
  if (!program) throw new Error(`“${bin}” was not found in ${name}`)
  if (!IS_WINDOWS) await fs.chmod(program, 0o755)
  const launch = await runtimeFor(job, log, runtime)
  await writeLauncher(command, program, launch.command, launch.env)
}

async function installGithub(job: Job, log: Log, id: string, spec: Extract<LspPackage, { type: 'github' }>, bin: string, command: string): Promise<string> {
  const which = spec.version ? `tags/${spec.version}` : 'latest'
  const release = await fetchJson<GithubRelease>(`https://api.github.com/repos/${spec.repo}/releases/${which}`, job.controller.signal)
  const pattern = new RegExp(spec.assets[PLATFORM])
  const asset = release.assets.find((candidate) => pattern.test(candidate.name) && !/\.(sha\d+|sig|asc|txt)$/i.test(candidate.name))
  if (!asset) throw new Error(`${spec.repo} ${release.tag_name} has no download for ${PLATFORM}`)
  log(`${spec.repo} ${release.tag_name}: ${asset.name}`)
  const sha256 = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : ''
  await installRelease(job, log, id, asset.browser_download_url, asset.name, sha256, bin, command, spec.runtime)
  return release.tag_name
}

async function installArchive(job: Job, log: Log, id: string, spec: Extract<LspPackage, { type: 'archive' }>, bin: string, command: string) {
  const url = archiveUrl(spec)
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download')
  await installRelease(job, log, id, url, name, '', bin, command, spec.runtime)
}

async function install(
  jobId: string, raw: LspPackage, rawCommand: string, getWindow: () => BrowserWindow | null,
): Promise<string> {
  if (jobs.has(jobId)) throw new Error('An installation is already running')
  const command = check(rawCommand, COMMAND_NAME, 'command')
  const bin = String(raw?.bin ?? command)
  const spec = validate(raw, bin)
  const id = packageId(spec)
  const job: Job = { controller: new AbortController(), child: null, cancelled: false }
  jobs.set(jobId, job)
  const log: Log = (text) => getWindow()?.webContents.send('lspPackages:log', { jobId, text })
  try {
    await fs.mkdir(ROOT, { recursive: true })
    const version = await installBy(job, log, id, spec, bin, command)
    // Tools that write their own launcher name it after the program.
    const own = await managedCommand(command)
    const written = own ? null : await managedCommand(path.basename(bin))
    if (written) await writeLauncher(command, written)
    await record(id, spec.type, command, version)
    const launcher = await managedCommand(command)
    if (!launcher) throw new Error(`No launcher for “${command}” was created`)
    log(`✓ ${command} → ${launcher}`)
    return launcher
  } catch (err) {
    if (job.cancelled) throw new Error('Cancelled')
    throw err
  } finally {
    jobs.delete(jobId)
  }
}

async function installBy(job: Job, log: Log, id: string, spec: LspPackage, bin: string, command: string): Promise<string | undefined> {
  if (spec.type === 'npm') return installNpm(job, log, id, spec, bin, command).then(() => undefined)
  if (spec.type === 'pypi') return installPypi(job, log, spec, bin).then(() => undefined)
  if (spec.type === 'go') return installGo(job, log, spec, bin).then(() => undefined)
  if (spec.type === 'dotnet') return installDotnet(job, log, spec, bin).then(() => undefined)
  if (spec.type === 'github') return installGithub(job, log, id, spec, bin, command)
  return installArchive(job, log, id, spec, bin, command).then(() => undefined)
}

function cancel(jobId: string) {
  const job = jobs.get(jobId)
  if (!job) return false
  job.cancelled = true
  job.controller.abort()
  job.child?.kill()
  return true
}

/** Removes a server: its launchers, its folder and its entry. */
async function remove(command: string): Promise<boolean> {
  const data = await readManifest()
  const entry = Object.values(data).find((candidate) => candidate.bins.includes(command))
  if (!entry) return false
  for (const bin of entry.bins) {
    for (const name of [bin, `${bin}.cmd`, `${bin}.exe`]) await fs.rm(path.join(BIN, name), { force: true })
  }
  // uv keeps its environments in one shared folder, named after the package.
  const folder = entry.type === 'pypi'
    ? path.join(PACKAGES, 'uv-tools', entry.id.slice('pypi-'.length))
    : path.join(PACKAGES, entry.id)
  if (folder.startsWith(PACKAGES + path.sep)) await fs.rm(folder, { recursive: true, force: true })
  delete data[entry.id]
  await writeManifest(data)
  return true
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

export function registerLspPackageIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('lspPackages:install', (_e, jobId: string, spec: LspPackage, command: string) =>
    install(String(jobId), spec, command, getWindow))
  ipcMain.handle('lspPackages:cancel', (_e, jobId: string) => cancel(String(jobId)))
  ipcMain.handle('lspPackages:remove', (_e, command: string) => remove(String(command)))
  ipcMain.handle('lspPackages:list', async () => Object.values(await readManifest()))
  ipcMain.handle('lspPackages:platform', () => PLATFORM)
}
