/**
 * Wires a language server to the CodeMirror editor.
 *
 * Completion (with auto-imports), hover, signature help, diagnostics,
 * occurrence highlighting, inlay hints, code actions, renaming, navigation
 * (definition, declaration, type, implementation, references), formatting and
 * the outline — all of it through the `LspClient`.
 */

import { diffChanges, needsResolve, offsetToPos, planCompletion, posToOffset } from '@/core/completion/apply'
import { snippetToCm } from '@/core/completion/snippet'
import { ensureSnippetSession, startSnippetSession } from './snippet-session'
import { formatFor, lspFormattingOptions } from '@/core/format-settings'
import {
  Decoration, EditorView, hoverTooltip, keymap, showTooltip, ViewPlugin, WidgetType,
  type DecorationSet, type Tooltip, type ViewUpdate,
} from '@codemirror/view'
import {
  ChangeSet, EditorSelection, Prec, StateEffect, StateField,
  type Extension, type Text, type TransactionSpec,
} from '@codemirror/state'
import {
  pickedCompletion, type Completion, type CompletionContext, type CompletionResult,
} from '@codemirror/autocomplete'
import { setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint'
import { lsp } from '@/core/lsp/manager'
import type { LspClient } from '@/core/lsp/client'
import {
  COMPLETION_ICON, plainText, toMarkdown, uriToPath,
  type CodeAction, type CompletionItem, type Diagnostic, type DocumentHighlight,
  type InlayHint, type Location, type LspCommand, type Range,
  type SignatureHelp, type TextEdit,
} from '@/core/lsp/protocol'
import { renderMarkdown, markdownToText } from '@/lib/markdown'
import { applyWorkspaceEdit } from '@/lib/workspace-edit'
import { symbolStore } from '@/lib/symbols'
import { t } from '@/i18n'
import { declarationHits, definitionSymbols, preferCurrentModule, searchExtensions } from './definition-fallback'
import { useStore, type ReferenceHit } from '@/state/store'
import type { Effects } from '@/core/theme'
import type { LanguageSpec } from '@/core/types'

export { markdownToText }

/* ------------------------------------------------------------------ *
 * Positions
 * ------------------------------------------------------------------ */

export { posToOffset, offsetToPos }

function rangeToOffsets(doc: Text, range: Range) {
  const from = posToOffset(doc, range.start)
  return { from, to: Math.max(from, posToOffset(doc, range.end)) }
}

function selectionRange(view: EditorView): Range {
  const { from, to } = view.state.selection.main
  return { start: offsetToPos(view.state.doc, from), end: offsetToPos(view.state.doc, to) }
}

function readyClient(filePath: string): LspClient | null {
  const client = lsp.clientForPath(filePath)
  return client?.status === 'ready' ? client : null
}

/** The word under the cursor — for the titles of reference lists. */
function wordAt(view: EditorView, pos: number): string {
  const word = view.state.wordAt(pos)
  return word ? view.state.sliceDoc(word.from, word.to) : ''
}

/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */

const SEVERITY: Record<number, CmDiagnostic['severity']> = {
  1: 'error', 2: 'warning', 3: 'info', 4: 'hint',
}

/** An extra class for deprecated (2) and unnecessary (1) spots. */
function diagnosticMark(tags: (1 | 2)[] | undefined): string | undefined {
  if (tags?.includes(2)) return 'cm-lintRange-deprecated'
  if (tags?.includes(1)) return 'cm-lintRange-unnecessary'
  return undefined
}

/** The file whose diagnostics were last set on this view. */
const shownFor = new WeakMap<EditorView, string | undefined>()

export function applyDiagnostics(view: EditorView, diagnostics: Diagnostic[], filePath?: string) {
  // Stale diagnostics — the server still working on an older snapshot — would
  // land beside the text while typing, so it is better to leave the existing
  // ones: CodeMirror moves them along with the changes. On a file switch they
  // always have to be set, or another file's marks would stay behind.
  const sameFile = shownFor.has(view) && shownFor.get(view) === filePath
  if (filePath && sameFile && !lsp.diagnosticsAreCurrent(filePath)) return
  shownFor.set(view, filePath)

  const doc = view.state.doc
  const client = filePath ? readyClient(filePath) : null
  const canFix = Boolean(client?.supports('codeActionProvider'))

  const mapped: CmDiagnostic[] = diagnostics.map((d) => {
    const { from, to } = rangeToOffsets(doc, d.range)
    const related = (d.relatedInformation ?? [])
      .slice(0, 4)
      .map((r) => `↳ ${uriToPath(r.location.uri).split(/[\\/]/).pop()}:${r.location.range.start.line + 1}: ${r.message}`)
    const message = [d.code ? `${d.message}  [${d.code}]` : d.message, ...related].join('\n')
    const markClass = diagnosticMark(d.tags)
    const entry: CmDiagnostic = {
      from,
      to: to === from ? Math.min(from + 1, doc.length) : to,
      severity: SEVERITY[d.severity ?? 1] ?? 'error',
      message,
      source: d.source,
      markClass,
    }
    if (canFix && filePath) {
      entry.actions = [{
        name: 'Korrektur…',
        apply: (v) => { void showCodeActions(v, filePath, undefined, d.range) },
      }]
    }
    return entry
  })
  view.dispatch(setDiagnostics(view.state, mapped))
}

/* ------------------------------------------------------------------ *
 * Snippets
 * ------------------------------------------------------------------ */

/** LSP snippet syntax → CodeMirror template syntax (`${1:name}` → `${1:name}` fields, `$0` → `${}`). */
export function lspSnippetToCm(body: string): string {
  return snippetToCm(body)
}

/* ------------------------------------------------------------------ *
 * Completion
 * ------------------------------------------------------------------ */

function textEditsToChanges(doc: Text, edits: TextEdit[]) {
  return edits.map((e) => {
    const { from, to } = rangeToOffsets(doc, e.range)
    return { from, to, insert: e.newText }
  })
}

/** The file's language server, when ready — for the merged completion. */
export function completionClient(filePath: string): LspClient | null {
  return readyClient(filePath)
}

/** The label without decoration — the basis for matching and duplicate detection. */
export function lspItemLabel(item: CompletionItem): string {
  return item.label.trim()
}

export function lspItemDeprecated(item: CompletionItem): boolean {
  return Boolean(item.deprecated || item.tags?.includes(1))
}

/** How long accepting waits for `completionItem/resolve` before applying what it has. */
const RESOLVE_TIMEOUT_MS = 2500

function warn(message: string) {
  console.warn(`[lsp] ${message}`)
  useStore.getState().notify(message, 'warning')
}

async function resolveWithTimeout(client: LspClient, item: CompletionItem): Promise<CompletionItem | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), RESOLVE_TIMEOUT_MS) })
  try {
    const result = await Promise.race([client.resolveCompletion(item), timeout])
    if (!result) warn(`Auto-Import für „${item.label}“ nicht rechtzeitig geladen — Vorschlag ohne Import eingefügt`)
    return result ?? undefined
  } catch (err) {
    warn(`Auto-Import für „${item.label}“ fehlgeschlagen: ${(err as Error).message}`)
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Accepts a suggestion: resolves it when it may still carry auto-imports, then
 * applies main edit, additional edits and snippet in ONE transaction (one undo
 * step). Changes made while resolving are mapped through; a moved cursor aborts.
 */
async function acceptCompletion(
  view: EditorView, client: LspClient, item: CompletionItem, completion: Completion,
  applyFrom: number, applyTo: number, filePath: string | undefined,
) {
  const baseDoc = view.state.doc
  const baseHead = view.state.selection.main.head
  const resolved = needsResolve(item) ? await resolveWithTimeout(client, item) : undefined

  let changes: ChangeSet | undefined
  if (view.state.doc !== baseDoc) {
    changes = diffChanges(baseDoc, view.state.doc)
    if (view.state.selection.main.head !== changes.mapPos(baseHead, 1)) {
      warn(`Einfügen von „${item.label}“ abgebrochen: Cursor wurde verschoben`)
      return
    }
  }
  const state = view.state
  const sel = state.selection.main
  const plan = planCompletion({
    doc: state.doc, head: sel.head,
    from: changes ? changes.mapPos(applyFrom, -1) : applyFrom,
    to: changes ? changes.mapPos(applyTo, 1) : applyTo,
    item, resolved, baseDoc: changes ? baseDoc : undefined, changes,
    filePath, selected: sel.empty ? undefined : state.sliceDoc(sel.from, sel.to),
  })
  for (const w of plan.warnings) console.warn(`[lsp] ${w}`)
  if (plan.dropped.length) {
    warn(`${plan.dropped.length} Zusatzänderung(en) von „${item.label}“ verworfen: ${plan.dropped[0].reason}`)
  }

  if (plan.stops) ensureSnippetSession(view)
  try {
    view.dispatch({
      changes: plan.changes,
      selection: EditorSelection.create(
        plan.selection.map((r) => EditorSelection.range(r.anchor, r.head)), 0,
      ),
      effects: plan.stops ? [startSnippetSession(plan.stops)] : [],
      userEvent: 'input.complete',
      annotations: pickedCompletion.of(completion),
      scrollIntoView: true,
    })
  } catch (err) {
    warn(`Einfügen von „${item.label}“ fehlgeschlagen: ${(err as Error).message}`)
    return
  }
  const command = resolved?.command ?? item.command
  if (command) await runCommand(view, client, command, filePath)
}

/**
 * One server suggestion as a CodeMirror option: documentation (fetched later),
 * snippets, the replacement range from `textEdit`, auto-imports and commands.
 * `filePath` lets a `triggerParameterHints` command open the signature help.
 */
export function lspItemToCompletion(client: LspClient, item: CompletionItem, filePath?: string): Completion {
  const label = lspItemLabel(item)
  const detail = item.labelDetails?.description ?? item.detail?.split('\n')[0]
  const icon = COMPLETION_ICON[item.kind ?? 1] ?? 'text'

  return {
    label,
    displayLabel: label + (item.labelDetails?.detail ?? ''),
    detail: detail && detail !== label ? detail : undefined,
    // A second type class marks deprecated items (styled as strike-through).
    type: lspItemDeprecated(item) ? `${icon} deprecated` : icon,
    info: async () => {
      const resolved = item.documentation ? item : await client.resolveCompletion(item)
      const md = toMarkdown(resolved.documentation)
      const extra = resolved.detail && resolved.detail !== detail
        ? `\`\`\`${client.servedLanguages[0] ?? ''}\n${resolved.detail}\n\`\`\`\n\n` : ''
      if (!md && !extra) return null
      const node = document.createElement('div')
      node.className = 'lm-lsp-doc'
      renderMarkdown((extra + md).slice(0, 4000), node)
      return node
    },
    apply: (view, completion, applyFrom, applyTo) => {
      void acceptCompletion(view, client, item, completion, applyFrom, applyTo, filePath ?? shownFor.get(view))
    },
  }
}

/**
 * A server-only source using CodeMirror's filtering. The merged,
 * error-tolerant completion lives in `core/completion`; this source remains
 * for callers who want nothing but the server.
 */
export function lspCompletionSource(filePath: string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const client = readyClient(filePath)
    if (!client) return null

    const word = context.matchBefore(/[\w$@.\-:/]+/)
    const before = context.state.sliceDoc(Math.max(0, context.pos - 1), context.pos)
    const isTrigger = client.triggerCharacters.includes(before)
    if (!word && !context.explicit && !isTrigger) return null

    const list = await client.completion(
      filePath,
      offsetToPos(context.state.doc, context.pos),
      isTrigger ? before : undefined,
    )
    const items = list.items
    if (!items.length) return null

    let from = context.pos
    const plain = context.matchBefore(/[\w$]+/)
    if (plain) from = plain.from

    const options = items.map((item, index) => ({
      ...lspItemToCompletion(client, item, filePath),
      boost: (item.preselect ? 30 : 0) - index / items.length,
    }))

    return {
      from,
      options,
      // Re-request incomplete lists on every keystroke.
      validFor: list.isIncomplete ? undefined : /^[\w$]*$/,
    }
  }
}

