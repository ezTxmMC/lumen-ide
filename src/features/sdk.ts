/**
 * Starting SDK management: load the settings and the installed JDKs, provide
 * the active JDK (the project's ahead of the default) as the environment for
 * tasks, terminals and language servers, and register the commands.
 */

import { useStore } from '@/state/store'
import { registerCommandProvider } from '@/core/commands'
import { lsp } from '@/core/lsp/manager'
import { terminals } from '@/lib/terminals'
import { t } from '@/i18n'
import type { Command, FormField } from '@/core/types'
import {
  SDK_PROVIDERS, activeSdk, applyProgress, createJvmServerDecorator, detectInstalled, loadSdkSettings,
  resolveSdk, sdkEnvironment, sdkLabel, setActiveSdks, setBaseEnvironment, setDefaultSdk, setProjectSdk,
  useSdk, type ActiveSdk,
} from '@/core/sdk'

let started = false
let signature: string | null = null

export function init() {
  if (started) return
  started = true
  window.lumen.sdk.onProgress(applyProgress)
  terminals.envProvider = sdkEnvironment
  lsp.addConfigDecorator(createJvmServerDecorator(() => useSdk.getState().installed.java ?? []))
  registerCommandProvider(sdkCommands)

  useSdk.subscribe((state, previous) => {
    if (state.installed === previous.installed && state.settings === previous.settings) return
    recompute()
  })
  useStore.subscribe((state, previous) => {
    if (state.projectConfig.jdk === previous.projectConfig.jdk && state.workspace === previous.workspace) return
    recompute()
  })
  void start()
}

async function start() {
  try {
    await loadSdkSettings()
    const environment = useSdk.getState().environment
    if (environment) setBaseEnvironment(environment)
  } catch (err) {
    console.error('[lumen] SDK-Einstellungen:', err)
  }
  await detectInstalled('java')
  recompute()
}

/** Work out the active SDKs again; restart running JVM servers when the Java JDK changed. */
function recompute() {
  const sdk = useSdk.getState()
  const store = useStore.getState()
  const next: ActiveSdk[] = []
  for (const provider of SDK_PROVIDERS) {
    const installed = sdk.installed[provider.id] ?? []
    const projectValue = provider.id === 'java' && store.workspace ? store.projectConfig.jdk : undefined
    const fromProject = resolveSdk(projectValue, installed)
    const chosen = fromProject ?? resolveSdk(sdk.settings.defaults[provider.id], installed)
    if (!chosen) continue
    next.push({
      providerId: provider.id,
      home: chosen.home,
      major: chosen.major,
      origin: fromProject ? 'project' : 'default',
      variables: provider.variables(chosen),
    })
  }
  const nextSignature = JSON.stringify(next.map((entry) => [entry.providerId, entry.home, entry.origin]))
  if (nextSignature === signature) return
  const javaBefore = activeSdk('java')?.home ?? null
  signature = nextSignature
  setActiveSdks(next)
  if ((activeSdk('java')?.home ?? null) === javaBefore) return
  void restartJvmServers()
}

async function restartJvmServers() {
  const entries = lsp.list().filter((entry) => entry.languages.some((id) => ['java', 'kotlin'].includes(id)))
  if (!entries.length) return
  const state = useStore.getState()
  state.notify(t('sdk.lspRestart'), 'info')
  for (const entry of entries) await lsp.restartClient(entry.id)
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

function jdkChoices(): FormField['choices'] {
  const installed = (useSdk.getState().installed.java ?? []).filter((sdk) => !sdk.runtimeOnly)
  return installed.map((sdk) => ({
    value: sdk.home,
    label: sdkLabel(sdk),
    hint: sdk.home,
  }))
}

function openJdkForm(scope: 'project' | 'default') {
  const store = useStore.getState()
  const current = scope === 'project'
    ? store.projectConfig.jdk ?? ''
    : useSdk.getState().settings.defaults.java ?? ''
  const emptyLabel = scope === 'project' ? t('sdk.form.followDefault') : t('sdk.form.system')
  const choices = [{ value: '', label: emptyLabel }, ...(jdkChoices() ?? [])]
  if (current && !choices.some((choice) => choice.value === current)) choices.push({ value: current, label: current })

  store.openForm({
    title: t(scope === 'project' ? 'sdk.form.projectTitle' : 'sdk.form.defaultTitle'),
    description: t(scope === 'project' ? 'sdk.form.projectDescription' : 'sdk.form.defaultDescription'),
    fields: [{ id: 'jdk', label: t('sdk.form.jdk'), type: 'select', choices, mono: false }],
    initial: { jdk: current },
    submitLabel: t('common.apply'),
    onSubmit: async (values) => {
      const value = values.jdk || null
      if (scope === 'project') {
        await setProjectSdk(value)
        return
      }
      await setDefaultSdk('java', value)
    },
  })
}

async function selectJdk(scope: 'project' | 'default') {
  if (!useSdk.getState().installed.java) await detectInstalled('java')
  openJdkForm(scope)
}

function sdkCommands(): Command[] {
  const s = () => useStore.getState()
  const category = t('sdk.category')
  return [
    { id: 'sdk.manage', title: t('sdk.command.manage'), category, run: () => s().openDialog('sdks', 'installed') },
    { id: 'sdk.download', title: t('sdk.command.download'), category, run: () => s().openDialog('sdks', 'download') },
    {
      id: 'sdk.selectProjectJdk', title: t('sdk.command.selectProjectJdk'), category,
      run: () => selectJdk('project'),
      when: () => Boolean(s().workspace),
    },
    { id: 'sdk.selectDefaultJdk', title: t('sdk.command.selectDefaultJdk'), category, run: () => selectJdk('default') },
    { id: 'sdk.detect', title: t('sdk.command.detect'), category, run: () => detectInstalled('java') },
  ]
}
