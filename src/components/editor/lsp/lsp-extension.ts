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
 * Wires a language server to the CodeMirror editor.
 *
 * Completion (with auto-imports), hover, signature help, diagnostics,
 * occurrence highlighting, inlay hints, semantic colours, folding ranges,
 * document links, code actions, renaming, navigation
 * (definition, declaration, type, implementation, references), formatting and
 * the outline — all of it through the `LspClient`.
 */

import { EditorView, keymap } from '@codemirror/view';
import { EditorSelection, type Extension } from '@codemirror/state';
import { lsp } from '@/core/lsp/manager';
import type { Effects } from '@/core/theme';
import type { LanguageSpec } from '@/core/types';
import { lspHover, setSignature, signatureField, signaturePlugin } from './lsp-popups';
import { menuField, menuKeymap } from './lsp-actions';
import { renameField } from './lsp-rename';
import { highlightField, highlightPlugin, inlayField, inlayPlugin, symbolPlugin } from './lsp-decorations';
import { gotoLocation } from './lsp-navigation';
import { serverView } from './server-view';

export function lspExtension(
  filePath: string | null,
  spec: LanguageSpec | null,
  effects: Pick<Effects, 'inlayHints' | 'signatureHelp' | 'documentHighlight'>,
): Extension {
  if (!filePath || !spec?.lsp?.length || !lsp.enabled) {
    return [];
  }
  const path = filePath;

  return [
    lspHover(path),
    menuField,
    menuKeymap,
    renameField,
    symbolPlugin(path),
    serverView(path),
    effects.signatureHelp ? [signatureField, signaturePlugin(path)] : [],
    effects.documentHighlight ? [highlightField, highlightPlugin(path)] : [],
    effects.inlayHints ? [inlayField, inlayPlugin(path)] : [],
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!(event.ctrlKey || event.metaKey) || event.button !== 0) {
          return false;
        }
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) {
          return false;
        }
        view.dispatch({ selection: EditorSelection.cursor(pos) });
        void gotoLocation(view, path, 'definition');
        event.preventDefault();
        return true;
      },
    }),
    // Navigation, rename and format commands run through the shortcut system (core/keybindings).
    keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          if (!view.state.field(signatureField, false)) {
            return false;
          }
          view.dispatch({ effects: setSignature.of(null) });
          return true;
        },
      },
    ]),
  ];
}
