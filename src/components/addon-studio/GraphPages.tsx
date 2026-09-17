/** The Studio's “commands” and “events” areas — a list each, plus the node editor. */

import { useEffect, useState } from 'react'
import { Keyboard, Trash2, Workflow, Zap } from 'lucide-react'
import { t as translate, useT } from '@/i18n'
import { chordFromEvent, chordToString, formatBinding } from '@/core/keybindings'
import type { NodeDef } from '@/core/user-addons/catalog'
import { emptyGraph, newId, type Graph, type UserAddonModel, type UserCommand, type UserEventGraph } from '@/core/user-addons/schema'
import type { ValidationIssue } from '@/core/user-addons/validate'
import { Button, Empty } from '../ui'
import { ItemList, TextField, inputClass } from './fields'
import { GraphWorkspace } from './GraphWorkspace'

const allowInCommand = (def: NodeDef) => !def.event || def.event === 'command'
const allowInEvents = (def: NodeDef) => def.event !== 'command'

/** A graph with one starting node. */
function starterGraph(type: string): Graph {
  const graph = emptyGraph()
  graph.nodes.push({ id: newId('n'), type, x: 80, y: 120 })
  return graph
}

export function newCommand(existing: UserCommand[]): UserCommand {
  let n = existing.length + 1
  while (existing.some((c) => c.id === `befehl${n}`)) n++
  return {
    id: `befehl${n}`,
    title: translate('addonStudio.commands.defaultTitle', { n }),
    graph: starterGraph('event.command'),
  }
}

export function newEvent(existing: UserEventGraph[]): UserEventGraph {
  return {
    id: newId('ev'),
    name: translate('addonStudio.events.defaultName', { n: existing.length + 1 }),
    graph: starterGraph('event.fileSaved'),
  }
}

function useFocus(focus: { index: number; token: number } | null | undefined, setSelected: (index: number) => void) {
  useEffect(() => {
    if (focus) setSelected(focus.index)
  }, [focus, setSelected])
}

export function CommandsPage({
  model, onChange, issues, focus,
}: {
  model: UserAddonModel
  onChange: (commands: UserCommand[]) => void
  issues: ValidationIssue[]
  focus?: { index: number; token: number } | null
}) {
  const t = useT()
  const [selected, setSelected] = useState(0)
  useFocus(focus, setSelected)
  const commands = model.commands
  const index = Math.min(selected, commands.length - 1)
  const command = commands[index]
  const errorIndexes = new Set(issues.filter((i) => !i.warning && i.index !== undefined).map((i) => i.index as number))

  if (!command) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Empty icon={<Zap size={28} strokeWidth={1.4} />} title={t('addonStudio.commands.empty')} hint={t('addonStudio.commands.emptyHint')} />
        <Button variant="solid" onClick={() => { onChange([newCommand(commands)]); setSelected(0) }}>{t('addonStudio.commands.add')}</Button>
      </div>
    )
  }

  const patch = (next: Partial<UserCommand>) => onChange(commands.map((c, i) => (i === index ? { ...c, ...next } : c)))
  const fieldError = (field: string) => issues.find((i) => i.index === index && i.field === field)?.message ?? null
  const messages = issues.filter((i) => i.index === index && !i.field)

  return (
    <div className="flex h-full min-h-0">
      <ItemList
        items={commands}
        selected={index}
        onSelect={setSelected}
        render={(c) => ({ title: c.title || c.id, subtitle: c.keybinding ? formatBinding(c.keybinding) : c.id, color: model.color })}
        onAdd={() => { onChange([...commands, newCommand(commands)]); setSelected(commands.length) }}
        addLabel={t('addonStudio.commands.add')}
        errorIndexes={errorIndexes}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="grid shrink-0 grid-cols-[1.4fr_1fr_1fr_1fr_auto] items-end gap-2 border-b border-edge px-3 py-2">
          <TextField label={t('addonStudio.commands.title')} value={command.title} error={fieldError('title')} onChange={(title) => patch({ title })} />
          <TextField mono label={t('addonStudio.commands.id')} value={command.id} error={fieldError('id')} onChange={(id) => patch({ id })} hint={`${model.id}.${command.id}`} />
          <TextField label={t('addonStudio.commands.category')} value={command.category} placeholder={model.name} onChange={(category) => patch({ category: category || undefined })} />
          <KeybindingField value={command.keybinding} error={fieldError('keybinding')} onChange={(keybinding) => patch({ keybinding })} />
          <Button size="sm" variant="danger" title={t('common.delete')} onClick={() => {
            if (!confirm(t('common.confirmDelete', { name: command.title || command.id }))) return
            onChange(commands.filter((_, i) => i !== index))
            setSelected(Math.max(0, index - 1))
          }}>
            <Trash2 size={12} />
          </Button>
        </div>
        {messages.length > 0 && (
          <div className="shrink-0 border-b border-edge bg-bad/8 px-3 py-1 text-[11.5px] text-bad">
            {messages.map((m, i) => <div key={i}>{m.message}</div>)}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <GraphWorkspace
            model={model}
            graph={command.graph}
            onChange={(graph) => patch({ graph })}
            resetKey={`command:${index}`}
            allow={allowInCommand}
            entryFilter={(def) => def.event === 'command'}
          />
        </div>
      </div>
    </div>
  )
}

function bindingText(recording: boolean, value: string | undefined) {
  if (recording) return translate('addonStudio.commands.pressKeys')
  return value ? formatBinding(value) : ''
}

/** Record a shortcut — the field is invisible to the global dispatcher. */
function KeybindingField({ value, onChange, error }: { value?: string; onChange: (value: string | undefined) => void; error?: string | null }) {
  const t = useT()
  const [recording, setRecording] = useState(false)
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[11.5px] text-muted">{t('addonStudio.commands.keybinding')}</span>
      <div className="flex items-center gap-1">
        <input
          data-keybinding-recorder
          readOnly
          value={bindingText(recording, value)}
          placeholder={t('common.none')}
          onFocus={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.key === 'Escape' || e.key === 'Tab') {
              setRecording(false)
              e.currentTarget.blur()
              return
            }
            if (e.key === 'Backspace' || e.key === 'Delete') {
              onChange(undefined)
              return
            }
            const chord = chordFromEvent(e.nativeEvent)
            if (!chord) return
            onChange(chordToString(chord))
            e.currentTarget.blur()
          }}
          className={`${inputClass} ${error ? 'border-bad' : 'border-edge'} cursor-pointer font-mono text-[12px]`}
        />
        <Keyboard size={13} className="shrink-0 text-subtle" />
      </div>
      {error && <span className="mt-1 block text-[11px] text-bad">{error}</span>}
    </div>
  )
}

