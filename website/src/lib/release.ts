/**
 * The latest release, from the manifest the updater in Lumen reads too:
 * `version/latest/latest.json` on the CDN (written by scripts/publish-cdn.mjs).
 */

import { useEffect, useState } from 'react'
import snapshot from 'virtual:release-snapshot'

export const CDN_ROOT = 'https://cdn.eztxm.de/download/lumen-ide/version'
export const RELEASE_URL = `${CDN_ROOT}/latest/latest.json`

/** In development the CDN is reached through the Vite proxy — it sends no CORS headers. */
const FETCH_URL = import.meta.env.DEV ? '/__release/latest.json' : RELEASE_URL

export interface ReleaseFile {
  name: string
  size: number
  sha512: string
}

export interface PlatformRelease {
  version: string
  releaseDate: string
  update: ReleaseFile
  files: ReleaseFile[]
}

export type PlatformId = 'linux_amd64' | 'linux_aarch64' | 'macos_arm64' | 'windows_x86_64' | 'windows_arm64'

export interface Release {
  product: string
  version: string
  releaseDate: string
  notes?: string
  platforms: Partial<Record<PlatformId, PlatformRelease>>
}

export type Os = 'linux' | 'windows' | 'mac'

export interface PlatformInfo {
  id: PlatformId
  os: Os
  arch: string
  label: string
}

export const PLATFORMS: PlatformInfo[] = [
  { id: 'linux_amd64', os: 'linux', arch: 'x86-64', label: 'Linux x86-64' },
  { id: 'linux_aarch64', os: 'linux', arch: 'arm64', label: 'Linux arm64' },
  { id: 'windows_x86_64', os: 'windows', arch: 'x64', label: 'Windows x64' },
  { id: 'windows_arm64', os: 'windows', arch: 'arm64', label: 'Windows arm64' },
  { id: 'macos_arm64', os: 'mac', arch: 'Apple Silicon', label: 'macOS Apple Silicon' },
]

export function fileUrl(platform: PlatformId, file: ReleaseFile) {
  return `${CDN_ROOT}/latest/${platform}/${encodeURIComponent(file.name)}`
}

export function archiveUrl(version: string, platform: PlatformId, file: ReleaseFile) {
  return `${CDN_ROOT}/${version}/${platform}/${encodeURIComponent(file.name)}`
}

export function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** What kind of package a file is, from its name. */
export function fileKind(name: string) {
  if (name.endsWith('-setup.exe')) return 'Installer'
  if (name.endsWith('.AppImage')) return 'AppImage'
  if (name.endsWith('.dmg')) return 'Disk image'
  if (name.endsWith('.zip')) return 'Portable ZIP'
  return 'Package'
}

/** The visitor's system, from the user agent — a hint, never a filter. */
export function detectOs(): Os | null {
  const agent = (navigator.userAgent || '').toLowerCase()
  if (agent.includes('android') || agent.includes('iphone') || agent.includes('ipad')) return null
  if (agent.includes('win')) return 'windows'
  if (agent.includes('mac')) return 'mac'
  if (agent.includes('linux')) return 'linux'
  return null
}

function isRelease(value: unknown): value is Release {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Release>
  return typeof candidate.version === 'string' && typeof candidate.platforms === 'object'
}

export type ReleaseSource = 'live' | 'snapshot' | 'none'

interface ReleaseState {
  release: Release | null
  source: ReleaseSource
  loading: boolean
}

let cache: Promise<Release | null> | null = null

function fetchRelease() {
  cache ??= fetch(`${FETCH_URL}?t=${Math.floor(Date.now() / 60_000)}`, { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data: unknown) => (isRelease(data) ? data : null))
    .catch(() => null)
  return cache
}

const initial: ReleaseState = isRelease(snapshot)
  ? { release: snapshot, source: 'snapshot', loading: true }
  : { release: null, source: 'none', loading: true }

/** The build-time snapshot at once, the live manifest as soon as it arrives. */
export function useRelease(): ReleaseState {
  const [state, setState] = useState(initial)
  useEffect(() => {
    let alive = true
    void fetchRelease().then((live) => {
      if (!alive) return
      if (!live) {
        setState((s) => ({ ...s, loading: false }))
        return
      }
      setState({ release: live, source: 'live', loading: false })
    })
    return () => {
      alive = false
    }
  }, [])
  return state
}

/** The platform the one-click button offers for each system. */
const PRIMARY: Record<Os, PlatformId> = {
  linux: 'linux_amd64',
  windows: 'windows_x86_64',
  mac: 'macos_arm64',
}

export const OS_NAME: Record<Os, string> = { linux: 'Linux', windows: 'Windows', mac: 'macOS' }

/** The package the visitor most likely wants — the one the updater installs too. */
export function primaryDownload(release: Release | null, os: Os | null) {
  if (!release || !os) return null
  const platform = PRIMARY[os]
  const entry = release.platforms[platform]
  if (!entry) return null
  return { os, platform, file: entry.update, url: fileUrl(platform, entry.update) }
}