async function runCommand(view: EditorView, client: LspClient, command: LspCommand, filePath?: string) {
  if (command.command === 'editor.action.triggerParameterHints') {
    if (filePath) await triggerSignatureHelp(view, filePath, undefined, false)
    return
  }
  try {
    await client.executeCommand(command)
  } catch (err) {
    useStore.getState().notify(`Befehl fehlgeschlagen: ${(err as Error).message}`, 'warning')
  }
}

/* ------------------------------------------------------------------ *
 * Hover
 * ------------------------------------------------------------------ */

function lspHover(filePath: string): Extension {
  return hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
    const client = readyClient(filePath)
    if (!client) return null

    const result = await client.hover(filePath, offsetToPos(view.state.doc, pos))
    const md = toMarkdown(result?.contents).trim()
    if (!md) return null

    const from = result?.range ? posToOffset(view.state.doc, result.range.start) : pos
    const to = result?.range ? posToOffset(view.state.doc, result.range.end) : pos

    return {
      pos: from,
      end: to,
      above: true,
      create: () => {
        const dom = document.createElement('div')
        dom.className = 'lm-lsp-hover'
        renderMarkdown(md.slice(0, 8000), dom)
        return { dom }
      },
    }
  }, { hoverTime: 300 })
}

/* ------------------------------------------------------------------ *
 * A generic menu inside the editor (code actions and the like)
 * ------------------------------------------------------------------ */

