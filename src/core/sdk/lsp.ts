/**
 * Starting language servers with the active JDK: JAVA_HOME and PATH for the
 * Java and Kotlin servers, plus `java.configuration.runtimes` for jdtls, so
 * projects are built against the chosen JDK.
 */

import type { LspConfig } from '@/core/types'
import { activeSdk, sdkEnvironment } from './env'
import { jdtlsRuntimeName } from './java'
import type { InstalledSdk } from './types'

/** jdtls itself needs Java 21 or newer to run. */
const JDTLS_MIN_RUNTIME = 21
const JVM_LANGUAGES = new Set(['java', 'kotlin', 'groovy', 'scala'])

interface Runtime {
  name: string
  path: string
  default?: boolean
}

function runtimesFor(installed: InstalledSdk[], activeHome: string, activeMajor: number): Runtime[] {
  const runtimes: Runtime[] = []
  const names = new Set<string>()
  if (activeMajor >= 8) {
    const name = jdtlsRuntimeName(activeMajor)
    runtimes.push({ name, path: activeHome, default: true })
    names.add(name)
  }
  const candidates = installed
    .filter((sdk) => !sdk.runtimeOnly && sdk.major >= 8)
    .sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }))
  for (const sdk of candidates) {
    const name = jdtlsRuntimeName(sdk.major)
    if (names.has(name)) continue
    names.add(name)
    runtimes.push({ name, path: sdk.home })
  }
  return runtimes
}

function withRuntimes(settings: unknown, runtimes: Runtime[]): unknown {
  if (!settings || typeof settings !== 'object') return settings
  const clone = JSON.parse(JSON.stringify(settings)) as { java?: { configuration?: Record<string, unknown> } }
  if (!clone.java) return settings
  clone.java.configuration = { ...(clone.java.configuration ?? {}), runtimes }
  return clone
}

/** A decorator for `lsp.addConfigDecorator`; `installed` supplies the detected JDKs. */
export function createJvmServerDecorator(installed: () => InstalledSdk[]) {
  return (config: LspConfig, languageId: string): LspConfig => {
    if (!JVM_LANGUAGES.has(languageId)) return config
    const java = activeSdk('java')
    if (!java) return config

    const isJdtls = /jdtls|jdt\.ls/i.test(`${config.command} ${config.label}`)
    const canRunServer = !isJdtls || java.major === 0 || java.major >= JDTLS_MIN_RUNTIME
    const env = canRunServer ? { ...sdkEnvironment(), ...(config.env ?? {}) } : config.env
    if (!isJdtls) return { ...config, env }

    const runtimes = runtimesFor(installed(), java.home, java.major)
    const init = config.initializationOptions as { settings?: unknown } | undefined
    return {
      ...config,
      env,
      settings: withRuntimes(config.settings, runtimes),
      initializationOptions: init && typeof init === 'object'
        ? { ...init, settings: withRuntimes(init.settings, runtimes) }
        : init,
    }
  }
}
