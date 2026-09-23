/**
 * Draws a view whose content an extension's code provides.
 *
 * The content is data (`ViewContent`): sections, rows, inputs, buttons, text,
 * grids and code inputs. Lumen draws it with its own components, so an
 * extension's panel looks like the rest of the program and cannot break the
 * window. Clicks and submitted inputs go back to the extension as actions,
 * together with the current values of every input of the view.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { extensionHost } from '@/core/extensions/host'
import { renderMarkdown } from '@/lib/markdown'
import type { ViewAction, ViewNode, ViewTone } from '../../../electron/features/extension-host/contract'
import { namedIcon } from '../ui/named-icons'
import { FileIcon } from '../icons/FileIcon'
import { Button, Empty } from '../ui'
import { ContextMenu, type MenuItem } from '../ui/ContextMenu'
import { TONE_TEXT } from './tones'
import { GridView } from './GridView'
import { CodeInput } from './CodeInput'

export { TONE_TEXT }

type Inputs = Record<string, string | boolean>

/**
 * What the user typed, per view (and editor tab). Kept outside the component:
 * an editor view unmounts when its tab is in the background, and a half-written
 * query must still be there when it comes back.
 */
const inputCache = new Map<string, { inputs: Inputs; declared: Inputs }>()

const toneText = (tone: ViewTone | undefined, fallback = 'text-muted') => (tone ? TONE_TEXT[tone] : fallback)

interface Ctx {
  run: (action: ViewAction) => void
  inputs: Inputs
  setInput: (id: string, value: string | boolean) => void
  setInputs: (values: Inputs) => void
  openMenu: (event: React.MouseEvent, actions: ViewAction[]) => void
}

function useHost() {
  useSyncExternalStore(extensionHost.subscribe, extensionHost.getVersion)
}

/** The values of the view's inputs as the content declares them. */
function declaredInputs(nodes: ViewNode[], out: Inputs = {}): Inputs {
  for (const node of nodes) {
    if (node.type === 'input') out[node.id] = node.value ?? ''
    if (node.type === 'code') out[node.id] = node.value ?? ''
    if (node.type === 'select') out[node.id] = node.value
    if (node.type === 'toggle') out[node.id] = node.value
    if (node.type === 'section' || node.type === 'row') declaredInputs(node.children, out)
    if (node.type === 'item' && node.children) declaredInputs(node.children, out)
  }
  return out
}