interface MenuItem {
  label: string
  detail?: string
  disabled?: string
  preferred?: boolean
  run: () => void | Promise<void>
}

interface MenuSpec {
  title: string
  items: MenuItem[]
  pos: number
  selected: number
}

const setMenu = StateEffect.define<MenuSpec | null>()

const menuField = StateField.define<MenuSpec | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setMenu)) return e.value
    if (value && tr.docChanged) return null
    return value
  },
  provide: (field) =>
    showTooltip.compute([field], (state) => {
      const menu = state.field(field)
      if (!menu) return null
      return {
        pos: menu.pos,
        above: false,
        strictSide: false,
        arrow: false,
        create: (view) => ({ dom: renderMenu(view, menu) }),
      }
    }),
})

function renderMenu(view: EditorView, menu: MenuSpec): HTMLElement {
  const dom = document.createElement('div')
  dom.className = 'lm-menu'
  const title = document.createElement('div')
  title.className = 'lm-menu-title'
  title.textContent = menu.title
  dom.append(title)
  if (!menu.items.length) {
    const empty = document.createElement('div')
    empty.className = 'lm-menu-empty'
    empty.textContent = t('editor.nav.noActions')
    dom.append(empty)
  }
  menu.items.forEach((item, i) => {
    const row = document.createElement('div')
    row.className = 'lm-menu-item'
    row.setAttribute('role', 'option')
    row.setAttribute('aria-selected', String(i === menu.selected))
    if (item.disabled) {
      row.setAttribute('aria-disabled', 'true')
      row.title = item.disabled
    }
    const label = document.createElement('span')
    label.textContent = (item.preferred ? '★ ' : '') + item.label
    row.append(label)
    if (item.detail) {
      const kind = document.createElement('span')
      kind.className = 'lm-menu-kind'
      kind.textContent = item.detail
      row.append(kind)
    }
    row.addEventListener('mousedown', (e) => e.preventDefault())
    row.addEventListener('click', () => {
      if (item.disabled) return
      closeMenu(view)
      void item.run()
    })
    dom.append(row)
  })
  queueMicrotask(() => dom.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
  return dom
}

function closeMenu(view: EditorView) {
  view.dispatch({ effects: setMenu.of(null) })
  view.focus()
}

const menuKeymap = Prec.highest(keymap.of([
  {
    key: 'ArrowDown',
    run: (view) => {
      const menu = view.state.field(menuField, false)
      if (!menu || !menu.items.length) return false
      view.dispatch({ effects: setMenu.of({ ...menu, selected: (menu.selected + 1) % menu.items.length }) })
      return true
    },
  },
  {
    key: 'ArrowUp',
    run: (view) => {
      const menu = view.state.field(menuField, false)
      if (!menu || !menu.items.length) return false
      view.dispatch({ effects: setMenu.of({ ...menu, selected: (menu.selected - 1 + menu.items.length) % menu.items.length }) })
      return true
    },
  },
  {
    key: 'Enter',
    run: (view) => {
      const menu = view.state.field(menuField, false)
      if (!menu) return false
      const item = menu.items[menu.selected]
      closeMenu(view)
      if (item && !item.disabled) void item.run()
      return true
    },
  },
  {
    key: 'Escape',
    run: (view) => {
      if (!view.state.field(menuField, false)) return false
      closeMenu(view)
      return true
    },
  },
]))

/* ------------------------------------------------------------------ *
 * Code actions
 * ------------------------------------------------------------------ */

function overlaps(a: Range, b: Range) {
  const before = a.end.line < b.start.line || (a.end.line === b.start.line && a.end.character < b.start.character)
  const after = b.end.line < a.start.line || (b.end.line === a.start.line && b.end.character < a.start.character)
  return !before && !after
}

export async function showCodeActions(
  view: EditorView, filePath: string, only?: string[], range?: Range,
): Promise<boolean> {
  const client = readyClient(filePath)
  if (!client?.supports('codeActionProvider')) {
    useStore.getState().notify('Kein Language-Server mit Code-Aktionen aktiv', 'info')
    return false
  }
  const target = range ?? selectionRange(view)
  const diagnostics = lsp.diagnostics(filePath).filter((d) => overlaps(d.range, target))
  const pos = posToOffset(view.state.doc, target.start)

  view.dispatch({ effects: setMenu.of({ title: 'Aktionen werden geladen…', items: [], pos, selected: 0 }) })
  const actions = await client.codeActions(filePath, target, diagnostics, only)

  const items: MenuItem[] = actions.map((action) => {
    const isCommand = !('kind' in action) && !('edit' in action) && 'command' in action && typeof action.command === 'string'
    const codeAction = action as CodeAction
    return {
      label: action.title,
      detail: isCommand ? 'Befehl' : kindLabel(codeAction.kind),
      disabled: codeAction.disabled?.reason,
      preferred: codeAction.isPreferred,
      run: () => runCodeAction(client, isCommand ? (action as LspCommand) : codeAction),
    }
  })
  items.sort((a, b) => Number(b.preferred ?? false) - Number(a.preferred ?? false))

  view.dispatch({
    effects: setMenu.of({
      title: only?.includes('source.organizeImports') ? 'Imports' : 'Code-Aktionen',
      items,
      pos,
      selected: 0,
    }),
  })
  return true
}

function kindLabel(kind: string | undefined): string {
  if (!kind) return ''
  if (kind.startsWith('quickfix')) return 'Korrektur'
  if (kind.startsWith('refactor.extract')) return 'Extrahieren'
  if (kind.startsWith('refactor.inline')) return 'Inline'
  if (kind.startsWith('refactor.rewrite')) return 'Umschreiben'
  if (kind.startsWith('refactor')) return 'Refactoring'
  if (kind.startsWith('source.organizeImports')) return 'Imports'
  if (kind.startsWith('source.fixAll')) return 'Alles korrigieren'
  if (kind.startsWith('source')) return 'Quelle'
  return kind
}

async function runCodeAction(client: LspClient, action: CodeAction | LspCommand) {
  try {
    if ('command' in action && typeof action.command === 'string') {
      await client.executeCommand(action as LspCommand)
      return
    }
    const resolved = await client.resolveCodeAction(action as CodeAction)
    if (resolved.edit) await applyWorkspaceEdit(resolved.edit, resolved.title)
    if (resolved.command) await client.executeCommand(resolved.command)
  } catch (err) {
    useStore.getState().notify(`Aktion fehlgeschlagen: ${(err as Error).message}`, 'error')
  }
}

/** Organise imports: run the first matching `source.organizeImports` action straight away. */
export async function organizeImports(view: EditorView, filePath: string): Promise<boolean> {
  const client = readyClient(filePath)
  if (!client?.supports('codeActionProvider')) return false
  const doc = view.state.doc
  const whole: Range = { start: { line: 0, character: 0 }, end: offsetToPos(doc, doc.length) }
  const actions = await client.codeActions(filePath, whole, [], ['source.organizeImports'])
  const action = actions.find((a) => (a as CodeAction).kind?.startsWith('source.organizeImports')) ?? actions[0]
  if (!action) return false
  await runCodeAction(client, action)
  return true
}

/* ------------------------------------------------------------------ *
 * Renaming
 * ------------------------------------------------------------------ */

interface RenameSpec { pos: number; from: number; to: number; placeholder: string }

const setRename = StateEffect.define<RenameSpec | null>()

const renameField = StateField.define<RenameSpec | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setRename)) return e.value
    return value
  },
  provide: (field) =>
    showTooltip.compute([field], (state) => {
      const spec = state.field(field)
      if (!spec) return null
      return { pos: spec.pos, above: true, create: (view) => ({ dom: renderRename(view, spec) }) }
    }),
})

