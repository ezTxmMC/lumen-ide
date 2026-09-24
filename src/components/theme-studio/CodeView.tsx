/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useRef } from 'react';
import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
} from '@codemirror/view';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { editorTheme, type Effects } from '@/core/theme';
import { editorExtensionFor } from '@/core/language';
import { registry } from '@/core/registry';
import { tokenTags } from '@/core/tokenizer';
import { TOKEN_KINDS, type Theme } from '@/core/types';
import './studio.css';

/** Extra classes per token kind, so the preview can tie tokens to a colour. */
const tokenClasses = syntaxHighlighting(
  HighlightStyle.define(TOKEN_KINDS.map((kind) => ({ tag: tokenTags[kind], class: `lm-tk-${kind}` }))),
);

/** Selection in the preview: `[anchor, head]` pairs, the first being the main one. */
export type Ranges = [number, number][];

/**
 * A small CodeMirror for the preview (read-only) and for the “Custom CSS”
 * field. Theme, language and contents can be swapped at any time.
 */
export function CodeView({
  value, languageId, theme, effects, readOnly = false, onChange, selection, className = '', fontSize,
}: {
  value: string;
  languageId: string;
  theme: Theme;
  effects: Effects;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  /** Selection or multiple cursors, applied only when the contents are set. */
  selection?: Ranges;
  className?: string;
  /** Overrides the font size from the effects, for the preview. */
  fontSize?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const themeComp = useRef(new Compartment());
  const langComp = useRef(new Compartment());
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const themeExtension = (): Extension => {
    const tuned = fontSize ? { ...effects, fontSize } : effects;
    return [editorTheme(theme, tuned), tokenClasses];
  };
  const languageExtension = (): Extension => {
    const spec = registry.languages().find((l) => l.id === languageId) ?? null;
    return editorExtensionFor(spec);
  };
  const selectionOf = (ranges: Ranges | undefined, length: number) => {
    if (!ranges?.length) {
      return undefined;
    }
    const clampPos = (n: number) => Math.max(0, Math.min(length, n));
    return EditorSelection.create(ranges.map(([a, h]) => EditorSelection.range(clampPos(a), clampPos(h))));
  };

  useEffect(() => {
    if (!host.current) {
      return;
    }
    const state = EditorState.create({
      doc: value,
      selection: selectionOf(selection, value.length),
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        bracketMatching(),
        EditorState.allowMultipleSelections.of(true),
        EditorState.readOnly.of(readOnly),
        readOnly ? [] : [history(), keymap.of([...defaultKeymap, ...historyKeymap])],
        themeComp.current.of(themeExtension()),
        langComp.current.of(languageExtension()),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }
          changeRef.current?.(update.state.doc.toString());
        }),
      ],
    });
    const created = new EditorView({ state, parent: host.current });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
    // Created once; changes run through the effects below.
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: themeComp.current.reconfigure(themeExtension()) });
  }, [theme, effects, fontSize]);

  useEffect(() => {
    view.current?.dispatch({ effects: langComp.current.reconfigure(languageExtension()) });
  }, [languageId]);

  useEffect(() => {
    const current = view.current;
    if (!current) {
      return;
    }
    if (current.state.doc.toString() === value) {
      return;
    }
    current.dispatch({
      changes: { from: 0, to: current.state.doc.length, insert: value },
      selection: selectionOf(selection, value.length),
    });
  }, [value]);

  return <div ref={host} className={`lm-ts-code h-full min-h-0 ${className}`} />;
}
