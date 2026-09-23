/**
 * Lumen's own per-project files — the project configuration, breakpoints,
 * launch configurations — live outside the project, so nothing of Lumen's
 * ends up in someone's repository:
 *
 *   ~/.lumen/projects/<folder name>-<hash of the path>/
 *     project.json       tasks, defaults, environment, preferred servers, open files
 *     breakpoints.json   breakpoints, watches, exception filters
 *     debug.json         launch configurations of your own
 *     location.json      which folder this belongs to (for people browsing the folder)
 *
 * Projects from older versions kept these in `<project>/.lumen/`. The first
 * time such a project opens, the files move over and the old folder is
 * removed once it is empty — files Lumen does not know stay where they are.
 */

import { ipcMain } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const PROJECTS_ROOT = path.join(os.homedir(), '.lumen', 'projects')

/** The files that used to live in `<project>/.lumen/`. */
const MIGRATED_FILES = ['project.json', 'breakpoints.json', 'debug.json']

/** Directories already prepared in this session. */
const prepared = new Map<string, Promise<string>>()

function slug(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 48) || 'project'
}

/** The data folder of a project root; the same root always maps to the same folder. */
export function projectDataDir(root: string): string {
  const resolved = path.resolve(root)
  const hash = crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 12)
  return path.join(PROJECTS_ROOT, `${slug(path.basename(resolved))}-${hash}`)
}

/** Is `target` inside the folder where project data lives? */
export function isProjectDataPath(target: string): boolean {
  const relative = path.relative(PROJECTS_ROOT, path.resolve(target))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const exists = (target: string) => fs.access(target).then(() => true, () => false)

/** Move `<root>/.lumen/*` over, without overwriting what is already there. */
async function migrate(root: string, dir: string) {
  const legacy = path.join(root, '.lumen')
  const stat = await fs.stat(legacy).catch(() => null)
  if (!stat?.isDirectory()) return
  for (const name of MIGRATED_FILES) {
    const source = path.join(legacy, name)
    if (!(await exists(source))) continue
    const target = path.join(dir, name)
    if (!(await exists(target))) await fs.copyFile(source, target)
    await fs.rm(source, { force: true })
  }
  const rest = await fs.readdir(legacy).catch(() => ['?'])
  if (rest.length === 0) await fs.rmdir(legacy).catch(() => {})
}

async function prepare(root: string): Promise<string> {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Project root must be an absolute path')
  const dir = projectDataDir(root)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'location.json'),
    `${JSON.stringify({ root: path.resolve(root), seenAt: new Date().toISOString() }, null, 2)}\n`,
  )
  await migrate(path.resolve(root), dir).catch((err: Error) => {
    console.error(`[lumen] moving ${root}/.lumen failed:`, err.message)
  })
  return dir
}

export function registerProjectDataIpc() {
  ipcMain.handle('projectData:dir', (_e, root: string) => {
    const known = prepared.get(root)
    if (known) return known
    const pending = prepare(root)
    prepared.set(root, pending)
    pending.catch(() => prepared.delete(root))
    return pending
  })
}
