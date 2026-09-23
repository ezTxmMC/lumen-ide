/**
 * Open files: tabs, editor groups (split view), saving, and keeping open tabs
 * in step with the disk.
 */

import { registry } from '@/core/registry'
import { lsp } from '@/core/lsp/manager'
import { isVirtualUri } from '@/core/lsp/protocol'
import { matchLanguage } from '@/core/language'
import { isProjectConfigPath } from '@/core/project/config'
import { editorBridge } from '@/lib/editor-bridge'
import { symbolStore } from '@/lib/symbols'
import { readText, toDisk, type LineEnding } from '@/lib/line-endings'
import { t } from '@/i18n'
import { isSvgPath, mediaKindForPath, sniffMediaKind, type MediaKind } from '@/lib/media-kind'
import {
  addTabToActiveGroup, commitGroups, currentGroup, FIRST_GROUP_ID, insertAt, nextGroupId, nextTabId,
  reorder, withoutTab, withTab, type StoreAccess,
} from '../editor-groups'
import { scheduleOpenFilesSync } from '../session'
import { visibleGroups } from '../popout'
import { claimFileOpen } from '@/core/file-open-claims'
import type { EditorGroup, EditorSlice, FsChange, Slice, State, Tab } from '../types'

let revealCounter = 0

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path
const errorText = (err: unknown) => (err as Error).message.replace(/^Error: /, '')

/** A file that failed to load as text: what its first bytes say it is, if not text. */
async function sniffFile(path: string): Promise<MediaKind | null> {
  const info = await window.lumen.media.inspect(path, 4096).catch(() => null)
  return info ? sniffMediaKind(info.head) : null
}

/** Open a virtual document (jdt:// classes from jars) — `false` when that is not possible. */
async function openVirtualUri(get: () => State, uri: string): Promise<boolean> {
  const state = get()
  const existing = state.tabs.find((tab) => tab.path === uri)
  if (existing) {
    state.setActiveTab(existing.id)
    return true
  }
  if (!uri.startsWith('jdt://')) {
    state.notify(t('notify.unsupportedUri', { scheme: uri.split(':')[0] }), 'warning')
    return false
  }
  // The server that owns the file being read — a build may have several.
  const from = state.activeTab()?.path ?? null
  const client = lsp.clientForPath(from) ?? lsp.clientForLanguage('java')
  const content = client ? await client.classFileContents(uri) : null
  if (content === null) {
    state.notify(t('notify.classSourceFailed'), 'warning')
    return false
  }
  const name = decodeURIComponent(uri.split('?')[0].split('/').pop() ?? 'Klasse').replace(/\.class$/, '.java')
  state.openVirtual(uri, name, content, 'java')
  return true
}

