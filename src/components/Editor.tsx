import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor, rectangularSelection,
  crosshairCursor, placeholder as cmPlaceholder,
} from '@codemirror/view'
import { history, indentWithTab, standardKeymap } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { activeLineHighlight } from './active-line'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { lintGutter } from '@codemirror/lint'

import { useStore } from '@/state/store'
import { registry } from '@/core/registry'
import { editorExtensionFor } from '@/core/language'
import { foldingFor, foldingUi } from '@/core/folding'
import { editorTheme } from '@/core/theme'
import { lsp } from '@/core/lsp/manager'
import type { ContentChange } from '@/core/lsp/client'
import { completionExtension } from '@/core/completion'
import { editorBridge } from '@/lib/editor-bridge'
import {
  editorExtensions, getEditorExtensionVersion, subscribeEditorExtensions,
} from '@/lib/editor-extensions'
import { t } from '@/i18n'
import { indentGuides } from './indent-guides'
import { minimap } from './minimap'
import {
  applyDiagnostics, formatDocument, lspExtension, lspRefresh, offsetToPos, organizeImports,
} from './lsp-extension'
import type { LanguageSpec } from '@/core/types'

const themeComp = new Compartment()
const langComp = new Compartment()
const optionsComp = new Compartment()
/** Completion, hover and diagnostics — these depend on the language *and* the file. */
const assistComp = new Compartment()
const readonlyComp = new Compartment()
/** Contributions from other features, such as the debugger. */
const featureComp = new Compartment()

/**
 * The editor's key bindings: basic movement and input aids only. Everything
 * reassignable — commenting, moving lines, searching, folding — runs through
 * the shortcut system in `core/keybindings.ts`.
 */
const EDITOR_KEYMAP = [
  ...closeBracketsKeymap,
  ...standardKeymap,
  ...completionKeymap.filter((binding) => binding.key !== 'Mod-Space' && binding.key !== 'Ctrl-Space'),
  ...searchKeymap.filter((binding) => binding.key === 'Escape'),
  indentWithTab,
]

function baseExtensions(): Extension[] {
  return [
    history(),
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
    search({ top: true }),
    foldingUi((count) => t('editor.foldedLines', { count })),
    keymap.of(EDITOR_KEYMAP),
    lintGutter(),
    cmPlaceholder(t('editor.emptyFile')),
  ]
}

/** Completion (static plus LSP), hover and navigation commands for one file. */
function assistExtensions(
  spec: LanguageSpec | null,
  filePath: string | null,
  effects: ReturnType<typeof useStore.getState>['effects'],
): Extension {
  return [
    completionExtension(spec, filePath),
    lspExtension(filePath, spec, effects),
  ]
}

/** CodeMirror changes → LSP changes, back to front, in the old coordinates. */
function toContentChanges(update: { startState: EditorState; changes: { iterChanges(f: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString(): string }) => void): void } }): ContentChange[] {
  const doc = update.startState.doc
  const out: ContentChange[] = []
  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    out.push({
      range: { start: offsetToPos(doc, fromA), end: offsetToPos(doc, toA) },
      text: inserted.toString(),
    })
  })
  // Backwards, so earlier positions stay untouched by later insertions.
  return out.reverse()
}

/* ------------------------------------------------------------------ *
 * View state per file
 * ------------------------------------------------------------------ */

/** Editor state (undo history, selection, folds) per group and tab. */
const editorStates = new Map<string, EditorState>()

interface ScrollMemory {
  /** An exact restore, as long as the text is unchanged. */
  snapshot: ReturnType<EditorView['scrollSnapshot']>
  doc: string
  /** The stand-in for when the text has changed. */
  top: number
  left: number
}

/**
 * Scroll position per tab — shared across groups, so a file always continues
 * where you left it, whichever group it opens in.
 */
const scrollMemory = new Map<string, ScrollMemory>()

/** The live views per group — so server updates reach all of them. */
const liveViews = new Map<string, EditorView>()

const stateKey = (groupId: string, tabId: string) => `${groupId}:${tabId}`

function rememberScroll(view: EditorView, tabId: string) {
  scrollMemory.set(tabId, {
    snapshot: view.scrollSnapshot(),
    doc: view.state.doc.toString(),
    top: view.scrollDOM.scrollTop,
    left: view.scrollDOM.scrollLeft,
  })
}