let renameHandler: ((view: EditorView, name: string) => Promise<void>) | null = null

function renderRename(view: EditorView, spec: RenameSpec): HTMLElement {
  const dom = document.createElement('div')
  dom.className = 'lm-rename'
  const input = document.createElement('input')
  input.value = spec.placeholder
  input.spellcheck = false
  input.setAttribute('aria-label', 'Neuer Name')
  const hint = document.createElement('span')
  hint.className = 'lm-rename-hint'
  hint.textContent = '↵ umbenennen · Esc abbrechen'
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key !== 'Escape' && e.key !== 'Enter') return
    const name = input.value.trim()
    view.dispatch({ effects: setRename.of(null) })
    view.focus()
    if (e.key === 'Escape') return
    if (name && name !== spec.placeholder) void renameHandler?.(view, name)
  })
  dom.append(input, hint)
  queueMicrotask(() => { input.focus(); input.select() })
  return dom
}

export async function startRename(view: EditorView, filePath: string): Promise<boolean> {
  const client = readyClient(filePath)
  if (!client?.supports('renameProvider')) {
    useStore.getState().notify('Umbenennen wird von diesem Server nicht unterstützt', 'info')
    return false
  }
  const head = view.state.selection.main.head
  const position = offsetToPos(view.state.doc, head)
  const prepared = await client.prepareRename(filePath, position)
  if (!prepared) {
    useStore.getState().notify('Hier lässt sich nichts umbenennen', 'info')
    return false
  }
  let { from, to } = rangeToOffsets(view.state.doc, prepared.range)
  if (from === to) {
    const word = view.state.wordAt(head)
    if (!word) return false
    from = word.from
    to = word.to
  }
  const placeholder = prepared.placeholder ?? view.state.sliceDoc(from, to)

  renameHandler = async (v, name) => {
    try {
      const edit = await client.rename(filePath, position, name)
      if (!edit) {
        useStore.getState().notify('Server lieferte keine Änderungen', 'warning')
        return
      }
      const count = Object.values(edit.changes ?? {}).reduce((n, e) => n + e.length, 0)
        + (edit.documentChanges ?? []).reduce((n, c) => n + ('edits' in c ? c.edits.length : 1), 0)
      await applyWorkspaceEdit(edit, `${placeholder} → ${name} (${count} Stellen)`)
      v.focus()
    } catch (err) {
      useStore.getState().notify(`Umbenennen fehlgeschlagen: ${(err as Error).message}`, 'error')
    }
  }
  view.dispatch({ effects: setRename.of({ pos: from, from, to, placeholder }) })
  return true
}

