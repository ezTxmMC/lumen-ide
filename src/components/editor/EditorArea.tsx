import { Fragment, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight, Clipboard, Columns2, ExternalLink, FileCode2, FolderSearch, Image as ImageIcon, Pin, Rows2, SquareSplitHorizontal, X,
} from 'lucide-react'
import { useStore, isDirty, type EditorGroup } from '@/state/store'
import { fileGlyph } from '@/lib/file-icon'
import { IconGlyph, useIconPackVersion } from '../icons/FileIcon'
import { formatBindingsFor } from '@/core/keybindings'
import { useT } from '@/i18n'
import { visibleGroups } from '@/state/popout'
import { Editor, useEditorServices } from './Editor'
import { FileBanner } from './FileBanner'
import { MediaViewer } from './viewers/MediaViewer'
import { ExtensionView } from '../extension-view/ExtensionView'
import { parseViewTabPath, viewTabIcon } from '@/core/extensions/host'
import { namedIcon } from '../ui/named-icons'
import { isSvgPath } from '@/lib/media-kind'
import { Welcome } from '../shell/Welcome'
import { Button } from '../ui'
import { ContextMenu, type MenuItem } from '../ui/ContextMenu'

const TAB_MIME = 'application/x-lumen-tab'

interface DragPayload {
  tabId: string
  groupId: string
}

function readPayload(event: React.DragEvent): DragPayload | null {
  try {
    const raw = event.dataTransfer.getData(TAB_MIME)
    return raw ? (JSON.parse(raw) as DragPayload) : null
  } catch {
    return null
  }
}

const hasTabDrag = (event: React.DragEvent) => event.dataTransfer.types.includes(TAB_MIME)