function restoreScroll(view: EditorView, tabId: string) {
  const memory = scrollMemory.get(tabId)
  if (!memory) {
    view.scrollDOM.scrollTop = 0
    view.scrollDOM.scrollLeft = 0
    return
  }
  if (memory.doc === view.state.doc.toString()) {
    view.dispatch({ effects: memory.snapshot })
    return
  }
  // The text changed: back to the old height after the next measuring pass.
  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = memory.top
    view.scrollDOM.scrollLeft = memory.left
  })
}

/** Tab closed: discard the states we remembered. */
function forgetTab(tabId: string) {
  scrollMemory.delete(tabId)
  for (const key of [...editorStates.keys()]) {
    if (key.endsWith(`:${tabId}`)) editorStates.delete(key)
  }
}

/* ------------------------------------------------------------------ *
 * The editor of one group
 * ------------------------------------------------------------------ */

export function Editor({ groupId }: { groupId: string }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const current = useRef<string | null>(null)

  const activeTabId = useStore((s) => s.groups.find((g) => g.id === groupId)?.activeTabId ?? null)
  const isActiveGroup = useStore((s) => s.activeGroupId === groupId)
  const languageId = useStore(
    (s) => s.tabs.find((t) => t.id === activeTabId)?.languageId ?? null,
  )
  const readonly = useStore(
    (s) => Boolean(s.tabs.find((t) => t.id === activeTabId)?.readonly),
  )
  const activePath = useStore(
    (s) => s.tabs.find((t) => t.id === activeTabId)?.path ?? null,
  )
  const themeId = useStore((s) => s.themeId)
  const effects = useStore((s) => s.effects)
  const registryVersion = useStore((s) => s.registryVersion)
  const updateContent = useStore((s) => s.updateContent)
  const setCursor = useStore((s) => s.setCursor)
  const reveal = useStore((s) => s.reveal)
  const consumeReveal = useStore((s) => s.consumeReveal)
  const lspEnabled = useStore((s) => s.effects.lsp)
  const extensionVersion = useSyncExternalStore(subscribeEditorExtensions, getEditorExtensionVersion)

  const theme = useMemo(
    () => registry.themes().find((t) => t.id === themeId) ?? registry.themes()[0],
    [themeId, registryVersion],
  )

  const optionExtensions = useMemo<Extension[]>(() => {
    const list: Extension[] = []
    if (effects.showLineNumbers) list.push(lineNumbers(), highlightActiveLineGutter())
    if (effects.highlightActiveLine) list.push(activeLineHighlight)
    if (effects.showIndentGuides) list.push(indentGuides)
    if (effects.wordWrap) list.push(EditorView.lineWrapping)
    if (effects.minimap && theme) {
      list.push(minimap({ theme, width: effects.minimapWidth, characters: effects.minimapRenderCharacters }))
    }
    if (effects.foldingOnHover) list.push(EditorView.editorAttributes.of({ class: 'lm-fold-hover' }))
    return list
  }, [
    effects.showLineNumbers, effects.highlightActiveLine, effects.showIndentGuides, effects.wordWrap,
    effects.minimap, effects.minimapWidth, effects.minimapRenderCharacters, effects.foldingOnHover, theme,
  ])

  const themeExtension = useMemo(
    () => (theme ? editorTheme(theme, effects) : []),
    [theme, effects],
  )

  const assist = useMemo(
    () => {
      const state = useStore.getState()
      const tab = state.tabs.find((t) => t.id === activeTabId) ?? null
      const spec = tab ? state.languageFor(tab) : null
      // Virtual documents (jdt://) get no LSP wiring — syntax only.
      return assistExtensions(spec, tab?.virtual ? null : activePath, state.effects)
    },
    // `lspEnabled` and `registryVersion` force the rebuild when the server
    // state or the language association changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeTabId, activePath, languageId, lspEnabled, registryVersion,
      effects.inlayHints, effects.signatureHelp, effects.documentHighlight,
    ],
  )

  const languageExtension = useMemo(() => {
    const state = useStore.getState()
    const tab = state.tabs.find((t) => t.id === activeTabId) ?? null
    const spec = tab ? state.languageFor(tab) : null
    return [editorExtensionFor(spec), foldingFor(spec)]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, languageId, registryVersion])

  const featureExtension = useMemo<Extension>(() => {
    if (!activeTabId) return []
    return editorExtensions({ tabId: activeTabId, groupId, path: activePath, languageId, readonly })
  }, [activeTabId, groupId, activePath, languageId, readonly, extensionVersion])

  const readonlyExtension = useMemo<Extension>(
    () => (readonly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
    [readonly],
  )

  /** A shared listener: contents into the store, cursor position into the status bar. */
  const listener = useMemo(
    () => EditorView.updateListener.of((update) => {
      if (update.docChanged && current.current) {
        updateContent(current.current, update.state.doc.toString(), toContentChanges(update))
      }
      if (update.focusChanged && update.view.hasFocus) {
        const state = useStore.getState()
        if (state.activeGroupId !== groupId) {
          const index = state.groups.findIndex((g) => g.id === groupId)
          if (index !== -1) state.focusGroup(index)
        }
      }
      if ((update.selectionSet || update.docChanged || update.focusChanged) && useStore.getState().activeGroupId === groupId) {
        setCursor(offsetToPos(update.state.doc, update.state.selection.main.head))
      }
    }),
    [updateContent, setCursor, groupId],
  )

  /* Create the editor once. */
  useEffect(() => {
    if (!host.current || view.current) return
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: '', extensions: [...baseExtensions(), listener] }),
    })
    liveViews.set(groupId, view.current)
    // Keep noting the scroll position, so it survives closing the group too.
    const scroller = view.current.scrollDOM
    let timer = 0
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (view.current && current.current) rememberScroll(view.current, current.current)
      }, 120)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      scroller.removeEventListener('scroll', onScroll)
      if (view.current && current.current) {
        rememberScroll(view.current, current.current)
        editorStates.set(stateKey(groupId, current.current), view.current.state)
      }
      if (editorBridge.view === view.current) editorBridge.attach(null, null)
      liveViews.delete(groupId)
      view.current?.destroy()
      view.current = null
      current.current = null
    }
  }, [listener, groupId])

  /* Tab switch: remember and restore state and scroll position per tab. */
  useEffect(() => {
    const cm = view.current
    if (!cm) return

    const tab = useStore.getState().tabs.find((t) => t.id === activeTabId) ?? null

    if (current.current && current.current !== tab?.id) {
      rememberScroll(cm, current.current)
      editorStates.set(stateKey(groupId, current.current), cm.state)
    }
    if (!tab) {
      current.current = null
      return
    }
    if (current.current === tab.id) return

    const extensions: Extension[] = [
      ...baseExtensions(),
      langComp.of(languageExtension),
      themeComp.of(themeExtension),
      optionsComp.of(optionExtensions),
      assistComp.of(assist),
      readonlyComp.of(readonlyExtension),
      featureComp.of(featureExtension),
      listener,
    ]

    const cached = editorStates.get(stateKey(groupId, tab.id))
    // Same text: carry the state over, undo history included; otherwise rebuild.
    const reuse = cached !== undefined && cached.doc.toString() === tab.content
    cm.setState(reuse && cached ? cached : EditorState.create({ doc: tab.content, extensions }))
    if (reuse) {
      cm.dispatch({
        effects: [
          themeComp.reconfigure(themeExtension),
          optionsComp.reconfigure(optionExtensions),
          langComp.reconfigure(languageExtension),
          assistComp.reconfigure(assist),
          readonlyComp.reconfigure(readonlyExtension),
          featureComp.reconfigure(featureExtension),
        ],
      })
    }

    current.current = tab.id
    restoreScroll(cm, tab.id)
    if (useStore.getState().activeGroupId === groupId) {
      editorBridge.attach(cm, tab.id)
      cm.focus()
      setCursor(offsetToPos(cm.state.doc, cm.state.selection.main.head))
    }
    applyDiagnostics(cm, lsp.diagnostics(tab.path), tab.path ?? undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, groupId])

  /* The active group changed: the bridge and the status bar follow. */
  useEffect(() => {
    const cm = view.current
    if (!cm || !isActiveGroup) return
    editorBridge.attach(cm, current.current)
    if (!cm.hasFocus && !document.activeElement?.closest('input, textarea, .lm-terminal, [role="dialog"]')) cm.focus()
    setCursor(offsetToPos(cm.state.doc, cm.state.selection.main.head))
  }, [isActiveGroup, setCursor])

  /* Tab contents changed from outside (reload, dependency, WorkspaceEdit, another group): adopt them. */
  const activeContent = useStore((s) => s.tabs.find((t) => t.id === activeTabId)?.content ?? null)
  useEffect(() => {
    const cm = view.current
    if (!cm || activeContent === null || current.current !== activeTabId) return
    const doc = cm.state.doc.toString()
    if (doc === activeContent) return
    // Replace only the middle that changed — cursor and scroll position survive.
    let start = 0
    const max = Math.min(doc.length, activeContent.length)
    while (start < max && doc.charCodeAt(start) === activeContent.charCodeAt(start)) start++
    let endDoc = doc.length
    let endNew = activeContent.length
    while (endDoc > start && endNew > start && doc.charCodeAt(endDoc - 1) === activeContent.charCodeAt(endNew - 1)) {
      endDoc--
      endNew--
    }
    cm.dispatch({
      changes: { from: start, to: endDoc, insert: activeContent.slice(start, endNew) },
      userEvent: 'external',
    })
  }, [activeContent, activeTabId])

  /* Jump to a spot (definition, reference, outline, problems). */
  useEffect(() => {
    if (!reveal || !view.current) return
    if (reveal.tabId !== current.current) return
    if (reveal.groupId && reveal.groupId !== groupId) return
    if (!reveal.groupId && !isActiveGroup) return
    editorBridge.attach(view.current, current.current)
    editorBridge.reveal(reveal.line, reveal.character, reveal.endLine, reveal.endCharacter)
    consumeReveal()
  }, [reveal, activeTabId, consumeReveal, groupId, isActiveGroup])

  /* Keep theme, options and extensions in step. */
  useEffect(() => {
    view.current?.dispatch({
      effects: [
        themeComp.reconfigure(themeExtension),
        optionsComp.reconfigure(optionExtensions),
        readonlyComp.reconfigure(readonlyExtension),
        featureComp.reconfigure(featureExtension),
      ],
    })
  }, [themeExtension, optionExtensions, readonlyExtension, featureExtension])

  useEffect(() => {
    if (!activeTabId) return
    view.current?.dispatch({
      effects: [
        langComp.reconfigure(languageExtension),
        assistComp.reconfigure(assist),
      ],
    })
  }, [activeTabId, languageExtension, assist])

  /* Mirror the diagnostics; once the server is ready, fetch the outline and hints. */
  useEffect(() => {
    let wasReady = lsp.clientForPath(activePath)?.status === 'ready'
    return lsp.subscribe(() => {
      const cm = view.current
      if (!cm || !activePath) return
      applyDiagnostics(cm, lsp.diagnostics(activePath), activePath)
      const ready = lsp.clientForPath(activePath)?.status === 'ready'
      if (ready && !wasReady) cm.dispatch({ effects: lspRefresh.of('all') })
      wasReady = ready
    })
  }, [activePath])

  return <div ref={host} className="h-full w-full overflow-hidden" />
}

