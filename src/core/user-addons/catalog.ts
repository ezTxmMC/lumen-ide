/**
 * The node catalogue of the visual scripting.
 *
 * Every node is an object with pins and either `run` (an exec node, following
 * the flow) or `compute` (a pure data node). To add one: extend `NODES` and
 * translate the title under `addonStudio.node.<type>` — the editor, the
 * palette and the interpreter read nothing but this list.
 *
 * Labels: pins under `addonStudio.pin.<label ?? id>`, settings under
 * `addonStudio.setting.<id>`, choice values under `addonStudio.choice.<value>`.
 */

import type { PinType } from './schema'
import type { ExecContext, NodeContext } from './interpreter'
import { GraphError, StopSignal, toText } from './values'
import { t } from '@/i18n'

export type NodeCategory =
  | 'events' | 'values' | 'editor' | 'text' | 'logic' | 'variables' | 'math' | 'workspace' | 'ui' | 'ide'

export const NODE_CATEGORIES: { id: NodeCategory; color: string }[] = [
  { id: 'events', color: '#e2554f' },
  { id: 'values', color: '#8b939f' },
  { id: 'editor', color: '#4f8fe2' },
  { id: 'text', color: '#d65fa5' },
  { id: 'logic', color: '#9a6be0' },
  { id: 'variables', color: '#d6a13a' },
  { id: 'math', color: '#3fae78' },
  { id: 'workspace', color: '#2ea3b8' },
  { id: 'ui', color: '#c77a3a' },
  { id: 'ide', color: '#6c7bd9' },
]

export const PIN_COLORS: Record<PinType, string> = {
  exec: '#e6e8ec',
  string: '#f472b6',
  number: '#5ecf8f',
  boolean: '#fb7185',
  list: '#fbbf24',
  any: '#94a3b8',
}

export type EventKind = 'command' | 'startup' | 'fileSaved' | 'fileOpened' | 'tabChanged'

export interface PinDef {
  id: string
  type: PinType
  /** Translation key under `addonStudio.pin`; defaults to `id`. */
  label?: string
  default?: string | number | boolean
}

export interface SettingDef {
  id: string
  kind: 'text' | 'select'
  default: string
  /** `label` is literal text (symbols such as `≤`), otherwise `addonStudio.choice.<value>`. */
  choices?: { value: string; label?: string }[]
}

export interface NodeDef {
  type: string
  category: NodeCategory
  inputs: PinDef[]
  outputs: PinDef[]
  settings?: SettingDef[]
  /** Entry point for events. */
  event?: EventKind
  /** An exec node: returns the exec output to follow. */
  run?(ctx: ExecContext): Promise<string | null | void> | string | null | void
  /** A pure node: computes every output. */
  compute?(ctx: NodeContext): Promise<Record<string, unknown>> | Record<string, unknown>
}

/* ------------------------------------------------------------------ *
 * Building blocks
 * ------------------------------------------------------------------ */

const IN: PinDef = { id: 'in', type: 'exec' }
const THEN: PinDef = { id: 'then', type: 'exec' }
const pin = (id: string, type: PinType, extra: Partial<PinDef> = {}): PinDef => ({ id, type, ...extra })
const str = (id: string, def?: string) => pin(id, 'string', def === undefined ? {} : { default: def })
const num = (id: string, def?: number) => pin(id, 'number', def === undefined ? {} : { default: def })
const bool = (id: string) => pin(id, 'boolean')
const list = (id: string) => pin(id, 'list')
const any = (id: string) => pin(id, 'any')

const select = (id: string, values: string[], labels?: Record<string, string>): SettingDef => ({
  id,
  kind: 'select',
  default: values[0],
  choices: values.map((value) => ({ value, label: labels?.[value] })),
})

const text = async (ctx: NodeContext, id: string) => String(await ctx.input(id))
const number = async (ctx: NodeContext, id: string) => Number(await ctx.input(id))

/** An event node: emits the event's data and starts the flow. */
function eventNode(type: string, event: EventKind, outputs: PinDef[] = []): NodeDef {
  return {
    type,
    category: 'events',
    event,
    inputs: [],
    outputs: [THEN, ...outputs],
    run(ctx) {
      for (const out of outputs) ctx.output(out.id, ctx.payload[out.id] ?? '')
      return 'then'
    },
  }
}

/** A simple action: read the inputs, do something, move on. */
function action(
  type: string,
  category: NodeCategory,
  inputs: PinDef[],
  body: (ctx: ExecContext) => Promise<unknown> | unknown,
  extra: Partial<NodeDef> = {},
): NodeDef {
  return {
    ...extra,
    type,
    category,
    inputs: [IN, ...inputs],
    outputs: [THEN, ...(extra.outputs ?? [])],
    async run(ctx) {
      await body(ctx)
      return 'then'
    },
  }
}

