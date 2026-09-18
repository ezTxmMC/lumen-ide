/**
 * Features that register themselves after startup — commands, editor
 * extensions, registry entries. Each file exports `init()`.
 */

import { init as initSdk } from './sdk'
import { init as initDebug } from './debug'
import { init as initUserAddons } from './userAddons'
import { init as initUpdater } from './updater'
import { init as initRecentProjects } from './recentProjects'
import { init as initLspInstall } from './lspInstall'
import { init as initExtensions } from './extensions'
import { init as initAgents } from './agents'

let started = false

export function initFeatures() {
  if (started) return
  started = true
  for (const [name, init] of [['sdk', initSdk], ['debug', initDebug], ['userAddons', initUserAddons], ['updater', initUpdater], ['recentProjects', initRecentProjects], ['lspInstall', initLspInstall], ['extensions', initExtensions], ['agents', initAgents]] as const) {
    try {
      void init()
    } catch (err) {
      console.error(`[lumen] Feature "${name}" failed to start:`, err)
    }
  }
}