/** The editor area: one or two groups, side by side or stacked. */
export function EditorArea() {
  const allGroups = useStore((s) => s.groups)
  const popouts = useStore((s) => s.popouts)
  // Groups in windows of their own are drawn there.
  const groups = useMemo(() => visibleGroups(allGroups, popouts), [allGroups, popouts])
  const direction = useStore((s) => s.splitDirection)
  const ratio = useStore((s) => s.splitRatio)
  const setRatio = useStore((s) => s.setSplitRatio)
  const hasTabs = useStore((s) => s.tabs.length > 0)
  const container = useRef<HTMLDivElement>(null)
  useEditorServices()

  if (!hasTabs) return <Welcome />

  const horizontal = direction === 'right'

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    const box = container.current?.getBoundingClientRect()
    if (!box) return
    document.body.classList.add(horizontal ? 'lm-resizing' : 'lm-resizing-row')
    const move = (e: PointerEvent) => {
      const value = horizontal ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height
      setRatio(value)
    }
    const up = () => {
      document.body.classList.remove('lm-resizing', 'lm-resizing-row')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      useStore.getState().persist()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const away = popouts.filter((entry) => entry.kind === 'group')
  const shown = groups.some((group) => group.tabIds.length > 0)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {away.length > 0 && <PoppedGroupsBar keys={away.map((entry) => entry.key)} />}
      {!shown && <Welcome />}
      {/* Kept mounted while empty: the main window's editor waits there for the tabs to come home. */}
      <div ref={container} className={`flex min-h-0 flex-1 ${horizontal ? 'flex-row' : 'flex-col'} ${shown ? '' : 'hidden'}`}>
        {groups.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 && (
              <div
                onPointerDown={startResize}
                className={[
                  'lm-transition shrink-0 bg-edge hover:bg-accent',
                  horizontal ? 'w-[3px] cursor-col-resize' : 'h-[3px] cursor-row-resize',
                ].join(' ')}
              />
            )}
            <div
              className="lm-anim-fade flex min-h-0 min-w-0 flex-col"
              style={{ flex: groups.length > 1 ? `${index === 0 ? ratio : 1 - ratio} 1 0` : '1 1 0' }}
            >
              <GroupView group={group} />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** A strip above the editor while groups sit in windows of their own: bring one forward, or all of them home. */
function PoppedGroupsBar({ keys }: { keys: string[] }) {
  const t = useT()
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-edge bg-surface px-3 text-[11.5px] text-subtle">
      <ExternalLink size={11} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">{keys.length === 1 ? t('popout.groupAway') : t('popout.groupsAway', { count: keys.length })}</span>
      {keys.length === 1 && (
        <Button size="sm" onClick={() => useStore.getState().focusPopout(keys[0])}>{t('popout.focusWindow')}</Button>
      )}
      <Button size="sm" onClick={() => useStore.getState().dockAllBack()}>{keys.length === 1 ? t('popout.bringBack') : t('popout.dockAll')}</Button>
    </div>
  )
}

type DropZone = 'center' | 'right' | 'down' | null

/** One editor group — in the editor area, or (`popped`) filling a window of its own. */
export function GroupView({ group, popped = false }: { group: EditorGroup; popped?: boolean }) {
  const t = useT()
  const active = useStore((s) => s.activeGroupId === group.id)
  const multiple = useStore((s) => !popped && visibleGroups(s.groups, s.popouts).length > 1)
  const viewerTab = useStore((s) => {
    const tab = s.tabs.find((open) => open.id === group.activeTabId)
    return tab?.viewer ? tab : null
  })
  // Tabs of an extension's editor view carry a `lumen-view:` path.
  const viewTab = parseViewTabPath(useStore((s) => s.tabs.find((open) => open.id === group.activeTabId)?.path))
  const [zone, setZone] = useState<DropZone>(null)

  const onDragOver = (event: React.DragEvent) => {
    if (!hasTabDrag(event)) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    const next = zoneAt(x, y)
    if (next !== zone) setZone(next)
  }

  const onDrop = (event: React.DragEvent) => {
    const payload = readPayload(event)
    const target = zone
    setZone(null)
    if (!payload) return
    event.preventDefault()
    const s = useStore.getState()
  // With two groups there is nothing left to split: every zone drops into this group.
    if (target === 'center' || s.groups.length > 1) {
      s.moveTab(payload.tabId, payload.groupId, group.id)
      return
    }
    s.setActiveTab(payload.tabId, payload.groupId)
    s.splitEditor(target === 'down' ? 'down' : 'right')
  }

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col ${multiple && !active ? 'lm-group-inactive' : ''}`}
      onMouseDown={() => {
        if (active) return
        const state = useStore.getState()
        state.focusGroup(state.groups.findIndex((g) => g.id === group.id))
      }}
    >
      <EditorTabs group={group} popped={popped} />
      <FileBanner tabId={group.activeTabId} />
      <div
        className="relative min-h-0 flex-1"
        onDragOver={onDragOver}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setZone(null) }}
        onDrop={onDrop}
      >
        {/* The editor stays mounted behind a viewer, so switching back keeps its state. */}
        <div className="h-full w-full" hidden={Boolean(viewerTab || viewTab)}>
          <Editor groupId={group.id} />
        </div>
        {viewerTab && (
          <div className="absolute inset-0">
            <MediaViewer tab={viewerTab} />
          </div>
        )}
        {viewTab && (
          <div className="absolute inset-0 bg-bg">
            <ExtensionView
              key={`${viewTab.extensionId}/${viewTab.viewId}#${viewTab.instance}`}
              extensionId={viewTab.extensionId}
              viewId={viewTab.viewId}
              instance={viewTab.instance}
            />
          </div>
        )}
        {zone && (
          <div
            className="lm-anim-fade pointer-events-none absolute z-20 flex items-center justify-center rounded-lumen border-2 border-accent bg-accent/15 text-[12px] text-fg lm-transition"
            style={dropZoneStyle(zone)}
          >
            {t('shell.groups.dropHere')}
          </div>
        )}
      </div>
    </div>
  )
}

function zoneAt(x: number, y: number): Exclude<DropZone, null> {
  if (x > 0.7) return 'right'
  if (y > 0.7) return 'down'
  return 'center'
}

function dropZoneStyle(zone: Exclude<DropZone, null>): React.CSSProperties {
  const styles: Record<Exclude<DropZone, null>, React.CSSProperties> = {
    center: { inset: 6 },
    right: { top: 6, bottom: 6, right: 6, width: '48%' },
    down: { left: 6, right: 6, bottom: 6, height: '48%' },
  }
  return styles[zone]
}