function pure(
  type: string,
  category: NodeCategory,
  inputs: PinDef[],
  outputs: PinDef[],
  compute: NodeDef['compute'],
  settings?: SettingDef[],
): NodeDef {
  return { type, category, inputs, outputs, compute, settings }
}

/** Two numbers → a result. */
const binaryMath = (type: string, fn: (a: number, b: number) => number): NodeDef =>
  pure(type, 'math', [num('a', 0), num('b', 0)], [num('result')], async (ctx) => ({
    result: fn(await number(ctx, 'a'), await number(ctx, 'b')),
  }))

/** `\n` and `\t` in a separator as the real characters. */
const unescape = (value: string) => value.replace(/\\n/g, '\n').replace(/\\t/g, '\t')

function compareValues(a: unknown, b: unknown): number {
  const numeric = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))
  if (numeric(a) && numeric(b)) return Number(a) - Number(b)
  return toText(a).localeCompare(toText(b))
}

const COMPARISONS: Record<string, (diff: number) => boolean> = {
  eq: (d) => d === 0,
  ne: (d) => d !== 0,
  lt: (d) => d < 0,
  le: (d) => d <= 0,
  gt: (d) => d > 0,
  ge: (d) => d >= 0,
}

const CASES: Record<string, (value: string) => string> = {
  upper: (v) => v.toUpperCase(),
  lower: (v) => v.toLowerCase(),
  title: (v) => v.replace(/\p{L}[\p{L}\p{N}]*/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
}

const ROUNDING: Record<string, (value: number) => number> = {
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
}

export const TOGGLE_SETTINGS = [
  'wordWrap', 'showLineNumbers', 'minimap', 'showIndentGuides', 'highlightActiveLine', 'animations', 'glass', 'lsp',
]

/** Waits, and can be cancelled. */
function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(t('addonStudio.run.aborted')))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, Math.max(0, ms))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error(t('addonStudio.run.aborted')))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/* ------------------------------------------------------------------ *
 * Nodes
 * ------------------------------------------------------------------ */