/* ------------------------------------------------------------------ *
 * Signature help
 * ------------------------------------------------------------------ */

interface SignatureState { help: SignatureHelp; pos: number }

const setSignature = StateEffect.define<SignatureState | null>()

const signatureField = StateField.define<SignatureState | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSignature)) return e.value
    if (value && tr.docChanged) return { ...value, pos: tr.changes.mapPos(value.pos) }
    return value
  },
  provide: (field) =>
    showTooltip.compute([field], (state) => {
      const sig = state.field(field)
      if (!sig) return null
      return {
        pos: sig.pos,
        above: true,
        arrow: false,
        create: () => ({ dom: renderSignature(sig.help) }),
      }
    }),
})

function renderSignature(help: SignatureHelp): HTMLElement {
  const dom = document.createElement('div')
  dom.className = 'lm-signature'
  const activeIndex = Math.min(help.activeSignature ?? 0, help.signatures.length - 1)
  const sig = help.signatures[activeIndex]
  if (!sig) return dom
  const activeParam = sig.activeParameter ?? help.activeParameter ?? 0

  if (help.signatures.length > 1) {
    const count = document.createElement('span')
    count.className = 'lm-signature-count'
    count.textContent = `${activeIndex + 1}/${help.signatures.length}`
    dom.append(count)
  }

  const label = document.createElement('div')
  label.className = 'lm-signature-label'
  const param = sig.parameters?.[activeParam]
  const range = parameterRange(sig.label, param?.label)
  if (!range) label.textContent = sig.label
  if (range) {
    label.append(sig.label.slice(0, range[0]))
    const strong = document.createElement('span')
    strong.className = 'lm-signature-active'
    strong.textContent = sig.label.slice(range[0], range[1])
    label.append(strong, sig.label.slice(range[1]))
  }
  dom.append(label)

  const docText = toMarkdown(param?.documentation) || toMarkdown(sig.documentation)
  if (docText) {
    const doc = document.createElement('div')
    doc.className = 'lm-signature-doc'
    renderMarkdown(docText.slice(0, 1500), doc)
    dom.append(doc)
  }
  return dom
}

