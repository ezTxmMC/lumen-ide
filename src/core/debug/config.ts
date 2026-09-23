/**
 * Launch configurations: the languages' adapters, custom entries from
 * the project's `debug.json`, placeholders, and the `DebugContext` surroundings.
 */

import { useStore, type FormDialogSpec } from '@/state/store'
import { registry } from '@/core/registry'
import { lsp } from '@/core/lsp/manager'
import { t } from '@/i18n'
import type {
  DebugAdapterConfig, DebugContext, DebugLaunchArguments, FormField, FormValues, LanguageSpec,
} from '@/core/types'
import { baseName } from './paths'
import { launchConfigPath } from './persist'

/** One entry from the project's `debug.json`, modelled on VS Code's launch.json. */
export interface LaunchConfig {
  name: string
  /** DAP type of the adapter, such as `debugpy`, `gdb`, `pwa-node`. */
  type: string
  request?: 'launch' | 'attach'
  /** Label of the adapter, where several share a type. */
  adapter?: string
  [key: string]: unknown
}

export interface DebugChoice {
  id: string
  label: string
  detail?: string
  adapter: DebugAdapterConfig
  languageId: string | null
  config?: LaunchConfig
}

/* ------------------------------------------------------------------ *
 * Adapters
 * ------------------------------------------------------------------ */

export function allAdapters(): { adapter: DebugAdapterConfig; language: LanguageSpec }[] {
  const out: { adapter: DebugAdapterConfig; language: LanguageSpec }[] = []
  for (const language of registry.languages()) {
    for (const adapter of language.debug ?? []) out.push({ adapter, language })
  }
  return out
}

export function findAdapter(type: string, label?: string) {
  const list = allAdapters()
  if (label) {
    const byLabel = list.find((entry) => entry.adapter.label === label)
    if (byLabel) return byLabel
  }
  return list.find((entry) => entry.adapter.type === type) ?? null
}

/* ------------------------------------------------------------------ *
 * debug.json (in Lumen's data folder for the project)
 * ------------------------------------------------------------------ */

export async function loadLaunchConfigs(root: string | null): Promise<LaunchConfig[]> {
  if (!root) return []
  const raw = await window.lumen.fs.readFile(await launchConfigPath(root)).catch(() => null)
  if (!raw) return []
  const parsed = JSON.parse(stripJsonComments(raw)) as { configurations?: unknown }
  if (!Array.isArray(parsed.configurations)) return []
  return parsed.configurations.filter((entry): entry is LaunchConfig =>
    Boolean(entry) && typeof entry === 'object' && typeof (entry as LaunchConfig).name === 'string' && typeof (entry as LaunchConfig).type === 'string')
}

function stripJsonComments(text: string) {
  return text.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_match, str: string | undefined) => str ?? '')
}

const TEMPLATE = {
  configurations: [
    {
      name: 'Aktuelle Datei (Python)',
      type: 'debugpy',
      request: 'launch',
      program: '${file}',
      cwd: '${projectRoot}',
      console: 'internalConsole',
    },
    {
      name: 'Programm (GDB)',
      type: 'gdb',
      request: 'launch',
      program: '${projectRoot}/build/app',
      args: [],
      cwd: '${projectRoot}',
    },
  ],
}

/** Opens the project's `debug.json`, creating it with examples if it is missing. */
export async function openLaunchConfigFile() {
  const state = useStore.getState()
  const root = state.workspace
  if (!root) {
    state.notify(t('debug.error.noWorkspace'), 'warning')
    return
  }
  const file = await launchConfigPath(root)
  const exists = await window.lumen.fs.exists(file).catch(() => false)
  if (!exists) await window.lumen.fs.writeFile(file, `${JSON.stringify(TEMPLATE, null, 2)}\n`)
  await state.openFile(file)
}

/* ------------------------------------------------------------------ *
 * Choosing one
 * ------------------------------------------------------------------ */

function orderByKinds(adapters: DebugAdapterConfig[], kinds: string[]) {
  const preferred = adapters.filter((adapter) => adapter.kinds?.some((kind) => kinds.includes(kind)))
  return [...preferred, ...adapters.filter((adapter) => !preferred.includes(adapter))]
}

