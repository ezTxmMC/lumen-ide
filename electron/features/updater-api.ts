/** The updater's preload bridge (check, download, install). */

import { invoke, subscribe } from './ipc'
import type { UpdateState } from './updater'

export const updaterApi = {
  state: (): Promise<UpdateState> => invoke('updater:state'),
  check: (): Promise<UpdateState> => invoke('updater:check'),
  /** Runs until the download is through; progress arrives through `onState`. */
  download: (): Promise<UpdateState> => invoke('updater:download'),
  /** Quits Lumen, installs the update and starts afresh. */
  install: (): Promise<boolean> => invoke('updater:install'),
  openDownload: (): Promise<void> => invoke('updater:openDownload'),
  onState: (cb: (state: UpdateState) => void) => subscribe('updater:state', cb),
}