/* ------------------------------------------------------------------ *
 * The wiring shared by every group
 * ------------------------------------------------------------------ */

/** Once in the editor area: the save hook, server updates, and cleanup. */
export function useEditorServices() {
  const tabIds = useStore((s) => s.tabs.map((t) => t.id).join(' '))

  /* Before saving: organise imports, format (in the active view). */
  useEffect(() => {
    editorBridge.beforeSave = async (tabId) => {
      const cm = editorBridge.view
      const state = useStore.getState()
      const tab = state.tabs.find((t) => t.id === tabId)
      if (!cm || !tab?.path || editorBridge.tabId !== tabId) return
      if (state.effects.organizeImportsOnSave) await organizeImports(cm, tab.path)
      if (state.effects.formatOnSave) await formatDocument(cm, tab.path)
    }
    return () => { editorBridge.beforeSave = null }
  }, [])

  /* The server asks for a recomputation — inlay hints after a project import, say. */
  useEffect(() => {
    lsp.onRefresh = (what) => {
      for (const cm of liveViews.values()) {
        cm.dispatch({ effects: lspRefresh.of(what === 'inlayHint' ? 'inlayHint' : 'all') })
      }
    }
    return () => { lsp.onRefresh = () => {} }
  }, [])

  /* Clear out orphaned states of closed tabs. */
  useEffect(() => {
    const live = new Set(tabIds.split(' '))
    for (const id of [...scrollMemory.keys()]) {
      if (!live.has(id)) forgetTab(id)
    }
    for (const key of [...editorStates.keys()]) {
      const id = key.slice(key.indexOf(':') + 1)
      if (!live.has(id)) editorStates.delete(key)
    }
  }, [tabIds])
}