/* ------------------------------------------------------------------ *
 * The tab bar of one group
 * ------------------------------------------------------------------ */

function EditorTabs({ group, popped }: { group: EditorGroup; popped: boolean }) {
  const t = useT()
  useIconPackVersion()
  const tabs = useStore((s) => s.tabs)
  const groupActive = useStore((s) => s.activeGroupId === group.id)
  const multiple = useStore((s) => !popped && visibleGroups(s.groups, s.popouts).length > 1)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeTab = useStore((s) => s.closeTab)
  const pinTab = useStore((s) => s.pinTab)
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const list = group.tabIds
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab))

  const onDrop = (event: React.DragEvent, index: number) => {
    const payload = readPayload(event)
    setDropIndex(null)
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    useStore.getState().moveTab(payload.tabId, payload.groupId, group.id, index)
  }

  const menuItems = (tabId: string): MenuItem[] => {
    const s = useStore.getState()
    const tab = s.tabs.find((x) => x.id === tabId)
    const index = group.tabIds.indexOf(tabId)
    return [
      { label: t('common.close'), icon: X, hint: formatBindingsFor('file.closeTab'), run: () => closeTab(tabId, group.id) },
      { label: t('shell.groups.closeOthers'), run: () => { s.setActiveTab(tabId, group.id); s.closeOthers(tabId) }, disabled: group.tabIds.length < 2 },
      {
        label: t('shell.groups.closeToRight'),
        disabled: index === group.tabIds.length - 1,
        run: () => { for (const id of group.tabIds.slice(index + 1)) useStore.getState().closeTab(id, group.id) },
      },
      { label: t('shell.groups.closeAll'), run: () => { for (const id of group.tabIds) useStore.getState().closeTab(id, group.id) } },
      'sep',
      { label: t('shell.groups.splitRight'), icon: Columns2, hint: formatBindingsFor('view.splitRight'), run: () => { s.setActiveTab(tabId, group.id); s.splitEditor('right') } },
      { label: t('shell.groups.splitDown'), icon: Rows2, hint: formatBindingsFor('view.splitDown'), run: () => { s.setActiveTab(tabId, group.id); s.splitEditor('down') } },
      { label: t('shell.groups.moveToOther'), icon: ArrowLeftRight, disabled: popped, run: () => { s.setActiveTab(tabId, group.id); s.moveTabToOtherGroup() } },
      {
        label: t('popout.moveTabToNewWindow'), icon: ExternalLink, hint: formatBindingsFor('editor.moveTabToNewWindow'),
        disabled: popped && group.tabIds.length < 2, run: () => s.popOutTab(tabId),
      },
      'sep',
      { label: t('shell.groups.pin'), icon: Pin, disabled: !tab?.preview, run: () => pinTab(tabId) },
      {
        label: t('shell.groups.copyPath'), icon: Clipboard, disabled: !tab?.path,
        run: () => { if (tab?.path) void navigator.clipboard.writeText(tab.path) },
      },
      {
        label: t('shell.groups.revealInExplorer'), icon: FolderSearch, disabled: !tab?.path || tab.virtual,
        run: () => { if (tab?.path) void window.lumen.shell.showItemInFolder(tab.path) },
      },
    ]
  }

  return (
    <div
      className={`lm-scroll-fade flex h-9 shrink-0 items-stretch border-b border-edge bg-surface ${multiple && groupActive ? 'lm-group-active-bar' : ''}`}
      onDragOver={(e) => { if (hasTabDrag(e)) { e.preventDefault(); setDropIndex(list.length) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndex(null) }}
      onDrop={(e) => onDrop(e, list.length)}
    >
      <div className="flex min-w-0 flex-1 items-stretch gap-px overflow-x-auto">
        {list.map((tab, index) => {
          const active = tab.id === group.activeTabId
          const dirty = isDirty(tab)
          const glyph = fileGlyph(tab.name)
          // Tabs of an extension's editor view show the view's icon, not a file's.
          const viewIcon = viewTabIcon(tab.path)
          const ViewIcon = viewIcon ? namedIcon(viewIcon) : null
          const title = (tab.missing && t('shell.groups.deleted')) || (tab.diskChanged && t('shell.groups.changedOutside')) || undefined

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(TAB_MIME, JSON.stringify({ tabId: tab.id, groupId: group.id } satisfies DragPayload))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (!hasTabDrag(e)) return
                e.preventDefault()
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                setDropIndex(e.clientX < rect.left + rect.width / 2 ? index : index + 1)
              }}
              onDrop={(e) => onDrop(e, dropIndex ?? index)}
              onClick={() => setActiveTab(tab.id, group.id)}
              onDoubleClick={() => pinTab(tab.id)}
              onAuxClick={(e) => e.button === 1 && closeTab(tab.id, group.id)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id }) }}
              title={viewIcon ? tab.name : tab.path ?? tab.name}
              className={[
                'lm-transition lm-tab group relative flex min-w-[110px] max-w-[220px] shrink-0 cursor-default items-center gap-1.5 px-3',
                active ? 'bg-bg text-fg' : 'text-subtle hover:bg-hover hover:text-muted',
              ].join(' ')}
            >
              {dropIndex === index && <span className="lm-anim-fade absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent" />}
              {dropIndex === index + 1 && index === list.length - 1 && <span className="lm-anim-fade absolute inset-y-1 right-0 w-[2px] rounded-full bg-accent" />}
              {active && <span className={`lm-tab-indicator absolute inset-x-0 top-0 h-[2px] ${groupActive || !multiple ? 'bg-accent' : 'bg-edge-strong'}`} />}
              {ViewIcon && <ViewIcon size={12} className={`shrink-0 ${active ? 'text-accent' : ''}`} />}
              {!ViewIcon && <IconGlyph icon={active ? glyph : { ...glyph, color: undefined }} size={12} />}
              <span
                className={[
                  'truncate text-[12.5px]',
                  tab.preview ? 'italic' : '',
                  tab.missing ? 'line-through opacity-70' : '',
                  tab.diskChanged ? 'text-warn' : '',
                ].join(' ')}
                title={title}
              >
                {tab.name}
              </span>

              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id, group.id) }}
                aria-label={t('shell.groups.closeTab', { name: tab.name })}
                className="lm-transition ml-auto flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-active"
              >
                {dirty ? (
                  <span className="lm-anim-pop size-[7px] rounded-full bg-accent group-hover:hidden" />
                ) : null}
                <X
                  size={11}
                  className={dirty ? 'hidden group-hover:block' : 'opacity-0 group-hover:opacity-100'}
                />
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 px-1">
        <SvgModeToggle tabId={group.activeTabId} />
        {!multiple && !popped && (
          <Button size="sm" title={withKeys(t('shell.groups.splitRight'), 'view.splitRight')} onClick={() => {
            useStore.getState().setActiveTab(group.activeTabId ?? '', group.id)
            useStore.getState().splitEditor('right')
          }}>
            <SquareSplitHorizontal size={13} />
          </Button>
        )}
        {!popped && (
          <Button size="sm" title={t('popout.moveGroupToNewWindow')} onClick={() => useStore.getState().popOutGroup(group.id)}>
            <ExternalLink size={13} />
          </Button>
        )}
        {multiple && (
          <Button size="sm" title={t('shell.groups.closeGroup')} onClick={() => {
            for (const id of group.tabIds) useStore.getState().closeTab(id, group.id)
          }}>
            <X size={13} />
          </Button>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.tabId)} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** SVG is image and text: switch the active SVG tab between preview and editor. */
function SvgModeToggle({ tabId }: { tabId: string | null }) {
  const t = useT()
  const tab = useStore((s) => s.tabs.find((open) => open.id === tabId) ?? null)
  if (!tab?.path || tab.virtual || !isSvgPath(tab.path)) return null
  const previewing = Boolean(tab.viewer)
  const label = previewing ? t('media.openAsText') : t('media.showPreview')
  return (
    <Button size="sm" title={label} onClick={() => void useStore.getState().setTabTextMode(tab.id, previewing)}>
      {previewing ? <FileCode2 size={13} /> : <ImageIcon size={13} />}
    </Button>
  )
}

function withKeys(label: string, command: string) {
  const keys = formatBindingsFor(command)
  return keys ? `${label} (${keys})` : label
}
