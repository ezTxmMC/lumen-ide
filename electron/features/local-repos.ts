/**
 * Dependencies already present on the device.
 *
 * Maven and Gradle put every artefact they download into a local store.
 * Whatever stands there the project — or a neighbouring project — has already
 * used: exactly the names meant when adding a dependency, along with the
 * versions that resolve without a network.
 *
 * How the two stores are laid out:
 *   ~/.m2/repository/org/slf4j/slf4j-api/2.0.13/…
 *       The group sits in the path, dots being folders. A folder whose name
 *       begins with a digit is a version — its parent is the artefact and
 *       everything above that the group.
 *   ~/.gradle/caches/modules-2/files-2.1/org.slf4j/slf4j-api/2.0.13/…
 *       The same idea, but the group stands undivided in one folder; the three
 *       levels are therefore fixed.
 *
 * The search runs only on request and at most once per session: a well-filled
 * Maven store has tens of thousands of folders.
 */

import { ipcMain } from 'electron'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface LocalDependency {
  /** `group:artefact`, as it stands in `pom.xml` or `build.gradle`. */
  name: string
  /** The versions found, newest first. */
  versions: string[]
}

/** No artefact in either store lies deeper than this. */
const MAX_DEPTH = 9

/** An upper bound, so that a huge store blows neither time nor memory. */
const MAX_ARTIFACTS = 20000

/** A folder name that denotes a version. */
const VERSION_DIR = /^\d/

type Found = Map<string, Set<string>>

function record(found: Found, name: string, version: string) {
  if (found.size >= MAX_ARTIFACTS && !found.has(name)) return
  const versions = found.get(name) ?? new Set<string>()
  versions.add(version)
  found.set(name, versions)
}

async function readDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

/** Maven: descend until a version folder completes the find. */
async function scanMaven(dir: string, segments: string[], found: Found, depth: number) {
  if (depth > MAX_DEPTH || found.size >= MAX_ARTIFACTS) return
  const names = await readDirs(dir)
  const versions = names.filter((name) => VERSION_DIR.test(name))

  if (versions.length && segments.length >= 2) {
    const artifact = segments[segments.length - 1]
    const group = segments.slice(0, -1).join('.')
    for (const version of versions) record(found, `${group}:${artifact}`, version)
  }

  // Version folders hold nothing but files — the rest is followed further.
  await Promise.all(names
    .filter((name) => !VERSION_DIR.test(name))
    .map((name) => scanMaven(path.join(dir, name), [...segments, name], found, depth + 1)))
}

/** Gradle: group, artefact, version — three fixed levels. */
async function scanGradle(root: string, found: Found) {
  const groups = await readDirs(root)
  await Promise.all(groups.map(async (group) => {
    if (found.size >= MAX_ARTIFACTS) return
    const artifacts = await readDirs(path.join(root, group))
    await Promise.all(artifacts.map(async (artifact) => {
      const versions = await readDirs(path.join(root, group, artifact))
      for (const version of versions) record(found, `${group}:${artifact}`, version)
    }))
  }))
}

/** Versions descending: `2.0.13` before `2.0.9` before `1.7.36`. */
function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.split(/[.\-_+]/).map((piece) => (/^\d+$/.test(piece) ? Number(piece) : piece))
  const left = parts(a)
  const right = parts(b)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i]
    const y = right[i]
    if (x === undefined) return 1
    if (y === undefined) return -1
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return y - x
    return String(y) < String(x) ? -1 : 1
  }
  return 0
}

let cached: Promise<LocalDependency[]> | null = null

async function scan(): Promise<LocalDependency[]> {
  const home = os.homedir()
  const found: Found = new Map()
  await Promise.all([
    scanMaven(path.join(home, '.m2', 'repository'), [], found, 0),
    scanGradle(path.join(home, '.gradle', 'caches', 'modules-2', 'files-2.1'), found),
  ])
  return [...found.entries()]
    .map(([name, versions]) => ({ name, versions: [...versions].sort(compareVersions) }))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
}

export function registerLocalRepoIpc() {
  ipcMain.handle('deps:local', () => {
    if (!cached) cached = scan().catch(() => [])
    return cached
  })
  // After an installation the store may have changed.
  ipcMain.handle('deps:rescan', () => { cached = null })
}