/** Custom configurations first, then the adapters of the active language, or of the project's. */
export async function debugChoices(languageId: string | null): Promise<DebugChoice[]> {
  const state = useStore.getState()
  const configs = await loadLaunchConfigs(state.workspace).catch((err: Error) => {
    state.notify(t('debug.error.configInvalid', { message: err.message }), 'error')
    return [] as LaunchConfig[]
  })
  const choices: DebugChoice[] = []
  for (const config of configs) {
    const hit = findAdapter(config.type, config.adapter)
    if (!hit) continue
    choices.push({ id: `config:${config.name}`, label: config.name, detail: hit.adapter.label, adapter: hit.adapter, languageId: hit.language.id, config })
  }
  const kinds = state.project?.kinds.map((k) => k.kind.id) ?? []
  const languageIds = languageId ? [languageId] : (state.project?.languages ?? [])
  const seen = new Set<DebugAdapterConfig>()
  for (const id of languageIds) {
    const language = registry.languages().find((l) => l.id === id)
    for (const adapter of orderByKinds(language?.debug ?? [], kinds)) {
      if (seen.has(adapter)) continue
      seen.add(adapter)
      choices.push({ id: `adapter:${adapter.label}`, label: adapter.label, detail: language?.name, adapter, languageId: id })
    }
  }
  return choices
}

/* ------------------------------------------------------------------ *
 * Placeholders
 * ------------------------------------------------------------------ */

export interface Vars {
  file: string
  fileDir: string
  fileName: string
  fileStem: string
  fileExtname: string
  workspace: string
  workspaceFolder: string
  projectRoot: string
  projectName: string
  home: string
}

export function varsFor(file: string | null, workspace: string, projectRoot: string, projectName: string, home: string): Vars {
  const name = file ? baseName(file) : ''
  const dot = name.lastIndexOf('.')
  return {
    file: file ?? '',
    fileDir: file ? file.slice(0, file.length - name.length - 1) : projectRoot,
    fileName: name,
    fileStem: dot > 0 ? name.slice(0, dot) : name,
    fileExtname: dot > 0 ? name.slice(dot) : '',
    workspace,
    workspaceFolder: workspace,
    projectRoot,
    projectName,
    home,
  }
}

export function substitute(value: string, vars: Vars): string {
  return value
    .replace(/^~(?=[\\/]|$)/, vars.home)
    .replace(/\$\{(\w+)\}/g, (match, key: string) => {
      if (!(key in vars)) return match
      return vars[key as keyof Vars]
    })
}

/** Replace placeholders in every string of an object. */
export function substituteDeep<T>(value: T, vars: Vars): T {
  if (typeof value === 'string') return substitute(value, vars) as T
  if (Array.isArray(value)) return value.map((item) => substituteDeep(item, vars)) as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substituteDeep(v, vars)])) as T
}

/* ------------------------------------------------------------------ *
 * Dialogs as promises
 * ------------------------------------------------------------------ */

export function askForm(title: string, fields: FormField[], initial?: FormValues, submitLabel?: string): Promise<FormValues | null> {
  return new Promise((resolve) => {
    let settled = false
    const spec: FormDialogSpec = {
      title,
      fields,
      initial,
      submitLabel: submitLabel ?? t('debug.form.continue'),
      onSubmit: (values) => {
        settled = true
        resolve(values)
      },
    }
    useStore.getState().openForm(spec)
    const unsubscribe = useStore.subscribe((state) => {
      if (state.formDialog === spec) return
      unsubscribe()
      if (settled) return
      settled = true
      resolve(null)
    })
  })
}

export async function pickOne(title: string, choices: { value: string; label: string; detail?: string }[], initial?: string): Promise<string | null> {
  if (!choices.length) return null
  const values = await askForm(title, [{
    id: 'choice',
    label: title,
    type: 'select',
    choices: choices.map((c) => ({ value: c.value, label: c.label, hint: c.detail })),
  }], { choice: initial && choices.some((c) => c.value === initial) ? initial : choices[0].value }, t('debug.form.choose'))
  return values?.choice ?? null
}

/* ------------------------------------------------------------------ *
 * Language server commands (Java)
 * ------------------------------------------------------------------ */

const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** When the plugins were written into the server configuration. */
let bundlesAddedAt = 0

function findClient(file: string | null, languageId: string | null) {
  const own = lsp.clientForPath(file)
  if (own) return own
  if (!languageId) return null
  const entry = lsp.list().find((server) => server.languages.includes(languageId))
  return entry ? lsp.clientById(entry.id) : null
}

