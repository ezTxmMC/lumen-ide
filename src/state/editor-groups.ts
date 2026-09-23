/**
 * Editor groups (split view) as data, plus `commitGroups`, the one place that
 * turns a new arrangement into state — closing whatever no group shows any
 * more.
 */

import { lsp } from '@/core/lsp/manager'
import { symbolStore } from '@/lib/symbols'
import { scheduleOpenFilesSync } from './session'
import { settleGroups } from './popout'
import type { EditorGroup, State, Tab } from './types'

export const FIRST_GROUP_ID = 'group-1'

let tabCounter = 0
let groupCounter = 1

export const nextTabId = () => `tab-${++tabCounter}`
export const nextGroupId = () => `group-${++groupCounter}`

export interface StoreAccess {
  get: () => State
  set: (partial: Partial<State> | ((state: State) => Partial<State>)) => void
}

export function currentGroup(s: State): EditorGroup {
  return s.groups.find((g) => g.id === s.activeGroupId) ?? s.groups[0]
}

export function withoutTab(group: EditorGroup, tabId: string): EditorGroup {
  const index = group.tabIds.indexOf(tabId)
  if (index === -1) return group
  const tabIds = group.tabIds.filter((id) => id !== tabId)
  if (group.activeTabId !== tabId) return { ...group, tabIds }
  return { ...group, tabIds, activeTabId: tabIds[index] ?? tabIds[index - 1] ?? null }
}

export function withTab(group: EditorGroup, tabId: string): EditorGroup {
  if (group.tabIds.includes(tabId)) return { ...group, activeTabId: tabId }
  return { ...group, tabIds: [...group.tabIds, tabId], activeTabId: tabId }
}

export function insertAt(group: EditorGroup, tabId: string, index?: number): EditorGroup {
  const tabIds = [...group.tabIds]
  tabIds.splice(index ?? tabIds.length, 0, tabId)
  return { ...group, tabIds }
}

export function reorder(group: EditorGroup, tabId: string, index?: number): EditorGroup {
  const without = group.tabIds.filter((id) => id !== tabId)
  const target = Math.min(index ?? without.length, without.length)
  without.splice(target, 0, tabId)
  return { ...group, tabIds: without, activeTabId: tabId }
}

/**
 * Takes on new groups: empty secondary groups fall away, tabs without a group
 * are closed (language servers, symbols) and remembered for “reopen”.
 */
export function commitGroups(
  { get, set }: StoreAccess,
  groups: EditorGroup[],
  activeGroupId: string,
  options: { remember?: boolean } = {},
) {
  const s = get()
  // The main window keeps a group of its own even while every tab sits in a popped-out window.
  const list = settleGroups(groups, s.popouts, () => ({ id: groups[0]?.id ?? FIRST_GROUP_ID, tabIds: [], activeTabId: null }))
  const active = list.find((g) => g.id === activeGroupId) ?? list[0]
  const referenced = new Set(list.flatMap((g) => g.tabIds))
  const closed = s.tabs.filter((tab) => !referenced.has(tab.id))
  for (const tab of closed) {
    lsp.closeDocument(tab.path)
    if (tab.path) symbolStore.clear(tab.path)
  }
  const remembered = options.remember === false
    ? []
    : closed.filter((tab) => tab.path && !tab.virtual).map((tab) => tab.path!)
  set({
    tabs: closed.length ? s.tabs.filter((tab) => referenced.has(tab.id)) : s.tabs,
    groups: list,
    activeGroupId: active.id,
    activeTabId: active.activeTabId,
    closedTabs: remembered.length
      ? [...remembered, ...s.closedTabs.filter((p) => !remembered.includes(p))].slice(0, 30)
      : s.closedTabs,
  })
  scheduleOpenFilesSync(get, set)
}

export function addTabToActiveGroup(access: StoreAccess, tab: Tab) {
  const s = access.get()
  access.set({ tabs: [...s.tabs, tab] })
  const group = currentGroup(s)
  commitGroups(access, s.groups.map((g) => (g.id === group.id ? withTab(g, tab.id) : g)), group.id, { remember: false })
}
