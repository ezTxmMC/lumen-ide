/**
 * Does an extension fit this version of Lumen?
 *
 * An extension names the oldest Lumen it needs in `minAppVersion`
 * (`extension.json`) — it is for when it uses something the app only has from
 * that version on: a new setting type, a host API, window code. Lumen refuses
 * to install one that needs more than it has, skips it in updates, and does
 * not start the code of one that is installed and no longer fits (after going
 * back to an older Lumen).
 *
 * Pure — the main process and the checks import it as well.
 */

import { compareVersions } from './version'

/** A plain version number: `0.5.0`, optionally with a tag (`0.5.0-beta.1`). */
export const APP_VERSION_PATTERN = /^\d+(\.\d+){0,2}(-[\w.]+)?$/

/** Does an app of `appVersion` meet `minAppVersion`? An unset or unreadable requirement always does. */
export function fitsApp(minAppVersion: string | undefined, appVersion: string): boolean {
  if (!minAppVersion || !APP_VERSION_PATTERN.test(minAppVersion)) return true
  // A tagged build of the required number (0.5.0-beta.1 for 0.5.0) counts: its features are there.
  const wanted = minAppVersion.split('-')[0]
  const have = appVersion.split('-')[0]
  return compareVersions(have, wanted) >= 0
}