/** Position of the active parameter within the signature text. */
function parameterRange(signature: string, param: string | [number, number] | undefined): [number, number] | null {
  if (param === undefined) return null
  if (Array.isArray(param)) return param
  const index = signature.indexOf(param)
  if (index < 0) return null
  return [index, index + param.length]
}

export async function triggerSignatureHelp(
  view: EditorView, filePath: string, trigger?: string, isRetrigger = false,
): Promise<boolean> {
  const client = readyClient(filePath)
  if (!client?.supports('signatureHelpProvider')) return false
  const head = view.state.selection.main.head
  const help = await client.signatureHelp(filePath, offsetToPos(view.state.doc, head), trigger, isRetrigger)
  if (!help?.signatures.length) {
    if (view.state.field(signatureField, false)) view.dispatch({ effects: setSignature.of(null) })
    return false
  }
  view.dispatch({ effects: setSignature.of({ help, pos: view.state.selection.main.head }) })
  return true
}

/**
 * Signature help when a call opens — and only then.
 *
 * The bubble appears on the server's trigger characters (`(`, `,`) and
 * disappears as soon as the first character of the argument is typed, or the
 * cursor leaves the spot. It used to close only on a `)` or a backwards move,
 * so anyone who simply kept writing after the call carried the parameter list
 * along across lines. The full signature stays reachable by hovering the name
 * and through `editor.triggerParameterHints`.
 */
function signaturePlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null

    private close(update: ViewUpdate) {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      if (!update.state.field(signatureField, false)) return
      update.view.dispatch({ effects: setSignature.of(null) })
    }

    update(update: ViewUpdate) {
      const active = Boolean(update.state.field(signatureField, false))

      if (!update.docChanged) {
        // Cursor away from where the bubble hangs → close it.
        if (!update.selectionSet || !active) return
        const sig = update.state.field(signatureField)!
        if (update.state.selection.main.head === sig.pos) return
        this.close(update)
        return
      }

      const client = readyClient(filePath)
      if (!client) return
      let inserted = ''
      update.changes.iterChanges((_fa, _ta, _fb, _tb, text) => { inserted = text.toString().slice(-1) })
      const isTrigger = client.signatureTriggerCharacters.includes(inserted)

      // Anything but a trigger character ends the display: the argument is
      // being typed, and the start of the call is behind us.
      if (!isTrigger) {
        this.close(update)
        return
      }

      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        void triggerSignatureHelp(update.view, filePath, inserted, active)
      }, 60)
    }

    destroy() {
      if (this.timer) clearTimeout(this.timer)
    }
  })
}

/* ------------------------------------------------------------------ *
 * Highlighting occurrences
 * ------------------------------------------------------------------ */

const setHighlights = StateEffect.define<DecorationSet>()

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setHighlights)) return e.value
    return tr.docChanged ? Decoration.none : value.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})

const HIGHLIGHT_MARK: Record<number, Decoration> = {
  1: Decoration.mark({ class: 'lm-highlight-text' }),
  2: Decoration.mark({ class: 'lm-highlight-read' }),
  3: Decoration.mark({ class: 'lm-highlight-write' }),
}

function highlightPlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null
    private lastPos = -1

    update(update: ViewUpdate) {
      if (!update.selectionSet && !update.docChanged) return
      const head = update.state.selection.main.head
      if (head === this.lastPos && !update.docChanged) return
      this.lastPos = head
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        void this.request(update.view, head)
      }, 220)
    }

    async request(view: EditorView, head: number) {
      const client = readyClient(filePath)
      if (!client?.supports('documentHighlightProvider')) return
      if (!view.state.wordAt(head)) {
        if (view.state.field(highlightField, false)?.size) view.dispatch({ effects: setHighlights.of(Decoration.none) })
        return
      }
      const hits: DocumentHighlight[] = await client.documentHighlight(filePath, offsetToPos(view.state.doc, head))
      if (view.state.selection.main.head !== head) return
      const doc = view.state.doc
      const ranges = hits
        .map((h) => {
          const { from, to } = rangeToOffsets(doc, h.range)
          return from < to ? HIGHLIGHT_MARK[h.kind ?? 1].range(from, to) : null
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => a.from - b.from)
      view.dispatch({ effects: setHighlights.of(Decoration.set(ranges)) })
    }

    destroy() {
      if (this.timer) clearTimeout(this.timer)
    }
  })
}

/* ------------------------------------------------------------------ *
 * Inlay hints
 * ------------------------------------------------------------------ */

class InlayWidget extends WidgetType {
  constructor(readonly text: string, readonly kind: number | undefined, readonly padLeft: boolean, readonly padRight: boolean, readonly tooltip: string) {
    super()
  }
  eq(other: InlayWidget) {
    return other.text === this.text && other.kind === this.kind
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = `lm-inlay${this.kind === 1 ? ' lm-inlay-type' : ' lm-inlay-param'}`
    span.textContent = `${this.padLeft ? ' ' : ''}${this.text}${this.padRight ? ' ' : ''}`
    if (this.tooltip) span.title = this.tooltip
    return span
  }
  ignoreEvent() {
    return true
  }
}

