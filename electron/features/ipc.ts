/** Shared helpers for the preload bridges. */

import { ipcRenderer, type IpcRendererEvent } from 'electron'

/**
 * `ipcRenderer.invoke` with readable errors: Electron puts
 * “Error invoking remote method '…': Error:” in front of every message — that
 * does not belong in a toast.
 */
export function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args).catch((err: Error) => {
    throw new Error(String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''))
  })
}

/** A typed subscriber; returns a function that unsubscribes. */
export function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}
