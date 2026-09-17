/**
 * The built-in terminals in the renderer: xterm.js instances that survive the
 * panel being closed and reopened. The process itself (node-pty) runs in the
 * main process.
 */

import { Terminal, type ITheme, type ILink } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { Effects } from '@/core/theme'
import type { SyntaxStyle, Theme } from '@/core/types'
import { t } from '@/i18n'

export interface ShellProfile {
  id: string
  label: string
  path: string
  args: string[]
  isDefault?: boolean
}

export interface ExternalTerminal {
  id: string
  label: string
  command: string
}

export interface TerminalSession {
  id: string
  /** Set by the user, or by the shell through an OSC title. */
  title: string
  shell: string
  cwd: string
  pid: number | null
  /** Exit code, once the process has finished. */
  exitCode: number | null
  error: string | null
  term: Terminal
  fit: FitAddon
  element: HTMLDivElement
}

export interface CreateOptions {
  shell?: string
  cwd?: string
  title?: string
  env?: Record<string, string>
  /** A command typed in after the start. */
  command?: string
}

type OpenLocation = (path: string, line: number, character: number) => void

/** file:line:column in the output — relative or absolute. */
const PATH_PATTERN = /(?:^|[\s'"(\[])((?:[A-Za-z]:)?(?:\.{0,2}\/)?[\w.@+-]+(?:\/[\w.@+-]+)*\.[A-Za-z0-9]{1,8})(?::(\d+))?(?::(\d+))?/g

let counter = 0

class TerminalManager {
  private sessions = new Map<string, TerminalSession>()
  private order: string[] = []
  private listeners = new Set<() => void>()
  private version = 0
  private started = false
  private theme: ITheme = {}
  private options: Pick<Effects, 'terminalFontSize' | 'terminalCursor' | 'fontFamily' | 'terminalCopyOnSelect' | 'ligatures'> = {
    terminalFontSize: 13, terminalCursor: 'bar', fontFamily: 'monospace', terminalCopyOnSelect: false, ligatures: false,
  }
  activeId: string | null = null
  /** Terminals currently starting, not yet in the list. */
  pending = 0
  shells: ShellProfile[] = []
  externals: ExternalTerminal[] = []
  openLocation: OpenLocation = () => {}
  /** Extra environment for new terminals (JAVA_HOME of the active JDK, say); project variables win. */
  envProvider: () => Record<string, string> = () => ({})

  /* ---------------------------------------------------------------- */

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  getVersion = () => this.version

  private emit() {
    this.version++
    for (const fn of this.listeners) fn()
  }

  list(): TerminalSession[] {
    return this.order.map((id) => this.sessions.get(id)!).filter(Boolean)
  }

  get(id: string | null) {
    if (!id) return null
    return this.sessions.get(id) ?? null
  }

  /** Once: subscribe to the main process's events and detect the shells. */
  async start() {
    if (this.started) return
    this.started = true
    window.lumen.terminal.onData(({ id, data }) => this.sessions.get(id)?.term.write(data))
    window.lumen.terminal.onExit(({ id, code }) => this.handleExit(id, code))
    await this.refreshProfiles()
  }

  async refreshProfiles() {
    const [shells, externals] = await Promise.all([
      window.lumen.terminal.shells().catch(() => []),
      window.lumen.terminal.externalTerminals().catch(() => []),
    ])
    this.shells = shells
    this.externals = externals
    this.emit()
  }

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */

  async create(options: CreateOptions = {}): Promise<string> {
    this.pending++
    try {
      await this.start()
    } finally {
      this.pending--
    }
    const id = `term-${++counter}`
    const element = document.createElement('div')
    element.className = 'lm-terminal h-full w-full'
    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: this.options.terminalCursor,
      fontFamily: this.options.fontFamily,
      fontSize: this.options.terminalFontSize,
      lineHeight: 1.15,
      scrollback: 10_000,
      theme: this.theme,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((event, uri) => {
      event.preventDefault()
      void window.lumen.shell.openExternal(uri)
    }))
    term.open(element)

    const profile = this.shells.find((s) => s.id === options.shell || s.path === options.shell)
      ?? this.shells.find((s) => s.isDefault)
    const session: TerminalSession = {
      id,
      title: options.title ?? profile?.label ?? t('run.terminal'),
      shell: profile?.label ?? t('run.shell'),
      cwd: options.cwd ?? '',
      pid: null,
      exitCode: null,
      error: null,
      term,
      fit,
      element,
    }
    this.sessions.set(id, session)
    this.order.push(id)
    this.activeId = id
    this.wire(session)
    this.emit()

    try {
      const info = await window.lumen.terminal.create(id, {
        shell: profile?.path ?? options.shell,
        cwd: options.cwd,
        cols: term.cols,
        rows: term.rows,
        env: { ...this.envProvider(), ...(options.env ?? {}) },
      })
      session.pid = info.pid
      session.cwd = info.cwd
      session.shell = info.shell
      if (!options.title) session.title = info.shell
      this.emit()
      if (options.command) window.setTimeout(() => void window.lumen.terminal.write(id, `${options.command}\r`), 150)
    } catch (err) {
      session.error = (err as Error).message
      session.exitCode = -1
      term.write(`\x1b[31m${session.error}\x1b[0m\r\n`)
      this.emit()
    }
    return id
  }

  private wire(session: TerminalSession) {
    const { term, id } = session
    term.onData((data) => {
      if (session.exitCode === null) {
        void window.lumen.terminal.write(id, data)
        return
      }
      // A finished process: a key closes the tab.
      this.close(id)
    })
    term.onResize(({ cols, rows }) => {
      if (session.exitCode !== null) return
      void window.lumen.terminal.resize(id, cols, rows)
    })
    term.onTitleChange((title) => {
      if (!title.trim()) return
      session.title = title.trim().slice(0, 60)
      this.emit()
    })
    term.onSelectionChange(() => {
      if (!this.options.terminalCopyOnSelect || !term.hasSelection()) return
      void navigator.clipboard.writeText(term.getSelection()).catch(() => {})
    })
    term.attachCustomKeyEventHandler((event) => this.handleKey(session, event))
    term.registerLinkProvider({
      provideLinks: (line, callback) => void this.fileLinks(session, line).then(callback),
    })
  }

  /** Copy and paste as in other terminals; global shortcuts pass through. */
  private handleKey(session: TerminalSession, event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') return true
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (mod && event.shiftKey && key === 'c') {
      if (session.term.hasSelection()) void navigator.clipboard.writeText(session.term.getSelection())
      return false
    }
    if (mod && event.shiftKey && key === 'v') {
      void navigator.clipboard.readText().then((text) => session.term.paste(text)).catch(() => {})
      return false
    }
    // Ctrl+C with a selection copies rather than sending SIGINT (as Windows Terminal and IntelliJ do).
    if (event.ctrlKey && !event.shiftKey && key === 'c' && session.term.hasSelection()) {
      void navigator.clipboard.writeText(session.term.getSelection())
      session.term.clearSelection()
      return false
    }
    return true
  }

  private async fileLinks(session: TerminalSession, lineNumber: number): Promise<ILink[] | undefined> {
    const line = session.term.buffer.active.getLine(lineNumber - 1)
    if (!line) return undefined
    const text = line.translateToString(true)
    const links: ILink[] = []
    for (const m of text.matchAll(PATH_PATTERN)) {
      const raw = m[1]
      if (/^\d+(\.\d+)+$/.test(raw)) continue
      const absolute = raw.startsWith('/') || /^[A-Za-z]:/.test(raw)
      const full = absolute ? raw : `${session.cwd.replace(/\/$/, '')}/${raw.replace(/^\.\//, '')}`
      const exists = await window.lumen.fs.stat(full).then((s) => Boolean(s && !s.isDirectory)).catch(() => false)
      if (!exists) continue
      const start = (m.index ?? 0) + m[0].indexOf(raw) + 1
      const suffix = `${m[2] ? `:${m[2]}` : ''}${m[3] ? `:${m[3]}` : ''}`
      links.push({
        range: { start: { x: start, y: lineNumber }, end: { x: start + raw.length + suffix.length - 1, y: lineNumber } },
        text: raw + suffix,
        activate: () => this.openLocation(full, Math.max(0, Number(m[2] ?? 1) - 1), Math.max(0, Number(m[3] ?? 1) - 1)),
      })
    }
    return links
  }

  private handleExit(id: string, code: number) {
    const session = this.sessions.get(id)
    if (!session) return
    session.exitCode = code
    session.term.write(`\r\n\x1b[2m${t('run.terminalExited', { code: String(code) })}\x1b[0m\r\n`)
    this.emit()
  }

  setActive(id: string) {
    if (!this.sessions.has(id)) return
    this.activeId = id
    this.emit()
  }

  rename(id: string, title: string) {
    const session = this.sessions.get(id)
    if (!session || !title.trim()) return
    session.title = title.trim()
    this.emit()
  }

  close(id: string) {
    const session = this.sessions.get(id)
    if (!session) return
    void window.lumen.terminal.kill(id)
    session.term.dispose()
    session.element.remove()
    this.sessions.delete(id)
    const index = this.order.indexOf(id)
    this.order = this.order.filter((x) => x !== id)
    if (this.activeId === id) this.activeId = this.order[Math.min(index, this.order.length - 1)] ?? null
    this.emit()
  }

  closeAll() {
    for (const id of [...this.order]) this.close(id)
  }

  /** Send text to the terminal — running a selection, for instance. */
  send(id: string, text: string) {
    const session = this.sessions.get(id)
    if (!session || session.exitCode !== null) return
    void window.lumen.terminal.write(id, text)
    session.term.focus()
  }

  clear(id: string | null) {
    this.get(id)?.term.clear()
  }

  /* ---------------------------------------------------------------- *
   * Presentation
   * ---------------------------------------------------------------- */

  /** Hang the element in the visible container and fit its size. */
  attach(id: string, host: HTMLElement) {
    const session = this.sessions.get(id)
    if (!session) return
    if (session.element.parentElement !== host) {
      host.replaceChildren(session.element)
    }
    this.fit(id)
  }

  fit(id: string | null) {
    const session = this.get(id)
    if (!session || !session.element.isConnected) return
    try {
      session.fit.fit()
    } catch {
      // The container has no size yet.
    }
  }

  focus(id: string | null) {
    this.get(id)?.term.focus()
  }

  configure(theme: Theme, effects: Effects) {
    this.theme = xtermTheme(theme)
    this.options = {
      terminalFontSize: effects.terminalFontSize,
      terminalCursor: effects.terminalCursor,
      fontFamily: effects.fontFamily,
      terminalCopyOnSelect: effects.terminalCopyOnSelect,
      ligatures: effects.ligatures,
    }
    for (const session of this.sessions.values()) {
      session.term.options.theme = this.theme
      session.term.options.fontSize = effects.terminalFontSize
      session.term.options.fontFamily = effects.fontFamily
      session.term.options.cursorStyle = effects.terminalCursor
      this.fit(session.id)
    }
  }
}

function color(value: string | SyntaxStyle | undefined, fallback: string): string {
  if (!value) return fallback
  if (typeof value === 'string') return value
  return value.color
}

/** The Lumen theme → xterm colours: the base areas from the interface, ANSI from the signal and syntax colours. */
export function xtermTheme(theme: Theme): ITheme {
  const ui = theme.ui
  const s = theme.syntax
  const dark = theme.type === 'dark'
  return {
    background: ui.bgElevated,
    foreground: ui.text,
    cursor: ui.cursor,
    cursorAccent: ui.bgElevated,
    selectionBackground: ui.selection,
    black: dark ? '#1c1f24' : '#3b3f46',
    red: ui.danger,
    green: ui.success,
    yellow: ui.warning,
    blue: color(s.function, '#61afef'),
    magenta: color(s.keyword, '#c678dd'),
    cyan: color(s.type, '#56b6c2'),
    white: dark ? ui.textMuted : '#a0a4ab',
    brightBlack: ui.textSubtle,
    brightRed: ui.danger,
    brightGreen: ui.success,
    brightYellow: ui.warning,
    brightBlue: color(s.function, '#61afef'),
    brightMagenta: color(s.keyword, '#c678dd'),
    brightCyan: color(s.type, '#56b6c2'),
    brightWhite: ui.text,
  }
}

export const terminals = new TerminalManager()
