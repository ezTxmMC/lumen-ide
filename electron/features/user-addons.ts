/**
 * The user's own add-ons (created in the add-on studio) — the main process.
 *
 * Every file lies under `userData/addons/<id>.lumen-addon.json`. The renderer
 * names nothing but the id; paths are built and checked by this file alone.
 * Import and export run through their own file dialogs. Along with that, a
 * shell call with its output gathered, for the node “Run a shell command”.
 */

import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const EXTENSION = '.lumen-addon.json'
/** `user.` from the add-on studio, `ext.` from an extension server. */
const ID_PATTERN = /^(?:user|ext)\.[a-z0-9][a-z0-9._-]*$/
const MAX_ADDON_BYTES = 4 * 1024 * 1024
const MAX_OUTPUT = 512 * 1024
const SHELL_TIMEOUT_MS = 60_000

export interface StoredUserAddon {
  file: string
  /** The parsed JSON, or `null` when it could not be read. */
  data: unknown
  error?: string
}

export interface ShellExecResult {
  code: number
  stdout: string
  stderr: string
}

const addonsDir = () => path.join(app.getPath('userData'), 'addons')

/** The path of an add-on file — valid ids only, and only inside the folder. */
function addonFile(id: string): string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error(`Invalid add-on id: ${id}`)
  const dir = addonsDir()
  const file = path.join(dir, `${id}${EXTENSION}`)
  const rel = path.relative(dir, file)
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) throw new Error('Path outside the add-on folder')
  return file
}

async function listAddons(): Promise<StoredUserAddon[]> {
  const dir = addonsDir()
  await fs.mkdir(dir, { recursive: true })
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith(EXTENSION)).sort()
  const out: StoredUserAddon[] = []
  for (const name of names) {
    const file = path.join(dir, name)
    try {
      const stat = await fs.stat(file)
      if (stat.size > MAX_ADDON_BYTES) throw new Error('File is too large')
      out.push({ file: name, data: JSON.parse(await fs.readFile(file, 'utf8')) })
    } catch (err) {
      out.push({ file: name, data: null, error: (err as Error).message })
    }
  }
  return out
}

async function saveAddon(id: string, content: string) {
  if (typeof content !== 'string' || content.length > MAX_ADDON_BYTES) throw new Error('Contents invalid or too large')
  JSON.parse(content)
  const file = addonFile(id)
  await fs.mkdir(path.dirname(file), { recursive: true })
  // Write to a neighbouring file first, then rename — never half a file.
  const temp = `${file}.tmp`
  await fs.writeFile(temp, content, 'utf8')
  await fs.rename(temp, file)
  return true
}

async function removeAddon(id: string) {
  await fs.rm(addonFile(id), { force: true })
  return true
}

/** A shell command with its output gathered (a time limit, a size limit). */
function execShell(command: string, cwd: string | null): Promise<ShellExecResult> {
  return new Promise((resolve) => {
    if (typeof command !== 'string' || !command.trim()) {
      resolve({ code: -1, stdout: '', stderr: 'Leerer Befehl' })
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }
    const child = spawn(command, {
      cwd: cwd || os.homedir(),
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    const timer = setTimeout(() => {
      stderr += `\nZeitlimit von ${SHELL_TIMEOUT_MS / 1000} s überschritten`
      child.kill('SIGTERM')
      finish(-1)
    }, SHELL_TIMEOUT_MS)
    child.stdout?.on('data', (d: Buffer) => { stdout = (stdout + d.toString()).slice(-MAX_OUTPUT) })
    child.stderr?.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-MAX_OUTPUT) })
    child.on('error', (err) => {
      stderr += err.message
      finish(-1)
    })
    child.on('close', (code) => finish(code ?? -1))
  })
}

export function registerUserAddonIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('userAddons:dir', () => addonsDir())
  ipcMain.handle('userAddons:list', () => listAddons())
  ipcMain.handle('userAddons:save', (_e, id: string, content: string) => saveAddon(id, content))
  ipcMain.handle('userAddons:remove', (_e, id: string) => removeAddon(id))

  ipcMain.handle('userAddons:import', async () => {
    const win = getWindow()
    const options = {
      properties: ['openFile' as const],
      filters: [{ name: 'Lumen Add-on', extensions: ['json'] }],
    }
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const file = res.filePaths[0]
    if (res.canceled || !file) return null
    const stat = await fs.stat(file)
    if (stat.size > MAX_ADDON_BYTES) throw new Error('File is too large')
    return { name: path.basename(file), content: await fs.readFile(file, 'utf8') }
  })

  ipcMain.handle('userAddons:export', async (_e, suggested: string, content: string) => {
    if (typeof content !== 'string' || content.length > MAX_ADDON_BYTES) throw new Error('Contents invalid or too large')
    const win = getWindow()
    const options = {
      defaultPath: path.join(app.getPath('documents'), path.basename(String(suggested || `addon${EXTENSION}`))),
      filters: [{ name: 'Lumen Add-on', extensions: ['json'] }],
    }
    const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return null
    await fs.writeFile(res.filePath, content, 'utf8')
    return res.filePath
  })

  ipcMain.handle('userAddons:exec', (_e, command: string, cwd: string | null) => execShell(command, cwd))
}
