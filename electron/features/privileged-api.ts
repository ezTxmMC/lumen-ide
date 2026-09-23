/** The preload bridge for installing through the system (package managers, root rights). */

import { invoke, subscribe } from './ipc'
import type { PrivilegedRequest, PrivilegedResult, SystemInfo } from './privileged'

export const privilegedApi = {
  /** Platform, distribution, the package managers present and whether sudo/pkexec exist. */
  system: (): Promise<SystemInfo> => invoke('privileged:system'),
  /** Runs until the command is through; the output arrives through `onLog`. */
  run: (jobId: string, request: PrivilegedRequest): Promise<PrivilegedResult> => invoke('privileged:run', jobId, request),
  cancel: (jobId: string): Promise<boolean> => invoke('privileged:cancel', jobId),
  onLog: (cb: (entry: { jobId: string; text: string }) => void) => subscribe('privileged:log', cb),
}
