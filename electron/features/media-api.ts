/** The preload bridge of the non-text viewers (see `media.ts`). */

import { invoke } from './ipc'
import type { MediaInfo } from './media'

export const mediaApi = {
  /** Size, modification time and the first `headBytes` bytes; also lets `lumen-file://` serve the file. */
  inspect: (file: string, headBytes?: number): Promise<MediaInfo> => invoke('media:inspect', file, headBytes),
  openWithSystem: (file: string): Promise<void> => invoke('media:openWithSystem', file),
}
