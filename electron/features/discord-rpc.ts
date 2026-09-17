/**
 * Discord rich presence in the main process: the IPC channels for the add-on
 * `tool.discord`. The protocol itself sits in `./discord-ipc`.
 */

import { ipcMain, type BrowserWindow } from 'electron'
import { DiscordIpcClient, sanitizeActivity, type DiscordStatus } from './discord-ipc'

let client: DiscordIpcClient | null = null

export function registerDiscordIpc(getWindow: () => BrowserWindow | null) {
  client = new DiscordIpcClient({
    onStatus(status: DiscordStatus) {
      const win = getWindow()
      if (!win || win.isDestroyed()) return
      win.webContents.send('discord:status', status)
    },
  })
  const rpc = client

  // `activity` null means clear the display and close the connection.
  ipcMain.handle('discord:set', (_event, clientId: unknown, activity: unknown) => {
    const id = typeof clientId === 'string' && /^\d{1,32}$/.test(clientId.trim()) ? clientId : ''
    rpc.update(id, activity === null ? null : sanitizeActivity(activity))
    return rpc.status()
  })
  ipcMain.handle('discord:status', () => rpc.status())
  ipcMain.handle('discord:reconnect', () => {
    rpc.reconnect()
    return rpc.status()
  })
}

/** On quit: clear the activity and close the socket. */
export function stopDiscordRpc() {
  client?.stop()
}