/** Waits until the language server is ready; jdtls takes a while on a first start. */
async function readyClient(file: string | null, languageId: string | null) {
  const started = Date.now()
  let opened = false
  while (Date.now() - started < 180_000) {
    const client = findClient(file, languageId)
    if (client?.status === 'ready') return client
    if (client && client.status !== 'starting' && client.status !== 'idle' && client.status !== 'checking') return null
    if (!client && !opened && file) {
      opened = true
      const state = useStore.getState()
      const tab = state.tabs.find((candidate) => candidate.path === file)
      if (tab) void lsp.openDocument(state.languageFor(tab), file, tab.content)
    }
    if (!client && Date.now() - started > 10_000) return null
    await waitMs(400)
  }
  return null
}

async function restartForBundles(clientId: string) {
  const files = await lsp.restartClient(clientId)
  const state = useStore.getState()
  for (const path of files) {
    const tab = state.tabs.find((candidate) => candidate.path === path)
    if (tab) await lsp.openDocument(state.languageFor(tab), path, tab.content)
  }
}

async function lspCommand(file: string | null, languageId: string | null, command: string, args: unknown[] = [], retried = false): Promise<unknown> {
  const client = await readyClient(file, languageId)
  if (!client) throw new Error(t('debug.error.noLsp'))
  try {
    return await client.executeCommand({ title: command, command, arguments: args })
  } catch (err) {
    const message = (err as Error).message
    const missingHandler = /delegate|not supported|unknown command|no handler/i.test(message)
    if (!missingHandler || retried || bundlesAddedAt <= client.startedAt) throw err
    // The server was already running before the plugins were known: restart it once.
    useStore.getState().notify(t('debug.java.restartingServer'), 'info')
    await restartForBundles(client.id)
    return lspCommand(file, languageId, command, args, true)
  }
}

/**
 * Write plugins such as java-debug into the language servers'
 * `initializationOptions.bundles`. This runs at startup; servers already
 * running are only restarted when debugging begins.
 */
export async function injectLspBundles() {
  for (const language of registry.languages()) {
    const patterns = (language.debug ?? []).flatMap((adapter) => adapter.lspBundles ?? [])
    if (!patterns.length) continue
    const jars: string[] = []
    for (const pattern of patterns) {
      const hits = await window.lumen.dap.glob(pattern).catch(() => [] as string[])
      if (hits[0]) jars.push(hits[0])
      if (jars.length) break
    }
    if (!jars.length) continue
    for (const config of language.lsp ?? []) {
      const options = config.initializationOptions as { bundles?: unknown } | undefined
      if (!options || !Array.isArray(options.bundles)) continue
      for (const jar of jars) {
        if (!options.bundles.includes(jar)) options.bundles.push(jar)
      }
      bundlesAddedAt = Date.now()
    }
  }
}

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

export function createContext(
  file: string | null,
  languageId: string | null,
  memory: DebugContext['memory'],
  home: string,
): { ctx: DebugContext; vars: Vars } {
  const state = useStore.getState()
  const workspace = state.workspace ?? (file ? file.replace(/[\\/][^\\/]*$/, '') : home)
  const projectRoot = state.project?.root ?? workspace
  const projectName = state.project?.meta.name ?? state.project?.name ?? baseName(projectRoot)
  const vars = varsFor(file, workspace, projectRoot, projectName, home)
  const ctx: DebugContext = {
    file,
    fileDir: vars.fileDir,
    fileName: vars.fileName,
    fileStem: vars.fileStem,
    workspace,
    projectRoot,
    projectName,
    projectKinds: state.project?.kinds.map((k) => k.kind.id) ?? [],
    languageId,
    platform: state.platform,
    home,
    substitute: (value) => substitute(value, vars),
    exists: (target) => window.lumen.fs.exists(substitute(target, vars)).catch(() => false),
    glob: (pattern) => window.lumen.dap.glob(substitute(pattern, vars)).catch(() => []),
    lspCommand: (command, args) => lspCommand(file, languageId, command, args ?? []),
    pick: (title, choices) => pickOne(title, choices),
    ask: (title, fields, initial) => askForm(title, fields, initial),
    memory,
  }
  return { ctx, vars }
}

/** Launch arguments of an adapter, or of a custom configuration. */
export async function launchArguments(choice: DebugChoice, ctx: DebugContext, vars: Vars): Promise<DebugLaunchArguments | null> {
  if (choice.config) {
    const { name: _name, type: _type, request: _request, adapter: _adapter, ...rest } = choice.config
    return substituteDeep(rest, vars)
  }
  const launch = choice.adapter.launch
  if (!launch) return {}
  if (typeof launch === 'function') {
    const result = await launch(ctx)
    return result ? substituteDeep(result, vars) : null
  }
  return substituteDeep(launch, vars)
}