const setInlayHints = StateEffect.define<DecorationSet>()
/** Triggered by the editor when the server asks for a recomputation, or becomes ready. */
export const lspRefresh = StateEffect.define<'inlayHint' | 'symbols' | 'all'>()

const inlayField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setInlayHints)) return e.value
    return value.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})

function inlayPlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null
    private generation = 0

    constructor(readonly view: EditorView) {
      this.schedule(400)
    }

    update(update: ViewUpdate) {
      const refresh = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(lspRefresh) && (e.value === 'inlayHint' || e.value === 'all')))
      if (update.docChanged || update.viewportChanged || refresh) this.schedule(update.docChanged ? 350 : 120)
    }

    schedule(delay: number) {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        void this.request()
      }, delay)
    }

    async request() {
      const client = readyClient(filePath)
      if (!client?.supports('inlayHintProvider')) return
      const view = this.view
      const generation = ++this.generation
      const doc = view.state.doc
      const from = Math.max(0, view.viewport.from - 2000)
      const to = Math.min(doc.length, view.viewport.to + 2000)
      const hints: InlayHint[] = await client.inlayHints(filePath, {
        start: offsetToPos(doc, from),
        end: offsetToPos(doc, to),
      })
      if (generation !== this.generation || view.state.doc !== doc) {
        if (generation === this.generation) this.schedule(200)
        return
      }
      const decorations = hints
        .map((hint) => {
          const pos = posToOffset(doc, hint.position)
          const text = typeof hint.label === 'string' ? hint.label : hint.label.map((p) => p.value).join('')
          const tooltip = plainText(hint.tooltip) || (Array.isArray(hint.label) ? plainText(hint.label[0]?.tooltip) : '')
          return Decoration.widget({
            widget: new InlayWidget(text.trim(), hint.kind, Boolean(hint.paddingLeft), Boolean(hint.paddingRight), tooltip),
            side: 1,
          }).range(pos)
        })
        .sort((a, b) => a.from - b.from)
      view.dispatch({ effects: setInlayHints.of(Decoration.set(decorations, true)) })
    }

    destroy() {
      if (this.timer) clearTimeout(this.timer)
    }
  })
}

/* ------------------------------------------------------------------ *
 * Outline (document symbols)
 * ------------------------------------------------------------------ */

function symbolPlugin(filePath: string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null
    private attempts = 0

    constructor(readonly view: EditorView) {
      this.schedule(300)
    }

    update(update: ViewUpdate) {
      const refresh = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(lspRefresh) && (e.value === 'symbols' || e.value === 'all')))
      if (update.docChanged) {
        this.schedule(700)
        return
      }
      if (refresh) this.schedule(100)
    }

    schedule(delay: number) {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        void this.request()
      }, delay)
    }

    async request() {
      const client = readyClient(filePath)
      if (!client?.supports('documentSymbolProvider')) {
        // The server is still starting — try again a few times.
        if (this.attempts++ < 20) this.schedule(1500)
        return
      }
      this.attempts = 0
      const symbols = await client.documentSymbols(filePath)
      symbolStore.set(filePath, symbols)
    }

    destroy() {
      if (this.timer) clearTimeout(this.timer)
    }
  })
}

/* ------------------------------------------------------------------ *
 * Navigation and references
 * ---------------------------------------------------------------- */

export type LocationKind = 'definition' | 'declaration' | 'typeDefinition' | 'implementation'

/** Translation keys of the location kinds (`editor.nav.kinds.*`). */
const KIND_KEYS: Record<LocationKind, string> = {
  definition: 'definition',
  declaration: 'declaration',
  typeDefinition: 'typeDefinition',
  implementation: 'implementation',
}

/** Open one location, the cursor on the name. */
async function openLocation(target: Location) {
  await useStore.getState().openAt(
    uriToPath(target.uri),
    target.range.start.line, target.range.start.character,
    target.range.end.line, target.range.end.character,
  )
}

/**
 * When the server knows no definition: an exact match among the servers'
 * workspace symbols, then a declaration of the name found by text search in
 * the project's files of this language (and its siblings, Java ↔ Kotlin).
 */
async function fallbackDefinitions(filePath: string, word: string): Promise<Location[]> {
  const symbols = await lsp.workspaceSymbols(word).catch(() => [])
  const fromSymbols = definitionSymbols(symbols, word)
  if (fromSymbols.length) return fromSymbols
  const state = useStore.getState()
  const root = state.project?.root ?? state.workspace
  if (!root || word.length < 2) return []
  const spec = state.languageFor(state.tabs.find((tab) => tab.path === filePath) ?? null)
  const extensions = searchExtensions(spec?.extensions ?? [filePath.slice(filePath.lastIndexOf('.'))])
  const hits = await window.lumen.fs.search(root, word, 400).catch(() => [])
  return declarationHits(hits, word, extensions)
}