export function EventsPage({
  model, onChange, issues, focus,
}: {
  model: UserAddonModel
  onChange: (events: UserEventGraph[]) => void
  issues: ValidationIssue[]
  focus?: { index: number; token: number } | null
}) {
  const t = useT()
  const [selected, setSelected] = useState(0)
  useFocus(focus, setSelected)
  const events = model.events
  const index = Math.min(selected, events.length - 1)
  const event = events[index]

  if (!event) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Empty icon={<Workflow size={28} strokeWidth={1.4} />} title={t('addonStudio.events.empty')} hint={t('addonStudio.events.emptyHint')} />
        <Button variant="solid" onClick={() => { onChange([newEvent(events)]); setSelected(0) }}>{t('addonStudio.events.add')}</Button>
      </div>
    )
  }

  const patch = (next: Partial<UserEventGraph>) => onChange(events.map((e, i) => (i === index ? { ...e, ...next } : e)))
  const messages = issues.filter((i) => i.index === index)

  return (
    <div className="flex h-full min-h-0">
      <ItemList
        items={events}
        selected={index}
        onSelect={setSelected}
        render={(e) => ({ title: e.name || e.id, subtitle: t('addonStudio.events.nodeCount', { count: e.graph.nodes.length }), color: model.color })}
        onAdd={() => { onChange([...events, newEvent(events)]); setSelected(events.length) }}
        addLabel={t('addonStudio.events.add')}
        errorIndexes={new Set(issues.filter((i) => !i.warning && i.index !== undefined).map((i) => i.index as number))}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-end gap-2 border-b border-edge px-3 py-2">
          <TextField className="max-w-[320px] flex-1" label={t('common.name')} value={event.name} onChange={(name) => patch({ name })} />
          <p className="flex-1 pb-1 text-[11.5px] leading-snug text-subtle">{t('addonStudio.events.hint')}</p>
          <Button size="sm" variant="danger" title={t('common.delete')} onClick={() => {
            if (!confirm(t('common.confirmDelete', { name: event.name || event.id }))) return
            onChange(events.filter((_, i) => i !== index))
            setSelected(Math.max(0, index - 1))
          }}>
            <Trash2 size={12} />
          </Button>
        </div>
        {messages.length > 0 && (
          <div className="shrink-0 border-b border-edge bg-warn/8 px-3 py-1 text-[11.5px] text-warn">
            {messages.map((m, i) => <div key={i}>{m.message}</div>)}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <GraphWorkspace
            model={model}
            graph={event.graph}
            onChange={(graph) => patch({ graph })}
            resetKey={`event:${event.id}`}
            allow={allowInEvents}
            entryFilter={allowInEvents}
          />
        </div>
      </div>
    </div>
  )
}
