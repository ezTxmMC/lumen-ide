/**
 * Local files for the non-text viewers (images, video, audio, PDF, fonts).
 *
 * The renderer never pulls big binaries through IPC as strings: the viewers
 * point `<img>`, `<video>`, `<iframe>` and `FontFace` at `lumen-file://`
 * URLs, which this module streams straight from disk — with byte ranges, so
 * videos can seek. Only files inside the open workspace folders, or ones the
 * user explicitly opened, are served; everything else is a 403, so content
 * shown in a viewer (an SVG, a PDF) cannot reach for arbitrary files.
 */

import { ipcMain, protocol, shell } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import {
  MEDIA_SCHEME, mimeTypeForPath, parseRange, pathFromMediaUrl,
} from '../../src/lib/media-kind'
import { workspaceFolders } from './workspace-roots'

/** How much of a file the hex viewer and the sniffing get to see at most. */
const MAX_HEAD_BYTES = 256 * 1024

// Must happen before the app is ready — hence at import time.
protocol.registerSchemesAsPrivileged([{
  scheme: MEDIA_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}])

/** Files opened explicitly (outside the workspace folders, say from a dialog or the session). */
const allowedFiles = new Set<string>()

function isInside(parent: string, target: string) {
  const rel = path.relative(parent, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function isServable(target: string): boolean {
  if (allowedFiles.has(target)) return true
  return workspaceFolders().some((root) => isInside(root, target))
}

/** Let the viewers show `file` although it lies outside the workspace. */
export function allowMediaFile(file: string) {
  if (!path.isAbsolute(file)) return
  allowedFiles.add(path.resolve(file))
}

async function serve(request: Request): Promise<Response> {
  const file = pathFromMediaUrl(request.url)
  if (!file || !path.isAbsolute(file)) return new Response('Bad request', { status: 400 })
  const target = path.resolve(file)
  if (!isServable(target)) return new Response('Forbidden', { status: 403 })

  const stat = await fsp.stat(target).catch(() => null)
  if (!stat?.isFile()) return new Response('Not found', { status: 404 })

  const headers = new Headers({
    'Content-Type': mimeTypeForPath(target),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    // Fonts load in CORS mode from the app's own origin (file:// or the dev server).
    'Access-Control-Allow-Origin': '*',
  })
  // An SVG opened as a document must not run scripts or load anything else.
  if (headers.get('Content-Type') === 'image/svg+xml') {
    headers.set('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:")
  }
  const range = parseRange(request.headers.get('Range'), stat.size)
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${stat.size}`)
    return new Response(null, { status: 416, headers })
  }
  if (request.method === 'HEAD') {
    headers.set('Content-Length', String(stat.size))
    return new Response(null, { status: 200, headers })
  }
  if (!range) {
    headers.set('Content-Length', String(stat.size))
    const body = Readable.toWeb(fs.createReadStream(target)) as ReadableStream<Uint8Array>
    return new Response(body, { status: 200, headers })
  }
  headers.set('Content-Length', String(range.end - range.start + 1))
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`)
  const body = Readable.toWeb(fs.createReadStream(target, { start: range.start, end: range.end })) as ReadableStream<Uint8Array>
  return new Response(body, { status: 206, headers })
}

export interface MediaInfo {
  size: number
  mtime: number
  /** The first bytes of the file — for sniffing and the hex view. */
  head: Uint8Array
}

async function inspect(file: string, headBytes: number): Promise<MediaInfo> {
  const target = path.resolve(file)
  const stat = await fsp.stat(target)
  if (!stat.isFile()) throw new Error('Not a file')
  const length = Math.max(0, Math.min(headBytes, MAX_HEAD_BYTES, stat.size))
  const handle = await fsp.open(target, 'r')
  try {
    const head = new Uint8Array(length)
    const { bytesRead } = await handle.read(head, 0, length, 0)
    return { size: stat.size, mtime: stat.mtimeMs, head: head.slice(0, bytesRead) }
  } finally {
    await handle.close()
  }
}

/** The scheme handler (after `app.whenReady`) and the viewers' IPC. */
export function registerMediaIpc() {
  protocol.handle(MEDIA_SCHEME, (request) =>
    serve(request).catch((err: Error) => new Response(err.message, { status: 500 })))

  /**
   * Size, time and the head of a file. Opening a file in a viewer goes
   * through here, which is also what lets the scheme serve it.
   */
  ipcMain.handle('media:inspect', (_e, file: string, headBytes = 4096) => {
    if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Not an absolute path')
    allowMediaFile(file)
    return inspect(file, Number(headBytes) || 0)
  })

  /** Open a file in the application the system associates with it. */
  ipcMain.handle('media:openWithSystem', async (_e, file: string) => {
    if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Not an absolute path')
    const error = await shell.openPath(file)
    if (error) throw new Error(error)
  })
}