export function ExtensionView({ extensionId, viewId, instance }: { extensionId: string; viewId: string; instance?: string }) {
  useHost()
  const state = extensionHost.view(extensionId, viewId, instance)
  const cacheKey = `${extensionId}/${viewId}#${instance ?? ''}`
  const cached = inputCache.get(cacheKey)
  const [inputs, setInputsState] = useState<Inputs>(cached?.inputs ?? {})
  // Actions read the inputs from here: a key pressed right after typing must see the last character.
  const latest = useRef<Inputs>(inputs)
  const setInputs = (update: (current: Inputs) => Inputs) => {
    latest.current = update(latest.current)
    setInputsState(latest.current)
  }
  const declared = useRef<Inputs>(cached?.declared ?? {})
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  useEffect(() => extensionHost.show(extensionId, viewId, instance), [extensionId, viewId, instance])
  useEffect(() => {
    inputCache.set(cacheKey, { inputs, declared: declared.current })
  }, [cacheKey, inputs])
  // A closed tab takes its typed text along.
  useEffect(() => () => {
    if (instance !== undefined && !extensionHost.view(extensionId, viewId, instance).content) inputCache.delete(cacheKey)
  }, [cacheKey, extensionId, viewId, instance])

  // Take over values the extension changed (a cleared commit message, say), keep what the user typed otherwise.
  useEffect(() => {
    const next = declaredInputs(state.content?.nodes ?? [])
    const previous = declared.current
    declared.current = next
    setInputs((current) => {
      const merged: Inputs = { ...current }
      for (const [id, value] of Object.entries(next)) {
        if (!(id in current) || previous[id] !== value) merged[id] = value
      }
      return merged
    })
  }, [state.content])

  const ctx: Ctx = {
    run: (action) => void extensionHost.action(extensionId, viewId, action, latest.current, instance),
    inputs,
    setInput: (id, value) => setInputs((current) => ({ ...current, [id]: value })),
    setInputs: (values) => setInputs((current) => ({ ...current, ...values })),
    openMenu: (event, actions) => {
      event.preventDefault()
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: actions.map<MenuItem>((action) => ({
          label: action.title, icon: action.icon ? namedIcon(action.icon) : undefined, danger: action.danger,
          disabled: action.disabled, run: () => ctx.run(action),
        })),
      })
    },
  }

  if (!state.content && state.loading) {
    return (
      <div className="flex h-full items-center justify-center text-subtle">
        <Loader2 size={16} className="lm-anim-spin" />
      </div>
    )
  }
  if (!state.content && state.error) return <Empty title={state.error} />

  const fill = state.content?.layout === 'fill'
  return (
    <div className={fill ? 'relative flex h-full flex-col overflow-hidden pb-2 [&>*:not(.flex-1)]:shrink-0' : 'relative h-full overflow-y-auto pb-3'}>
      {/* A tab in the editor area has no dock header: its toolbar goes on top. */}
      {instance !== undefined && Boolean(state.content?.toolbar?.length) && (
        <div className="flex items-center gap-0.5 border-b border-edge px-2 py-1">
          <span className="min-w-0 flex-1 truncate text-[12px] text-subtle">{state.content?.title}</span>
          <ExtensionViewToolbar extensionId={extensionId} viewId={viewId} instance={instance} inputs={inputs} />
        </div>
      )}
      {state.loading && <div className="lm-anim-pulse absolute top-0 right-0 left-0 h-px bg-accent" />}
      {state.error && <p className="mx-3 my-2 rounded-lumen-sm border border-bad/40 bg-bad/10 px-2 py-1 text-[11.5px] text-bad">{state.error}</p>}
      <Nodes nodes={state.content?.nodes ?? []} ctx={ctx} depth={0} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** The view's toolbar actions, for the dock header. */
export function ExtensionViewToolbar({ extensionId, viewId, instance, inputs = {} }: {
  extensionId: string; viewId: string; instance?: string; inputs?: Inputs
}) {
  useHost()
  const toolbar = extensionHost.view(extensionId, viewId, instance).content?.toolbar ?? []
  return (
    <>
      {toolbar.map((action) => {
        const Icon = namedIcon(action.icon)
        return (
          <Button
            key={action.action}
            size="sm"
            title={action.title}
            disabled={action.disabled}
            onClick={() => void extensionHost.action(extensionId, viewId, action, inputs, instance)}
          >
            <Icon size={13} />
          </Button>
        )
      })}
    </>
  )
}

function Nodes({ nodes, ctx, depth }: { nodes: ViewNode[]; ctx: Ctx; depth: number }) {
  return (
    <>
      {nodes.map((node, index) => <Node key={nodeKey(node, index)} node={node} ctx={ctx} depth={depth} />)}
    </>
  )
}

function nodeKey(node: ViewNode, index: number): string {
  if ('id' in node && node.id) return `${node.type}:${node.id}`
  return `${node.type}:${index}`
}

function Node({ node, ctx, depth }: { node: ViewNode; ctx: Ctx; depth: number }) {
  const renderers: { [K in ViewNode['type']]: (n: Extract<ViewNode, { type: K }>) => React.ReactNode } = {
    section: (n) => <Section node={n} ctx={ctx} depth={depth} />,
    item: (n) => <Item node={n} ctx={ctx} depth={depth} />,
    input: (n) => <Input node={n} ctx={ctx} />,
    select: (n) => (
      <label className="flex items-center gap-2 px-3 py-1 text-[11.5px] text-muted">
        {n.label && <span className="shrink-0">{n.label}</span>}
        <select
          value={String(ctx.inputs[n.id] ?? n.value)}
          onChange={(e) => {
            ctx.setInput(n.id, e.target.value)
            if (n.change) ctx.run({ ...n.change, payload: n.change.payload ?? e.target.value })
          }}
          className="min-w-0 flex-1 rounded-lumen-sm border border-edge bg-input px-1.5 py-0.5 text-[11.5px] text-fg"
        >
          {n.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    ),
    toggle: (n) => (
      <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-[11.5px] text-muted">
        <input
          type="checkbox"
          className="accent-[var(--c-accent)]"
          checked={Boolean(ctx.inputs[n.id] ?? n.value)}
          onChange={(e) => {
            ctx.setInput(n.id, e.target.checked)
            if (n.change) ctx.run({ ...n.change, payload: n.change.payload ?? e.target.checked })
          }}
        />
        {n.label}
      </label>
    ),
    buttons: (n) => (
      <div className="flex flex-wrap gap-1.5 px-3 py-1.5">
        {n.buttons.map((button) => {
          const Icon = button.icon ? namedIcon(button.icon) : null
          const variants = { primary: 'solid', secondary: 'outline', danger: 'danger' } as const
          return (
            <Button key={button.action} size="sm" variant={variants[button.variant ?? 'secondary']} disabled={button.disabled} onClick={() => ctx.run(button)}>
              {Icon && <Icon size={12} />}
              {button.title}
            </Button>
          )
        })}
      </div>
    ),
    text: (n) => (
      <p className={`px-3 py-1 whitespace-pre-wrap break-words ${n.small ? 'text-[11px]' : 'text-[12px]'} ${n.mono ? 'font-mono' : ''} ${toneText(n.tone)}`}>
        {n.text}
      </p>
    ),
    markdown: (n) => <Markdown content={n.content} />,
    keyValue: (n) => (
      <dl className="space-y-0.5 px-3 py-1 text-[12px]">
        {n.rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-subtle">{row.key}</dt>
            <dd className={`truncate text-right ${toneText(row.tone)}`} title={row.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    ),
    empty: (n) => {
      const Icon = n.icon ? namedIcon(n.icon) : null
      const action = n.action
      return (
        <Empty
          icon={Icon ? <Icon size={24} strokeWidth={1.4} /> : undefined}
          title={n.title}
          hint={n.hint}
          action={action ? <Button size="sm" variant="solid" onClick={() => ctx.run(action)}>{action.title}</Button> : undefined}
        />
      )
    },
    progress: (n) => (
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11.5px] text-subtle">
        <Loader2 size={12} className="lm-anim-spin" /> {n.label}
      </div>
    ),
    divider: () => <div className="mx-3 my-1.5 h-px bg-edge" />,
    // Fields share the width; buttons, toggles and text keep theirs. The children's own padding goes.
    row: (n) => (
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1">
        {n.children.map((child, index) => (
          <div
            key={nodeKey(child, index)}
            className={`[&>*]:px-0! [&>*]:py-0! ${GROWING_IN_ROW.has(child.type) ? 'min-w-[140px] flex-1' : 'shrink-0'}`}
          >
            <Node node={child} ctx={ctx} depth={depth} />
          </div>
        ))}
      </div>
    ),
    grid: (n) => (
      <GridView
        node={n}
        selected={parseSelection(ctx.inputs[n.id])}
        onSelect={(ids) => ctx.setInput(n.id, JSON.stringify(ids))}
        run={ctx.run}
      />
    ),
    code: (n) => (
      <CodeInput
        node={n}
        value={String(ctx.inputs[n.id] ?? n.value ?? '')}
        onChange={(value, selection) => ctx.setInputs({ [n.id]: value, [`${n.id}.selection`]: selection })}
        onSubmit={() => { if (n.submit) ctx.run(n.submit) }}
      />
    ),
  }
  const render = renderers[node.type] as (n: ViewNode) => React.ReactNode
  return <>{render(node)}</>
}

const GROWING_IN_ROW = new Set<ViewNode['type']>(['input', 'select', 'code'])

function parseSelection(value: string | boolean | undefined): string[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const ids = JSON.parse(value) as unknown
    return Array.isArray(ids) ? ids.map(String) : []
  } catch {
    return []
  }
}

function Markdown({ content }: { content: string }) {
  const html = renderMarkdown(content).innerHTML
  return <div className="lm-markdown px-3 py-1 text-[12px] leading-relaxed text-muted" dangerouslySetInnerHTML={{ __html: html }} />
}

function ActionButtons({ actions, ctx }: { actions: ViewAction[]; ctx: Ctx }) {
  return (
    <>
      {actions.map((action) => {
        const Icon = namedIcon(action.icon)
        return (
          <button
            key={action.action + JSON.stringify(action.payload ?? '')}
            title={action.title}
            disabled={action.disabled}
            onClick={(e) => { e.stopPropagation(); ctx.run(action) }}
            className={`lm-transition rounded p-0.5 disabled:opacity-40 ${action.danger ? 'text-subtle hover:text-bad' : 'text-subtle hover:text-fg'}`}
          >
            <Icon size={12} />
          </button>
        )
      })}
    </>
  )
}

function Section({ node, ctx, depth }: { node: Extract<ViewNode, { type: 'section' }>; ctx: Ctx; depth: number }) {
  const [open, setOpen] = useState(!node.collapsed)
  return (
    <section className="group/section">
      <div className="flex items-center gap-1 px-2 pt-1.5 pb-0.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle hover:text-muted"
        >
          <ChevronRight size={12} className="lm-transition shrink-0" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
          <span className="truncate">{node.title}</span>
          {node.badge !== undefined && <span className="ml-1 rounded-full bg-active px-1.5 font-normal tracking-normal normal-case">{node.badge}</span>}
        </button>
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/section:opacity-100">
          <ActionButtons actions={node.actions ?? []} ctx={ctx} />
        </span>
      </div>
      {open && <Nodes nodes={node.children} ctx={ctx} depth={depth} />}
    </section>
  )
}

function Item({ node, ctx, depth }: { node: Extract<ViewNode, { type: 'item' }>; ctx: Ctx; depth: number }) {
  const [open, setOpen] = useState(node.expanded ?? false)
  // The extension may open a row itself later (children loaded after a click).
  useEffect(() => {
    if (node.expanded !== undefined) setOpen(node.expanded)
  }, [node.expanded])
  const hasChildren = Boolean(node.children?.length)
  const Icon = node.icon ? namedIcon(node.icon) : null
  const click = () => {
    if (node.onClick) {
      ctx.run(node.onClick)
      return
    }
    if (hasChildren) setOpen(!open)
  }
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={click}
        onKeyDown={(e) => { if (e.key === 'Enter') click() }}
        onContextMenu={(e) => { if (node.menu?.length) ctx.openMenu(e, node.menu) }}
        title={node.tooltip ?? node.label}
        className="lm-row lm-transition group flex cursor-pointer items-center gap-1.5 text-[12.5px] hover:bg-hover"
        style={{ paddingLeft: 10 + depth * 12 }}
      >
        {hasChildren && (
          <ChevronRight
            size={11}
            className="lm-transition shrink-0 text-subtle"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
            onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
          />
        )}
        {node.fileIcon && <FileIcon name={node.fileIcon} size={13} />}
        {!node.fileIcon && Icon && <Icon size={13} className={`shrink-0 ${toneText(node.iconTone, 'text-subtle')}`} />}
        <span className={`min-w-0 truncate ${toneText(node.tone, 'text-muted')} ${node.strike ? 'line-through' : ''}`}>{node.label}</span>
        {node.description && <span className="min-w-0 flex-1 truncate text-[11px] text-subtle">{node.description}</span>}
        {!node.description && <span className="flex-1" />}
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <ActionButtons actions={node.actions ?? []} ctx={ctx} />
        </span>
        {node.badge !== undefined && (
          <span className={`shrink-0 pr-1 font-mono text-[10.5px] ${toneText(node.badgeTone ?? node.tone, 'text-subtle')}`}>{node.badge}</span>
        )}
      </div>
      {open && hasChildren && <Nodes nodes={node.children!} ctx={ctx} depth={depth + 1} />}
    </>
  )
}

function Input({ node, ctx }: { node: Extract<ViewNode, { type: 'input' }>; ctx: Ctx }) {
  const value = String(ctx.inputs[node.id] ?? node.value ?? '')
  const submit = () => {
    if (node.submit) ctx.run(node.submit)
  }
  const className = `lm-transition w-full rounded-lumen-sm border border-edge bg-input px-2 py-1 text-[12px] outline-none placeholder:text-subtle focus:border-accent ${node.mono ? 'font-mono' : ''}`
  if (node.multiline) {
    return (
      <div className="px-3 py-1">
        <textarea
          value={value}
          rows={node.rows ?? 3}
          placeholder={node.placeholder}
          onChange={(e) => ctx.setInput(node.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return
            e.preventDefault()
            submit()
          }}
          className={`${className} resize-y`}
        />
      </div>
    )
  }
  return (
    <div className="px-3 py-1">
      <input
        value={value}
        placeholder={node.placeholder}
        spellCheck={false}
        onChange={(e) => ctx.setInput(node.id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          submit()
        }}
        className={className}
      />
    </div>
  )
}
