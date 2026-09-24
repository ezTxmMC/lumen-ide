/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * A live preview of a language using the real tokenizer: `buildStreamParser`
 * inside a read-only CodeMirror view, coloured with the active theme.
 */

import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { buildStreamParser } from '@/core/tokenizer';
import { editorTheme } from '@/core/theme';
import type { LanguageSpec } from '@/core/types';

export function LanguagePreview({ spec, doc, className = '' }: { spec: LanguageSpec; doc: string; className?: string; }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const themeId = useStore((s) => s.themeId);
  const effects = useStore((s) => s.effects);
  const registryVersion = useStore((s) => s.registryVersion);

  const theme = () => registry.themes().find((th) => th.id === themeId) ?? registry.themes()[0];

  const languageExtension = (value: LanguageSpec) => {
    try {
      // Without the cache (languageSupport caches per id) — every change should show at once.
      return StreamLanguage.define(buildStreamParser({ ...value, id: `${value.id}-preview` }));
    } catch {
      return [];
    }
  };

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc,
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          langComp.current.of(languageExtension(spec)),
          themeComp.current.of(editorTheme(theme(), { ...effects, fontSize: Math.min(effects.fontSize, 13) })),
          EditorView.theme({ '.cm-content': { padding: '8px 0' } }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Created once; changes run through the effects below.
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: langComp.current.reconfigure(languageExtension(spec)) });
  }, [spec]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === doc) {
      return;
    }
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
  }, [doc]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeComp.current.reconfigure(editorTheme(theme(), { ...effects, fontSize: Math.min(effects.fontSize, 13) })),
    });
  }, [themeId, effects, registryVersion]);

  return <div ref={hostRef} className={`min-h-0 overflow-auto rounded-lumen-sm border border-edge bg-bg ${className}`} />;
}

/** Sample text built from a language's word lists. */
export function sampleFor(spec: LanguageSpec): string {
  const pick = (list: string[] | undefined, fallback: string, i = 0) => list?.[i] ?? fallback;
  const quote = spec.strings?.[0];
  const str = quote ? `${quote.start}Hallo${quote.end ?? quote.start}` : '"Hallo"';
  const lines = [
    commentLine(spec),
    `${pick(spec.keywords, 'let')} wert = ${str}`,
    `${pick(spec.keywords, 'fn', 1)} Rechne(a, b) {`,
    `  ${pick(spec.controls, 'if')} (a > 42) ${pick(spec.controls, 'return', 1)} ${pick(spec.constants, 'true')}`,
    `  ${pick(spec.builtins, 'print')}(${pick(spec.types, 'Zahl')}, 3.14)`,
    '}',
  ];
  return lines.join('\n');
}

function commentLine(spec: LanguageSpec) {
  const line = spec.comments?.line;
  if (line) {
    return `${line} ${spec.name}`;
  }
  const block = spec.comments?.block;
  if (block) {
    return `${block[0]} ${spec.name} ${block[1]}`;
  }
  return spec.name;
}