export const createEditorSlice: Slice<EditorSlice> = (set, get) => {
  const access: StoreAccess = { get, set }
  const commit = (groups: EditorGroup[], activeGroupId: string, options?: { remember?: boolean }) =>
    commitGroups(access, groups, activeGroupId, options)
  const patchTab = (id: string, patch: Partial<Tab>) =>
    set((s) => ({ tabs: s.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)) }))

  /** Reconcile one change on disk with its open tab. */
  async function applyFsChange(change: FsChange) {
    const tab = get().tabs.find((open) => open.path === change.path && !open.virtual)
    if (!tab) return
    if (change.type === 3) {
      patchTab(tab.id, { missing: true })
      return
    }
    if (tab.viewer) {
      patchTab(tab.id, { missing: false, revision: (tab.revision ?? 0) + 1 })
      // A viewer without text (anything but an SVG shown as text before) has nothing more to reconcile.
      if (tab.readonly) return
    }
    const disk = await readText(change.path).then((read) => read.text, () => null)
    if (disk === null) return
    const current = get().tabs.find((open) => open.id === tab.id)
    if (!current) return
    if (disk === current.content && disk !== current.saved) {
      // Our own save, whose event arrived before the state did.
      patchTab(tab.id, { saved: disk, missing: false, diskChanged: false })
      return
    }
    if (disk === current.saved) {
      if (current.missing) patchTab(tab.id, { missing: false })
      return
    }
    if (current.content === current.saved) {
      await get().reloadTab(tab.id)
      return
    }
    if (current.diskChanged) return
    patchTab(tab.id, { diskChanged: true, missing: false })
    get().notify(t('notify.changedOutside', { name: current.name }), 'warning')
  }

  /**
   * Add a freshly opened file's tab to the active group — the group's preview
   * tab is reused rather than stacked. `false` when a concurrent open (a double
   * click) got there first; that tab is shown instead.
   */
  function insertTab(tab: Tab): boolean {
    const s = get()
    const twin = s.tabs.find((open) => open.path === tab.path)
    if (twin) {
      if (!tab.preview && twin.preview) get().pinTab(twin.id)
      get().setActiveTab(twin.id)
      return false
    }
    const group = currentGroup(s)
    const replaced = tab.preview ? group.tabIds.filter((id) => s.tabs.find((open) => open.id === id)?.preview) : []
    set({ tabs: [...s.tabs, tab] })
    commit(
      s.groups.map((g) => (g.id === group.id ? withTab(replaced.reduce(withoutTab, g), tab.id) : g)),
      group.id,
      { remember: false },
    )
    scheduleOpenFilesSync(get, set)
    return true
  }

  /** A read-only tab for a non-text viewer; the file itself streams through `lumen-file://`. */
  async function openViewer(path: string, viewer: MediaKind, preview: boolean) {
    try {
      // Also what allows the viewer to load the file.
      await window.lumen.media.inspect(path, 0)
    } catch (err) {
      get().notify(`${fileName(path)}: ${errorText(err)}`, 'error')
      throw err
    }
    insertTab({
      id: nextTabId(),
      path,
      name: fileName(path),
      content: '',
      saved: '',
      languageId: matchLanguage(path, registry.languages())?.id ?? null,
      preview,
      readonly: true,
      viewer,
    })
  }

  return {
    tabs: [],
    activeTabId: null,
    groups: [{ id: FIRST_GROUP_ID, tabIds: [], activeTabId: null }],
    activeGroupId: FIRST_GROUP_ID,
    splitDirection: 'right',
    splitRatio: 0.5,
    closedTabs: [],
    cursor: { line: 0, character: 0 },
    reveal: null,
    recentFiles: [],

    async openFile(path, preview = false) {
      const existing = get().tabs.find((tab) => tab.path === path)
      if (existing) {
        if (!preview && existing.preview) get().pinTab(existing.id)
        get().setActiveTab(existing.id)
        return
      }
      // An extension may open this kind of file itself (a database, say).
      if (await claimFileOpen(path)) return

      const kind = mediaKindForPath(path)
      if (kind) {
        await openViewer(path, kind, preview)
        return
      }

      let content: string
      let eol: LineEnding
      try {
        ({ text: content, eol } = await readText(path))
      } catch (err) {
        // Binary content or a huge file: a viewer may still show it.
        const sniffed = await sniffFile(path)
        if (sniffed) {
          await openViewer(path, sniffed, preview)
          return
        }
        get().notify(`${fileName(path)}: ${errorText(err)}`, 'error')
        throw err
      }

      const language = matchLanguage(path, registry.languages())
      const added = insertTab({
        id: nextTabId(),
        path,
        name: fileName(path),
        content,
        saved: content,
        eol,
        languageId: language?.id ?? null,
        preview,
      })
      if (added) void lsp.openDocument(language, path, content)
    },

    async setTabTextMode(id, text) {
      const tab = get().tabs.find((open) => open.id === id)
      if (!tab?.path || !isSvgPath(tab.path)) return
      if (!text) {
        patchTab(id, { viewer: 'image' })
        return
      }
      if (!tab.viewer) return
      // Text already loaded (switched back and forth): keep it, edits included.
      if (!tab.readonly) {
        patchTab(id, { viewer: undefined })
        return
      }
      let content: string
      let eol: LineEnding
      try {
        ({ text: content, eol } = await readText(tab.path))
      } catch (err) {
        get().notify(`${tab.name}: ${errorText(err)}`, 'error')
        return
      }
      patchTab(id, { viewer: undefined, readonly: false, content, saved: content, eol, diskChanged: false })
      const fresh = get().tabs.find((open) => open.id === id)
      if (fresh?.path) void lsp.openDocument(get().languageFor(fresh), fresh.path, content)
    },

    async openAt(path, line, character, endLine, endCharacter) {
      const opened = isVirtualUri(path)
        ? await openVirtualUri(get, path)
        : await get().openFile(path).then(() => true, () => false)
      if (!opened) return
      const tab = get().tabs.find((open) => open.path === path)
      if (!tab) return
      set({ reveal: { tabId: tab.id, groupId: get().activeGroupId, line, character, endLine, endCharacter, token: ++revealCounter } })
    },

    openVirtual(uri, name, content, languageId) {
      addTabToActiveGroup(access, {
        id: nextTabId(), path: uri, name, content, saved: content, languageId,
        preview: false, readonly: true, virtual: true,
      })
    },

    consumeReveal() {
      set({ reveal: null })
    },

    newFile() {
      addTabToActiveGroup(access, {
        id: nextTabId(), path: null, name: t('common.untitled'), content: '', saved: '', languageId: null, preview: false,
      })
    },

    closeTab(id, groupId) {
      const s = get()
      const active = currentGroup(s)
      const group = s.groups.find((g) => g.id === groupId)
        ?? (active.tabIds.includes(id) ? active : s.groups.find((g) => g.tabIds.includes(id)))
      if (!group) return
      commit(s.groups.map((g) => (g.id === group.id ? withoutTab(g, id) : g)), s.activeGroupId)
    },

    closeTabEverywhere(id) {
      const s = get()
      commit(s.groups.map((g) => withoutTab(g, id)), s.activeGroupId)
    },

    closeOthers(id) {
      const s = get()
      const active = currentGroup(s)
      const group = active.tabIds.includes(id) ? active : s.groups.find((g) => g.tabIds.includes(id))
      if (!group) return
      commit(s.groups.map((g) => (g.id === group.id ? { ...g, tabIds: [id], activeTabId: id } : g)), group.id)
    },

    closeAll() {
      const s = get()
      // Popped-out groups go too: their windows close once their group is gone.
      const home = visibleGroups(s.groups, s.popouts)[0] ?? s.groups[0]
      commit([{ id: home.id, tabIds: [], activeTabId: null }], home.id)
      set({ reveal: null })
    },

    setActiveTab(id, groupId) {
      const s = get()
      if (!s.tabs.some((tab) => tab.id === id)) return
      const target = s.groups.find((g) => g.id === groupId) ?? currentGroup(s)
      commit(s.groups.map((g) => (g.id === target.id ? withTab(g, id) : g)), target.id, { remember: false })
    },

    cycleTab(delta) {
      const group = currentGroup(get())
      if (group.tabIds.length < 2) return
      const index = group.tabIds.indexOf(group.activeTabId ?? '')
      const next = group.tabIds[(index + delta + group.tabIds.length) % group.tabIds.length]
      get().setActiveTab(next, group.id)
    },

    async reopenClosedTab() {
      const s = get()
      const path = s.closedTabs.find((p) => !s.tabs.some((tab) => tab.path === p))
      if (!path) return
      set({ closedTabs: s.closedTabs.filter((p) => p !== path) })
      await get().openFile(path).catch(() => {})
    },

    moveTab(tabId, fromGroupId, toGroupId, index) {
      const s = get()
      const from = s.groups.find((g) => g.id === fromGroupId)
      const to = s.groups.find((g) => g.id === toGroupId)
      if (!from || !to) return
      const groups = s.groups.map((g) => {
        if (g.id === from.id && g.id === to.id) return reorder(g, tabId, index)
        if (g.id === from.id) return withoutTab(g, tabId)
        if (g.id === to.id) return withTab(g.tabIds.includes(tabId) ? g : insertAt(g, tabId, index), tabId)
        return g
      })
      commit(groups, to.id, { remember: false })
    },

    splitEditor(direction) {
      const s = get()
      const tabId = s.activeTabId
      if (!tabId) return
      set({ splitDirection: direction })
      // Groups in windows of their own are not part of the split.
      const shown = visibleGroups(s.groups, s.popouts)
      if (shown.length === 1) {
        const second: EditorGroup = { id: nextGroupId(), tabIds: [tabId], activeTabId: tabId }
        commit([...s.groups, second], second.id, { remember: false })
        return
      }
      const other = shown.find((g) => g.id !== s.activeGroupId) ?? shown[1]
      commit(s.groups.map((g) => (g.id === other.id ? withTab(g, tabId) : g)), other.id, { remember: false })
    },

    unsplitEditor() {
      const s = get()
      const shown = visibleGroups(s.groups, s.popouts)
      if (shown.length < 2) return
      const tabIds = [...new Set(shown.flatMap((g) => g.tabIds))]
      const merged: EditorGroup = { id: shown[0].id, tabIds, activeTabId: s.activeTabId ?? tabIds[0] ?? null }
      commit([merged, ...s.groups.filter((g) => !shown.includes(g))], merged.id, { remember: false })
    },

    focusGroup(index) {
      const group = get().groups[index]
      if (!group) return
      set({ activeGroupId: group.id, activeTabId: group.activeTabId })
    },

    focusNextGroup() {
      const s = get()
      const shown = visibleGroups(s.groups, s.popouts)
      if (shown.length < 2) return
      const index = shown.findIndex((g) => g.id === s.activeGroupId)
      get().focusGroup(s.groups.indexOf(shown[(index + 1) % shown.length]))
    },

    moveTabToOtherGroup() {
      const s = get()
      const tabId = s.activeTabId
      const group = currentGroup(s)
      if (!tabId) return
      const shown = visibleGroups(s.groups, s.popouts)
      if (shown.length === 1 && group.tabIds.length < 2) {
        get().splitEditor(s.splitDirection)
        return
      }
      if (shown.length === 1) {
        const second: EditorGroup = { id: nextGroupId(), tabIds: [tabId], activeTabId: tabId }
        commit(s.groups.map((g) => (g.id === group.id ? withoutTab(group, tabId) : g)).concat(second), second.id, { remember: false })
        return
      }
      const other = shown.find((g) => g.id !== group.id) ?? shown[0]
      get().moveTab(tabId, group.id, other.id)
    },

    setSplitRatio(ratio) {
      set({ splitRatio: Math.min(0.85, Math.max(0.15, ratio)) })
    },

    retargetTab(id, path) {
      const language = matchLanguage(path, registry.languages())
      set((s) => ({
        tabs: s.tabs.map((tab) =>
          tab.id === id ? { ...tab, path, name: fileName(path), languageId: language?.id ?? tab.languageId } : tab),
      }))
    },

    pathRenamed(from, to) {
      const prefix = `${from}/`
      for (const tab of get().tabs) {
        if (!tab.path || tab.virtual) continue
        if (tab.path !== from && !tab.path.startsWith(prefix)) continue
        const next = `${to}${tab.path.slice(from.length)}`
        lsp.closeDocument(tab.path)
        symbolStore.clear(tab.path)
        get().retargetTab(tab.id, next)
        const moved = get().tabs.find((open) => open.id === tab.id)
        if (moved && !(moved.viewer && moved.readonly)) void lsp.openDocument(get().languageFor(moved), next, moved.content)
      }
      scheduleOpenFilesSync(get, set)
    },

    pathDeleted(path) {
      const prefix = `${path}/`
      const affected = get().tabs.filter((tab) => tab.path && !tab.virtual && (tab.path === path || tab.path.startsWith(prefix)))
      for (const tab of affected) {
        if (tab.content !== tab.saved) {
          patchTab(tab.id, { missing: true })
          continue
        }
        get().closeTabEverywhere(tab.id)
      }
    },

    async reloadTab(id) {
      const tab = get().tabs.find((open) => open.id === id)
      if (!tab?.path || tab.virtual) return
      if (tab.viewer) patchTab(id, { revision: (tab.revision ?? 0) + 1, missing: false })
      if (tab.viewer && tab.readonly) return
      let content: string
      let eol: LineEnding
      try {
        ({ text: content, eol } = await readText(tab.path))
      } catch (err) {
        get().notify(`${tab.name}: ${errorText(err)}`, 'error')
        return
      }
      patchTab(id, { content, saved: content, eol, diskChanged: false, missing: false })
      // The active tab synchronises through the editor (so undo works) and reports the change itself.
      if (editorBridge.tabId !== id) lsp.changeDocument(tab.path, content)
    },

    async handleFsChanges(changes) {
      for (const change of changes) await applyFsChange(change)
    },

    async syncTabsWithDisk() {
      const changes: FsChange[] = []
      for (const tab of get().tabs) {
        if (!tab.path || tab.virtual) continue
        const exists = await window.lumen.fs.exists(tab.path)
        changes.push({ path: tab.path, type: exists ? 2 : 3 })
      }
      await get().handleFsChanges(changes)
    },

    updateContent(id, content, changes) {
      patchTab(id, { content })
      const tab = get().tabs.find((open) => open.id === id)
      if (tab?.virtual) return
      lsp.changeDocument(tab?.path ?? null, content, changes)
    },

    pinTab(id) {
      patchTab(id, { preview: false })
      scheduleOpenFilesSync(get, set)
    },

    setCursor(cursor) {
      const current = get().cursor
      if (current.line === cursor.line && current.character === cursor.character) return
      set({ cursor })
    },

    async saveTab(id) {
      const s = get()
      const tab = s.tabs.find((open) => open.id === (id ?? s.activeTabId))
      if (!tab || tab.readonly) return

      const target = tab.path ?? await window.lumen.dialog.saveFile(s.workspace ? `${s.workspace}/${tab.name}` : tab.name)
      if (!target) return

      // Formatting and organising imports — only possible for the visible tab.
      if ((s.effects.formatOnSave || s.effects.organizeImportsOnSave) && editorBridge.tabId === tab.id) {
        try { await editorBridge.beforeSave?.(tab.id) } catch { /* saving goes ahead regardless */ }
      }
      const fresh = get().tabs.find((open) => open.id === tab.id) ?? tab

      try {
        await window.lumen.fs.writeFile(target, toDisk(fresh.content, fresh.eol))
      } catch (err) {
        get().notify(errorText(err), 'error')
        return
      }

      const language = matchLanguage(target, registry.languages())
      const wasNew = !tab.path
      patchTab(tab.id, {
        path: target, name: fileName(target), saved: fresh.content, preview: false, diskChanged: false, missing: false,
        languageId: language?.id ?? tab.languageId,
      })
      if (wasNew) void lsp.openDocument(language, target, fresh.content)
      if (!wasNew) lsp.saveDocument(target, fresh.content)
      get().notify(t('common.saved', { name: fileName(target) }), 'success')
      scheduleOpenFilesSync(get, set)
      // Lumen's own project file lives outside the project, where no watcher sees it.
      if (isProjectConfigPath(target)) void get().reloadProjectConfig()
    },

    async saveAll() {
      const dirty = get().tabs.filter((tab) => tab.content !== tab.saved && !tab.readonly)
      for (const tab of dirty) await get().saveTab(tab.id)
    },

    activeTab() {
      const s = get()
      return s.tabs.find((tab) => tab.id === s.activeTabId) ?? null
    },

    languageFor(tab) {
      if (!tab) return null
      if (tab.languageId) return registry.languages().find((language) => language.id === tab.languageId) ?? null
      if (!tab.path || tab.virtual) return null
      return matchLanguage(tab.path, registry.languages())
    },

    languages: () => registry.languages(),
  }
}
