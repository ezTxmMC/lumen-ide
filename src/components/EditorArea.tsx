import { Fragment, useRef, useState } from 'react'
import {
  ArrowLeftRight, Clipboard, Columns2, FolderSearch, Pin, Rows2, SquareSplitHorizontal, X,
} from 'lucide-react'
import { useStore, isDirty, type EditorGroup } from '@/state/store'
import { fileGlyph } from '@/lib/file-icon'
import { IconGlyph, useIconPackVersion } from './icons/FileIcon'
import { formatBindingsFor } from '@/core/keybindings'
import { useT } from '@/i18n'
import { Editor, useEditorServices } from './Editor'
import { FileBanner } from './FileBanner'
import { Welcome } from './Welcome'
import { Button } from './ui'
import { ContextMenu, type MenuItem } from './ui/ContextMenu'

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
  const groups = useStore((s) => s.groups)
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

  return (
    <div ref={container} className={`flex h-full min-h-0 ${horizontal ? 'flex-row' : 'flex-col'}`}>
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
            <GroupView group={group} index={index} />
          </div>
        </Fragment>
      ))}
    </div>
  )
}

type DropZone = 'center' | 'right' | 'down' | null

function GroupView({ group, index }: { group: EditorGroup; index: number }) {
  const t = useT()
  const active = useStore((s) => s.activeGroupId === group.id)
  const multiple = useStore((s) => s.groups.length > 1)
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
        useStore.getState().focusGroup(index)
      }}
    >
      <EditorTabs group={group} />
      <FileBanner tabId={group.activeTabId} />
      <div
        className="relative min-h-0 flex-1"
        onDragOver={onDragOver}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setZone(null) }}
        onDrop={onDrop}
      >
        <Editor groupId={group.id} />
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

function EditorTabs({ group }: { group: EditorGroup }) {
  const t = useT()
  useIconPackVersion()
  const tabs = useStore((s) => s.tabs)
  const groupActive = useStore((s) => s.activeGroupId === group.id)
  const multiple = useStore((s) => s.groups.length > 1)
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
      { label: t('shell.groups.moveToOther'), icon: ArrowLeftRight, run: () => { s.setActiveTab(tabId, group.id); s.moveTabToOtherGroup() } },
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
              title={tab.path ?? tab.name}
              className={[
                'lm-transition lm-tab group relative flex min-w-[110px] max-w-[220px] shrink-0 cursor-default items-center gap-1.5 px-3',
                active ? 'bg-bg text-fg' : 'text-subtle hover:bg-hover hover:text-muted',
              ].join(' ')}
            >
              {dropIndex === index && <span className="lm-anim-fade absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent" />}
              {dropIndex === index + 1 && index === list.length - 1 && <span className="lm-anim-fade absolute inset-y-1 right-0 w-[2px] rounded-full bg-accent" />}
              {active && <span className={`lm-tab-indicator absolute inset-x-0 top-0 h-[2px] ${groupActive || !multiple ? 'bg-accent' : 'bg-edge-strong'}`} />}
              <IconGlyph icon={active ? glyph : { ...glyph, color: undefined }} size={12} />
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
        {!multiple && (
          <Button size="sm" title={withKeys(t('shell.groups.splitRight'), 'view.splitRight')} onClick={() => {
            useStore.getState().setActiveTab(group.activeTabId ?? '', group.id)
            useStore.getState().splitEditor('right')
          }}>
            <SquareSplitHorizontal size={13} />
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

function withKeys(label: string, command: string) {
  const keys = formatBindingsFor(command)
  return keys ? `${label} (${keys})` : label
}
