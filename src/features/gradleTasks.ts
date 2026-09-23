/**
 * Gradle tasks at hand when a project opens: the cached `gradle tasks --all`
 * result right away, and — when there is none yet — a quiet fetch in the
 * background, so tasks from plugins and dependencies (`runClient`,
 * `runServer`, `genSources` …) show up without a click.
 */

import { useStore } from '@/state/store'
import { loadGradleTasks, restoreGradleTasks } from '@/lib/gradle-tasks'

let started = false
let lastRoot: string | null = null

/** Give Gradle a moment: the project just opened, language servers are starting. */
const BACKGROUND_DELAY_MS = 4000

async function onProject(root: string) {
  const cached = await restoreGradleTasks(root)
  if (cached) return
  const state = useStore.getState()
  if (!state.effects.gradleTasksOnOpen) return
  window.setTimeout(() => {
    const now = useStore.getState()
    if (now.project?.root !== root) return
    const gradle = now.project.kinds.find((detected) => detected.kind.id === 'gradle')
    if (!gradle) return
    void loadGradleTasks(root, gradle.tasks[0]?.command ?? 'gradle', now.projectConfig.env)
  }, BACKGROUND_DELAY_MS)
}

export function init() {
  if (started) return
  started = true
  useStore.subscribe((state) => {
    const project = state.project
    const root = project?.kinds.some((detected) => detected.kind.id === 'gradle') ? project.root : null
    if (root === lastRoot) return
    lastRoot = root
    if (root) void onProject(root)
  })
}
