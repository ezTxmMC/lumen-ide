/**
 * Pop-out windows: views and editor groups the user moved into a window of
 * their own.
 *
 * These are child windows the renderer opens itself with `window.open` — the
 * code that fills them keeps running in the opener, so the state, the language
 * servers and the terminals stay live and nothing has to be synchronised. That
 * is why they are not registered as windows of their own (`contexts` in
 * main.ts): they never talk to the main process, the opener speaks for them.
 * All they need from here is a frame that matches the main window and the
 * few window controls a frameless window lacks.
 */

import { BrowserWindow, ipcMain, shell, type HandlerDetails, type IpcMainInvokeEvent, type WindowOpenHandlerResponse } from 'electron'

/** The name the renderer opens its windows under (`popoutWindowName` in src/state/popout.ts). */
const POPOUT_PREFIX = 'lumen-popout:'

/** Windows by opener and name — `<webContents id>|<name>`. */
const windows = new Map<string, BrowserWindow>()

const keyOf = (owner: number, name: string) => `${owner}|${name}`

/** The options of a pop-out window, or `null` when the request is not for one. */
export function popoutOpenResult(details: HandlerDetails): WindowOpenHandlerResponse | null {
  if (!details.frameName.startsWith(POPOUT_PREFIX)) return null
  return {
    action: 'allow',
    overrideBrowserWindowOptions: {
      frame: false,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      trafficLightPosition: { x: 12, y: 10 },
      minWidth: 280,
      minHeight: 160,
      backgroundColor: '#0b0d10',
      autoHideMenuBar: true,
      show: true,
    },
  }
}

/**
 * Follow the pop-out windows a window opens: they close with it, and with a
 * reload of its renderer (which would orphan them — the code that fills them
 * is gone then).
 */
export function trackPopouts(owner: BrowserWindow) {
  const contents = owner.webContents
  const ownerId = contents.id
  const own = new Set<BrowserWindow>()

  const closeAll = () => {
    for (const child of [...own]) if (!child.isDestroyed()) child.destroy()
    own.clear()
  }

  contents.on('did-create-window', (child, details) => {
    if (!details.frameName.startsWith(POPOUT_PREFIX)) return
    const key = keyOf(ownerId, details.frameName)
    windows.set(key, child)
    own.add(child)
    // A pop-out shows what the renderer puts into it, nothing else: no navigation, links go outside.
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    child.webContents.on('will-navigate', (event) => event.preventDefault())
    child.on('closed', () => {
      own.delete(child)
      if (windows.get(key) === child) windows.delete(key)
    })
  })

  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) closeAll()
  })
  owner.on('closed', closeAll)
}

type PopoutAction = 'minimize' | 'toggleMaximize' | 'focus' | 'close'

/** The window controls of a pop-out, asked for by the opener. */
export function registerPopoutIpc() {
  ipcMain.handle('window:popout', (e: IpcMainInvokeEvent, name: string, action: PopoutAction) => {
    const win = windows.get(keyOf(e.sender.id, String(name)))
    if (!win || win.isDestroyed()) return false
    const actions: Record<PopoutAction, () => void> = {
      minimize: () => win.minimize(),
      toggleMaximize: () => (win.isMaximized() ? win.unmaximize() : win.maximize()),
      focus: () => {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      },
      close: () => win.close(),
    }
    actions[action]?.()
    return win.isMaximized()
  })
}