export async function gotoLocation(
  view: EditorView, filePath: string, kind: LocationKind,
): Promise<boolean> {
  const client = readyClient(filePath)
  const head = view.state.selection.main.head
  const word = wordAt(view, head)
  const kindLabel = t(`editor.nav.kinds.${KIND_KEYS[kind]}`)
  const fromServer = client ? await client[kind](filePath, offsetToPos(view.state.doc, head)) : []
  const fallback = !fromServer.length && (kind === 'definition' || kind === 'declaration') && word
  const found = fallback ? await fallbackDefinitions(filePath, word) : fromServer
  const locations = preferCurrentModule(found, filePath)
  if (!locations.length) {
    // A server still importing the build knows little yet — say so rather than “not found”.
    const busy = client?.busy
    const message = busy
      ? t('editor.nav.notFoundBusy', { kind: kindLabel, name: word, busy })
      : t(word ? 'editor.nav.notFoundNamed' : 'editor.nav.notFound', { kind: kindLabel, name: word })
    useStore.getState().notify(message, 'info')
    return false
  }
  if (locations.length === 1) {
    await openLocation(locations[0])
    return true
  }
  await showLocations(t('editor.nav.listTitle', { kind: kindLabel, name: word }), locations)
  return true
}

export async function findReferences(view: EditorView, filePath: string): Promise<boolean> {
  const client = readyClient(filePath)
  if (!client) return false
  const head = view.state.selection.main.head
  const locations = await client.references(filePath, offsetToPos(view.state.doc, head), true)
  const word = wordAt(view, head)
  if (!locations.length) {
    useStore.getState().notify(t(word ? 'editor.nav.noReferencesNamed' : 'editor.nav.noReferences', { name: word }), 'info')
    return false
  }
  await showLocations(t('editor.nav.referencesTitle', { name: word, count: locations.length }), locations)
  return true
}

/** The hit list into the references panel; preview lines are fetched afterwards. */
export async function showLocations(title: string, locations: Location[]) {
  const store = useStore.getState()
  const hits: ReferenceHit[] = locations.map((l) => ({
    path: uriToPath(l.uri),
    line: l.range.start.line,
    character: l.range.start.character,
    endLine: l.range.end.line,
    endCharacter: l.range.end.character,
  }))
  store.setReferences({ title, hits, loading: true })

  const cache = new Map<string, string[] | null>()
  const previews = await Promise.all(hits.map(async (hit) => {
    if (!cache.has(hit.path)) {
      const tab = useStore.getState().tabs.find((t) => t.path === hit.path)
      const text = tab ? tab.content : await window.lumen.fs.readFile(hit.path).catch(() => null)
      cache.set(hit.path, text === null ? null : text.split('\n'))
    }
    return cache.get(hit.path)?.[hit.line]?.trim().slice(0, 240) ?? ''
  }))
  const current = useStore.getState().references
  if (current?.title !== title) return
  store.setReferences({
    title,
    hits: hits.map((h, i) => ({ ...h, preview: previews[i] })),
    loading: false,
  })
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export async function formatDocument(view: EditorView, filePath: string): Promise<boolean> {
  const client = readyClient(filePath)
  if (!client) return false

  const spec = useStore.getState().languageFor(useStore.getState().activeTab())
  const options = lspFormattingOptions(formatFor(useStore.getState().formatSettings, spec?.id, spec?.indentUnit))
  const selection = view.state.selection.main
  const edits = selection.empty || !client.supports('documentRangeFormattingProvider')
    ? await client.formatting(filePath, options)
    : await client.rangeFormatting(filePath, selectionRange(view), options)
  if (!edits?.length) return false

  const changes = textEditsToChanges(view.state.doc, edits)
  const head = selection.head
  const spec2: TransactionSpec = { changes, userEvent: 'lsp.format' }
  const tr = view.state.update(spec2)
  view.dispatch(tr)
  const mapped = tr.changes.mapPos(head)
  view.dispatch({ selection: EditorSelection.cursor(Math.min(mapped, view.state.doc.length)) })
  return true
}

/* ------------------------------------------------------------------ *
 * The whole package
 * ------------------------------------------------------------------ */

export function lspExtension(
  filePath: string | null,
  spec: LanguageSpec | null,
  effects: Pick<Effects, 'inlayHints' | 'signatureHelp' | 'documentHighlight'>,
): Extension {
  if (!filePath || !spec?.lsp?.length || !lsp.enabled) return []
  const path = filePath

  return [
    lspHover(path),
    menuField,
    menuKeymap,
    renameField,
    symbolPlugin(path),
    effects.signatureHelp ? [signatureField, signaturePlugin(path)] : [],
    effects.documentHighlight ? [highlightField, highlightPlugin(path)] : [],
    effects.inlayHints ? [inlayField, inlayPlugin(path)] : [],
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return false
        view.dispatch({ selection: EditorSelection.cursor(pos) })
        void gotoLocation(view, path, 'definition')
        event.preventDefault()
        return true
      },
    }),
    // Navigation, rename and format commands run through the shortcut system (core/keybindings).
    keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          if (!view.state.field(signatureField, false)) return false
          view.dispatch({ effects: setSignature.of(null) })
          return true
        },
      },
    ]),
  ]
}
