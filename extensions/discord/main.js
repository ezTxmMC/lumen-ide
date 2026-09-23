/**
 * Discord Rich Presence for Lumen: shows in Discord what is being worked on —
 * the file, the project, the language, how long.
 *
 * The code talks to the local Discord client itself (`src/ipc.js`, the
 * socket `discord-ipc-N`) and works from what Lumen reports: the active file
 * with its language, the project, the window's focus. Nothing leaves the
 * machine except through Discord, and only what the settings allow.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { DiscordIpcClient } from './src/ipc.js'
import { buildActivity, isInside, readSettings, repoUrlFromGitConfig } from './src/activity.js'
import { createT } from './src/i18n.js'

/** A short rest, so that typing or switching tabs quickly does not send every time. */
const DEBOUNCE_MS = 600
/** How often idleness is checked while the window has no focus. */
const IDLE_CHECK_MS = 30_000

const STATUS_LOOK = {
  connected: { icon: 'messages', tone: 'success' },
  connecting: { icon: 'loader', tone: 'muted' },
  disconnected: { icon: 'circle-dashed', tone: 'muted' },
  error: { icon: 'circle-alert', tone: 'danger' },
}

/** The web link of the repository at `root`, from `.git/config`; `null` when there is none. */
async function readRepoUrl(root) {
  if (!root) return null
  const text = await fs.readFile(path.join(root, '.git', 'config'), 'utf8').catch(() => null)
  return text ? repoUrlFromGitConfig(text) : null
}

