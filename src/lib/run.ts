/**
 * Running things: the language's runner for the current file, and the
 * project's tasks (build, test, scripts, package managers). All of it goes
 * through the same process slot, with output in the panel, cancelling, and
 * chains of several steps.
 *
 * `${env:NAME}` in arguments is replaced by the main process from the
 * environment.
 */

import { useStore } from '@/state/store'
import { lsp } from '@/core/lsp/manager'
import type { LspConfig, ProjectTask, RunConfig } from '@/core/types'
import { sdkEnvironment } from '@/core/sdk/env'
import { t } from '@/i18n'

const RUN_ID = 'lumen-run'

interface Vars {
  file: string
  fileDir: string
  fileName: string
  fileStem: string
  workspace: string
  projectRoot: string
}

interface Step {
  label: string
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

function substitute(value: string, vars: Vars): string {
  return value.replace(/\$\{(\w+)\}/g, (match, key: string) => {
    if (!(key in vars)) return match
    return vars[key as keyof Vars]
  })
}

function varsFor(file: string, workspace: string, projectRoot = workspace): Vars {
  const fileName = file.split(/[\\/]/).pop() ?? file
  const fileDir = file.slice(0, file.length - fileName.length - 1) || workspace
  const dot = fileName.lastIndexOf('.')
  return {
    file,
    fileDir,
    fileName,
    fileStem: dot > 0 ? fileName.slice(0, dot) : fileName,
    workspace,
    projectRoot,
  }
}

/** Steps of the running chain still to come. */
let queue: Step[] = []
/** After the whole chain finishes successfully. */
let afterSuccess: (() => void) | null = null

export function initRunBridge() {
  const { appendOutput, setRunning, notify } = useStore.getState()

  window.lumen.run.onData(({ stream, data }) => {
    for (const line of data.split('\n')) {
      if (line === '' && !data.endsWith('\n')) continue
      appendOutput({ stream, text: line })
    }
  })

  window.lumen.run.onExit(({ code }) => {
    const next = queue.shift()
    if (next && code === 0) {
      appendOutput({ stream: 'system', text: `→ ${next.command} ${next.args.join(' ')}` })
      setRunning(RUN_ID, next.label)
      void window.lumen.run.start(RUN_ID, next.command, next.args, next.cwd, next.env)
      return
    }

    queue = []
    setRunning(null)
    appendOutput({
      stream: 'system',
      text: code === 0 ? t('run.exitedOk') : t('run.exitedWithCode', { code: String(code) }),
    })
    const done = afterSuccess
    afterSuccess = null
    if (code === 0) {
      done?.()
      return
    }
    if (code !== null) notify(t('run.processExited', { code: String(code) }), 'warning')
  })
}

async function startSteps(steps: Step[], onSuccess?: () => void, keepOutput = false) {
  const [first, ...rest] = steps
  if (!first) return
  const state = useStore.getState()
  if (state.runningId) {
    state.notify(t('run.alreadyRunning'), 'warning')
    return
  }
  queue = rest
  afterSuccess = onSuccess ?? null
  state.showPanel('output')
  if (!keepOutput) state.clearOutput()
  state.appendOutput({ stream: 'system', text: `$ ${first.command} ${first.args.join(' ')}` })
  if (first.cwd !== state.workspace) state.appendOutput({ stream: 'system', text: t('run.inDir', { dir: first.cwd }) })
  state.setRunning(RUN_ID, first.label)
  await window.lumen.run.start(RUN_ID, first.command, first.args, first.cwd, first.env)
}

export async function runWithConfig(config: RunConfig) {
  const state = useStore.getState()
  const tab = state.activeTab()
  const workspace = state.workspace ?? ''

  if (!tab?.path || tab.virtual) {
    state.notify(t('run.saveFirst'), 'warning')
    return
  }
  if (tab.content !== tab.saved) await state.saveTab(tab.id)

  const vars = varsFor(tab.path, workspace, state.project?.root ?? workspace)
  const cwd = workspace || vars.fileDir
  // The active JDK (JAVA_HOME, PATH) first; the project's own variables win.
  const env = { ...sdkEnvironment(), ...state.projectConfig.env }
  const steps: Step[] = [{
    label: config.label,
    command: substitute(config.command, vars),
    args: config.args.map((a) => substitute(a, vars)),
    cwd,
    env,
  }]
  if (config.then) {
    steps.push({
      label: config.label,
      command: substitute(config.then.command, vars),
      args: config.then.args.map((a) => substitute(a, vars)),
      cwd,
      env,
    })
  }
  await startSteps(steps)
}

/** Translate tasks into a chain of steps — the working directory is the project root. */
function taskSteps(tasks: ProjectTask[], root: string): Step[] {
  const state = useStore.getState()
  const file = state.activeTab()?.path ?? `${root}/`
  const vars = varsFor(file, state.workspace ?? root, root)
  return tasks.flatMap((task) => {
    const cwd = task.cwd ? `${root}/${task.cwd.replace(/^[\\/]/, '')}` : root
    const env = { ...sdkEnvironment(), ...state.projectConfig.env, ...(task.env ?? {}) }
    const steps: Step[] = [{
      label: task.label,
      command: substitute(task.command, vars),
      args: task.args.map((a) => substitute(a, vars)),
      cwd,
      env,
    }]
    if (task.then) {
      steps.push({
        label: task.label,
        command: substitute(task.then.command, vars),
        args: task.then.args.map((a) => substitute(a, vars)),
        cwd,
        env,
      })
    }
    return steps
  })
}

/** Run a project task. */
export async function runTask(task: ProjectTask, onSuccess?: () => void) {
  await runTasks([task], undefined, onSuccess)
}

/**
 * Run several tasks one after another, stopping at the first failure. `root`
 * overrides the project root — for a project that has just been created, say.
 */
export async function runTasks(tasks: ProjectTask[], root?: string, onSuccess?: () => void) {
  const state = useStore.getState()
  const base = root ?? state.project?.root ?? state.workspace
  if (!base) {
    state.notify(t('run.noProject'), 'warning')
    return
  }
  const dirty = state.tabs.filter((t) => t.content !== t.saved && t.path && !t.readonly)
  if (dirty.length) await state.saveAll()
  await startSteps(taskSteps(tasks, base), onSuccess)
}

/** A task by id, whether detected or custom. */
export function findTask(id: string | undefined): ProjectTask | null {
  if (!id) return null
  const state = useStore.getState()
  return [...state.projectConfig.tasks, ...(state.project?.tasks ?? [])].find((t) => t.id === id) ?? null
}

/** The default task of a group: the configured one, else the first detected. */
export function defaultTask(group: 'build' | 'run' | 'test'): ProjectTask | null {
  const state = useStore.getState()
  const configured = findTask(state.projectConfig.defaults[group])
  if (configured) return configured
  return [...state.projectConfig.tasks, ...(state.project?.tasks ?? [])].find((t) => t.group === group) ?? null
}

export function runDefault(group: 'build' | 'run' | 'test') {
  const task = defaultTask(group)
  if (task) {
    void runTask(task)
    return
  }
  if (group === 'run') {
    runActiveFile()
    return
  }
  const state = useStore.getState()
  if (!state.project) {
    state.notify(t('run.noProject'), 'warning')
    return
  }
  state.notify(group === 'build' ? t('run.noBuildTask') : t('run.noTestTask'), 'warning')
}

/** Install one language server — into Lumen's own environment where it can, otherwise by command. */
export async function installServer(config: LspConfig) {
  if (lsp.canInstall(config)) {
    await installServers([config])
    return
  }
  useStore.getState().notify(config.install ?? t('run.noInstallCommand'), 'info')
}

/** The managed installation in progress, so that `stopRun` can cancel it. */
let managedJob: string | null = null
let managedCancelled = false

/** Install into `~/.lumen/lsp`; the output goes to the panel. */
async function installManaged(config: LspConfig): Promise<boolean> {
  const state = useStore.getState()
  const spec = lsp.packageFor(config)!
  const jobId = `lsp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  managedJob = jobId
  state.setRunning(RUN_ID, t('run.installLabel', { name: config.label }))
  state.appendOutput({ stream: 'system', text: `→ ${t('run.installLabel', { name: config.label })}` })
  const off = window.lumen.lspPackages.onLog((entry) => {
    if (entry.jobId !== jobId) return
    state.appendOutput({ stream: 'stdout', text: entry.text })
  })
  try {
    await window.lumen.lspPackages.install(jobId, spec, config.command)
    return true
  } catch (err) {
    state.appendOutput({ stream: 'stderr', text: (err as Error).message })
    return false
  } finally {
    off()
    managedJob = null
  }
}

/**
 * Install several language servers one after another. Servers with a
 * `package` go into Lumen's closed environment — one failing does not stop
 * the rest; the others fall back to their install command, run in the panel.
 */
export async function installServers(configs: LspConfig[]) {
  const state = useStore.getState()
  if (state.runningId) {
    state.notify(t('run.alreadyRunning'), 'warning')
    return
  }
  const managed = configs.filter((config) => lsp.hasPackage(config))
  const scripted = configs.filter((config) => !lsp.hasPackage(config) && lsp.installCommand(config))

  if (managed.length) {
    state.showPanel('output')
    state.clearOutput()
    managedCancelled = false
    const done: string[] = []
    const failed: string[] = []
    for (const config of managed) {
      if (managedCancelled) break
      const ok = await installManaged(config)
      if (ok) done.push(config.label)
      if (!ok) failed.push(config.label)
    }
    state.setRunning(null)
    lsp.rescan()
    if (done.length) state.notify(t('run.installed', { name: done.join(', ') }), 'success')
    if (failed.length && !managedCancelled) state.notify(t('run.installFailed', { name: failed.join(', ') }), 'error')
    if (managedCancelled) return
  }

  const steps: Step[] = []
  for (const config of scripted) {
    const [cmd, ...args] = splitShell(lsp.installCommand(config)!)
    steps.push({ label: t('run.installLabel', { name: config.label }), command: cmd, args, cwd: state.workspace ?? '.', env: {} })
  }
  const names = scripted.map((config) => config.label).join(', ')
  await startSteps(steps, () => {
    lsp.rescan()
    state.notify(t('run.installed', { name: names }), 'success')
  }, managed.length > 0)
}

/** A very simple shell split: spaces separate, quotes group. */
export function splitShell(input: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const m of input.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

export function stopRun() {
  const state = useStore.getState()
  if (managedJob) {
    managedCancelled = true
    void window.lumen.lspPackages.cancel(managedJob)
  }
  queue = []
  afterSuccess = null
  void window.lumen.run.kill(RUN_ID)
  state.setRunning(null)
  state.appendOutput({ stream: 'system', text: t('run.cancelled') })
}

/** The first matching runner of the active language. */
export function runActiveFile() {
  const state = useStore.getState()
  const language = state.languageFor(state.activeTab())
  const config = language?.run?.[0]
  if (config) {
    void runWithConfig(config)
    return
  }
  state.notify(
    language ? t('run.noRunner', { language: language.name }) : t('run.noLanguage'),
    'warning',
  )
}