const NODES: NodeDef[] = [
  /* Events */
  eventNode('event.command', 'command'),
  eventNode('event.startup', 'startup'),
  eventNode('event.fileSaved', 'fileSaved', [str('path'), str('language')]),
  eventNode('event.fileOpened', 'fileOpened', [str('path'), str('language')]),
  eventNode('event.tabChanged', 'tabChanged', [str('path'), str('language')]),

  /* Values */
  pure('value.string', 'values', [], [str('value')], (ctx) => ({ value: ctx.setting('value') }),
    [{ id: 'value', kind: 'text', default: '' }]),
  pure('value.number', 'values', [], [num('value')], (ctx) => ({ value: Number(ctx.setting('value')) || 0 }),
    [{ id: 'value', kind: 'text', default: '0' }]),
  pure('value.boolean', 'values', [], [bool('value')], (ctx) => ({ value: ctx.setting('value') === 'true' }),
    [select('value', ['true', 'false'])]),

  /* Editor */
  pure('editor.selection', 'editor', [], [str('text')], (ctx) => ({ text: ctx.host.selection() })),
  action('editor.replaceSelection', 'editor', [str('text', '')], async (ctx) => ctx.host.replaceSelection(await text(ctx, 'text'))),
  action('editor.insert', 'editor', [str('text', '')], async (ctx) => ctx.host.insert(await text(ctx, 'text'))),
  pure('editor.documentText', 'editor', [], [str('text')], (ctx) => ({ text: ctx.host.documentText() })),
  pure('editor.currentLine', 'editor', [], [str('text'), num('line')], (ctx) => {
    const line = ctx.host.currentLine()
    return { text: line.text, line: line.number }
  }),
  pure('editor.filePath', 'editor', [], [str('path')], (ctx) => ({ path: ctx.host.filePath() })),
  pure('editor.language', 'editor', [], [str('language')], (ctx) => ({ language: ctx.host.languageId() })),
  pure('editor.cursor', 'editor', [], [num('line'), num('column')], (ctx) => ctx.host.cursor()),
  action('editor.gotoLine', 'editor', [num('line', 1)], async (ctx) => ctx.host.gotoLine(await number(ctx, 'line'))),

  /* Text */
  pure('text.concat', 'text', [str('a', ''), str('b', '')], [str('result')], async (ctx) => ({
    result: (await text(ctx, 'a')) + (await text(ctx, 'b')),
  })),
  pure('text.template', 'text', [str('template', '{a}'), any('a'), any('b'), any('c')], [str('result')], async (ctx) => {
    const template = await text(ctx, 'template')
    const values: Record<string, string> = {}
    for (const id of ['a', 'b', 'c']) {
      if (template.includes(`{${id}}`)) values[id] = toText(await ctx.input(id))
    }
    const result = template
      .replace(/\{([abc])\}/g, (_m, id: string) => values[id] ?? '')
      .replace(/\{\$(\w+)\}/g, (_m, name: string) => toText(ctx.vars.get(name)))
    return { result }
  }),
  pure('text.case', 'text', [str('text', '')], [str('result')], async (ctx) => ({
    result: (CASES[ctx.setting('mode')] ?? CASES.upper)(await text(ctx, 'text')),
  }), [select('mode', ['upper', 'lower', 'title'])]),
  pure('text.trim', 'text', [str('text', '')], [str('result')], async (ctx) => ({
    result: (await text(ctx, 'text')).trim(),
  })),
  pure('text.replace', 'text', [str('text', ''), str('pattern', ''), str('replacement', '')], [str('result')], async (ctx) => {
    const source = await text(ctx, 'text')
    const pattern = await text(ctx, 'pattern')
    const replacement = await text(ctx, 'replacement')
    if (!pattern) return { result: source }
    if (ctx.setting('mode') === 'plain') return { result: source.split(pattern).join(replacement) }
    let regex: RegExp
    try {
      regex = new RegExp(pattern, ctx.setting('flags'))
    } catch (err) {
      throw new GraphError(t('addonStudio.run.badRegex', { message: (err as Error).message }), ctx.node.id)
    }
    return { result: source.replace(regex, replacement) }
  }, [select('mode', ['regex', 'plain']), select('flags', ['g', 'gi', 'gm', ''], { g: 'g', gi: 'gi', gm: 'gm', '': '—' })]),
  pure('text.split', 'text', [str('text', ''), str('separator', ',')], [list('list')], async (ctx) => ({
    list: (await text(ctx, 'text')).split(unescape(await text(ctx, 'separator'))),
  })),
  pure('text.join', 'text', [list('list'), str('separator', ', ')], [str('result')], async (ctx) => ({
    result: ((await ctx.input('list')) as unknown[]).map(toText).join(unescape(await text(ctx, 'separator'))),
  })),
  pure('text.length', 'text', [str('text', '')], [num('length')], async (ctx) => ({
    length: (await text(ctx, 'text')).length,
  })),
  pure('text.contains', 'text', [str('text', ''), str('search', '')], [bool('result')], async (ctx) => ({
    result: (await text(ctx, 'text')).includes(await text(ctx, 'search')),
  })),
  pure('text.startsWith', 'text', [str('text', ''), str('prefix', '')], [bool('result')], async (ctx) => ({
    result: (await text(ctx, 'text')).startsWith(await text(ctx, 'prefix')),
  })),
  pure('text.fromNumber', 'text', [num('number', 0)], [str('text')], async (ctx) => {
    const value = await number(ctx, 'number')
    const decimals = ctx.setting('decimals')
    return { text: decimals === 'auto' ? String(value) : value.toFixed(Number(decimals)) }
  }, [select('decimals', ['auto', '0', '1', '2', '3'], { 0: '0', 1: '1', 2: '2', 3: '3' })]),

  /* Logic and flow */
  {
    type: 'flow.if',
    category: 'logic',
    inputs: [IN, bool('condition')],
    outputs: [pin('true', 'exec'), pin('false', 'exec')],
    async run(ctx) {
      return (await ctx.input('condition')) ? 'true' : 'false'
    },
  },
  pure('logic.compare', 'logic', [any('a'), any('b')], [bool('result')], async (ctx) => {
    const test = COMPARISONS[ctx.setting('op')] ?? COMPARISONS.eq
    return { result: test(compareValues(await ctx.input('a'), await ctx.input('b'))) }
  }, [select('op', ['eq', 'ne', 'lt', 'le', 'gt', 'ge'], { eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' })]),
  pure('logic.and', 'logic', [bool('a'), bool('b')], [bool('result')], async (ctx) => ({
    result: Boolean(await ctx.input('a')) && Boolean(await ctx.input('b')),
  })),
  pure('logic.or', 'logic', [bool('a'), bool('b')], [bool('result')], async (ctx) => ({
    result: Boolean(await ctx.input('a')) || Boolean(await ctx.input('b')),
  })),
  pure('logic.not', 'logic', [bool('value')], [bool('result')], async (ctx) => ({
    result: !(await ctx.input('value')),
  })),
  {
    type: 'flow.sequence',
    category: 'logic',
    inputs: [IN],
    outputs: [pin('then1', 'exec', { label: 'first' }), pin('then2', 'exec', { label: 'second' }), pin('then3', 'exec', { label: 'third' })],
    async run(ctx) {
      await ctx.follow('then1')
      await ctx.follow('then2')
      return 'then3'
    },
  },
  {
    type: 'flow.forEach',
    category: 'logic',
    inputs: [IN, list('list')],
    outputs: [pin('body', 'exec'), any('element'), num('index'), pin('done', 'exec')],
    async run(ctx) {
      const items = (await ctx.input('list')) as unknown[]
      for (let i = 0; i < items.length; i++) {
        ctx.output('element', items[i])
        ctx.output('index', i)
        await ctx.follow('body')
      }
      return 'done'
    },
  },
  {
    type: 'flow.repeat',
    category: 'logic',
    inputs: [IN, num('count', 3)],
    outputs: [pin('body', 'exec'), num('index'), pin('done', 'exec')],
    async run(ctx) {
      const count = Math.floor(Number(await ctx.input('count')))
      for (let i = 0; i < count; i++) {
        ctx.output('index', i)
        await ctx.follow('body')
      }
      return 'done'
    },
  },
  action('flow.wait', 'logic', [num('ms', 500)], async (ctx) => sleep(await number(ctx, 'ms'), ctx.signal)),
  {
    type: 'flow.stop',
    category: 'logic',
    inputs: [IN],
    outputs: [],
    run() {
      throw new StopSignal()
    },
  },

  /* Variables and lists */
  {
    type: 'var.set',
    category: 'variables',
    inputs: [IN, any('value')],
    outputs: [THEN, any('value')],
    settings: [{ id: 'name', kind: 'text', default: 'wert' }],
    async run(ctx) {
      const value = await ctx.input('value')
      ctx.vars.set(ctx.setting('name'), value)
      ctx.output('value', value)
      return 'then'
    },
  },
  pure('var.get', 'variables', [], [any('value')], (ctx) => ({ value: ctx.vars.get(ctx.setting('name')) }),
    [{ id: 'name', kind: 'text', default: 'wert' }]),
  pure('list.create', 'variables', [any('a'), any('b'), any('c')], [list('list')], async (ctx) => {
    const items: unknown[] = []
    for (const id of ['a', 'b', 'c']) {
      const value = await ctx.input(id)
      if (value !== '' && value !== undefined && value !== null) items.push(value)
    }
    return { list: items }
  }),
  pure('list.append', 'variables', [list('list'), any('item')], [list('list')], async (ctx) => ({
    list: [...((await ctx.input('list')) as unknown[]), await ctx.input('item')],
  })),
  pure('list.get', 'variables', [list('list'), num('index', 0)], [any('item')], async (ctx) => {
    const items = (await ctx.input('list')) as unknown[]
    const index = Math.floor(await number(ctx, 'index'))
    return { item: items[index < 0 ? items.length + index : index] }
  }),
  pure('list.length', 'variables', [list('list')], [num('length')], async (ctx) => ({
    length: ((await ctx.input('list')) as unknown[]).length,
  })),

  /* Maths */
  binaryMath('math.add', (a, b) => a + b),
  binaryMath('math.subtract', (a, b) => a - b),
  binaryMath('math.multiply', (a, b) => a * b),
  pure('math.divide', 'math', [num('a', 0), num('b', 1)], [num('result')], async (ctx) => {
    const b = await number(ctx, 'b')
    if (b === 0) throw new GraphError(t('addonStudio.run.divideByZero'), ctx.node.id)
    return { result: (await number(ctx, 'a')) / b }
  }),
  pure('math.modulo', 'math', [num('a', 0), num('b', 2)], [num('result')], async (ctx) => {
    const b = await number(ctx, 'b')
    if (b === 0) throw new GraphError(t('addonStudio.run.divideByZero'), ctx.node.id)
    return { result: (await number(ctx, 'a')) % b }
  }),
  pure('math.round', 'math', [num('value', 0)], [num('result')], async (ctx) => ({
    result: (ROUNDING[ctx.setting('mode')] ?? Math.round)(await number(ctx, 'value')),
  }), [select('mode', ['round', 'floor', 'ceil'])]),
  pure('math.random', 'math', [num('min', 0), num('max', 100)], [num('result')], async (ctx) => {
    const min = Math.ceil(await number(ctx, 'min'))
    const max = Math.floor(await number(ctx, 'max'))
    return { result: min + Math.floor(Math.random() * (Math.max(min, max) - min + 1)) }
  }),
  binaryMath('math.min', Math.min),
  binaryMath('math.max', Math.max),

  /* Workspace */
  action('ws.openFile', 'workspace', [str('path', '')], async (ctx) => ctx.host.openFile(await text(ctx, 'path'))),
  action('ws.readFile', 'workspace', [str('path', '')], async (ctx) => {
    ctx.output('content', await ctx.host.readFile(await text(ctx, 'path')))
  }, { outputs: [str('content')] }),
  action('ws.writeFile', 'workspace', [str('path', ''), str('content', '')], async (ctx) => {
    await ctx.host.writeFile(await text(ctx, 'path'), await text(ctx, 'content'))
  }),
  action('ws.shell', 'workspace', [str('command', '')], async (ctx) => {
    const result = await ctx.host.shell(ctx.addonId, await text(ctx, 'command'))
    ctx.output('stdout', result.stdout)
    ctx.output('stderr', result.stderr)
    ctx.output('code', result.code)
  }, { outputs: [str('stdout'), str('stderr'), num('code')] }),
  action('ws.runTask', 'workspace', [str('task', '')], async (ctx) => {
    ctx.output('ok', await ctx.host.runTask(await text(ctx, 'task')))
  }, { outputs: [bool('ok')] }),

  /* Interface */
  action('ui.notify', 'ui', [str('message', '')], async (ctx) => {
    const kind = ctx.setting('kind') as 'info' | 'success' | 'warning' | 'error'
    ctx.host.notify(await text(ctx, 'message'), kind)
  }, { settings: [select('kind', ['info', 'success', 'warning', 'error'])] }),
  {
    type: 'ui.prompt',
    category: 'ui',
    inputs: [IN, str('title', ''), str('label', ''), str('initial', '')],
    outputs: [THEN, pin('cancel', 'exec'), str('value')],
    async run(ctx) {
      const value = await ctx.host.prompt(await text(ctx, 'title'), await text(ctx, 'label'), await text(ctx, 'initial'))
      if (value === null) return 'cancel'
      ctx.output('value', value)
      return 'then'
    },
  },
  {
    type: 'ui.pick',
    category: 'ui',
    inputs: [IN, str('title', ''), list('items')],
    outputs: [THEN, pin('cancel', 'exec'), str('value')],
    async run(ctx) {
      const items = ((await ctx.input('items')) as unknown[]).map(toText)
      const value = await ctx.host.pick(await text(ctx, 'title'), items)
      if (value === null) return 'cancel'
      ctx.output('value', value)
      return 'then'
    },
  },
  action('ui.output', 'ui', [str('text', '')], async (ctx) => ctx.host.output(await text(ctx, 'text'))),

  /* IDE */
  action('ide.runCommand', 'ide', [str('command', '')], async (ctx) => {
    ctx.output('ok', ctx.host.runCommand(await text(ctx, 'command')))
  }, { outputs: [bool('ok')] }),
  action('ide.setTheme', 'ide', [str('theme', '')], async (ctx) => ctx.host.setTheme(await text(ctx, 'theme'))),
  action('ide.toggleSetting', 'ide', [], (ctx) => ctx.host.toggleSetting(ctx.setting('key'), ctx.setting('mode')), {
    settings: [select('key', TOGGLE_SETTINGS), select('mode', ['toggle', 'on', 'off'])],
  }),
]

export const NODE_CATALOG = new Map(NODES.map((def) => [def.type, def]))

export const nodeDefs = (): NodeDef[] => NODES

export const categoryColor = (category: NodeCategory) =>
  NODE_CATEGORIES.find((c) => c.id === category)?.color ?? '#8b939f'

/**
 * May an output of this type feed an input of that one? exec only to exec,
 * `any` fits every data type, and numbers and booleans become text.
 */
export function canConnect(from: PinType, to: PinType): boolean {
  if (from === 'exec' || to === 'exec') return from === to
  if (from === to || from === 'any' || to === 'any') return true
  return to === 'string' && (from === 'number' || from === 'boolean')
}

/** Translated labels. */
export const nodeTitle = (type: string) => t(`addonStudio.node.${type}`)
export const pinLabel = (p: PinDef) => t(`addonStudio.pin.${p.label ?? p.id}`)
export const settingLabel = (s: SettingDef) => t(`addonStudio.setting.${s.id}`)
export const choiceLabel = (c: { value: string; label?: string }) => c.label ?? t(`addonStudio.choice.${c.value}`)
export const categoryLabel = (id: NodeCategory) => t(`addonStudio.category.${id}`)