export function activate(ctx) {
  const t = createT(ctx)
  const sessionStart = Date.now()

  let settings = readSettings(ctx.settings.all())
  let enabled = ctx.storage.get('enabled', true) !== false
  /** Folders marked private with the command — next to the ones typed into the settings. */
  let markedPrivate = ctx.storage.get('privateProjects', [])
  if (!Array.isArray(markedPrivate)) markedPrivate = []

  const lastFile = ctx.events.last('activeFile')
  const lastProject = ctx.events.last('project')
  let file = lastFile?.path ? lastFile : null
  let project = lastProject?.root ? { root: lastProject.root, name: lastProject.name } : null
  let fileStart = Date.now()
  let projectStart = Date.now()
  let blurredAt = null
  let idle = false
  let repoUrl = null

  let timer = null
  let idleTimer = null
  let disposed = false
  /** Does the next connection announce itself (after a command)? */
  let announce = false
  let lastError = ''
  let hintShown = false

  const client = new DiscordIpcClient({
    onStatus(status) {
      updateStatusBar()
      onStatus(status)
    },
    log: (message) => ctx.log(message),
  })

  /* The activity ------------------------------------------------------ */

  const isPrivate = () => Boolean(project) && isInside(project.root, [...settings.privateProjects, ...markedPrivate])

  function startOf() {
    if (settings.elapsedFrom === 'file' && file) return fileStart
    if (settings.elapsedFrom === 'project' && project) return projectStart
    return sessionStart
  }

  function push() {
    if (disposed) return
    // The settings arrive from the window; until then nothing is known about the user's wishes.
    if (!Object.keys(ctx.settings.all()).length) return
    if (!enabled) {
      client.stop()
      return
    }
    if (!settings.clientId) {
      client.stop()
      if (hintShown) return
      hintShown = true
      ctx.ui.notify(t('toast.missingClientId'), 'info')
      return
    }
    const activity = buildActivity({
      file: file ? { path: file.path, languageId: file.languageId, languageName: file.languageName } : null,
      project,
      private: isPrivate(),
      idle,
      start: startOf(),
      version: ctx.appVersion,
      repoUrl,
    }, settings, t)
    client.update(settings.clientId, activity)
  }

  function schedule() {
    if (timer || disposed) return
    timer = setTimeout(() => {
      timer = null
      push()
    }, DEBOUNCE_MS)
  }

  /* Status ------------------------------------------------------------ */

  function updateStatusBar() {
    if (disposed) return
    if (!enabled) {
      ctx.statusBar.set('status', {
        text: 'Discord', icon: 'pause', tone: 'muted', tooltip: t('status.disabled'), command: 'discord.enable', side: 'right', priority: 5,
      })
      return
    }
    const status = client.status()
    const look = STATUS_LOOK[status.state] ?? STATUS_LOOK.disconnected
    ctx.statusBar.set('status', {
      text: 'Discord',
      icon: look.icon,
      tone: look.tone,
      tooltip: `${statusText(status)}\n${t('status.click')}`,
      command: 'discord.reconnect',
      side: 'right',
      priority: 5,
    })
  }

  function statusText(status) {
    if (!settings.clientId) return t('status.noClientId')
    if (status.state === 'connected' && status.user) return t('status.connectedAs', { user: status.user })
    if (status.state === 'error') return t('status.error', { message: status.message ?? '' })
    return t(`status.${status.state}`)
  }

  function onStatus(status) {
    if (disposed) return
    if (status.state === 'connected' && announce) {
      announce = false
      ctx.ui.notify(status.user ? t('toast.connectedAs', { user: status.user }) : t('toast.connected'), 'success')
      return
    }
    if (status.state !== 'error' || !status.message || status.message === lastError) return
    lastError = status.message
    ctx.ui.notify(t('toast.error', { message: status.message }), 'warning')
  }

  /* Idleness ---------------------------------------------------------- */

  function checkIdle() {
    const now = blurredAt !== null && settings.idleMinutes > 0 && Date.now() - blurredAt >= settings.idleMinutes * 60_000
    if (now === idle) return
    idle = now
    push()
  }

  function stopIdleTimer() {
    if (!idleTimer) return
    clearInterval(idleTimer)
    idleTimer = null
  }

  /* Commands ---------------------------------------------------------- */

  function setEnabled(value) {
    enabled = value
    void ctx.storage.set('enabled', value)
    lastError = ''
    announce = value
    ctx.ui.notify(t(value ? 'toast.enabled' : 'toast.disabled'), 'info')
    updateStatusBar()
    push()
  }

  const commands = {
    'discord.reconnect': () => {
      if (!enabled) {
        setEnabled(true)
        return
      }
      if (!settings.clientId) {
        ctx.ui.notify(t('toast.missingClientId'), 'info')
        return
      }
      announce = true
      lastError = ''
      ctx.ui.notify(t('toast.connecting'), 'info')
      push()
      client.reconnect()
    },
    'discord.enable': () => setEnabled(true),
    'discord.disable': () => setEnabled(false),
    'discord.toggle': () => setEnabled(!enabled),
    'discord.toggle-private': () => {
      if (!project) {
        ctx.ui.notify(t('toast.noProject'), 'info')
        return
      }
      const marked = markedPrivate.includes(project.root)
      markedPrivate = marked ? markedPrivate.filter((root) => root !== project.root) : [...markedPrivate, project.root]
      void ctx.storage.set('privateProjects', markedPrivate)
      ctx.ui.notify(t(marked ? 'toast.privateOff' : 'toast.privateOn', { project: project.name ?? project.root }), 'info')
      push()
    },
  }
  for (const [id, run] of Object.entries(commands)) ctx.commands.register(id, run)

  /* Events ------------------------------------------------------------ */

  async function loadRepoUrl() {
    const root = project?.root ?? null
    const url = await readRepoUrl(root)
    if (disposed || (project?.root ?? null) !== root) return
    repoUrl = url
    schedule()
  }

  ctx.events.on('activeFile', (event) => {
    const next = event.path ? event : null
    if (next?.path !== file?.path) fileStart = Date.now()
    file = next
    schedule()
  })
  ctx.events.on('project', (event) => {
    const root = event.root ?? null
    if (root !== (project?.root ?? null)) projectStart = Date.now()
    project = root ? { root, name: event.name } : null
    repoUrl = null
    void loadRepoUrl()
    schedule()
  })
  ctx.events.on('windowBlur', () => {
    blurredAt = Date.now()
    stopIdleTimer()
    idleTimer = setInterval(checkIdle, IDLE_CHECK_MS)
  })
  ctx.events.on('windowFocus', () => {
    blurredAt = null
    stopIdleTimer()
    checkIdle()
  })
  ctx.events.on('locale', () => {
    updateStatusBar()
    schedule()
  })
  ctx.settings.onDidChange((values) => {
    const before = settings.clientId
    settings = readSettings(values)
    if (settings.clientId !== before) hintShown = false
    lastError = ''
    updateStatusBar()
    checkIdle()
    schedule()
  })

  updateStatusBar()
  void loadRepoUrl()
  push()

  return () => {
    disposed = true
    if (timer) clearTimeout(timer)
    stopIdleTimer()
    client.stop()
  }
}
