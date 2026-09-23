/**
 * Run a command and hand its output back as a whole — for discovery rather
 * than for the user: `gradle tasks --all`, say, whose report the project panel
 * turns into runnable tasks.
 *
 * Unlike the process runner in `main.ts`, nothing streams into the output
 * panel. The call is bounded: a timeout, a cap on the captured output, and a
 * working folder that has to be an existing absolute directory. No shell,
 * except on Windows where `.bat` wrappers (`gradlew.bat`) need one.
 */

import { ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 300_000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

export interface CaptureResult {
  /** Exit code; `null` when the process was killed (timeout). */
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

function checkArguments(command: unknown, args: unknown) {
  if (typeof command !== 'string' || !command.trim()) throw new Error('No command given')
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) throw new Error('Arguments must be strings')
}

async function checkDirectory(cwd: unknown): Promise<string> {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw new Error('The working folder must be an absolute path')
  const stat = await fs.stat(cwd).catch(() => null)
  if (!stat?.isDirectory()) throw new Error(`Not a folder: ${cwd}`)
  return cwd
}

/** A collector that stops keeping text beyond the cap. */
function collector() {
  const chunks: Buffer[] = []
  let size = 0
  return {
    push(chunk: Buffer) {
      if (size >= MAX_OUTPUT_BYTES) return
      chunks.push(chunk.subarray(0, MAX_OUTPUT_BYTES - size))
      size += chunk.length
    },
    text: () => Buffer.concat(chunks).toString('utf8'),
  }
}

async function capture(
  command: string, args: string[], cwd: string, env: Record<string, string> = {}, timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CaptureResult> {
  checkArguments(command, args)
  const dir = await checkDirectory(cwd)
  const extra: Record<string, string> = {}
  for (const [key, value] of Object.entries(env ?? {})) {
    if (typeof value === 'string') extra[key] = value
  }
  const limit = Math.min(Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS)

  return new Promise((resolve) => {
    const stdout = collector()
    const stderr = collector()
    let timedOut = false
    const child = spawn(command, args, {
      cwd: dir,
      env: { ...process.env, ...extra },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, limit)
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout: stdout.text(), stderr: `${stderr.text()}${err.message}\n`, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: stdout.text(), stderr: stderr.text(), timedOut })
    })
  })
}

export function registerCaptureIpc() {
  ipcMain.handle('run:capture', (
    _e, command: string, args: string[], cwd: string, env?: Record<string, string>, timeoutMs?: number,
  ) => capture(command, args, cwd, env, timeoutMs))
}
