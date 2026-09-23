/**
 * The `code` node of an extension view: a small CodeMirror editor used as an
 * input — an SQL console, a JSON document. Highlighting comes from the
 * languages Lumen knows; the text and the selection go back to the view's
 * inputs like any other field.
 */

import { useEffect, useMemo, useRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, placeholder as placeholderText, drawSelection } from '@codemirror/view'
import { history, historyKeymap, indentWithTab, standardKeymap } from '@codemirror/commands'
import { bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { useStore } from '@/state/store'
import { registry } from '@/core/registry'
import { editorExtensionFor } from '@/core/language'
import { editorTheme } from '@/core/theme'
import type { ViewCodeNode } from '../../../electron/features/extension-host/contract'

const LINE_HEIGHT = 19

interface Props {
  node: ViewCodeNode
  value: string
  onChange: (value: string, selection: string) => void
  onSubmit: () => void
}

export function CodeInput({ node, value, onChange, onSubmit }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const themeId = useStore((s) => s.themeId)
  const effects = useStore((s) => s.effects)
  const registryVersion = useStore((s) => s.registryVersion)
  // Handlers change every render; the editor reads them through a ref.
  const handlers = useRef({ onChange, onSubmit })
  handlers.current = { onChange, onSubmit }
  const compartments = useMemo(() => ({ theme: new Compartment(), language: new Compartment(), readOnly: new Compartment() }), [])

  const theme = useMemo(
    () => registry.themes().find((entry) => entry.id === themeId) ?? registry.themes()[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeId, registryVersion],
  )
  const language = useMemo(
    () => editorExtensionFor(registry.languages().find((spec) => spec.id === node.language) ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node.language, registryVersion],
  )

  useEffect(() => {
    if (!host.current) return
    const selectionOf = (state: EditorState) =>
      state.selection.ranges.map((range) => state.sliceDoc(range.from, range.to)).filter(Boolean).join('\n')
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          bracketMatching(),
          closeBrackets(),
          EditorView.lineWrapping,
          keymap.of([
            { key: 'Mod-Enter', preventDefault: true, run: () => { handlers.current.onSubmit(); return true } },
            ...closeBracketsKeymap, ...historyKeymap, indentWithTab, ...standardKeymap,
          ]),
          placeholderText(node.placeholder ?? ''),
          compartments.theme.of(theme ? editorTheme(theme, effects) : []),
          compartments.language.of(language),
          compartments.readOnly.of(EditorState.readOnly.of(Boolean(node.readOnly))),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged && !update.selectionSet) return
            handlers.current.onChange(update.state.doc.toString(), selectionOf(update.state))
          }),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
    // The editor lives as long as the node; later changes arrive below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.theme.reconfigure(theme ? editorTheme(theme, effects) : []) })
  }, [theme, effects, compartments])

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.language.reconfigure(language) })
  }, [language, compartments])

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.readOnly.reconfigure(EditorState.readOnly.of(Boolean(node.readOnly))) })
  }, [node.readOnly, compartments])

  // A value set by the extension (a document loaded, the console cleared) replaces the text.
  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }, [value])

  const height = node.grow ? undefined : (node.rows ?? 8) * LINE_HEIGHT + 8
  return (
    <div className={node.grow ? 'flex min-h-0 flex-1 flex-col px-3 py-1' : 'px-3 py-1'}>
      <div
        ref={host}
        data-embedded-editor=""
        className="lm-code-input min-h-0 flex-1 overflow-hidden rounded-lumen-sm border border-edge focus-within:border-accent [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
        style={height ? { height } : { minHeight: 80 }}
      />
    </div>
  )
}
