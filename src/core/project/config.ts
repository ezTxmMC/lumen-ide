/**
 * Project configuration in `.lumen/project.json` inside the workspace folder:
 * custom tasks, default tasks, environment variables and the preferred
 * language server per language.
 */

import type { ProjectTask } from '@/core/types'

export interface ProjectConfig {
  /** Display name, overriding the detected one. */
  name?: string
  /** Custom tasks, on top of the detected ones. */
  tasks: ProjectTask[]
  /** Task ids for build, run and test (the function keys and the toolbar). */
  defaults: { build?: string; run?: string; test?: string }
  /** Environment variables for every task and runner. */
  env: Record<string, string>
  /** Language → label of the preferred language server. */
  lsp: Record<string, string>
  /** Recently open files (relative), restored when the project opens. */
  openFiles?: string[]
  /** How the open files are spread across editor groups in a split view, relative. */
  openGroups?: string[][]
  /** Direction of the split. */
  splitDirection?: 'right' | 'down'
  /** The project's JDK: a path, a major version (`21`) or `distribution-major` — otherwise the default JDK applies. */
  jdk?: string
}

export const EMPTY_PROJECT_CONFIG: ProjectConfig = {
  tasks: [],
  defaults: {},
  env: {},
  lsp: {},
}

const FILE = '.lumen/project.json'

export function configPath(root: string) {
  return `${root.replace(/[\\/]$/, '')}/${FILE}`
}

export async function loadProjectConfig(root: string): Promise<ProjectConfig> {
  try {
    const raw = await window.lumen.fs.readFile(configPath(root))
    const parsed = JSON.parse(raw) as Partial<ProjectConfig>
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter(isTask) : [],
      defaults: parsed.defaults && typeof parsed.defaults === 'object' ? parsed.defaults : {},
      env: parsed.env && typeof parsed.env === 'object' ? parsed.env : {},
      lsp: parsed.lsp && typeof parsed.lsp === 'object' ? parsed.lsp : {},
      openFiles: Array.isArray(parsed.openFiles) ? parsed.openFiles.filter((f) => typeof f === 'string') : undefined,
      openGroups: Array.isArray(parsed.openGroups)
        ? parsed.openGroups.filter(Array.isArray).map((g) => g.filter((f) => typeof f === 'string'))
        : undefined,
      splitDirection: parsed.splitDirection === 'down' ? 'down' : undefined,
      jdk: typeof parsed.jdk === 'string' && parsed.jdk ? parsed.jdk : undefined,
    }
  } catch {
    return structuredClone(EMPTY_PROJECT_CONFIG)
  }
}

export async function saveProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const clean: ProjectConfig = {
    ...(config.name ? { name: config.name } : {}),
    tasks: config.tasks,
    defaults: config.defaults,
    env: config.env,
    lsp: config.lsp,
    ...(config.openFiles?.length ? { openFiles: config.openFiles } : {}),
    ...((config.openGroups?.length ?? 0) > 1 ? { openGroups: config.openGroups } : {}),
    ...(config.splitDirection === 'down' ? { splitDirection: 'down' as const } : {}),
    ...(config.jdk ? { jdk: config.jdk } : {}),
  }
  await window.lumen.fs.writeFile(configPath(root), `${JSON.stringify(clean, null, 2)}\n`)
}

function isTask(value: unknown): value is ProjectTask {
  const t = value as ProjectTask | null
  return Boolean(
    t && typeof t.id === 'string' && typeof t.label === 'string' &&
    typeof t.command === 'string' && Array.isArray(t.args),
  )
}
