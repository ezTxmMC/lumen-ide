/**
 * Every Gradle task of a build — including those that plugins and
 * dependencies add and no script names — fetched through
 * `gradle tasks --all`.
 *
 * The result is cached in the project's data folder (`gradle-tasks.json`), so
 * it is there at once the next time the project opens. When no cache exists
 * yet, Lumen fetches it quietly in the background after the project opened
 * (*Settings → General → Load Gradle tasks when a project opens*); the project
 * panel's button fetches it afresh at any time.
 *
 * Tasks of subprojects (`fabric:runClient`) are handed to their module in the
 * project panel through `tasksOfModule`.
 */

import { useSyncExternalStore } from 'react'
import type { ProjectTask } from '@/core/types'
import { sdkEnvironment } from '@/core/sdk/env'
import { projectDataFile } from '@/core/project/data'
import { parseGradleTasksOutput, type GradleTaskInfo } from '@/addons/lib/jvm-tasks'

export interface GradleTaskList {
  loading: boolean
  tasks: ProjectTask[]
  error?: string
  /** When the list was fetched (ms), from the cache or just now. */
  fetchedAt?: number
}

interface CacheFile {
  schema: 1
  gradle: string
  fetchedAt: number
  tasks: GradleTaskInfo[]
}

const CACHE_FILE = 'gradle-tasks.json'
const lists = new Map<string, GradleTaskList>()
const listeners = new Set<() => void>()
let version = 0

function emit() {
  version++
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The loaded list of a root, re-rendering when it changes. */
export function useGradleTasks(root: string | null | undefined): GradleTaskList | undefined {
  useSyncExternalStore(subscribe, () => version)
  return root ? lists.get(root) : undefined
}

/** Forget the list of a root (after a refresh of the project). */
export function clearGradleTasks(root: string) {
  if (!lists.delete(root)) return
  emit()
}

/** The first lines of stderr, enough to say what went wrong. */
function failure(stderr: string, code: number | null, timedOut: boolean): string {
  if (timedOut) return 'timeout'
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const message = lines.find((line) => /error|wrong|failed|exception/i.test(line)) ?? lines[0]
  return message ?? `exit ${code}`
}

function toTasks(infos: GradleTaskInfo[], gradle: string): ProjectTask[] {
  return infos.map((info) => ({
    id: `gradle-all:${info.name}`,
    label: info.name,
    command: gradle,
    args: ['--console=plain', info.name],
    group: /^run[A-Z]|(^|:)(run|bootRun|quarkusDev|runIde)$/.test(info.name.split(':').pop() ?? '') ? 'run' : 'other',
    category: info.group,
    detail: info.description ?? `gradle ${info.name}`,
  }))
}

/** Read the cached list of a root, when there is one and nothing newer is loaded. Returns whether it was found. */
export async function restoreGradleTasks(root: string): Promise<boolean> {
  if (lists.get(root)) return true
  const raw = await window.lumen.fs.readFile(await projectDataFile(root, CACHE_FILE)).catch(() => null)
  if (!raw) return false
  try {
    const cache = JSON.parse(raw) as CacheFile
    if (cache.schema !== 1 || !Array.isArray(cache.tasks)) return false
    if (lists.get(root)) return true
    lists.set(root, { loading: false, tasks: toTasks(cache.tasks, cache.gradle), fetchedAt: cache.fetchedAt })
    emit()
    return true
  } catch {
    return false
  }
}

async function writeCache(root: string, gradle: string, tasks: GradleTaskInfo[]) {
  const cache: CacheFile = { schema: 1, gradle, fetchedAt: Date.now(), tasks }
  await window.lumen.fs.writeFile(await projectDataFile(root, CACHE_FILE), `${JSON.stringify(cache)}\n`).catch(() => {})
}

/** Run `gradle tasks --all` in `root`, keep the tasks it reports and cache them. */
export async function loadGradleTasks(root: string, gradle: string, env: Record<string, string> = {}) {
  if (lists.get(root)?.loading) return
  const previous = lists.get(root)
  lists.set(root, { loading: true, tasks: previous?.tasks ?? [], fetchedAt: previous?.fetchedAt })
  emit()
  try {
    // Gradle's first run of a mod build sets Minecraft up — that can take minutes.
    const result = await window.lumen.run.capture(
      gradle, ['tasks', '--all', '--console=plain', '-q'], root, { ...sdkEnvironment(), ...env }, 300_000,
    )
    const parsed = parseGradleTasksOutput(result.stdout)
    if (!parsed.length && result.code !== 0) {
      lists.set(root, { loading: false, tasks: previous?.tasks ?? [], fetchedAt: previous?.fetchedAt, error: failure(result.stderr, result.code, result.timedOut) })
      emit()
      return
    }
    lists.set(root, { loading: false, tasks: toTasks(parsed, gradle), fetchedAt: Date.now() })
    void writeCache(root, gradle, parsed)
  } catch (err) {
    lists.set(root, { loading: false, tasks: previous?.tasks ?? [], error: (err as Error).message })
  }
  emit()
}

/**
 * The loaded tasks that belong to a module — `fabric:runClient` for `:fabric`
 * — relabelled without the module prefix. Tasks of deeper modules stay with
 * those.
 */
export function tasksOfModule(list: GradleTaskList | undefined, moduleId: string): ProjectTask[] {
  if (!list) return []
  const prefix = `${moduleId.replace(/^:/, '')}:`
  return list.tasks
    .filter((task) => task.label.startsWith(prefix) && !task.label.slice(prefix.length).includes(':'))
    .map((task) => ({ ...task, id: `${task.id}@${moduleId}`, label: task.label.slice(prefix.length) }))
}

/** The loaded tasks of the root project itself (no module prefix). */
export function rootTasks(list: GradleTaskList | undefined): ProjectTask[] {
  return (list?.tasks ?? []).filter((task) => !task.label.includes(':'))
}
