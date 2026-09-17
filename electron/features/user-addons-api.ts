/** The preload bridge for the user's own add-ons (the add-on studio). */

import { invoke } from './ipc'
import type { ShellExecResult, StoredUserAddon } from './user-addons'

export const userAddonsApi = {
  /** The folder of the add-on files (userData/addons). */
  dir: (): Promise<string> => invoke('userAddons:dir'),
  /** Every add-on stored, parsed; files with a problem carry an `error`. */
  list: (): Promise<StoredUserAddon[]> => invoke('userAddons:list'),
  /** Stores `<id>.lumen-addon.json`; ids with the prefix `user.` only. */
  save: (id: string, content: string): Promise<boolean> => invoke('userAddons:save', id, content),
  remove: (id: string): Promise<boolean> => invoke('userAddons:remove', id),
  /** A file dialog; `null` on cancel. */
  importFile: (): Promise<{ name: string; content: string } | null> => invoke('userAddons:import'),
  /** A save dialog; returns the path chosen, or `null`. */
  exportFile: (suggested: string, content: string): Promise<string | null> =>
    invoke('userAddons:export', suggested, content),
  /** A shell command with its output gathered (a 60 s limit). */
  exec: (command: string, cwd: string | null): Promise<ShellExecResult> => invoke('userAddons:exec', command, cwd),
}
